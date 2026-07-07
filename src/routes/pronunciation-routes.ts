import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * /api/pronunciation-dicts — Account Holder-managed pronunciation dictionaries.
 *
 *   GET    /api/pronunciation-dicts        — list this tenant's dictionaries
 *   POST   /api/pronunciation-dicts        — create + sync to ElevenLabs
 *   PATCH  /api/pronunciation-dicts/:id    — update entries (recreate on EL side)
 *   DELETE /api/pronunciation-dicts/:id    — remove locally + on EL
 *
 * Why: account holders in regulated verticals (medical, legal, real estate)
 * need their AI receptionist to pronounce industry jargon correctly.
 * ElevenLabs has first-class support: we maintain the rules locally
 * (so we control the UX) and mirror them to ElevenLabs so the
 * (dictionary_id, version_id) pair can be attached to every Vapi
 * assistant via voice.eleven_labs.pronunciation_dictionary_locators.
 *
 * Active dictionaries are read by the Vapi assistant factory at call
 * time and injected into the assistant config so playback applies
 * the Account Holder's vocabulary.
 *
 * Tenant isolation: every row is scoped to req.user.id. The mutation
 * routes always check ownership before touching ElevenLabs so a
 * confused-deputy can't delete another tenant's dictionary.
 */
import { Router, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { log, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import {
  createPronunciationDictionary,
  deletePronunciationDictionary,
  elevenLabsConfigured,
  type PronunciationRule,
} from "../lib/elevenlabs-client";

const router = Router();

// Reads are cheap; mutations fan out to ElevenLabs, so keep them tighter.
const readLimiter = createRateLimiter({
  bucket: "api:pronunciation-read",
  windowMs: 60_000,
  max: 120,
});
const mutateLimiter = createRateLimiter({
  bucket: "api:pronunciation-mutate",
  windowMs: 60_000,
  max: 30,
});

interface DictEntry {
  from: string;
  to: string;
  kind: "alias" | "phoneme";
}

const MAX_ENTRIES_PER_DICT = 500; // safety cap — ElevenLabs takes thousands but UX falls apart well before
const MAX_DICT_NAME_LEN = 80;

/**
 * Validate + normalize the incoming entries array. Returns either
 * the cleaned list or an error string the route handler can echo
 * back to the client. We strip whitespace, dedupe identical
 * `from` keys (last-write-wins so the UI can rewrite a row), and
 * reject empties.
 */
function normalizeEntries(raw: unknown): { entries: DictEntry[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "entries must be an array" };
  if (raw.length > MAX_ENTRIES_PER_DICT) {
    return { error: `Too many entries (max ${MAX_ENTRIES_PER_DICT})` };
  }
  const seen = new Map<string, DictEntry>();
  for (const r of raw) {
    if (!r || typeof r !== "object") return { error: "Each entry must be an object" };
    const from = typeof (r as any).from === "string" ? (r as any).from.trim() : "";
    const to = typeof (r as any).to === "string" ? (r as any).to.trim() : "";
    const kind = (r as any).kind === "phoneme" ? "phoneme" : "alias";
    if (!from || !to) continue; // drop blanks silently — UI ships empty rows on add-row
    if (from.length > 200 || to.length > 400) {
      return { error: "Entry too long" };
    }
    seen.set(from, { from, to, kind });
  }
  return { entries: Array.from(seen.values()) };
}

/**
 * Translate our internal entry shape into ElevenLabs's rules
 * payload shape. Alias and phoneme cases require different keys.
 */
function toElevenLabsRules(entries: DictEntry[]): PronunciationRule[] {
  return entries.map((e) =>
    e.kind === "phoneme"
      ? {
          string_to_replace: e.from,
          type: "phoneme" as const,
          phoneme: e.to,
          alphabet: "ipa" as const,
        }
      : { string_to_replace: e.from, type: "alias" as const, alias: e.to },
  );
}

// GET /api/pronunciation-dicts — list this tenant's dictionaries.
router.get(
  "/api/pronunciation-dicts",
  authenticateUser,
  readLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select()
        .from(schema.pronunciationDictionaries)
        .where(eq(schema.pronunciationDictionaries.userId, req.user.id))
        .orderBy(desc(schema.pronunciationDictionaries.createdAt));
      res.json({ dictionaries: rows, configured: elevenLabsConfigured() });
    } catch (e: any) {
      // 42P01 = undefined_table. If the migration hasn't run yet, return
      // an empty list so the admin UI keeps loading instead of erroring.
      if (e?.code === "42P01" || /does not exist/i.test(e?.message || "")) {
        log.warn(
          "wireline_pronunciation_dictionaries table missing - apply the checked pronunciation dictionary migration",
        );
        return res.json({ dictionaries: [], configured: elevenLabsConfigured() });
      }
      log.error("/api/pronunciation-dicts GET failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to list pronunciation dictionaries");
    }
  },
);

