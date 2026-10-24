import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  LIVE_VOICE_CONSENT_SCOPES,
  LIVE_VOICE_CONSENT_VERSION,
  liveVoices,
  type LiveVoice,
  type LiveVoiceConsentScope,
} from "../../db/live-voice-schema";
import { AppError } from "../api-error";
import { drizzle, log, tenantStore } from "../server-context";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import {
  analyzeLiveVoiceRecording,
  LIVE_VOICE_COACHING_COPY,
  LIVE_VOICE_MAX_BYTES,
  LIVE_VOICE_MAX_SECONDS,
  LIVE_VOICE_MIN_QUALITY_SCORE,
  LIVE_VOICE_MIN_SECONDS,
  LIVE_VOICE_RECOMMENDED_SECONDS,
  readPcm16MonoWav,
  type LiveVoiceQualityReport,
} from "./live-voice-quality";
import {
  createXAICustomVoice,
  deleteXAICustomVoice,
  isXAICustomVoiceConfigured,
  isXAICustomVoiceId,
  synthesizeXAIVoiceLine,
  XAICustomVoiceError,
  type XAICustomVoiceErrorCode,
} from "./xai-custom-voice-client";
import { stockFallbackVoiceFor } from "./xai-voice-config";
import { voiceSampleLine } from "./voice-sample";

/** Per-account cap; the provider team has a shared ceiling (30 by default). */
export const LIVE_VOICE_MAX_PER_ACCOUNT = 2;
/** The bot setting that points a Bot at a cloned voice. */
export const LIVE_CUSTOM_VOICE_KEY = "wirelineLiveCustomVoice";

export type LiveVoiceSummary = {
  id: string;
  name: string;
  status: "ready";
  qualityScore: number | null;
  sourceDurationSeconds: number;
  gender: "female" | "male" | null;
  createdAt: string;
  lastUsedAt: string | null;
  inUseByAgentIds: string[];
};

export type RuntimeCustomVoice = {
  cloneId: string;
  voiceId: string;
  name: string;
  /** Picks a same-gender stock voice if the clone has to step aside mid-call. */
  gender: "female" | "male" | null;
};

type Actor = { id: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function liveVoiceCloneEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LIVE_VOICE_CLONE_ENABLED !== "false" && isXAICustomVoiceConfigured(env);
}

/** The cloned-voice reference stored on a Bot, or null. */
export function customVoiceSelection(businessVariables: unknown): { cloneId: string } | null {
  const raw = asRecord(asRecord(businessVariables)[LIVE_CUSTOM_VOICE_KEY]);
  const cloneId = typeof raw.cloneId === "string" ? raw.cloneId : "";
  return UUID.test(cloneId) ? { cloneId } : null;
}

const FRIENDLY_PROVIDER_ERRORS: Record<
  XAICustomVoiceErrorCode,
  { status: number; message: string }
> = {
  not_configured: {
    status: 503,
    message: "Voice cloning is temporarily unavailable. Your stock voice is still working.",
  },
  not_entitled: {
    status: 503,
    message:
      "Voice cloning is warming up for your account. We'll let you know as soon as it's ready — your stock voice keeps working meanwhile.",
  },
  limit_reached: {
    status: 409,
    message:
      "Voice cloning is at capacity right now. Remove a voice you no longer use, or try again soon.",
  },
  rejected_audio: {
    status: 422,
    message:
      "We couldn't build a voice from that recording. Try a quieter room and read the script at a natural pace.",
  },
  region_unavailable: { status: 451, message: "Voice cloning isn't available in your region yet." },
  not_found: { status: 404, message: "That voice is no longer available." },
  provider_unavailable: {
    status: 503,
    message:
      "We couldn't finish your voice just now. Nothing was charged — please try again in a minute.",
  },
};

function friendlyProviderError(error: unknown): AppError {
  const code = error instanceof XAICustomVoiceError ? error.code : "provider_unavailable";
  const friendly = FRIENDLY_PROVIDER_ERRORS[code];
  return new AppError(friendly.status, `LIVE_VOICE_${code.toUpperCase()}`, friendly.message);
}

async function inTenant<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return tenantStore.run(userId, work);
}

async function readyVoices(userId: string): Promise<LiveVoice[]> {
  return inTenant(userId, () =>
    drizzle
      .select()
      .from(liveVoices)
      .where(and(eq(liveVoices.userId, userId), eq(liveVoices.status, "ready")))
      .orderBy(desc(liveVoices.createdAt))
      .limit(20),
  );
}

