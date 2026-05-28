/* eslint-disable @typescript-eslint/no-explicit-any -- admin migration routes normalize heterogeneous legacy rows during one-off backfills. */

import { Router, Response } from "express";
import { drizzle, log } from "../../lib/server-context";
import { sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../../types/auth";
import { authorizeMigration, optionalAuth } from "./auth";

const router = Router();

// Per-agent ElevenLabs voice fine-tuning parameters. Adds four
// columns that map 1:1 to the ElevenLabs voice_settings payload:
//   * voice_stability         (numeric, default 0.5)
//   * voice_similarity_boost  (numeric, default 0.75)
//   * voice_style             (numeric, default 0.0)
//   * voice_speaker_boost     (boolean, default true)
//
// Operators with cloned voices need these to dial in their exact
// sound. Idempotent — every column uses `ADD COLUMN IF NOT EXISTS`
// so re-running after each deploy is safe. We also backfill rows
// that landed before the defaults kicked in (defensive — partial
// rollouts can leave NULLs behind that the IF-NOT-EXISTS guard
// happily skips on the second run).
//
// Defaults match ElevenLabs's documented defaults exactly so a
// freshly-migrated row sounds identical to "no fine-tuning at all"
// and the operator is free to leave the sliders untouched.
//
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request.body.voice_settings
router.post(
  "/api/admin/migrate-voice-quality-params",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    try {
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
          ADD COLUMN IF NOT EXISTS voice_stability NUMERIC(3, 2) DEFAULT 0.5;
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
          ADD COLUMN IF NOT EXISTS voice_similarity_boost NUMERIC(3, 2) DEFAULT 0.75;
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
          ADD COLUMN IF NOT EXISTS voice_style NUMERIC(3, 2) DEFAULT 0.0;
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
          ADD COLUMN IF NOT EXISTS voice_speaker_boost BOOLEAN DEFAULT TRUE;
      `);
      // Backfill rows that pre-existed the columns (their values would
      // be NULL until UPDATE-ed because PG only applies DEFAULT on
      // INSERT, not on ADD COLUMN with existing rows when the table is
      // large enough to skip the rewrite). Safe and idempotent.
      await drizzle.execute(sql`
        UPDATE wireline_agents SET voice_stability = 0.5 WHERE voice_stability IS NULL;
      `);
      await drizzle.execute(sql`
        UPDATE wireline_agents SET voice_similarity_boost = 0.75 WHERE voice_similarity_boost IS NULL;
      `);
      await drizzle.execute(sql`
        UPDATE wireline_agents SET voice_style = 0.0 WHERE voice_style IS NULL;
      `);
      await drizzle.execute(sql`
        UPDATE wireline_agents SET voice_speaker_boost = TRUE WHERE voice_speaker_boost IS NULL;
      `);
      log.info("migrate-voice-quality-params completed", {
        userId: req.user?.id || "migration-token",
      });
      res.json({
        ok: true,
        message:
          "wireline_agents fine-tuning columns ensured (stability=0.5, similarity_boost=0.75, style=0.0, speaker_boost=true).",
      });
    } catch (err: any) {
      log.error("migrate-voice-quality-params failed", { error: err?.message });
      res.status(500).json({ error: err?.message || "Migration failed" });
    }
  },
);

export default router;
