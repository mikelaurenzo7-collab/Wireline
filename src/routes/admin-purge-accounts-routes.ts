/**
 * One-shot account purge — wipes every customer account in the database
 * EXCEPT the two preserved emails (OWNER_EMAIL and E2E_USER_EMAIL).
 *
 * Use case: pre-launch cleanup. After months of dev seed data + manual
 * test signups + Claude-driven smoke tests, the users table is full of
 * stale accounts that shouldn't carry into the production launch.
 *
 * Safety:
 *   - Owner-gated (req.user.email must match OWNER_EMAIL).
 *   - Dry-run by default (?dry_run=true returns the list without deleting).
 *   - Both preserved emails are required to be set in env, or the route
 *     refuses to run — we never want to purge to "0 accounts left" by
 *     accident if one of the env vars is missing.
 *   - Each deletion uses the existing `purgeAccount()` cascade so audit
 *     log, agents, calls, messages, etc. are all cleaned consistently.
 *
 * Auth: requesting user's email must match OWNER_EMAIL env var.
 */

import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import type { AuthenticatedRequest } from "../types/auth";
import { purgeAccount } from "../lib/account-deletion";

const router = Router();

interface PurgeReport {
  preserved: { email: string; reason: string }[];
  candidates: { id: string; email: string }[];
  deleted: { id: string; email: string; ok: boolean; error?: string }[];
  total_before: number;
  total_after_dry_run: number;
  dry_run: boolean;
}

router.post(
  "/api/admin/purge-non-preserved-accounts",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
    if (!ownerEmail) {
      throw AppError.fromHttpStatus(503, "OWNER_EMAIL not configured");
    }

    const e2eEmail = process.env.E2E_USER_EMAIL?.trim().toLowerCase();
    if (!e2eEmail) {
      return res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        error:
          "E2E_USER_EMAIL not configured — refusing to run a wide-scope purge without both preserve targets set.",
      });
    }

    // Dry run is the default. Account Holder must explicitly pass dry_run=false
    // (in body OR query) to actually delete. Body takes precedence.
    const bodyDryRun = (req.body as { dry_run?: boolean } | undefined)?.dry_run;
    const queryDryRun = (req.query.dry_run as string | undefined)?.toLowerCase();
    const dryRun = bodyDryRun !== undefined ? bodyDryRun !== false : queryDryRun !== "false";

    try {
      const allUsers = (await drizzle.execute(
        sql`SELECT id, email FROM wireline_users ORDER BY created_at ASC NULLS LAST`,
      )) as unknown as { rows: Array<{ id: string; email: string }> };

      const rows = Array.isArray(allUsers) ? allUsers : allUsers.rows || [];
      const candidates = rows
        .map((r) => ({
          id: String(r.id),
          email: String(r.email ?? "")
            .trim()
            .toLowerCase(),
        }))
        .filter((r) => r.email !== ownerEmail && r.email !== e2eEmail);

      const report: PurgeReport = {
        preserved: [
          { email: ownerEmail, reason: "OWNER_EMAIL" },
          { email: e2eEmail, reason: "E2E_USER_EMAIL" },
        ],
        candidates,
        deleted: [],
        total_before: rows.length,
        total_after_dry_run: rows.length - candidates.length,
        dry_run: dryRun,
      };

      if (dryRun) {
        log.info("admin purge: dry run", {
          owner: ownerEmail,
          candidate_count: candidates.length,
          would_remain: report.total_after_dry_run,
        });
        return res.json(report);
      }

      // Execute purges sequentially so a partial failure mid-run leaves
      // a clear report rather than parallel chaos. The cascade per user
      // is fast (<200ms each) so 10-50 accounts purges in seconds.
      for (const candidate of candidates) {
        const result = await purgeAccount(candidate.id, { db: drizzle, log });
        report.deleted.push({
          id: candidate.id,
          email: candidate.email,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.error }),
        });
      }

      log.info("admin purge: executed", {
        owner: ownerEmail,
        deleted_count: report.deleted.filter((d) => d.ok).length,
        failed_count: report.deleted.filter((d) => !d.ok).length,
      });

      return res.json(report);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error("admin purge failed", { error: msg });
      throw AppError.fromHttpStatus(500, "Purge failed");
    }
  },
);

export default router;
