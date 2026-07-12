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
  return cause && typeof cause === "object" && typeof (cause as { code?: unknown }).code === "string"
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
    const tables: Record<string, unknown[]> = {};
    const skippedMissingTables: string[] = [];
    let totalRows = 0;

    try {
      for (const target of ACCOUNT_DELETION_TARGETS) {
        if (ACCOUNT_EXPORT_SECURITY_ONLY_TABLES.has(target.table)) continue;

        const predicates = [
          ...(target.userColumns || []).map(
            (column) => sql`${sql.raw(column)} = ${userId}`,
          ),
          ...(target.organizationColumns || []).map(
            (column) =>
              sql`${sql.raw(column)} IN (
                SELECT id FROM wireline_organizations WHERE owner_id = ${userId}
              )`,
          ),
        ];
        if (predicates.length === 0) {
          throw new Error(`Unsafe account export target without ownership predicate: ${target.table}`);
        }

        try {
          const result = (await drizzle.execute(
            sql`SELECT * FROM ${sql.raw(target.table)} WHERE ${sql.join(predicates, sql` OR `)}`,
          )) as ExecuteResult;
          const rows = (result.rows || []).map(
            (row) => redactAccountExportValue(row) as Record<string, unknown>,
          );
          tables[accountExportKeyForTable(target.table)] = rows;
          totalRows += rows.length;
        } catch (error) {
          // Legacy backup tables may be removed after a later migration. Their
          // absence should be disclosed, not turn every account export into 500.
          if (postgresErrorCode(error) === "42P01") {
            skippedMissingTables.push(target.table);
            log.warn("account export skipped missing table", { table: target.table, userId });
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
      const userRows = (userResult.rows || []).map(
        (row) => redactAccountExportValue(row) as Record<string, unknown>,
      );
      tables.users = userRows;
      totalRows += userRows.length;

      const exportedAt = new Date();
      const exportPackage = {
        metadata: {
          user_id: userId,
          email: req.user.email || "unknown",
          exported_at: exportedAt.toISOString(),
          export_schema_version: "2.0",
          source_registry: "ACCOUNT_DELETION_TARGETS",
          total_rows: totalRows,
          excluded_security_resources: [...ACCOUNT_EXPORT_SECURITY_ONLY_TABLES].sort(),
          redacted_credential_fields: [...ACCOUNT_EXPORT_REDACTED_FIELDS],
          skipped_missing_tables: skippedMissingTables.sort(),
        },
        tables,
      };

      log.info("secure account export completed", {
        userId,
        totalRows,
        tableCount: Object.keys(tables).length,
        skippedMissingTableCount: skippedMissingTables.length,
      });

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="wireline-account-export-${userId.substring(0, 8)}-${exportedAt.getTime()}.json"`,
      );
      return res.status(200).json(exportPackage);
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("secure account export failed", { userId, error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Export failed.");
    }
  },
);

export default router;