async function readyVoice(userId: string, id: string): Promise<LiveVoice> {
  if (!UUID.test(id)) throw AppError.notFound("Voice not found.");
  const [row] = await inTenant(userId, () =>
    drizzle
      .select()
      .from(liveVoices)
      .where(
        and(eq(liveVoices.userId, userId), eq(liveVoices.id, id), eq(liveVoices.status, "ready")),
      )
      .limit(1),
  );
  if (!row) throw AppError.notFound("Voice not found.");
  return row;
}

async function ownedAgents(userId: string) {
  return inTenant(userId, () =>
    drizzle
      .select({ id: schema.agents.id, businessVariables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId)),
  );
}

function summarize(
  row: LiveVoice,
  agents: { id: string; businessVariables: unknown }[],
): LiveVoiceSummary {
  return {
    id: row.id,
    name: row.name,
    status: "ready",
    qualityScore: row.qualityScore,
    sourceDurationSeconds: row.sourceDurationSeconds,
    gender: row.voiceGender ?? null,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    inUseByAgentIds: agents
      .filter((agent) => customVoiceSelection(agent.businessVariables)?.cloneId === row.id)
      .map((agent) => agent.id),
  };
}

async function fenced<T>(userId: string, operation: string, perform: () => Promise<T>): Promise<T> {
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId,
    operation,
    perform: () => inTenant(userId, perform),
  });
  if (!outcome.performed) throw AppError.notFound("Account is no longer available.");
  return outcome.result;
}

export type CreateLiveVoiceInput = {
  name: unknown;
  consentAccepted: unknown;
  consentVersion: unknown;
  consentScope: unknown;
  gender?: unknown;
};

