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
import {
  AccountExportBusyError,
  accountExportSnapshotGate,
  type AccountExportSnapshotLease,
} from "../lib/account-export-admission";
import { writeAccountExportChunk } from "../lib/account-export-stream";
import { drizzle, log, tenantStore } from "../lib/server-context";
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
type ExportQueryExecutor = Pick<typeof drizzle, "execute">;

/**
 * PostgreSQL does not consume AbortSignal, so mirror the lease's remaining
 * wall-clock budget into the current transaction before every archive query.
 * `is_local = true` prevents the timeout from escaping through the pool.
 */
async function setAccountExportStatementDeadline(
  executor: ExportQueryExecutor,
  lease: AccountExportSnapshotLease,
): Promise<void> {
  const timeout = `${lease.remainingMs()}ms`;
  await executor.execute(sql`SELECT set_config('statement_timeout', ${timeout}, true)`);
  // The setup round trip may itself cross the wall-clock deadline.
  lease.remainingMs();
}

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
 * not stable across pages. The caller holds one REPEATABLE READ transaction for
 * the complete archive, so concurrent writes cannot shift snapshot-visible rows
 * between pages or produce a mixture of table states.
 *
 * Returns the number of rows written.
 */
async function streamTableRows(
  executor: ExportQueryExecutor,
  res: Response,
  table: string,
  predicates: ReturnType<typeof sql>[],
  lease: AccountExportSnapshotLease,
): Promise<number> {
  let written = 0;
  for (let offset = 0; ; offset += EXPORT_PAGE_ROWS) {
    await setAccountExportStatementDeadline(executor, lease);
    const result = (await executor.execute(
      sql`SELECT * FROM ${sql.raw(table)} WHERE ${sql.join(predicates, sql` OR `)}
          ORDER BY ctid LIMIT ${EXPORT_PAGE_ROWS} OFFSET ${offset}`,
    )) as ExecuteResult;
    const rows = result.rows || [];
    for (const row of rows) {
      await writeAccountExportChunk(
        res,
        `${written === 0 ? "" : ","}${JSON.stringify(redactAccountExportValue(row))}`,
        lease.signal,
      );
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
    let exportLease: AccountExportSnapshotLease;

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

    try {
      exportLease = await accountExportSnapshotGate.acquire(userId);
    } catch (error) {
      if (error instanceof AccountExportBusyError) {
        res.setHeader("Retry-After", "30");
        res.status(503).json({
          error: "Another account export is already in progress. Try again shortly.",
          code: error.code,
          requestId: res.locals?.requestId,
        });
        return;
      }
      throw error;
    }

    // Account archives contain private customer and conversation data.
    // Prevent browsers and intermediary caches from retaining the response.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="botbound-account-export-${userId.substring(0, 8)}-${exportedAt.getTime()}.json"`,
    );
    res.status(200);

    try {
      // Auth middleware runs inside tenantStore so normal queries receive SET
      // LOCAL tenant scope. That outer scope already owns a transaction, where
      // Drizzle can only create a savepoint and cannot change isolation. Exit it
      // before checkout so this is one real root transaction whose BEGIN carries
      // REPEATABLE READ. Every query still has the validated ownership predicate
      // above; root scope is used only to make the whole archive one snapshot.
      await tenantStore.exit(() =>
        drizzle.transaction(
          async (tx) => {
            // `tables` is streamed first and `metadata` written last, because
            // total_rows and skipped_missing_tables are only known once every
            // table has been walked. Key order carries no meaning in JSON, so
            // the parsed document retains the route's established shape.
            await writeAccountExportChunk(res, '{"tables":{', exportLease.signal);

            for (const { table, predicates } of targets) {
              const key = accountExportKeyForTable(table);
              const separator = tableCount === 0 ? "" : ",";
              await writeAccountExportChunk(
                res,
                `${separator}${JSON.stringify(key)}:[`,
                exportLease.signal,
              );
              try {
                // A failed SELECT aborts its transaction in PostgreSQL. Isolate
                // each legacy-compatible table read in a savepoint so a missing
                // retired table can be disclosed without invalidating the root
                // snapshot used by every remaining table.
                totalRows += await tx.transaction((tableTx) =>
                  streamTableRows(tableTx, res, table, predicates, exportLease),
                );
                await writeAccountExportChunk(res, "]", exportLease.signal);
                tableCount += 1;
              } catch (error) {
                if (postgresErrorCode(error) === "42P01") {
                  skippedMissingTables.push(table);
                  log.warn("account export skipped missing table", { table, userId });
                  await writeAccountExportChunk(res, "]", exportLease.signal);
                  tableCount += 1;
                  continue;
                }
                throw error;
              }
            }

            // The auth profile is deleted separately after the tenant registry
            // during terminal purge, so include it explicitly and let the shared
            // redactor remove password_hash or future credential-shaped columns.
            await setAccountExportStatementDeadline(tx, exportLease);
            const userResult = (await tx.execute(
              sql`SELECT * FROM wireline_users WHERE id = ${userId}`,
            )) as ExecuteResult;
            const userRows = (userResult.rows || []).map((row) => redactAccountExportValue(row));
            await writeAccountExportChunk(
              res,
              `${tableCount === 0 ? "" : ","}"users":${JSON.stringify(userRows)}`,
              exportLease.signal,
            );
            tableCount += 1;
            totalRows += userRows.length;

            await writeAccountExportChunk(res, "},", exportLease.signal);
            await writeAccountExportChunk(
              res,
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
              exportLease.signal,
            );
          },
          { isolationLevel: "repeatable read", accessMode: "read only" },
        ),
      );
      // Do not mark the download complete until PostgreSQL has committed the
      // snapshot successfully. A commit failure destroys the response below.
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
    } finally {
      exportLease.release();
    }
  },
);

export default router;
