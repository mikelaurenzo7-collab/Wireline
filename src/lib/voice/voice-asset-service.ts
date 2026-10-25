import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns, isNotNull, isNull, lte, ne } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  voiceAssets,
  voiceCloneEvents,
  type VoiceAsset,
  type NewVoiceAsset,
  type VoiceCloneEventKind,
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_ASSET_ENGINE_ID,
  VOICE_ASSET_MODEL_REVISION,
  VOICE_ASSET_SOURCE_REVISION,
  VOICE_ASSET_QUALITY_CHECK_VERSION,
  VOICE_CLONE_RETENTION_POLICY_VERSION,
  VOICE_CLONE_RETENTION_DAYS_DEFAULT,
  VOICE_CLONE_RETENTION_DAYS_MIN,
  VOICE_CLONE_RETENTION_DAYS_MAX,
} from "../../db/voice-asset-schema";
import { isPlatformAdmin } from "../../middleware/platform-admin";
import {
  reservePlatformCostRecord,
  commitPlatformCostReservation,
  releasePlatformCostReservation,
  type PlatformCostReservation,
  type PlatformCostReservationDecision,
} from "../../middleware/audit-middleware";
import { AppError } from "../api-error";
import { drizzle, tenantStore, log } from "../server-context";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { createInhouseVoiceClient, InhouseVoiceError } from "./inhouse-voice-client";
import {
  validateVoiceReference,
  encryptVoiceReference,
  decryptVoiceReference,
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_MIN_SECONDS,
  VOICE_REFERENCE_MAX_SECONDS,
} from "./voice-reference-vault";

export const VOICE_PREVIEW_RESERVE_SECONDS = 75;
export const VOICE_ASSET_MAX_RETAINED = 5;
/** Bounded per-tick batch for the retention sweep; later ticks drain the rest. */
export const VOICE_CLONE_EXPIRY_BATCH = 25;
const MAX_BASE64 = Math.ceil(VOICE_REFERENCE_MAX_BYTES / 3) * 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;
type Actor = { id: string; email?: string };
type Access = "admin" | "customer";
type PublicRow = Omit<VoiceAsset, "secretEncrypted">;
type EventAccounting = {
  sourceSha256: string;
  reservedUsdMicros: number | null;
  committedUsdMicros: number | null;
};
type Update = Partial<
  Pick<
    VoiceAsset,
    | "status"
    | "secretEncrypted"
    | "reviewedAt"
    | "reviewedBy"
    | "reviewedSourceSha256"
    | "qualityCheckVersion"
    | "revokedAt"
    | "deletedAt"
    | "deletedReason"
  >
>;
export type VoiceAssetRepository = {
  list(userId: string): Promise<PublicRow[]>;
  get(userId: string, id: string): Promise<VoiceAsset | null>;
  create(userId: string, row: NewVoiceAsset): Promise<VoiceAsset>;
  update(
    userId: string,
    id: string,
    version: number,
    patch: Update,
    action: "approved" | "deleted" | "expired",
  ): Promise<VoiceAsset | null>;
  /** Stamp last_preview_at and append one immutable preview ledger row. */
  recordPreview(
    userId: string,
    id: string,
    version: number,
    at: Date,
    accounting: EventAccounting,
  ): Promise<void>;
  /** Root-scoped read of customer rows whose retention window elapsed. */
  dueForExpiry(now: Date, limit: number): Promise<VoiceAsset[]>;
};
type Engine = {
  client: Pick<ReturnType<typeof createInhouseVoiceClient>, "getReadiness" | "synthesizePreview">;
  computeUsdPerMinute: number;
};
export type VoiceAssetDependencies = {
  repository: VoiceAssetRepository;
  /** Platform-admin pilot flag; unchanged by the customer lane. */
  enabled(): boolean;
  /** Default-off customer lane flag (VOICE_CLONE_CUSTOMER_ENABLED). */
  customerEnabled(): boolean;
  /** Canary allowlist check (emails and/or user UUIDs). */
  customerAllowed(actor: Actor): boolean;
  /** Bounded retention days, or null when the configured value is unsafe. */
  retentionDays(): number | null;
  isAdmin(actor: Actor): Promise<boolean>;
  engine(): Engine | null;
  fenced<T>(userId: string, operation: string, perform: () => Promise<T>): Promise<T>;
  reserve: (
    input: Parameters<typeof reservePlatformCostRecord>[0],
  ) => Promise<PlatformCostReservationDecision>;
  commit(reservation: PlatformCostReservation): Promise<void>;
  release(reservation: PlatformCostReservation): Promise<void>;
  now(): Date;
  newId(): string;
};

