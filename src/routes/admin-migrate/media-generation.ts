/* eslint-disable @typescript-eslint/no-explicit-any -- admin migration routes normalize heterogeneous legacy rows during one-off backfills. */

import { Router, Response } from "express";
import { AppError } from "../../lib/api-error";
import { log } from "../../lib/server-context";
import type { AuthenticatedRequest } from "../../types/auth";
import { authorizeMigration, optionalAuth } from "./auth";

const router = Router();

/**
 * Generate a fresh multi-speaker dialogue MP3 via ElevenLabs's
 * Text-to-Dialogue API and persist it to `public/sounds/<name>.mp3`
 * so the marketing landing page can embed it as a demo sample. The
 * route returns the public URL the operator can paste into the
 * marketing component.
 *
 * Owner-gated via the same `authorizeMigration` helper used by the
 * one-shot DDL endpoints — same set of trusted callers (OWNER_EMAIL
 * session OR X-Migration-Token header). Mike will curl this directly
 * to refresh the landing-page audio when launching a new vertical.
 *
 * Body: { name: string, lines: [{ voice_id: string, text: string }] }
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/text-to-dialogue
 */
router.post(
  "/api/admin/generate-dialogue-sample",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const { name, lines } = (req.body || {}) as {
      name?: unknown;
      lines?: unknown;
    };

    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: "name must be 1-64 chars matching [a-zA-Z0-9_-]+",
      });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      throw AppError.fromHttpStatus(400, "lines must be a non-empty array");
    }
    const safeLines: { voice_id: string; text: string }[] = [];
    for (const raw of lines) {
      if (!raw || typeof raw !== "object") {
        throw AppError.fromHttpStatus(400, "each line must be an object");
      }
      const voice_id = (raw as any).voice_id;
      const text = (raw as any).text;
      if (typeof voice_id !== "string" || !voice_id) {
        throw AppError.fromHttpStatus(400, "line.voice_id required");
      }
      if (typeof text !== "string" || !text.trim()) {
        throw AppError.fromHttpStatus(400, "line.text required");
      }
      safeLines.push({ voice_id, text });
    }

    try {
      const { composeDialogue, elevenLabsConfigured } = await import("../../lib/elevenlabs-client");
      if (!elevenLabsConfigured()) {
        throw AppError.fromHttpStatus(500, "ELEVENLABS_API_KEY not set");
      }

      const audio = await composeDialogue({ inputs: safeLines });

      // Persist under public/sounds/<name>.mp3 — Vite serves /public at
      // the site root, so the marketing page references /sounds/<n>.mp3.
      // We resolve relative to cwd which is the repo root for both
      // local dev and the Vercel build/serve.
      const path = await import("path");
      const fs = await import("fs/promises");
      const dir = path.join(process.cwd(), "public", "sounds");
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `${name}.mp3`);
      await fs.writeFile(outPath, Buffer.from(audio));

      const url = `/sounds/${name}.mp3`;
      log.info("generate-dialogue-sample completed", {
        userId: req.user?.id || "migration-token",
        name,
        bytes: audio.byteLength,
      });
      return res.json({ ok: true, url, bytes: audio.byteLength });
    } catch (err: any) {
      log.error("generate-dialogue-sample failed", { error: err?.message });
      throw AppError.fromHttpStatus(500, String(err?.message || "Dialogue generation failed"));
    }
  },
);

/**
 * Generate the Singing Receptionist jingle via the ElevenLabs Music
 * API and persist it to `public/sounds/wireline-jingle.mp3`. Powers
 * the marquee "fun" demo on /showcase (Mira). Same owner gating as
 * the other generate-* endpoints — OWNER_EMAIL session OR the
 * X-Migration-Token header.
 *
 * Body (all optional):
 *   {
 *     "prompt"?: string,            // override the default jingle prompt
 *     "music_length_ms"?: number,   // default 8000
 *     "filename"?: string           // default "wireline-jingle"
 *   }
 *
 * Vercel's serverless filesystem is ephemeral — the MP3 written
 * here survives until the deploy is rebuilt. For a permanent fix
 * the operator should ALSO run `node scripts/generate-jingle.mjs`
 * locally + commit the resulting file. This endpoint exists so
 * Mike can refresh the jingle on prod without redeploying, and
 * so people without the ELEVENLABS_API_KEY locally can still
 * trigger generation via a curl against the live deploy.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music
 */
router.post(
  "/api/admin/generate-jingle",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const body = (req.body || {}) as {
      prompt?: unknown;
      music_length_ms?: unknown;
      filename?: unknown;
    };

    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Upbeat playful jingle, female voice singing 'Welcome to Wireline, your phones are alive! Call us anytime, day or night!' — pop style, 8 seconds.";
    const lengthMs =
      typeof body.music_length_ms === "number" &&
      body.music_length_ms >= 3000 &&
      body.music_length_ms <= 600000
        ? body.music_length_ms
        : 8000;
    const filename =
      typeof body.filename === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(body.filename)
        ? body.filename
        : "wireline-jingle";

    try {
      const { composeMusic, elevenLabsConfigured } = await import("../../lib/elevenlabs-client");
      if (!elevenLabsConfigured()) {
        throw AppError.fromHttpStatus(500, "ELEVENLABS_API_KEY not set");
      }

      const audio = await composeMusic({ prompt, musicLengthMs: lengthMs });

      const path = await import("path");
      const fs = await import("fs/promises");
      const dir = path.join(process.cwd(), "public", "sounds");
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `${filename}.mp3`);
      await fs.writeFile(outPath, Buffer.from(audio));

      const url = `/sounds/${filename}.mp3`;
      log.info("generate-jingle completed", {
        userId: req.user?.id || "migration-token",
        filename,
        bytes: audio.byteLength,
        lengthMs,
      });
      return res.json({ ok: true, url, bytes: audio.byteLength, lengthMs });
    } catch (err: any) {
      log.error("generate-jingle failed", { error: err?.message });
      throw AppError.fromHttpStatus(500, String(err?.message || "Jingle generation failed"));
    }
  },
);