export const liveVoiceService = {
  capabilities(actor: Actor) {
    void actor;
    return {
      available: liveVoiceCloneEnabled(),
      consentVersion: LIVE_VOICE_CONSENT_VERSION,
      minSeconds: LIVE_VOICE_MIN_SECONDS,
      recommendedSeconds: LIVE_VOICE_RECOMMENDED_SECONDS,
      maxSeconds: LIVE_VOICE_MAX_SECONDS,
      maxBytes: LIVE_VOICE_MAX_BYTES,
      maxVoices: LIVE_VOICE_MAX_PER_ACCOUNT,
      minQualityScore: LIVE_VOICE_MIN_QUALITY_SCORE,
    };
  },

  async list(actor: Actor) {
    const [rows, agents] = await Promise.all([readyVoices(actor.id), ownedAgents(actor.id)]);
    return { voices: rows.map((row) => summarize(row, agents)), ...this.capabilities(actor) };
  },

  /** Server-side quality gate; returns the report so the UI can coach. */
  inspect(wav: Buffer): LiveVoiceQualityReport {
    let decoded;
    try {
      decoded = readPcm16MonoWav(wav);
    } catch {
      throw new AppError(
        400,
        "LIVE_VOICE_INVALID_AUDIO",
        "That recording couldn't be read. Record again in the browser, or upload a mono WAV.",
      );
    }
    return analyzeLiveVoiceRecording(decoded.samples, decoded.sampleRateHz);
  },

  async create(actor: Actor, wav: Buffer, input: CreateLiveVoiceInput) {
    if (!liveVoiceCloneEnabled())
      throw friendlyProviderError(new XAICustomVoiceError("not_configured", null, ""));
    const name = typeof input.name === "string" ? input.name.trim() : "";
    // eslint-disable-next-line no-control-regex
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
      throw AppError.badRequest("Name this voice using 80 characters or fewer.");
    const consentScope = String(input.consentScope || "") as LiveVoiceConsentScope;
    if (
      input.consentAccepted !== true ||
      input.consentVersion !== LIVE_VOICE_CONSENT_VERSION ||
      !(LIVE_VOICE_CONSENT_SCOPES as readonly string[]).includes(consentScope)
    )
      throw new AppError(
        400,
        "LIVE_VOICE_CONSENT_REQUIRED",
        "Please confirm you have permission to clone this voice before continuing.",
      );
    if (wav.byteLength > LIVE_VOICE_MAX_BYTES)
      throw new AppError(413, "LIVE_VOICE_TOO_LARGE", "Keep the recording under two minutes.");
    const quality = this.inspect(wav);
    if (
      quality.durationSeconds < LIVE_VOICE_MIN_SECONDS ||
      quality.durationSeconds > LIVE_VOICE_MAX_SECONDS + 1
    )
      throw new AppError(
        422,
        "LIVE_VOICE_LENGTH",
        "Record between 10 seconds and 2 minutes — about 90 seconds is ideal.",
        { quality },
      );
    if (quality.score < LIVE_VOICE_MIN_QUALITY_SCORE)
      throw new AppError(
        422,
        "LIVE_VOICE_QUALITY",
        quality.tips.map((tip) => LIVE_VOICE_COACHING_COPY[tip]).join(" ") ||
          "Let's try that once more in a quieter spot.",
        { quality },
      );
    const existing = await readyVoices(actor.id);
    if (existing.length >= LIVE_VOICE_MAX_PER_ACCOUNT)
      throw new AppError(
        409,
        "LIVE_VOICE_ACCOUNT_LIMIT",
        `You can keep ${LIVE_VOICE_MAX_PER_ACCOUNT} cloned voices. Remove one to add another.`,
      );
    const gender = input.gender === "male" || input.gender === "female" ? input.gender : undefined;
    const sourceSha256 = createHash("sha256").update(wav).digest("hex");

    return fenced(actor.id, "live_voice_create", async () => {
      let voiceId: string;
      try {
        ({ voiceId } = await createXAICustomVoice({
          name,
          wav,
          gender,
          useCase: "customer_support",
        }));
      } catch (error) {
        log.warn("Live voice clone failed at provider", {
          userId: actor.id,
          code: error instanceof XAICustomVoiceError ? error.code : "unknown",
          status: error instanceof XAICustomVoiceError ? error.status : null,
        });
        throw friendlyProviderError(error);
      }
      try {
        const now = new Date();
        const [row] = await drizzle
          .insert(liveVoices)
          .values({
            userId: actor.id,
            name,
            provider: "xai",
            providerVoiceId: voiceId,
            status: "ready",
            consentVersion: LIVE_VOICE_CONSENT_VERSION,
            consentScope,
            consentAcceptedAt: now,
            consentAcceptedBy: actor.id,
            sourceSha256,
            sourceDurationSeconds: Math.min(LIVE_VOICE_MAX_SECONDS, quality.durationSeconds),
            qualityScore: quality.score,
            voiceGender: gender ?? null,
          })
          .returning();
        log.info("Live voice clone created", {
          userId: actor.id,
          cloneId: row.id,
          qualityScore: quality.score,
        });
        return { voice: summarize(row, []), quality };
      } catch (error) {
        // Never leave an orphaned provider voice behind a failed insert.
        await deleteXAICustomVoice(voiceId).catch(() => {});
        throw error;
      }
    });
  },

  async remove(actor: Actor, id: string) {
    const row = await readyVoice(actor.id, id);
    return fenced(actor.id, "live_voice_delete", async () => {
      if (row.providerVoiceId) {
        try {
          await deleteXAICustomVoice(row.providerVoiceId);
        } catch (error) {
          log.warn("Live voice provider delete failed", {
            userId: actor.id,
            cloneId: row.id,
            code: error instanceof XAICustomVoiceError ? error.code : "unknown",
          });
          throw new AppError(
            503,
            "LIVE_VOICE_DELETE_RETRY",
            "We couldn't remove that voice just now. Please try again in a minute.",
          );
        }
      }
      await drizzle
        .update(liveVoices)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          deletedReason: "user_deleted",
          updatedAt: new Date(),
        })
        .where(and(eq(liveVoices.userId, actor.id), eq(liveVoices.id, row.id)));
      // Any Bot that used it goes back to its stock voice immediately.
      for (const agent of await ownedAgents(actor.id)) {
        if (customVoiceSelection(agent.businessVariables)?.cloneId !== row.id) continue;
        const variables = { ...asRecord(agent.businessVariables) };
        delete variables[LIVE_CUSTOM_VOICE_KEY];
        await drizzle
          .update(schema.agents)
          .set({ businessVariables: variables })
          .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, actor.id)));
      }
      return { deleted: true as const };
    });
  },

  /** One line, spoken by the clone or the Bot's stock voice, for an honest A/B. */
  async preview(
    actor: Actor,
    id: string,
    input: { variant: "clone" | "stock"; agentName?: string; stockVoice?: string },
  ): Promise<Buffer> {
    const row = await readyVoice(actor.id, id);
    const line = voiceSampleLine(input.agentName || "your Bot");
    const voiceId =
      input.variant === "clone"
        ? row.providerVoiceId!
        : // The same stock voice a call would fall back to, so the A/B is honest.
          stockFallbackVoiceFor(input.stockVoice, row.voiceGender);
    try {
      return await synthesizeXAIVoiceLine(voiceId, line);
    } catch (error) {
      throw friendlyProviderError(error);
    }
  },

  async useOnBot(actor: Actor, id: string, agentId: string) {
    const row = await readyVoice(actor.id, id);
    if (!UUID.test(agentId)) throw AppError.notFound("Bot not found.");
    const [agent] = await inTenant(actor.id, () =>
      drizzle
        .select({ id: schema.agents.id, businessVariables: schema.agents.businessVariables })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, actor.id)))
        .limit(1),
    );
    if (!agent) throw AppError.notFound("Bot not found.");
    const variables = {
      ...asRecord(agent.businessVariables),
      [LIVE_CUSTOM_VOICE_KEY]: {
        cloneId: row.id,
        name: row.name,
        selectedAt: new Date().toISOString(),
      },
    };
    await inTenant(actor.id, () =>
      drizzle
        .update(schema.agents)
        .set({ businessVariables: variables })
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, actor.id))),
    );
    return { agentId, customVoice: { cloneId: row.id, name: row.name } };
  },

  /** One tap back to the Bot's stock voice. Idempotent. */
  async useStock(actor: Actor, agentId: string) {
    if (!UUID.test(agentId)) throw AppError.notFound("Bot not found.");
    const [agent] = await inTenant(actor.id, () =>
      drizzle
        .select({ id: schema.agents.id, businessVariables: schema.agents.businessVariables })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, actor.id)))
        .limit(1),
    );
    if (!agent) throw AppError.notFound("Bot not found.");
    const variables = { ...asRecord(agent.businessVariables) };
    delete variables[LIVE_CUSTOM_VOICE_KEY];
    await inTenant(actor.id, () =>
      drizzle
        .update(schema.agents)
        .set({ businessVariables: variables })
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, actor.id))),
    );
    return { agentId, customVoice: null };
  },
};