/** Default 30, integer 1..365; any other configured value fails closed (null). */
export function parseVoiceCloneRetentionDays(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return VOICE_CLONE_RETENTION_DAYS_DEFAULT;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  if (
    !Number.isSafeInteger(days) ||
    days < VOICE_CLONE_RETENTION_DAYS_MIN ||
    days > VOICE_CLONE_RETENTION_DAYS_MAX
  )
    return null;
  return days;
}

/** Split the canary allowlist into lowercase emails and user UUIDs. */
export function parseVoiceCloneAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

function usdMicros(usd: number): number {
  return Math.ceil(usd * 1_000_000);
}

function ledgerKind(action: "approved" | "deleted" | "expired"): VoiceCloneEventKind {
  if (action === "approved") return "reviewed";
  return action;
}

function dto(row: PublicRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    version: row.version,
    sourceSha256: row.sourceSha256,
    durationSeconds: row.sourceDurationSeconds,
    sampleRateHz: row.sourceSampleRateHz,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastPreviewAt: row.lastPreviewAt?.toISOString() ?? null,
  };
}

function assetId(value: unknown): string {
  if (typeof value !== "string" || value.length !== 36 || !UUID.test(value))
    throw AppError.badRequest("Choose a valid voice reference.");
  return value;
}
function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= 2_147_483_647)
    throw AppError.badRequest("Reload this voice reference and try again.");
  return Number(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw AppError.badRequest("The voice reference request is invalid.");
  return value as Record<string, unknown>;
}
function reserveUsd(engine: Engine): number {
  const cost =
    Math.ceil(engine.computeUsdPerMinute * (VOICE_PREVIEW_RESERVE_SECONDS / 60) * 1_000_000) /
    1_000_000;
  if (!(engine.computeUsdPerMinute > 0) || !Number.isFinite(cost) || !(cost > 0))
    throw new AppError(
      503,
      "VOICE_ENGINE_FUNDING_UNAVAILABLE",
      "Private voice preview funding is not configured.",
    );
  return cost;
}
function stale(): AppError {
  return new AppError(
    409,
    "VOICE_ASSET_CHANGED",
    "This voice reference changed. Reload it before continuing.",
  );
}

function hasSqlState(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current = error;
  // Drizzle wraps the driver error in cause; never inspect SQL text or unbounded chains.
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (seen.has(current)) return false;
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === code) return true;
    current = candidate.cause;
  }
  return false;
}