/**
 * Generate the brand sound-effect library via ElevenLabs's Sound
 * Effects API and persist the MP3s under `public/sounds/`. Owns the
 * platform's sonic identity: hold music for the failover/IVR path,
 * a transfer chime before warm hand-offs, an end-call sting, and a
 * small UI notification bell. Mike curls this endpoint after each
 * voice-design pass; assets ship in-tree so the CDN serves them
 * with no extra round-trip.
 *
 * Idempotent: existing files are skipped unless `?force=true` is
 * passed. Failures on individual sounds don't abort the batch — the
 * response lists per-file status so the operator can retry only
 * what didn't land.
 *
 * Auth: same `optionalAuth` + `authorizeMigration` pair the DDL
 * endpoints above use (OWNER_EMAIL session OR X-Migration-Token).
 * NEVER runs automatically — Mike triggers it himself.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects
 */
const BRAND_SOUND_SPECS: Array<{
  filename: string;
  text: string;
  durationSeconds: number;
  promptInfluence?: number;
}> = [
  {
    filename: "wireline-hold-music.mp3",
    text: "soft warm ambient lounge music, light piano, gentle, professional, on-hold music for a business phone line",
    durationSeconds: 22, // ElevenLabs caps single sound-gen at 22s; the caller of the asset loops it client-side for a 30s feel.
    promptInfluence: 0.25, // Slightly looser — gives the model room to breathe musically.
  },
  {
    filename: "wireline-transfer-chime.mp3",
    text: "soft pleasant two-note chime, ascending, professional handoff signal",
    durationSeconds: 1.5,
    promptInfluence: 0.4, // Tighter — short cues need to stay on-brief.
  },
  {
    filename: "wireline-end-sting.mp3",
    text: "subtle warm three-note outro, professional sign-off",
    durationSeconds: 1.2,
    promptInfluence: 0.4,
  },
  {
    filename: "wireline-bell-notification.mp3",
    text: "small bright chime, single note, friendly alert",
    durationSeconds: 0.8,
    promptInfluence: 0.4,
  },
];

router.post(
  "/api/admin/generate-brand-sounds",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const force = String(req.query.force || "").toLowerCase() === "true";

    try {
      const { generateSoundEffect, elevenLabsConfigured } =
        await import("../../lib/elevenlabs-client");
      if (!elevenLabsConfigured()) {
        throw AppError.fromHttpStatus(500, "ELEVENLABS_API_KEY not set");
      }

      const path = await import("path");
      const fs = await import("fs/promises");
      const dir = path.join(process.cwd(), "public", "sounds");
      await fs.mkdir(dir, { recursive: true });

      const results: Array<{
        filename: string;
        url: string;
        status: "generated" | "skipped" | "failed";
        bytes?: number;
        error?: string;
      }> = [];

      for (const spec of BRAND_SOUND_SPECS) {
        const outPath = path.join(dir, spec.filename);
        const url = `/sounds/${spec.filename}`;

        // Idempotent — skip if the file already exists unless force=true.
        // Lets Mike re-run safely on a deploy that only needs the missing
        // ones (e.g. an earlier batch partially failed).
        if (!force) {
          try {
            await fs.access(outPath);
            results.push({ filename: spec.filename, url, status: "skipped" });
            continue;
          } catch {
            /* file doesn't exist — fall through and generate */
          }
        }

        try {
          const audio = await generateSoundEffect({
            text: spec.text,
            durationSeconds: spec.durationSeconds,
            promptInfluence: spec.promptInfluence,
          });
          await fs.writeFile(outPath, Buffer.from(audio));
          results.push({
            filename: spec.filename,
            url,
            status: "generated",
            bytes: audio.byteLength,
          });
        } catch (e: any) {
          // Don't abort the batch — the operator may want partial success
          // and retry the failed ones independently. Failed files log as
          // warnings; the response status code reflects the partial result.
          log.warn("brand sound generation failed for one file", {
            filename: spec.filename,
            error: e?.message,
          });
          results.push({
            filename: spec.filename,
            url,
            status: "failed",
            error: e?.message || String(e),
          });
        }
      }

      log.info("generate-brand-sounds completed", {
        userId: req.user?.id || "migration-token",
        force,
        results: results.map((r) => ({ f: r.filename, s: r.status })),
      });

      const failed = results.filter((r) => r.status === "failed").length;
      // 207 Multi-Status when some succeeded + some failed; 200 on clean
      // (all generated or all skipped). Caller can branch on the ok flag.
      return res.status(failed > 0 ? 207 : 200).json({
        ok: failed === 0,
        force,
        results,
      });
    } catch (err: any) {
      log.error("generate-brand-sounds failed", { error: err?.message });
      throw AppError.fromHttpStatus(500, String(err?.message || "Brand sound generation failed"));
    }
  },
);

export default router;
