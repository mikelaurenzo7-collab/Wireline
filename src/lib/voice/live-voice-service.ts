import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { elevenLabsCallsConfigured } from "./cloned-media-config";
import { renderClonedStockPreview } from "./cloned-speech-stream";
import {
  reservePlatformCostRecord,
  commitPlatformCostReservation,
} from "../../middleware/audit-middleware";

import * as schema from "../../db/schema";
import {
  LIVE_VOICE_CONSENT_SCOPES,
  LIVE_VOICE_CONSENT_VERSION,
  liveVoices,
  type LiveVoice,
  type LiveVoiceConsentScope,
  type LiveVoiceDeletedReason,
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
  alertCloneEngineCapacity,
  cloneEngine,
  CloneEngineError,
  isCloneEngineId,
  type CloneEngine,
  type CloneEngineErrorCode,
  type CloneEngineId,
} from "./clone-engines";
import {
  BIOMETRIC_RELEASE_VERSION,
  biometricReleaseRecord,
  BIOMETRIC_RETENTION_SUMMARY,
  BIOMETRIC_RETENTION_POLICY_VERSION,
  biometricExpiresAt,
  CLONE_ENGINE_FALLTHROUGH_CODES,
  cloneEngineCandidates,
  parseSignedLegalName,
  parseSpeakerJurisdiction,
  requiresWrittenBiometricRelease,
  resolvePreferredCloneEngine,
  resolveXAICustomVoiceTeamLimit,
  WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS,
  noteXAICustomVoiceNotEntitled,
  xaiCustomVoiceApiEntitled,
  type SpeakerJurisdiction,
} from "./clone-engine-selection";
import { stockFallbackVoiceFor } from "./xai-voice-config";
import { voiceSampleLine } from "./voice-sample";

/** Per-account cap on every engine; each engine also has a shared workspace/team ceiling. */
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
  /** Scheduled destruction date when a retention schedule applies, else null. */
  expiresAt: string | null;
  /** Whether live phone calls speak this voice today (else the closest stock voice answers). */
  speaksOnCalls: boolean;
  inUseByAgentIds: string[];
};

export type RuntimeCustomVoice = {
  cloneId: string;
  /** Engine that holds the voice. Only `xai` voices are spoken natively by the phone runtime. */
  engine: CloneEngineId;
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

/**
 * Provider credentials do not grant rollout approval. Cloning stays off until
 * explicitly enabled; consent and ownership checks always apply.
 */
export function liveVoiceCloneEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LIVE_VOICE_CLONE_ENABLED !== "true") return false;
  return cloneEngine("xai").configured() || cloneEngine("elevenlabs").configured();
}

/** Engines available to the native or streaming phone runtime. */
export function engineSpeaksOnCalls(engine: CloneEngineId): boolean {
  return (
    cloneEngine(engine).liveMode === "native_realtime" ||
    (engine === "elevenlabs" && elevenLabsCallsConfigured())
  );
}

function voiceNotExpired() {
  return or(isNull(liveVoices.expiresAt), gt(liveVoices.expiresAt, new Date()));
}

function validBotId(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
}

function engineFor(row: Pick<LiveVoice, "provider">): CloneEngine {
  return cloneEngine(isCloneEngineId(row.provider) ? row.provider : "xai");
}

/** The cloned-voice reference stored on a Bot, or null. */
export function customVoiceSelection(businessVariables: unknown): { cloneId: string } | null {
  const raw = asRecord(asRecord(businessVariables)[LIVE_CUSTOM_VOICE_KEY]);
  const cloneId = typeof raw.cloneId === "string" ? raw.cloneId : "";
  return UUID.test(cloneId) ? { cloneId } : null;
}

