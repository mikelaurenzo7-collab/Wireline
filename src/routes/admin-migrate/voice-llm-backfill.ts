/* eslint-disable @typescript-eslint/no-explicit-any -- admin migration routes normalize heterogeneous legacy rows during one-off backfills. */

import { Router, Response } from "express";
import { drizzle, log, auditLogger } from "../../lib/server-context";
import { sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../../types/auth";
import { authorizeMigration, optionalAuth } from "./auth";

const router = Router();

// The cutover values. New signups already default to these via the
// schema (wireline_settings.voice_llm_provider / voice_llm_model), but
// tenants created before the 2026-Q1 Sonnet-voice tiering pass still
// carry the legacy Gemini voice path. This endpoint flips them.
const LEGACY_PROVIDER = "google";
const LEGACY_MODEL = "gemini-3.5-flash";
const TARGET_PROVIDER = "anthropic";
const TARGET_MODEL = "claude-sonnet-4-6";

/**
 * One-shot tenant backfill — flip legacy `google` / `gemini-3.5-flash`
 * voice-LLM settings rows to `anthropic` / `claude-sonnet-4-6`.
 *
 * Backlog item 3 from AUDIT_WINS.md. The 2026-Q1 tiering pass changed
 * the schema *default* only, which affects new signups; existing
 * tenants keep running Gemini on the live voice path until an operator
 * updates them. This endpoint performs the wholesale migration the
 * audit note called for: gated, dry-run-first, and audited.
 *
 * Safety:
 *   - Gated by authorizeMigration (OWNER_EMAIL or X-Migration-Token).
 *   - Dry-run by default. The UPDATE only runs when the caller passes
 *     `{ "apply": true }` (or `?apply=true`); otherwise it just counts
 *     and reports what *would* change, touching no rows.
 *   - Scoped strictly to rows that still hold the legacy pair, so
 *     re-running after a partial rollout is idempotent and never
 *     clobbers a tenant who deliberately set some other provider.
 *   - Writes a settings.updated audit event on apply.
 */
router.post(
  "/api/admin/migrate-voice-llm-backfill",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const apply =
      req.body?.apply === true || req.body?.apply === "true" || req.query?.apply === "true";

    try {
      // Count the rows that still carry the legacy voice pair. This is
      // the candidate set for both the dry-run report and the apply.
      const countRes: any = await drizzle.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM wireline_settings
        WHERE voice_llm_provider = ${LEGACY_PROVIDER}
          AND voice_llm_model = ${LEGACY_MODEL};
      `);
      const candidates: number = Number(countRes?.rows?.[0]?.n ?? countRes?.[0]?.n ?? 0) || 0;

      if (!apply) {
        log.info("migrate-voice-llm-backfill dry-run", {
          userId: req.user?.id || "migration-token",
          candidates,
        });
        return res.json({
          ok: true,
          dryRun: true,
          candidates,
          from: { provider: LEGACY_PROVIDER, model: LEGACY_MODEL },
          to: { provider: TARGET_PROVIDER, model: TARGET_MODEL },
          message:
            candidates === 0
              ? "No legacy voice-LLM rows found. Nothing to migrate."
              : `Dry run: ${candidates} tenant settings row(s) would be flipped to ${TARGET_PROVIDER}/${TARGET_MODEL}. Re-send with { "apply": true } to perform the migration.`,
        });
      }

      const updateRes: any = await drizzle.execute(sql`
        UPDATE wireline_settings
        SET voice_llm_provider = ${TARGET_PROVIDER},
            voice_llm_model = ${TARGET_MODEL},
            updated_at = now()
        WHERE voice_llm_provider = ${LEGACY_PROVIDER}
          AND voice_llm_model = ${LEGACY_MODEL};
      `);
      const updated: number = Number(updateRes?.rowCount ?? updateRes?.count ?? candidates) || 0;

      const actorId = req.user?.id || "migration-token";
      void auditLogger
        .logSettings("updated", {
          userId: actorId,
          changes: {
            migration: "voice-llm-backfill",
            from: { provider: LEGACY_PROVIDER, model: LEGACY_MODEL },
            to: { provider: TARGET_PROVIDER, model: TARGET_MODEL },
            rows_updated: updated,
          },
          ip: req.ip,
        })
        .catch((err: any) =>
          log.error("migrate-voice-llm-backfill audit log failed", {
            error: err?.message,
          }),
        );

      log.info("migrate-voice-llm-backfill applied", {
        userId: actorId,
        updated,
      });
      res.json({
        ok: true,
        dryRun: false,
        updated,
        from: { provider: LEGACY_PROVIDER, model: LEGACY_MODEL },
        to: { provider: TARGET_PROVIDER, model: TARGET_MODEL },
        message: `Migrated ${updated} tenant settings row(s) to ${TARGET_PROVIDER}/${TARGET_MODEL}.`,
      });
    } catch (err: any) {
      log.error("migrate-voice-llm-backfill failed", { error: err?.message });
      res.status(500).json({ error: err?.message || "Migration failed" });
    }
  },
);

export default router;