const { secretEncrypted: privateColumn, ...publicColumns } = getTableColumns(voiceAssets);
void privateColumn;
function ledgerEntry(
  asset: VoiceAsset,
  kind: VoiceCloneEventKind,
  accounting: EventAccounting | null,
): schema.NewVoiceCloneEvent {
  return {
    userId: asset.userId,
    assetId: asset.id,
    kind,
    sourceSha256: asset.sourceSha256,
    reservedUsdMicros: accounting?.reservedUsdMicros ?? null,
    committedUsdMicros: accounting?.committedUsdMicros ?? null,
    engineId: asset.engineId,
    modelRevision: asset.modelRevision,
    sourceRevision: asset.sourceRevision,
  };
}
const repository: VoiceAssetRepository = {
  list: (userId) =>
    tenantStore.run(userId, () =>
      drizzle
        .select(publicColumns)
        .from(voiceAssets)
        .where(and(eq(voiceAssets.userId, userId), ne(voiceAssets.status, "deleted")))
        .orderBy(desc(voiceAssets.createdAt))
        .limit(VOICE_ASSET_MAX_RETAINED),
    ),
  get: (userId, id) =>
    tenantStore.run(
      userId,
      async () =>
        (
          await drizzle
            .select()
            .from(voiceAssets)
            .where(and(eq(voiceAssets.userId, userId), eq(voiceAssets.id, id)))
            .limit(1)
        )[0] ?? null,
    ),
  create: (userId, row) =>
    tenantStore.run(userId, () =>
      drizzle.transaction(async (tx) => {
        // One owner-row lock serializes retained-reference capacity across processes.
        const [owner] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
          .for("update");
        if (!owner) throw AppError.notFound("Account not found.");
        const retained = await tx
          .select({ id: voiceAssets.id })
          .from(voiceAssets)
          .where(and(eq(voiceAssets.userId, userId), ne(voiceAssets.status, "deleted")))
          .limit(VOICE_ASSET_MAX_RETAINED);
        if (retained.length >= VOICE_ASSET_MAX_RETAINED)
          throw new AppError(
            409,
            "VOICE_ASSET_CAPACITY",
            "Delete a saved voice reference before adding another. Five can be retained.",
          );
        const [saved] = await tx.insert(voiceAssets).values(row).returning();
        await tx.insert(schema.auditLog).values({
          userId,
          action: "voice.asset.created",
          provider: "inhouse",
          eventType: "voice.asset.created",
          resourceType: "voice_asset",
          resourceId: saved.id,
          metadata: { consent_version: saved.consentVersion, scope: "private_preview" },
        });
        // The ledger is customer-lane evidence only: the platform-admin pilot's
        // operations keep their existing audit row and write no lane rows.
        if (saved.customerVisible)
          await tx.insert(voiceCloneEvents).values(ledgerEntry(saved, "created", null));
        return saved;
      }),
    ),
  update: (userId, id, version, patch, action) =>
    tenantStore.run(userId, () =>
      drizzle.transaction(async (tx) => {
        const [saved] = await tx
          .update(voiceAssets)
          .set({ ...patch, version: version + 1 })
          .where(
            and(
              eq(voiceAssets.userId, userId),
              eq(voiceAssets.id, id),
              eq(voiceAssets.version, version),
            ),
          )
          .returning();
        if (saved) {
          await tx.insert(schema.auditLog).values({
            userId,
            action: `voice.asset.${action}`,
            provider: "inhouse",
            eventType: `voice.asset.${action}`,
            resourceType: "voice_asset",
            resourceId: id,
            metadata: { version: saved.version, scope: "private_preview" },
          });
          if (saved.customerVisible)
            await tx.insert(voiceCloneEvents).values(ledgerEntry(saved, ledgerKind(action), null));
        }
        return saved ?? null;
      }),
    ),
  recordPreview: (userId, id, version, at, accounting) =>
    tenantStore.run(userId, () =>
      drizzle.transaction(async (tx) => {
        // The state guard permits exactly this non-lifecycle stamp without a
        // version bump, so a completed preview cannot race a pending review.
        await tx
          .update(voiceAssets)
          .set({ lastPreviewAt: at })
          .where(
            and(
              eq(voiceAssets.userId, userId),
              eq(voiceAssets.id, id),
              eq(voiceAssets.version, version),
              eq(voiceAssets.status, "approved"),
              isNull(voiceAssets.deletedAt),
            ),
          );
        // A preview whose compute was consumed is still ledger evidence even if
        // a concurrent deletion removed the reference while the worker ran; the
        // caller supplies the source hash it validated before inference.
        await tx.insert(voiceCloneEvents).values({
          userId,
          assetId: id,
          kind: "preview",
          sourceSha256: accounting.sourceSha256,
          reservedUsdMicros: accounting.reservedUsdMicros,
          committedUsdMicros: accounting.committedUsdMicros,
          engineId: VOICE_ASSET_ENGINE_ID,
          modelRevision: VOICE_ASSET_MODEL_REVISION,
          sourceRevision: VOICE_ASSET_SOURCE_REVISION,
        });
      }),
    ),
  dueForExpiry: (now, limit) =>
    tenantStore.exit(() =>
      drizzle
        .select()
        .from(voiceAssets)
        .where(
          and(
            eq(voiceAssets.customerVisible, true),
            ne(voiceAssets.status, "deleted"),
            isNull(voiceAssets.deletedAt),
            isNotNull(voiceAssets.expiresAt),
            lte(voiceAssets.expiresAt, now),
          ),
        )
        .orderBy(voiceAssets.expiresAt)
        .limit(limit)
        // Drizzle builders are lazy: execute while the tenant scope is exited,
        // otherwise the query would run after it is restored, under the caller's
        // tenant (RLS would hide other owners' expired references).
        .execute(),
    ),
};