// POST /api/pronunciation-dicts — create a new dictionary + sync to EL.
router.post(
  "/api/pronunciation-dicts",
  authenticateUser,
  mutateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = (req.body?.name || "").toString().trim();
      if (name.length < 1 || name.length > MAX_DICT_NAME_LEN) {
        throw AppError.fromHttpStatus(400, `Name required (1-${MAX_DICT_NAME_LEN} characters)`);
      }
      const norm = normalizeEntries(req.body?.entries);
      if ("error" in norm) throw AppError.fromHttpStatus(400, String(norm.error));

      // Insert locally first so we have a stable row id even if the
      // EL sync fails — Account Holder can retry the sync from the UI later.
      const [inserted] = await drizzle
        .insert(schema.pronunciationDictionaries)
        .values({
          userId: req.user.id,
          name,
          entries: norm.entries as unknown as any,
          active: req.body?.active !== false,
        })
        .returning();

      // Sync to ElevenLabs only if there are rules + the API key is set.
      // Empty dictionaries are valid drafts; we sync once the Account Holder
      // adds entries via PATCH.
      let synced: { id: string; version_id: string } | null = null;
      if (elevenLabsConfigured() && norm.entries.length > 0) {
        try {
          const result = await createPronunciationDictionary({
            name: `wireline-${req.user.id.slice(0, 8)}-${inserted.id.slice(0, 8)}-${name}`.slice(
              0,
              100,
            ),
            rules: toElevenLabsRules(norm.entries),
            description: `Wireline tenant ${req.user.id} dictionary ${inserted.id}`,
          });
          synced = { id: result.id, version_id: result.version_id };
          await drizzle
            .update(schema.pronunciationDictionaries)
            .set({
              elevenlabsDictionaryId: result.id,
              elevenlabsVersionId: result.version_id,
              updatedAt: new Date(),
            })
            .where(eq(schema.pronunciationDictionaries.id, inserted.id));
        } catch (e) {
          if (e instanceof AppError) throw e;
          log.warn("pronunciation dict EL sync failed on create", {
            error: getErrorMessage(e),
            dictId: inserted.id,
          });
        }
      }

      log.info("pronunciation dict created", {
        userId: req.user.id,
        dictId: inserted.id,
        synced: !!synced,
      });
      res.json({
        dictionary: {
          ...inserted,
          elevenlabsDictionaryId: synced?.id || inserted.elevenlabsDictionaryId,
          elevenlabsVersionId: synced?.version_id || inserted.elevenlabsVersionId,
        },
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("/api/pronunciation-dicts POST failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to create pronunciation dictionary");
    }
  },
);