const FRIENDLY_PROVIDER_ERRORS: Record<CloneEngineErrorCode, { status: number; message: string }> =
  {
    not_configured: {
      status: 503,
      message:
        "Voice cloning could not connect. Keep this page open and try again. Your built-in voice still works.",
    },
    not_entitled: {
      status: 503,
      message:
        "Voice cloning is warming up for your account. We'll let you know as soon as it's ready. Your stock voice keeps working meanwhile.",
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
    quota_exhausted: {
      status: 503,
      message:
        "Voice cloning is at capacity right now. Your stock voice keeps working. Please try again soon.",
    },
    region_unavailable: {
      status: 451,
      message: "Voice cloning isn't available in your region yet.",
    },
    not_found: { status: 404, message: "That voice is no longer available." },
    provider_unavailable: {
      status: 503,
      message:
        "We couldn't finish your voice just now. Nothing was charged. Please try again in a minute.",
    },
  };

function friendlyProviderError(error: unknown): AppError {
  const code = error instanceof CloneEngineError ? error.code : "provider_unavailable";
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
      .where(and(eq(liveVoices.userId, userId), eq(liveVoices.status, "ready"), voiceNotExpired()))
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
        and(
          eq(liveVoices.userId, userId),
          eq(liveVoices.id, id),
          eq(liveVoices.status, "ready"),
          voiceNotExpired(),
        ),
      )
      .limit(1),
  );
  if (!row) throw AppError.notFound("Voice not found.");
  return row;
}

async function ownedAgents(userId: string) {
  return inTenant(userId, () =>
    drizzle
      .select({
        id: schema.agents.id,
        businessVariables: schema.agents.businessVariables,
      })
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
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    speaksOnCalls: engineSpeaksOnCalls(engineFor(row).id),
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
  /** Speaker's residence: `US-XX` or `INTL`. Decides engine and consent rules. */
  speakerJurisdiction?: unknown;
  /** Written voice release, signed by the speaker (required for every voice). */
  biometricReleaseAccepted?: unknown;
  biometricReleaseVersion?: unknown;
  biometricReleaseSignedName?: unknown;
  /** Bot name shown in the release, so the stored text matches what was signed. */
  agentName?: unknown;
};

/** Ready xAI voices across every BotBound account (one shared xAI team). */
async function xaiTeamVoicesUsed(): Promise<number> {
  try {
    const [row] = await tenantStore.exit(() =>
      drizzle
        .select({ n: count() })
        .from(liveVoices)
        .where(and(eq(liveVoices.provider, "xai"), eq(liveVoices.status, "ready")))
        .execute(),
    );
    return Number(row?.n ?? 0);
  } catch {
    // Unknown usage never blocks a clone; xAI's own 400 at the cap falls through.
    return 0;
  }
}

const SWEEP_BATCH = 25;

async function clearBotSelections(userId: string, cloneId: string): Promise<void> {
  for (const agent of await ownedAgents(userId)) {
    if (customVoiceSelection(agent.businessVariables)?.cloneId !== cloneId) continue;
    const variables = { ...asRecord(agent.businessVariables) };
    delete variables[LIVE_CUSTOM_VOICE_KEY];
    await drizzle
      .update(schema.agents)
      .set({ businessVariables: variables })
      .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, userId)));
  }
}

async function destroyRow(
  userId: string,
  row: Pick<LiveVoice, "id" | "provider" | "providerVoiceId">,
  reason: LiveVoiceDeletedReason,
): Promise<void> {
  // Revoke locally first. Provider outages must never leave a revoked or
  // expired voice selectable; cleanup_pending retains durable retry evidence.
  await drizzle
    .update(liveVoices)
    .set({
      status: "cleanup_pending",
      deletedReason: reason,
      updatedAt: new Date(),
    })
    .where(and(eq(liveVoices.userId, userId), eq(liveVoices.id, row.id)));
  await clearBotSelections(userId, row.id);
  if (row.providerVoiceId) await engineFor(row).remove(row.providerVoiceId);
  const now = new Date();
  await drizzle
    .update(liveVoices)
    .set({
      status: "deleted",
      deletedAt: now,
      deletedReason: reason,
      updatedAt: now,
    })
    .where(and(eq(liveVoices.userId, userId), eq(liveVoices.id, row.id)));
  // Any Bot that used it goes back to its stock voice immediately.
  await clearBotSelections(userId, row.id);
}