const production: VoiceAssetDependencies = {
  repository,
  enabled: () => process.env.VOICE_CLONE_PILOT_ENABLED === "true",
  customerEnabled: () => process.env.VOICE_CLONE_CUSTOMER_ENABLED === "true",
  customerAllowed: (actor) => {
    const allowlist = parseVoiceCloneAllowlist(process.env.VOICE_CLONE_CUSTOMER_ALLOWLIST);
    if (allowlist.size === 0) return false;
    const email = actor.email?.trim().toLowerCase() ?? "";
    const userId = actor.id.trim().toLowerCase();
    return (email.length > 0 && allowlist.has(email)) || allowlist.has(userId);
  },
  retentionDays: () => parseVoiceCloneRetentionDays(process.env.VOICE_CLONE_RETENTION_DAYS),
  isAdmin: isPlatformAdmin,
  engine: () => {
    const baseUrl = process.env.VOICE_ENGINE_URL?.trim();
    const serviceToken = process.env.VOICE_ENGINE_SERVICE_TOKEN?.trim();
    const rate = Number(process.env.VOICE_ENGINE_COMPUTE_USD_PER_MINUTE);
    if (!baseUrl || !serviceToken || !Number.isFinite(rate) || !(rate > 0)) return null;
    try {
      return {
        client: createInhouseVoiceClient({ baseUrl, serviceToken }),
        computeUsdPerMinute: rate,
      };
    } catch {
      return null;
    }
  },
  fenced: async (userId, operation, perform) => {
    const outcome = await runTenantProviderWorkWithDeletionFence({
      userId,
      operation,
      perform: () => tenantStore.run(userId, perform),
    });
    if (!outcome.performed) throw AppError.notFound("Account is no longer available.");
    return outcome.result;
  },
  reserve: reservePlatformCostRecord,
  commit: commitPlatformCostReservation,
  release: releasePlatformCostReservation,
  now: () => new Date(),
  newId: randomUUID,
};

/**
 * Preview-only access control. The platform-admin pilot is unchanged; the
 * customer lane is an independent, default-off canary that must also pass the
 * explicit allowlist. Anything else fails closed.
 */
