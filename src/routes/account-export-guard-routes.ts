import { Router, type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { ACCOUNT_DELETION_TARGETS } from "../lib/account-deletion";
import {
  ACCOUNT_EXPORT_REDACTED_FIELDS,
  ACCOUNT_EXPORT_SECURITY_ONLY_TABLES,
  accountExportKeyForTable,
  redactAccountExportValue,
} from "../lib/account-export";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const accountExportRateLimit = createRateLimiter({
  bucket: "api:account-export",
  windowMs: 15 * 60 * 1000,
  max: 5,
});

type ExecuteResult = { rows?: Array<Record<string, unknown>> };

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  return cause &&
    typeof cause === "object" &&
    typeof (cause as { code?: unknown }).code === "string"
    ? ((cause as { code: string }).code as string)
    : undefined;
}

function postOnly(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== "POST") {
    next("router");
    return;
  }
  next();
}

/**
 * Rows fetched per round trip while streaming a table.
 *
 * The export used to run `SELECT *` with no bound across every table in the
 * deletion registry, accumulate every row into one object, and hand the whole
 * thing to `res.json()`. Peak memory was therefore the tenant's entire history
 * — call logs, transcripts, messages, audit ledger, webhook deliveries — held
 * twice over, once as rows and again as the serialized string. On a 1 GB
 * serverless function that is fine for a trial account and fatal for the
 * customers who matter most: the export 500s, and it 500s reproducibly, so a
 * data-portability request from the largest tenant is the one that cannot be
 * fulfilled. Paging keeps peak memory flat regardless of account size.
 */
const EXPORT_PAGE_ROWS = 500;

/**
 * Stream one table's rows into the open response.
 *
 * Ordered by `ctid` — the physical row locator — because the registry covers
 * ~100 tables with no shared primary-key name, and OFFSET without ORDER BY is
 * not stable across pages. A concurrent write can still shift a row between
 * pages; an export is a point-in-time snapshot of the tenant's own data taken
 * while they wait for the download, so that is an acceptable trade against
 * holding a transaction open for the length of the stream.
 *
 * Returns the number of rows written.
 */
async function streamTableRows(
  res: Response,
  table: string,
  predicates: ReturnType<typeof sql>[],
): Promise<number> {
  let written = 0;
  for (let offset = 0; ; offset += EXPORT_PAGE_ROWS) {
    const result = (await drizzle.execute(
      sql`SELECT * FROM ${sql.raw(table)} WHERE ${sql.join(predicates, sql` OR `)}
          ORDER BY ctid LIMIT ${EXPORT_PAGE_ROWS} OFFSET ${offset}`,
    )) as ExecuteResult;
    const rows = result.rows || [];
    for (const row of rows) {
      res.write(`${written === 0 ? "" : ","}${JSON.stringify(redactAccountExportValue(row))}`);
      written += 1;
    }
    if (rows.length < EXPORT_PAGE_ROWS) return written;
  }
}

/**
 * Secure terminal middleware for the canonical legacy export route declared in
 * settings-routes.ts. Keeping the declaration there prevents generated authz
 * documentation from treating this hardening layer as a second public route.
 *
 * Coverage derives from the same audited registry used by terminal account
 * deletion. Short-lived authentication artifacts are excluded and provider
 * credentials are recursively removed from user-owned settings/connections.
 */
router.use(
  "/api/account/export",
  postOnly,
  authenticateUser,
  accountExportRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const skippedMissingTables: string[] = [];
    const exportedAt = new Date();
    let totalRows = 0;
    let tableCount = 0;

    // Validate every ownership predicate BEFORE a byte goes out. Once the
    // response has started there is no way to turn a failure into a clean 4xx,
    // so the one error that means "this code is unsafe" must surface first.
    const targets = ACCOUNT_DELETION_TARGETS.filter(
      (target) => !ACCOUNT_EXPORT_SECURITY_ONLY_TABLES.has(target.table),
    ).map((target) => {
      const predicates = [
        ...(target.userColumns || []).map((column) => sql`${sql.raw(column)} = ${userId}`),
        ...(target.organizationColumns || []).map(
          (column) =>
            sql`${sql.raw(column)} IN (
                SELECT id FROM wireline_organizations WHERE owner_id = ${userId}
              )`,
        ),
      ];
      if (predicates.length === 0) {
        throw AppError.fromHttpStatus(
          500,
          `Unsafe account export target without ownership predicate: ${target.table}`,
        );
      }
      return { table: target.table, predicates };
    });

    // Account archives contain private customer and conversation data.
    // Prevent browsers and intermediary caches from retaining the response.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wireline-account-export-${userId.substring(0, 8)}-${exportedAt.getTime()}.json"`,
    );
    res.status(200);

    try {
      // `tables` is streamed first and `metadata` written last, because
      // total_rows and skipped_missing_tables are only known once every table
      // has been walked. Key order carries no meaning in JSON, so the parsed
      // document is identical to the shape this route has always returned.
      res.write('{"tables":{');

      for (const { table, predicates } of targets) {
        const key = accountExportKeyForTable(table);
        const separator = tableCount === 0 ? "" : ",";
        try {
          res.write(`${separator}${JSON.stringify(key)}:[`);
          totalRows += await streamTableRows(res, table, predicates);
          res.write("]");
          tableCount += 1;
        } catch (error) {
          // Legacy backup tables may be removed after a later migration. Their
          // absence should be disclosed, not turn every account export into 500.
          // The opening bracket is already written, so close it and move on —
          // the table appears as an empty array and is named in
          // skipped_missing_tables.
          if (postgresErrorCode(error) === "42P01") {
            skippedMissingTables.push(table);
            log.warn("account export skipped missing table", { table, userId });
            res.write("]");
            tableCount += 1;
            continue;
          }
          throw error;
        }
      }

      // The auth profile is deleted separately after the tenant registry during
      // terminal purge, so include it explicitly and let the shared redactor
      // remove password_hash or any future credential-shaped columns.
      const userResult = (await drizzle.execute(
        sql`SELECT * FROM wireline_users WHERE id = ${userId}`,
      )) as ExecuteResult;
      const userRows = (userResult.rows || []).map((row) => redactAccountExportValue(row));
      res.write(`${tableCount === 0 ? "" : ","}"users":${JSON.stringify(userRows)}`);
      tableCount += 1;
      totalRows += userRows.length;

      res.write("},");
      res.write(
        `"metadata":${JSON.stringify({
          user_id: userId,
          email: req.user.email || "unknown",
          exported_at: exportedAt.toISOString(),
          export_schema_version: "2.0",
          source_registry: "ACCOUNT_DELETION_TARGETS",
          total_rows: totalRows,
          excluded_security_resources: [...ACCOUNT_EXPORT_SECURITY_ONLY_TABLES].sort(),
          redacted_credential_fields: [...ACCOUNT_EXPORT_REDACTED_FIELDS],
          skipped_missing_tables: skippedMissingTables.sort(),
        })}}`,
      );
      res.end();

      log.info("secure account export completed", {
        userId,
        totalRows,
        tableCount,
        skippedMissingTableCount: skippedMissingTables.length,
      });
      return;
    } catch (error) {
      log.error("secure account export failed", { userId, error: getErrorMessage(error) });
      // Bytes are already on the wire, so there is no status code left to send.
      // Destroy the socket rather than closing the JSON: a truncated download
      // is an obvious failure, whereas a well-formed document missing half the
      // tenant's history would be silently accepted as a complete archive.
      res.destroy();
      return;
    }
  },
);

export default router;