type LiveVoiceRecordValues = Omit<
  typeof liveVoices.$inferInsert,
  "provider" | "providerVoiceId" | "status"
>;

/**
 * A provider voice exists but its BotBound record could not be saved. Delete
 * it at the provider; if that also fails, keep durable cleanup evidence
 * (a `cleanup_pending` row the retention sweep and account deletion destroy)
 * and alert, so the voice can never be silently lost track of.
 */
async function discardOrphanedProviderVoice(
  userId: string,
  orphan: { engine: CloneEngine; providerVoiceId: string },
  values: LiveVoiceRecordValues,
): Promise<void> {
  try {
    await orphan.engine.remove(orphan.providerVoiceId);
    return;
  } catch {
    // Fall through to durable evidence.
  }
  try {
    await inTenant(userId, () =>
      drizzle.insert(liveVoices).values({
        ...values,
        provider: orphan.engine.id,
        providerVoiceId: orphan.providerVoiceId,
        status: "cleanup_pending",
        expiresAt: new Date(),
      }),
    );
    log.warn("Live voice provider cleanup deferred to the retention sweep", {
      userId,
      engine: orphan.engine.id,
    });
  } catch {
    log.error("Live voice provider voice orphaned; manual cleanup required", {
      userId,
      engine: orphan.engine.id,
      providerVoiceId: orphan.providerVoiceId,
    });
    void alertCloneEngineCapacity(orphan.engine.id, "provider_unavailable", {
      operation: "orphan_cleanup",
    }).catch(() => {});
  }
}

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
      writtenReleaseJurisdictions: WRITTEN_BIOMETRIC_RELEASE_JURISDICTIONS,
      biometricReleaseVersion: BIOMETRIC_RELEASE_VERSION,
      retentionPolicyVersion: BIOMETRIC_RETENTION_POLICY_VERSION,
      retentionSummary: BIOMETRIC_RETENTION_SUMMARY,
    };
  },

  async list(actor: Actor) {
    const [rows, agents] = await Promise.all([readyVoices(actor.id), ownedAgents(actor.id)]);
    return {
      voices: rows.map((row) => summarize(row, agents)),
      ...this.capabilities(actor),
    };
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
      throw friendlyProviderError(new CloneEngineError("xai", "not_configured"));
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
        "Please confirm this is your own voice and you are recording it yourself.",
      );
    const jurisdiction: SpeakerJurisdiction | null = parseSpeakerJurisdiction(
      input.speakerJurisdiction,
    );
    if (!jurisdiction)
      throw new AppError(
        400,
        "LIVE_VOICE_JURISDICTION_REQUIRED",
        "Tell us where the speaker lives so we can apply the right privacy protections.",
      );
    // Every speaker signs the written release; Illinois (BIPA) is covered by it.
    const writtenRelease = requiresWrittenBiometricRelease(jurisdiction);
    const signedName = parseSignedLegalName(input.biometricReleaseSignedName);
    if (
      input.biometricReleaseAccepted !== true ||
      input.biometricReleaseVersion !== BIOMETRIC_RELEASE_VERSION ||
      !signedName
    )
      throw new AppError(
        400,
        "LIVE_VOICE_WRITTEN_RELEASE_REQUIRED",
        "Please read the voice release and sign it with your full legal name.",
      );
    const agentName =
      typeof input.agentName === "string" ? input.agentName.trim().slice(0, 80) : "";
    const consentNoticeText = biometricReleaseRecord(agentName);
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
        "Record between 10 seconds and 2 minutes. About 90 seconds is ideal.",
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

    const candidates = cloneEngineCandidates({
      jurisdiction,
      xai: {
        configured: cloneEngine("xai").configured(),
        entitled: xaiCustomVoiceApiEntitled(),
        teamVoicesUsed: await xaiTeamVoicesUsed(),
        teamLimit: resolveXAICustomVoiceTeamLimit(),
      },
      elevenlabs: { configured: cloneEngine("elevenlabs").configured() },
      preferred: resolvePreferredCloneEngine(),
    });
    if (candidates.length === 0)
      throw friendlyProviderError(new CloneEngineError("xai", "region_unavailable"));

    return fenced(actor.id, "live_voice_create", async () => {
      let created: { engine: CloneEngine; providerVoiceId: string } | null = null;
      const now = new Date();
      const values: LiveVoiceRecordValues = {
        userId: actor.id,
        name,
        consentVersion: LIVE_VOICE_CONSENT_VERSION,
        consentScope,
        consentAcceptedAt: now,
        consentAcceptedBy: actor.id,
        consentNoticeText,
        sourceSha256,
        sourceDurationSeconds: Math.min(LIVE_VOICE_MAX_SECONDS, quality.durationSeconds),
        qualityScore: quality.score,
        voiceGender: gender ?? null,
        speakerJurisdiction: jurisdiction,
        biometricReleaseVersion: BIOMETRIC_RELEASE_VERSION,
        biometricReleaseSignedName: signedName,
        biometricReleaseAcceptedAt: now,
        retentionPolicyVersion: BIOMETRIC_RETENTION_POLICY_VERSION,
        expiresAt: biometricExpiresAt(now, null),
        createdAt: now,
      };
      try {
        const row = await drizzle.transaction(async (tx) => {
          // The per-account cap is reserved atomically BEFORE any provider is
          // contacted: concurrent creates for one account serialize on this
          // lock, and each re-counts under it.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`live_voice_cap:${actor.id}`}))`,
          );
          const [ready] = await tx
            .select({ n: count() })
            .from(liveVoices)
            .where(and(eq(liveVoices.userId, actor.id), eq(liveVoices.status, "ready")));
          if (Number(ready?.n ?? 0) >= LIVE_VOICE_MAX_PER_ACCOUNT)
            throw new AppError(
              409,
              "LIVE_VOICE_ACCOUNT_LIMIT",
              `You can keep ${LIVE_VOICE_MAX_PER_ACCOUNT} cloned voices. Remove one to add another.`,
            );
          let lastError: unknown = null;
          for (const id of candidates) {
            const engine = cloneEngine(id);
            try {
              const { providerVoiceId } = await engine.create({
                name,
                wav,
                gender,
              });
              created = { engine, providerVoiceId };
              break;
            } catch (error) {
              lastError = error;
              const code = error instanceof CloneEngineError ? error.code : "provider_unavailable";
              log.warn("Live voice clone failed at engine", {
                userId: actor.id,
                engine: id,
                code,
                status: error instanceof CloneEngineError ? error.status : null,
              });
              if (id === "xai" && code === "not_entitled") noteXAICustomVoiceNotEntitled();
              // xAI without Enterprise is expected until it is enabled: not an alert.
              if (!(id === "xai" && code === "not_entitled"))
                void alertCloneEngineCapacity(id, code, { jurisdiction }).catch(() => {});
              if (!(CLONE_ENGINE_FALLTHROUGH_CODES as readonly string[]).includes(code)) break;
            }
          }
          if (!created) throw friendlyProviderError(lastError);
          const [inserted] = await tx
            .insert(liveVoices)
            .values({
              ...values,
              provider: created.engine.id,
              providerVoiceId: created.providerVoiceId,
              status: "ready",
            })
            .returning();
          return inserted;
        });
        log.info("Live voice clone created", {
          userId: actor.id,
          cloneId: row.id,
          engine: row.provider,
          jurisdiction,
          writtenRelease,
          qualityScore: quality.score,
        });
        return { voice: summarize(row, []), quality };
      } catch (error) {
        // Never leave an orphaned provider voice (or a used slot) behind a failed insert.
        const orphan = created as {
          engine: CloneEngine;
          providerVoiceId: string;
        } | null;
        if (orphan) await discardOrphanedProviderVoice(actor.id, orphan, values);
        throw error;
      }
    });
  },

  async remove(actor: Actor, id: string) {
    const row = await readyVoice(actor.id, id);
    return fenced(actor.id, "live_voice_delete", async () => {
      try {
        await destroyRow(actor.id, row, "user_deleted");
      } catch (error) {
        log.warn("Live voice provider delete failed", {
          userId: actor.id,
          cloneId: row.id,
          engine: row.provider,
          code: error instanceof CloneEngineError ? error.code : "unknown",
        });
        throw new AppError(
          503,
          "LIVE_VOICE_DELETE_RETRY",
          "We couldn't remove that voice just now. Please try again in a minute.",
        );
      }
      return { deleted: true as const };
    });
  },

  /** One line, spoken by the clone or the Bot's stock voice, for an honest A/B. */
  async preview(
    actor: Actor,
    id: string,
    input: {
      variant: "clone" | "stock";
      agentName?: string;
      stockVoice?: string;
    },
  ): Promise<Buffer> {
    const row = await readyVoice(actor.id, id);
    const line = voiceSampleLine(input.agentName || "your Bot");
    try {
      if (input.variant === "clone") {
        const audio = await engineFor(row).preview(row.providerVoiceId!, line);
        void touchLastUsed(actor.id, row);
        return audio;
      }
      // The same stock voice a call would fall back to, so the A/B is honest.
      if (engineFor(row).id === "elevenlabs") {
        const reservation = await reservePlatformCostRecord({
          userId: actor.id,
          action: "voice.clone.preview",
          provider: "openai",
          model: "tts-1",
          costUsd: Math.max(0.000001, (Array.from(line).length * 0.015) / 1_000),
          requestMeta: {
            surface: "clone_preview",
            characters: Array.from(line).length,
            estimate: true,
          },
        });
        if (!reservation.reserved)
          throw AppError.serviceUnavailable(
            "The preview could not reserve its audio cost. Try again shortly.",
          );
        await commitPlatformCostReservation(reservation.reservation);
        return renderClonedStockPreview({
          text: line,
          gender: row.voiceGender ?? null,
          apiKey: process.env.OPENAI_API_KEY ?? "",
        });
      }
      return await cloneEngine("xai").preview(
        stockFallbackVoiceFor(input.stockVoice, row.voiceGender),
        line,
      );
    } catch (error) {
      if (error instanceof CloneEngineError)
        void alertCloneEngineCapacity(error.engine, error.code, {
          operation: "preview",
        }).catch(() => {});
      throw friendlyProviderError(error);
    }
  },

  async useOnBot(actor: Actor, id: string, agentId: string) {
    const row = await readyVoice(actor.id, id);
    if (!validBotId(agentId)) throw AppError.notFound("Bot not found.");
    const [agent] = await inTenant(actor.id, () =>
      drizzle
        .select({
          id: schema.agents.id,
          businessVariables: schema.agents.businessVariables,
        })
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
    if (!validBotId(agentId)) throw AppError.notFound("Bot not found.");
    const [agent] = await inTenant(actor.id, () =>
      drizzle
        .select({
          id: schema.agents.id,
          businessVariables: schema.agents.businessVariables,
        })
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

  /**
   * Destroy voices whose published retention schedule has run out, at the
   * provider with durable retries. Local revocation takes effect before the
   * provider request; a voice already gone at the provider counts as destroyed.
   */
  async expireDue(now: Date = new Date()): Promise<number> {
    const due = await tenantStore.exit(() =>
      drizzle
        .select({
          id: liveVoices.id,
          userId: liveVoices.userId,
          provider: liveVoices.provider,
          providerVoiceId: liveVoices.providerVoiceId,
          status: liveVoices.status,
          deletedReason: liveVoices.deletedReason,
        })
        .from(liveVoices)
        .where(
          and(
            inArray(liveVoices.status, ["ready", "cleanup_pending"]),
            or(
              eq(liveVoices.status, "cleanup_pending"),
              and(isNotNull(liveVoices.expiresAt), lte(liveVoices.expiresAt, now)),
            ),
          ),
        )
        .orderBy(asc(liveVoices.expiresAt))
        .limit(SWEEP_BATCH)
        .execute(),
    );
    let expired = 0;
    for (const row of due) {
      try {
        await fenced(row.userId, "live_voice_expire", () =>
          destroyRow(
            row.userId,
            row,
            row.deletedReason ??
              (row.status === "cleanup_pending" ? "create_failed" : "retention_expired"),
          ),
        );
        expired += 1;
        log.info("Live voice destroyed on retention schedule", {
          userId: row.userId,
          cloneId: row.id,
          engine: row.provider,
        });
      } catch (error) {
        log.warn("Live voice retention destroy failed; will retry", {
          userId: row.userId,
          cloneId: row.id,
          engine: row.provider,
          code: error instanceof CloneEngineError ? error.code : "unknown",
        });
      }
    }
    return expired;
  },
};

/** Record use and, under a retention schedule, push the idle-destruction date out. */
function touchLastUsed(
  userId: string,
  row: Pick<LiveVoice, "id" | "createdAt" | "retentionPolicyVersion">,
): Promise<void> {
  const now = new Date();
  return drizzle
    .update(liveVoices)
    .set({
      lastUsedAt: now,
      ...(row.retentionPolicyVersion ? { expiresAt: biometricExpiresAt(row.createdAt, now) } : {}),
    })
    .where(
      and(
        eq(liveVoices.userId, userId),
        eq(liveVoices.id, row.id),
        eq(liveVoices.status, "ready"),
        voiceNotExpired(),
      ),
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

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
        provider: liveVoices.provider,
        providerVoiceId: liveVoices.providerVoiceId,
        voiceGender: liveVoices.voiceGender,
        createdAt: liveVoices.createdAt,
        retentionPolicyVersion: liveVoices.retentionPolicyVersion,
      })
      .from(liveVoices)
      .where(
        and(
          eq(liveVoices.userId, userId),
          eq(liveVoices.id, selection.cloneId),
          eq(liveVoices.status, "ready"),
          voiceNotExpired(),
        ),
      )
      .limit(1);
    if (!row || !isCloneEngineId(row.provider)) return null;
    const engine = cloneEngine(row.provider);
    if (!engine.isVoiceId(row.providerVoiceId)) return null;
    // lastUsedAt moves only when the clone is actually heard
    // (markRuntimeCustomVoicePlayed), never on lookup alone.
    return {
      cloneId: row.id,
      engine: engine.id,
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

/**
 * The live session calls this once, when the cloned voice's first audio plays
 * on a call. It records use and pushes the idle-destruction date out.
 */
export async function markRuntimeCustomVoicePlayed(userId: string, cloneId: string): Promise<void> {
  if (!UUID.test(cloneId)) return;
  try {
    await inTenant(userId, async () => {
      const [row] = await drizzle
        .select({
          id: liveVoices.id,
          createdAt: liveVoices.createdAt,
          retentionPolicyVersion: liveVoices.retentionPolicyVersion,
        })
        .from(liveVoices)
        .where(
          and(
            eq(liveVoices.userId, userId),
            eq(liveVoices.id, cloneId),
            eq(liveVoices.status, "ready"),
          ),
        )
        .limit(1);
      if (row) await touchLastUsed(userId, row);
    });
  } catch {
    // Usage bookkeeping never affects a live call.
  }
}

/** Account deletion: remove engine-side voices before rows are purged. */
export async function deleteProviderLiveVoicesForAccount(
  db: typeof drizzle,
  userId: string,
): Promise<number> {
  let rows: Array<{
    id: string;
    provider: string;
    providerVoiceId: string | null;
  }>;
  try {
    rows = await db
      .select({
        id: liveVoices.id,
        provider: liveVoices.provider,
        providerVoiceId: liveVoices.providerVoiceId,
      })
      .from(liveVoices)
      .where(
        and(
          eq(liveVoices.userId, userId),
          inArray(liveVoices.status, ["ready", "cleanup_pending"]),
        ),
      );
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
    // Delete at whichever engine holds the voice; this also frees its slot.
    await engineFor({ provider: row.provider as LiveVoice["provider"] }).remove(
      row.providerVoiceId,
    );
    deleted += 1;
  }
  return deleted;
}