export function createVoiceAssetService(deps: VoiceAssetDependencies = production) {
  function customerGate(actor: Actor): boolean {
    return deps.customerEnabled() && deps.customerAllowed(actor);
  }
  async function access(actor: Actor): Promise<Access> {
    if (deps.enabled() && (await deps.isAdmin(actor))) {
      assetId(actor.id);
      return "admin";
    }
    if (customerGate(actor)) {
      assetId(actor.id);
      return "customer";
    }
    if (deps.enabled()) throw AppError.forbidden("Private voice pilot access required.");
    throw new AppError(
      404,
      "VOICE_CLONE_PILOT_UNAVAILABLE",
      "Private voice previews are unavailable.",
    );
  }
  /** Bounded retention is mandatory for customer rows; unsafe config fails closed. */
  function customerExpiresAt(now: Date): Date {
    const days = deps.retentionDays();
    if (days === null)
      throw new AppError(
        503,
        "VOICE_CLONE_RETENTION_UNAVAILABLE",
        "Private preview retention is not configured safely.",
      );
    return new Date(now.getTime() + days * DAY_MS);
  }
  async function stored<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (hasSqlState(error, "23505"))
        throw new AppError(
          409,
          "VOICE_REFERENCE_ALREADY_SAVED",
          "This recording is already saved. Open its existing voice reference.",
        );
      throw new AppError(
        503,
        "VOICE_ASSET_STORAGE_UNAVAILABLE",
        "Private voice storage is temporarily unavailable.",
      );
    }
  }
  async function owned(actor: Actor, id: string) {
    const row = await stored(() => deps.repository.get(actor.id, id));
    if (!row || row.userId !== actor.id) throw AppError.notFound("Voice reference not found.");
    return row;
  }
  async function accounting<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        "VOICE_PREVIEW_ACCOUNTING_UNAVAILABLE",
        "Preview accounting could not be confirmed. Any existing allowance reservation is retained.",
      );
    }
  }
  function approved(row: VoiceAsset, version: number) {
    if (row.version !== version || row.status !== "approved") throw stale();
    if (row.expiresAt && row.expiresAt.getTime() <= deps.now().getTime())
      throw new AppError(
        409,
        "VOICE_REFERENCE_EXPIRED",
        "This private preview reached the end of its retention window. Record a new reference to continue.",
      );
    if (
      row.consentVersion !== VOICE_ASSET_CONSENT_VERSION ||
      row.consentAcceptedBy !== row.userId ||
      !row.secretEncrypted ||
      row.revokedAt ||
      row.deletedAt ||
      row.intendedUse !== "private_preview" ||
      row.engineId !== VOICE_ASSET_ENGINE_ID ||
      row.modelRevision !== VOICE_ASSET_MODEL_REVISION ||
      row.sourceRevision !== VOICE_ASSET_SOURCE_REVISION ||
      row.reviewedSourceSha256 !== row.sourceSha256 ||
      row.qualityCheckVersion !== VOICE_ASSET_QUALITY_CHECK_VERSION ||
      !row.reviewedAt ||
      !row.reviewedBy
    )
      throw new AppError(
        409,
        "VOICE_REVIEW_REQUIRED",
        "Review this voice reference before generating a private preview.",
      );
  }

  return {
    async capabilities(actor: Actor) {
      const pilotAdmin = deps.enabled() && (await deps.isAdmin(actor).catch(() => false));
      if (pilotAdmin) {
        let engineReady = false;
        let previewReserveUsd: number | null = null;
        try {
          const engine = deps.engine();
          if (engine) {
            previewReserveUsd = reserveUsd(engine);
            const readiness = await engine.client.getReadiness();
            engineReady = readiness.ready && !readiness.busy;
          }
        } catch {
          /* Configuration and engine failures never disclose service URLs or secrets. */
        }
        return {
          available: true as const,
          scope: "private_preview" as const,
          engineReady,
          consentVersion: VOICE_ASSET_CONSENT_VERSION,
          qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
          maxReferenceBytes: VOICE_REFERENCE_MAX_BYTES,
          minReferenceSeconds: VOICE_REFERENCE_MIN_SECONDS,
          maxReferenceSeconds: VOICE_REFERENCE_MAX_SECONDS,
          previewReserveUsd,
        };
      }
      if (!deps.customerEnabled() || !deps.customerAllowed(actor))
        return { available: false as const };
      // Customer-safe fields only: no engine readiness, provider config, service
      // URL, token or internal pilot state is disclosed on this lane.
      const days = deps.retentionDays();
      if (days === null) return { available: false as const };
      let previewReserveUsd: number | null = null;
      try {
        const engine = deps.engine();
        if (engine) previewReserveUsd = reserveUsd(engine);
      } catch {
        /* Preview funding is optional for saving and deleting references. */
      }
      return {
        available: true as const,
        scope: "private_preview" as const,
        lane: "customer_preview" as const,
        consentVersion: VOICE_ASSET_CONSENT_VERSION,
        qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
        maxReferenceBytes: VOICE_REFERENCE_MAX_BYTES,
        minReferenceSeconds: VOICE_REFERENCE_MIN_SECONDS,
        maxReferenceSeconds: VOICE_REFERENCE_MAX_SECONDS,
        previewReserveUsd,
        retentionDays: days,
      };
    },
    async list(actor: Actor) {
      await access(actor);
      return { assets: (await stored(() => deps.repository.list(actor.id))).map(dto) };
    },
    async create(actor: Actor, body: unknown) {
      const lane = await access(actor);
      const input = object(body);
      const name = typeof input.name === "string" ? input.name.trim() : "";
      // eslint-disable-next-line no-control-regex
      if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
        throw AppError.badRequest("Name this voice reference using 80 characters or fewer.");
      if (input.consentAccepted !== true || input.consentVersion !== VOICE_ASSET_CONSENT_VERSION)
        throw new AppError(
          400,
          "VOICE_CONSENT_REQUIRED",
          "Confirm that this is your voice and accept the current private-preview permission.",
        );
      const encoded = input.referenceAudioBase64;
      if (
        typeof encoded !== "string" ||
        encoded.length === 0 ||
        encoded.length > MAX_BASE64 ||
        encoded.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      )
        throw AppError.badRequest("Upload a valid PCM WAV recording of your voice.");
      const bytes = Buffer.from(encoded, "base64");
      try {
        if (bytes.toString("base64") !== encoded)
          throw AppError.badRequest("Upload a valid PCM WAV recording of your voice.");
        let metadata;
        try {
          metadata = validateVoiceReference(bytes);
        } catch {
          throw AppError.badRequest(
            "Use a mono PCM16 WAV recording between 6 and 20 seconds, up to 2 MB.",
          );
        }
        const id = deps.newId();
        const now = deps.now();
        // Customer references always carry a bounded retention window; the
        // platform-admin pilot keeps its existing unbounded preview record.
        const expiresAt = lane === "customer" ? customerExpiresAt(now) : null;
        let sealed: string;
        try {
          sealed = encryptVoiceReference({
            userId: actor.id,
            assetId: id,
            mimeType: "audio/wav",
            bytes,
          });
        } catch {
          throw new AppError(
            503,
            "VOICE_VAULT_UNAVAILABLE",
            "The private voice vault is unavailable.",
          );
        }
        const row = await deps.fenced(actor.id, "voice_asset_create", () =>
          stored(() =>
            deps.repository.create(actor.id, {
              id,
              userId: actor.id,
              name,
              secretEncrypted: sealed,
              sourceSha256: metadata.sha256,
              sourceMimeType: metadata.mimeType,
              sourceSizeBytes: metadata.sizeBytes,
              sourceSampleRateHz: metadata.sampleRateHz,
              sourceSampleCount: metadata.sampleCount,
              sourceDurationSeconds: metadata.durationSeconds,
              consentVersion: VOICE_ASSET_CONSENT_VERSION,
              consentAcceptedAt: now,
              consentAcceptedBy: actor.id,
              status: "pending_review",
              version: 1,
              createdAt: now,
              updatedAt: now,
              ...(expiresAt
                ? {
                    customerVisible: true,
                    retentionPolicyVersion: VOICE_CLONE_RETENTION_POLICY_VERSION,
                    expiresAt,
                  }
                : {}),
            }),
          ),
        );
        return { asset: dto(row) };
      } finally {
        bytes.fill(0);
      }
    },
    async review(actor: Actor, idInput: unknown, body: unknown) {
      await access(actor);
      const id = assetId(idInput);
      const input = object(body);
      const version = expectedVersion(input.expectedVersion);
      if (
        input.qualityCheckVersion !== VOICE_ASSET_QUALITY_CHECK_VERSION ||
        typeof input.sourceSha256 !== "string" ||
        input.sourceSha256.length !== 64 ||
        !/^[0-9a-f]{64}$/.test(input.sourceSha256)
      )
        throw AppError.badRequest("Confirm the current recording and private-preview review.");
      return deps.fenced(actor.id, "voice_asset_review", async () => {
        const row = await owned(actor, id);
        if (row.version !== version || row.status !== "pending_review") throw stale();
        if (
          row.sourceSha256 !== input.sourceSha256 ||
          row.consentVersion !== VOICE_ASSET_CONSENT_VERSION ||
          row.consentAcceptedBy !== actor.id ||
          !row.secretEncrypted
        )
          throw new AppError(
            409,
            "VOICE_REVIEW_REQUIRED",
            "The recording or permission changed. Reload this voice reference.",
          );
        const updated = await stored(() =>
          deps.repository.update(
            actor.id,
            id,
            version,
            {
              status: "approved",
              reviewedAt: deps.now(),
              reviewedBy: actor.id,
              reviewedSourceSha256: row.sourceSha256,
              qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
            },
            "approved",
          ),
        );
        if (!updated) throw stale();
        return { asset: dto(updated) };
      });
    },
    async remove(actor: Actor, idInput: unknown, body: unknown) {
      await access(actor);
      const id = assetId(idInput);
      const version = expectedVersion(object(body).expectedVersion);
      return deps.fenced(actor.id, "voice_asset_delete", async () => {
        const row = await owned(actor, id);
        if (row.status === "deleted") return { asset: dto(row) };
        if (row.version !== version) throw stale();
        const now = deps.now();
        const updated = await stored(() =>
          deps.repository.update(
            actor.id,
            id,
            version,
            {
              status: "deleted",
              secretEncrypted: null,
              revokedAt: row.revokedAt ?? now,
              deletedAt: now,
              deletedReason: "user_deleted",
            },
            "deleted",
          ),
        );
        if (!updated) throw stale();
        return { asset: dto(updated) };
      });
    },
    async preview(actor: Actor, idInput: unknown, body: unknown, signal?: AbortSignal) {
      await access(actor);
      const id = assetId(idInput);
      const input = object(body);
      const version = expectedVersion(input.expectedVersion);
      return deps.fenced(actor.id, "voice_asset_preview", async () => {
        const row = await owned(actor, id);
        approved(row, version);
        const engine = deps.engine();
        if (!engine)
          throw new AppError(
            503,
            "VOICE_ENGINE_FUNDING_UNAVAILABLE",
            "Private voice preview hosting and funding must be configured first.",
          );
        const costUsd = reserveUsd(engine);
        if (
          typeof input.expectedReserveUsd !== "number" ||
          !Number.isFinite(input.expectedReserveUsd) ||
          input.expectedReserveUsd !== costUsd
        )
          throw new AppError(
            409,
            "VOICE_PREVIEW_PRICE_CHANGED",
            "The private preview reservation changed. Reload its price before continuing.",
          );
        let readiness;
        try {
          readiness = await engine.client.getReadiness({ signal });
        } catch {
          throw new AppError(
            503,
            "VOICE_ENGINE_UNAVAILABLE",
            "The private voice engine is unavailable. Your saved recording is unchanged.",
          );
        }
        if (readiness.busy)
          throw new AppError(
            429,
            "VOICE_ENGINE_BUSY",
            "The private voice engine is busy. Try again shortly.",
          );
        let opened;
        try {
          opened = decryptVoiceReference({
            userId: actor.id,
            assetId: id,
            mimeType: "audio/wav",
            sealedReference: row.secretEncrypted!,
          });
        } catch {
          throw new AppError(
            503,
            "VOICE_REFERENCE_UNAVAILABLE",
            "This private recording could not be opened. No preview was started.",
          );
        }
        try {
          if (opened.metadata.sha256 !== row.sourceSha256)
            throw new AppError(
              409,
              "VOICE_REFERENCE_MISMATCH",
              "The saved recording does not match its review. Delete it and record again.",
            );
          if (signal?.aborted)
            throw new AppError(
              409,
              "VOICE_PREVIEW_CANCELLED",
              "The private preview was cancelled.",
            );
          const decision = await accounting(() =>
            deps.reserve({
              userId: actor.id,
              action: "voice.inhouse.preview",
              provider: "inhouse",
              model: VOICE_ASSET_ENGINE_ID,
              costUsd,
              requestMeta: {
                surface: "private_voice_preview",
                asset_id: id,
                model_revision: VOICE_ASSET_MODEL_REVISION,
                source_revision: VOICE_ASSET_SOURCE_REVISION,
                reserve_seconds: VOICE_PREVIEW_RESERVE_SECONDS,
                settlement: "conservative_compute_reserve",
              },
            }),
          );
          if (!decision.reserved)
            throw new AppError(
              decision.reason === "cap_reached" ? 402 : 503,
              decision.reason === "cap_reached" ? "SPEND_CAP_REACHED" : "SPEND_GUARD_UNAVAILABLE",
              decision.reason === "cap_reached"
                ? "Your AI allowance cannot cover this preview. Review Billing before continuing."
                : "The preview allowance could not be reserved.",
              { recovery_path: "/settings/billing" },
            );
          const reservation = decision.reservation;
          let workStarted = false;
          let result: Awaited<ReturnType<Engine["client"]["synthesizePreview"]>>;
          try {
            approved(await owned(actor, id), version);
            if (signal?.aborted)
              throw new AppError(
                409,
                "VOICE_PREVIEW_CANCELLED",
                "The private preview was cancelled.",
              );
            workStarted = true;
            result = await engine.client.synthesizePreview(opened.bytes, { signal });
          } catch (error) {
            const uncertain =
              workStarted && (!(error instanceof InhouseVoiceError) || error.workMayHaveStarted);
            if (uncertain) await accounting(() => deps.commit(reservation));
            else await accounting(() => deps.release(reservation));
            if (error instanceof AppError) throw error;
            throw new AppError(
              error instanceof InhouseVoiceError && error.code === "BUSY" ? 429 : 503,
              "VOICE_PREVIEW_FAILED",
              uncertain
                ? "The preview could not be confirmed. Its allowance reservation is retained; do not retry automatically."
                : "The preview did not start. Try again when the voice engine is ready.",
            );
          }
          try {
            await accounting(() => deps.commit(reservation));
            // Only customer-lane previews write lane evidence; the admin pilot
            // keeps its exact prior behavior and audit surface.
            if (row.customerVisible)
              await accounting(() =>
                deps.repository.recordPreview(actor.id, id, version, deps.now(), {
                  sourceSha256: row.sourceSha256,
                  reservedUsdMicros: usdMicros(costUsd),
                  committedUsdMicros: usdMicros(costUsd),
                }),
              );
            await access(actor);
            approved(await owned(actor, id), version);
            if (signal?.aborted)
              throw new AppError(
                409,
                "VOICE_PREVIEW_CANCELLED",
                "The private preview was cancelled.",
              );
          } catch (error) {
            result.bytes.fill(0);
            throw error;
          }
          return { ...result, reserveUsd: costUsd };
        } finally {
          opened.bytes.fill(0);
        }
      });
    },
    /**
     * Terminally expire customer references whose retention window elapsed.
     *
     * Runs from the jobs sweep (cron/system scope): candidates are read without
     * tenant context, then each row is re-entered under its owner's tenant scope
     * with the deletion fence, so RLS and the state guard still own the write.
     */
    async expireDue(now: Date = deps.now()) {
      const due = await stored(() => deps.repository.dueForExpiry(now, VOICE_CLONE_EXPIRY_BATCH));
      let expired = 0;
      for (const row of due) {
        if (
          row.customerVisible !== true ||
          !row.expiresAt ||
          row.expiresAt.getTime() > now.getTime() ||
          row.deletedAt !== null ||
          row.status === "deleted"
        )
          continue;
        try {
          const updated = await stored(() =>
            deps.fenced(row.userId, "voice_asset_expire", () =>
              deps.repository.update(
                row.userId,
                row.id,
                row.version,
                {
                  status: "deleted",
                  secretEncrypted: null,
                  revokedAt: row.revokedAt ?? now,
                  deletedAt: now,
                  deletedReason: "retention_expired",
                },
                "expired",
              ),
            ),
          );
          if (updated) expired++;
        } catch {
          // A concurrent owner change or a transient storage failure leaves the
          // row in place; the next sweep tick retries it. Never log user data.
          log.warn("voice clone retention expiry skipped one row", { assetId: row.id });
        }
      }
      return expired;
    },
  };
}

export const voiceAssetService = createVoiceAssetService();