// PATCH /api/pronunciation-dicts/:id — update name/entries/active.
// Because ElevenLabs has no "replace all rules" endpoint, when entries
// change we delete the old EL-side dictionary and create a fresh one;
// the new (id, version_id) pair replaces what we stored.
router.patch(
  "/api/pronunciation-dicts/:id",
  authenticateUser,
  mutateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const [existing] = await drizzle
        .select()
        .from(schema.pronunciationDictionaries)
        .where(
          and(
            eq(schema.pronunciationDictionaries.id, id),
            eq(schema.pronunciationDictionaries.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!existing) throw AppError.fromHttpStatus(404, "Not found");

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      let nextEntries: DictEntry[] | null = null;

      if (typeof req.body?.name === "string") {
        const trimmed = req.body.name.trim();
        if (trimmed.length < 1 || trimmed.length > MAX_DICT_NAME_LEN) {
          throw AppError.fromHttpStatus(400, `Name must be 1-${MAX_DICT_NAME_LEN} characters`);
        }
        updates.name = trimmed;
      }
      if (req.body?.entries !== undefined) {
        const norm = normalizeEntries(req.body.entries);
        if ("error" in norm) throw AppError.fromHttpStatus(400, String(norm.error));
        updates.entries = norm.entries as unknown as any;
        nextEntries = norm.entries;
      }
      if (typeof req.body?.active === "boolean") {
        updates.active = req.body.active;
      }

      // If entries changed, recreate the EL dictionary. We do this
      // before the DB update so on success we can stamp the new IDs
      // in the same row update.
      if (nextEntries && elevenLabsConfigured()) {
        // Tear down the old dictionary (best-effort — 404s ok).
        if (existing.elevenlabsDictionaryId) {
          try {
            await deletePronunciationDictionary(existing.elevenlabsDictionaryId);
          } catch (e) {
            if (e instanceof AppError) throw e;
            log.warn("pronunciation dict EL delete on patch failed", {
              error: getErrorMessage(e),
              dictId: id,
            });
          }
        }
        // Recreate only when we have rules — empty dicts stay
        // unsynced (no EL row needed for an empty ruleset).
        if (nextEntries.length > 0) {
          try {
            const result = await createPronunciationDictionary({
              name: `wireline-${req.user.id.slice(0, 8)}-${id.slice(0, 8)}-${
                (updates.name as string) || existing.name
              }`.slice(0, 100),
              rules: toElevenLabsRules(nextEntries),
              description: `Wireline tenant ${req.user.id} dictionary ${id}`,
            });
            updates.elevenlabsDictionaryId = result.id;
            updates.elevenlabsVersionId = result.version_id;
          } catch (e) {
            if (e instanceof AppError) throw e;
            log.warn("pronunciation dict EL recreate on patch failed", {
              error: getErrorMessage(e),
              dictId: id,
            });
            // Clear stale IDs so we don't keep referencing a deleted dict.
            updates.elevenlabsDictionaryId = null;
            updates.elevenlabsVersionId = null;
          }
        } else {
          updates.elevenlabsDictionaryId = null;
          updates.elevenlabsVersionId = null;
        }
      }

      const [updated] = await drizzle
        .update(schema.pronunciationDictionaries)
        .set(updates as any)
        .where(
          and(
            eq(schema.pronunciationDictionaries.id, id),
            eq(schema.pronunciationDictionaries.userId, req.user.id),
          ),
        )
        .returning();

      log.info("pronunciation dict updated", { userId: req.user.id, dictId: id });
      res.json({ dictionary: updated });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("/api/pronunciation-dicts PATCH failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update pronunciation dictionary");
    }
  },
);

// DELETE /api/pronunciation-dicts/:id — remove locally + on EL.
router.delete(
  "/api/pronunciation-dicts/:id",
  authenticateUser,
  mutateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const [existing] = await drizzle
        .select()
        .from(schema.pronunciationDictionaries)
        .where(
          and(
            eq(schema.pronunciationDictionaries.id, id),
            eq(schema.pronunciationDictionaries.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!existing) throw AppError.fromHttpStatus(404, "Not found");

      if (existing.elevenlabsDictionaryId && elevenLabsConfigured()) {
        try {
          await deletePronunciationDictionary(existing.elevenlabsDictionaryId);
        } catch (e) {
          if (e instanceof AppError) throw e;
          log.warn("pronunciation dict EL delete failed — removing local row anyway", {
            error: getErrorMessage(e),
            dictId: id,
          });
        }
      }

      await drizzle
        .delete(schema.pronunciationDictionaries)
        .where(
          and(
            eq(schema.pronunciationDictionaries.id, id),
            eq(schema.pronunciationDictionaries.userId, req.user.id),
          ),
        );

      log.info("pronunciation dict deleted", { userId: req.user.id, dictId: id });
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("/api/pronunciation-dicts DELETE failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to delete pronunciation dictionary");
    }
  },
);

export default router;