/**
 * Resolve a Bot's cloned voice for a live session. Never throws: any lookup
 * problem (flag off, table not yet migrated, deleted clone) means the stock
 * voice answers, so a call can never fail because of a clone.
 */
export async function resolveRuntimeCustomVoice(
  userId: string,
  businessVariables: unknown,
): Promise<RuntimeCustomVoice | null> {
  const selection = customVoiceSelection(businessVariables);
  if (!selection || !liveVoiceCloneEnabled()) return null;
  try {
    const [row] = await drizzle
      .select({
        id: liveVoices.id,
        name: liveVoices.name,
        providerVoiceId: liveVoices.providerVoiceId,
        voiceGender: liveVoices.voiceGender,
      })
      .from(liveVoices)
      .where(
        and(
          eq(liveVoices.userId, userId),
          eq(liveVoices.id, selection.cloneId),
          eq(liveVoices.status, "ready"),
        ),
      )
      .limit(1);
    if (!row || !isXAICustomVoiceId(row.providerVoiceId)) return null;
    void drizzle
      .update(liveVoices)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(liveVoices.userId, userId), eq(liveVoices.id, row.id)))
      .catch(() => {});
    return {
      cloneId: row.id,
      voiceId: row.providerVoiceId,
      name: row.name,
      gender: row.voiceGender ?? null,
    };
  } catch (error) {
    log.warn("Cloned voice lookup failed; using stock voice", {
      userId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}

/** Account deletion: remove provider-side voices before rows are purged. */
export async function deleteProviderLiveVoicesForAccount(
  db: typeof drizzle,
  userId: string,
): Promise<number> {
  let rows: Array<{ id: string; providerVoiceId: string | null }>;
  try {
    rows = await db
      .select({ id: liveVoices.id, providerVoiceId: liveVoices.providerVoiceId })
      .from(liveVoices)
      .where(and(eq(liveVoices.userId, userId), eq(liveVoices.status, "ready")));
  } catch (err) {
    // Before migration 0186 reaches an environment there is nothing to delete.
    const code =
      (err as { code?: string; cause?: { code?: string } } | null)?.code ??
      (err as { cause?: { code?: string } } | null)?.cause?.code;
    if (code === "42P01") return 0;
    throw err;
  }
  let deleted = 0;
  for (const row of rows) {
    if (!row.providerVoiceId) continue;
    await deleteXAICustomVoice(row.providerVoiceId);
    deleted += 1;
  }
  return deleted;
}
