import { Buffer } from "node:buffer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  tenantStore: { run: (_id: string, fn: () => unknown) => fn() },
}));
vi.mock("../src/middleware/platform-admin", () => ({ isPlatformAdmin: vi.fn() }));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: vi.fn(),
  commitPlatformCostReservation: vi.fn(),
  releasePlatformCostReservation: vi.fn(),
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: vi.fn(),
}));

import {
  type VoiceAsset,
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_ASSET_ENGINE_ID,
  VOICE_ASSET_MODEL_REVISION,
  VOICE_ASSET_SOURCE_REVISION,
  VOICE_ASSET_QUALITY_CHECK_VERSION,
  VOICE_CLONE_RETENTION_DAYS_DEFAULT,
  VOICE_CLONE_RETENTION_POLICY_VERSION,
} from "../src/db/voice-asset-schema";
import {
  createVoiceAssetService,
  parseVoiceCloneAllowlist,
  parseVoiceCloneRetentionDays,
  type VoiceAssetDependencies,
  VOICE_CLONE_EXPIRY_BATCH,
  VOICE_PREVIEW_RESERVE_SECONDS,
} from "../src/lib/voice/voice-asset-service";
import {
  encryptVoiceReference,
  validateVoiceReference,
} from "../src/lib/voice/voice-reference-vault";
import { InhouseVoiceError } from "../src/lib/voice/inhouse-voice-client";

const actor = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.org" };
const id = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-17T15:00:00.000Z");
const reservation = { userId: actor.id, auditId: 1n, adopted: false, costUsd: 0.125 };
function wav() {
  const bytes = Buffer.alloc(288_044);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24_000, 24);
  bytes.writeUInt32LE(48_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function row(): VoiceAsset {
  const bytes = wav();
  const metadata = validateVoiceReference(bytes);
  return {
    id,
    userId: actor.id,
    name: "My voice",
    engineId: VOICE_ASSET_ENGINE_ID,
    modelRevision: VOICE_ASSET_MODEL_REVISION,
    sourceRevision: VOICE_ASSET_SOURCE_REVISION,
    intendedUse: "private_preview",
    secretEncrypted: encryptVoiceReference({
      userId: actor.id,
      assetId: id,
      mimeType: "audio/wav",
      bytes,
    }),
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
    reviewedAt: null,
    reviewedBy: null,
    reviewedSourceSha256: null,
    qualityCheckVersion: null,
    revokedAt: null,
    deletedAt: null,
    retentionPolicyVersion: null,
    expiresAt: null,
    lastPreviewAt: null,
    deletedReason: null,
    customerVisible: false,
    createdAt: now,
    updatedAt: now,
  };
}
function createBody() {
  return {
    name: "My voice",
    referenceAudioBase64: wav().toString("base64"),
    consentAccepted: true,
    consentVersion: VOICE_ASSET_CONSENT_VERSION,
  };
}
function setup(seed = true) {
  const rows = new Map<string, VoiceAsset>();
  if (seed) rows.set(id, row());
  const speech = vi.fn().mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "audio/wav",
    durationSeconds: 1,
    engine: VOICE_ASSET_ENGINE_ID,
    modelRevision: VOICE_ASSET_MODEL_REVISION,
  });
  const readiness = vi.fn().mockResolvedValue({ ready: true, busy: false });
  const repo: VoiceAssetDependencies["repository"] = {
    list: vi.fn(async (userId) =>
      [...rows.values()]
        .filter((value) => value.userId === userId && value.status !== "deleted")
        .map((value) => {
          const { secretEncrypted, ...safe } = value;
          void secretEncrypted;
          return safe;
        }),
    ),
    get: vi.fn(async (userId, assetId) => {
      const value = rows.get(assetId);
      return value && value.userId === userId ? { ...value } : null;
    }),
    create: vi.fn(async (userId, input) => {
      const retained = [...rows.values()].filter(
        (value) => value.userId === userId && value.status !== "deleted",
      );
      if (retained.length >= 5) throw Object.assign(new Error("Capacity"), { status: 409 });
      if (
        retained.some(
          (value) => value.sourceSha256 === input.sourceSha256 && value.status !== "revoked",
        )
      )
        throw Object.assign(new Error("duplicate private SQL"), { code: "23505" });
      const saved = { ...row(), ...input } as VoiceAsset;
      rows.set(saved.id, saved);
      return saved;
    }),
    update: vi.fn(async (userId, assetId, version, patch) => {
      const current = rows.get(assetId);
      if (!current || current.userId !== userId || current.version !== version) return null;
      const updated = { ...current, ...patch, version: version + 1, updatedAt: now };
      rows.set(assetId, updated);
      return updated;
    }),
    recordPreview: vi.fn(async (userId, assetId, _version, at) => {
      const current = rows.get(assetId);
      if (current && current.userId === userId)
        Object.assign(current, { lastPreviewAt: at, updatedAt: at });
    }),
    dueForExpiry: vi.fn(async (_now: Date, _limit: number) => [] as VoiceAsset[]),
  };
  const deps: VoiceAssetDependencies = {
    repository: repo,
    enabled: vi.fn(() => true),
    customerEnabled: vi.fn(() => false),
    customerAllowed: vi.fn(() => false),
    retentionDays: vi.fn(() => VOICE_CLONE_RETENTION_DAYS_DEFAULT),
    isAdmin: vi.fn().mockResolvedValue(true),
    engine: vi.fn(() => ({
      client: { synthesizePreview: speech, getReadiness: readiness },
      computeUsdPerMinute: 0.1,
    })),
    fenced: vi.fn(async (_userId, _operation, perform) => perform()),
    reserve: vi.fn().mockResolvedValue({ reserved: true, reservation }),
    commit: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    now: () => now,
    newId: () => id,
  };
  const service = createVoiceAssetService(deps);
  const approve = () => {
    const current = rows.get(id)!;
    Object.assign(current, {
      status: "approved",
      version: 2,
      reviewedAt: now,
      reviewedBy: actor.id,
      reviewedSourceSha256: current.sourceSha256,
      qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
    });
  };
  return { service, deps, rows, repo, speech, readiness, approve };
}
const DAY_MS = 86_400_000;
function customerFields(expiresAt: Date | null = new Date(now.getTime() + 30 * DAY_MS)) {
  return {
    customerVisible: true,
    retentionPolicyVersion: VOICE_CLONE_RETENTION_POLICY_VERSION,
    expiresAt,
  };
}
function customerSetup(seed = false) {
  const harness = setup(seed);
  vi.mocked(harness.deps.enabled).mockReturnValue(false);
  vi.mocked(harness.deps.customerEnabled).mockReturnValue(true);
  vi.mocked(harness.deps.customerAllowed).mockReturnValue(true);
  return harness;
}
beforeEach(() => vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("private operator voice asset service", () => {
  it("hides capabilities when the pilot is closed without touching admin, storage or engine", async () => {
    const { service, deps, repo } = setup();
    vi.mocked(deps.enabled).mockReturnValue(false);
    expect(await service.capabilities(actor)).toEqual({ available: false });
    await expect(service.list(actor)).rejects.toMatchObject({
      status: 404,
      code: "VOICE_CLONE_PILOT_UNAVAILABLE",
    });
    expect(deps.isAdmin).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
    expect(deps.engine).not.toHaveBeenCalled();
  });
  it("fails closed for non-admins and authorization lookup errors", async () => {
    const { service, deps, repo } = setup();
    vi.mocked(deps.isAdmin).mockResolvedValue(false);
    expect(await service.capabilities(actor)).toEqual({ available: false });
    await expect(service.create(actor, createBody())).rejects.toMatchObject({ status: 403 });
    expect(repo.create).not.toHaveBeenCalled();
    vi.mocked(deps.isAdmin).mockRejectedValue(new Error("private auth failure"));
    expect(await service.capabilities(actor)).toEqual({ available: false });
  });
  it("reports private-only capability, canonical review contracts and conservative allowance reservation", async () => {
    const { service, readiness } = setup();
    const caps = await service.capabilities(actor);
    expect(caps).toMatchObject({
      available: true,
      scope: "private_preview",
      engineReady: true,
      consentVersion: VOICE_ASSET_CONSENT_VERSION,
      qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
      maxReferenceBytes: 2_000_000,
      previewReserveUsd: 0.125,
    });
    expect(VOICE_PREVIEW_RESERVE_SECONDS).toBe(75);
    expect(readiness).toHaveBeenCalledOnce();
    expect(JSON.stringify(caps)).not.toContain("serviceToken");
  });
  it("keeps saved asset management usable when the engine is absent", async () => {
    const { service, deps } = setup(false);
    vi.mocked(deps.engine).mockReturnValue(null);
    expect(await service.capabilities(actor)).toMatchObject({
      available: true,
      engineReady: false,
      previewReserveUsd: null,
    });
    const created = await service.create(actor, createBody());
    expect(created.asset.status).toBe("pending_review");
    expect((await service.list(actor)).assets).toHaveLength(1);
  });
  it("creates encrypted, self-owned pending assets and never exports source bytes or ciphertext", async () => {
    const { service, rows, repo, speech } = setup(false);
    const result = await service.create(actor, { ...createBody(), userId: other });
    const saved = rows.get(id)!;
    expect(saved.userId).toBe(actor.id);
    expect(saved.consentAcceptedBy).toBe(actor.id);
    expect(saved.secretEncrypted).toMatch(/^vref1\./);
    expect(saved.status).toBe("pending_review");
    expect(saved.reviewedAt).toBeNull();
    expect(saved.intendedUse).toBe("private_preview");
    expect(saved.customerVisible).toBe(false);
    expect(saved.retentionPolicyVersion).toBeNull();
    expect(saved.expiresAt).toBeNull();
    for (const value of [result, await service.list(actor)]) {
      const serialized = JSON.stringify(value);
      expect(serialized).not.toContain("vref1");
      expect(serialized).not.toContain("referenceAudioBase64");
      expect(serialized).not.toContain(createBody().referenceAudioBase64);
    }
    expect(repo.create).toHaveBeenCalledWith(
      actor.id,
      expect.objectContaining({ sourceSampleCount: 144_000, sourceDurationSeconds: 6 }),
    );
    expect(speech).not.toHaveBeenCalled();
  });
  it.each([
    { consentAccepted: false },
    { consentVersion: "old" },
    { name: "" },
    { name: "bad\nname" },
    { name: "x".repeat(81) },
    { referenceAudioBase64: "data:audio/wav;base64,AAAA" },
    { referenceAudioBase64: "AAAA\n" },
    { referenceAudioBase64: "AAAA-___" },
    { referenceAudioBase64: "" },
    { referenceAudioBase64: "A".repeat(2_666_672) },
  ])("rejects invalid names, consent or audio before persistence", async (patch) => {
    const { service, repo, deps } = setup(false);
    await expect(service.create(actor, { ...createBody(), ...patch })).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
  });
  it("rejects malformed and noncanonical decoded audio", async () => {
    const { service, repo } = setup(false);
    for (const referenceAudioBase64 of [Buffer.from("not wav").toString("base64"), "AB=="])
      await expect(
        service.create(actor, { ...createBody(), referenceAudioBase64 }),
      ).rejects.toMatchObject({ status: 400 });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("reports duplicate recordings without disclosing database errors", async () => {
    const { service } = setup();
    await expect(service.create(actor, createBody())).rejects.toMatchObject({
      status: 409,
      code: "VOICE_REFERENCE_ALREADY_SAVED",
    });
  });
  it("recognizes a real Drizzle-wrapped unique violation without leaking its query or parameters", async () => {
    const { service, repo } = setup(false);
    vi.mocked(repo.create).mockRejectedValue(
      new DrizzleQueryError(
        "insert private voice SQL",
        ["private encrypted recording"],
        Object.assign(new Error("private driver details"), { code: "23505" }),
      ),
    );
    const error = await service.create(actor, createBody()).catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 409, code: "VOICE_REFERENCE_ALREADY_SAVED" });
    expect(String(error)).not.toMatch(/private|SQL|driver|encrypted/);
  });
  it("bounds cyclic and deeply nested database causes and returns a sanitized storage error", async () => {
    const { service, repo } = setup(false);
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    const deep = Array.from({ length: 8 }).reduce<unknown>((cause) => ({ cause }), {
      code: "23505",
    });
    for (const cause of [cycle, deep]) {
      vi.mocked(repo.create).mockRejectedValue(cause);
      await expect(service.create(actor, createBody())).rejects.toMatchObject({
        status: 503,
        code: "VOICE_ASSET_STORAGE_UNAVAILABLE",
      });
    }
  });
  it("requires explicit source-matching review before approving private preview", async () => {
    const { service, rows } = setup();
    const sourceSha256 = rows.get(id)!.sourceSha256;
    await expect(
      service.preview(actor, id, { expectedVersion: 1, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      service.review(actor, id, {
        expectedVersion: 1,
        sourceSha256: "a".repeat(64),
        qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.review(actor, id, { expectedVersion: 1, sourceSha256, qualityCheckVersion: "old" }),
    ).rejects.toMatchObject({ status: 400 });
    const reviewed = await service.review(actor, id, {
      expectedVersion: 1,
      sourceSha256,
      qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
    });
    expect(reviewed.asset).toMatchObject({ status: "approved", version: 2 });
    expect(rows.get(id)!.intendedUse).toBe("private_preview");
  });
  it("refuses cross-tenant references and stale mutations", async () => {
    const { service, rows, repo } = setup();
    rows.get(id)!.userId = other;
    await expect(service.remove(actor, id, { expectedVersion: 1 })).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.update).not.toHaveBeenCalled();
    rows.get(id)!.userId = actor.id;
    await expect(service.remove(actor, id, { expectedVersion: 2 })).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.remove(actor, `${id}\n`, { expectedVersion: 1 })).rejects.toMatchObject({
      status: 400,
    });
  });
  it("detects a compare-and-swap conflict during review", async () => {
    const { service, rows, repo } = setup();
    vi.mocked(repo.update).mockResolvedValue(null);
    await expect(
      service.review(actor, id, {
        expectedVersion: 1,
        sourceSha256: rows.get(id)!.sourceSha256,
        qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
      }),
    ).rejects.toMatchObject({ code: "VOICE_ASSET_CHANGED" });
  });
  it("deletes ciphertext immediately without worker dependency and makes repeated deletion safe", async () => {
    const { service, deps, rows, repo } = setup();
    vi.mocked(deps.engine).mockReturnValue(null);
    expect((await service.remove(actor, id, { expectedVersion: 1 })).asset).toMatchObject({
      status: "deleted",
      version: 2,
    });
    expect(rows.get(id)).toMatchObject({ secretEncrypted: null, revokedAt: now, deletedAt: now });
    expect((await service.list(actor)).assets).toEqual([]);
    expect((await service.remove(actor, id, { expectedVersion: 1 })).asset.status).toBe("deleted");
    expect(repo.update).toHaveBeenCalledOnce();
  });
  it("checks fresh worker readiness before reserving or generating every preview", async () => {
    const { service, deps, readiness, speech, approve } = setup();
    approve();
    const result = await service.preview(actor, id, {
      expectedVersion: 2,
      expectedReserveUsd: 0.125,
    });
    expect(result.reserveUsd).toBe(0.125);
    expect(readiness.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.reserve).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(deps.reserve).mock.invocationCallOrder[0]).toBeLessThan(
      speech.mock.invocationCallOrder[0],
    );
    expect(deps.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.id,
        provider: "inhouse",
        costUsd: 0.125,
        requestMeta: expect.objectContaining({
          reserve_seconds: 75,
          source_revision: VOICE_ASSET_SOURCE_REVISION,
        }),
      }),
    );
    expect(deps.commit).toHaveBeenCalledOnce();
    expect(deps.release).not.toHaveBeenCalled();
    // The platform-admin pilot writes no customer-lane ledger rows.
    expect(deps.repository.recordPreview).not.toHaveBeenCalled();
    const plaintext = speech.mock.calls[0][0] as Uint8Array;
    expect(plaintext.every((value) => value === 0)).toBe(true);
    await service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 });
    expect(readiness).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, null, "0.125", 0, 0.124, 0.126, NaN, Infinity])(
    "requires the exact numeric preview quote %s before readiness, reserve or inference",
    async (expectedReserveUsd) => {
      const { service, deps, readiness, speech, approve } = setup();
      approve();
      await expect(
        service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd }),
      ).rejects.toMatchObject({ status: 409, code: "VOICE_PREVIEW_PRICE_CHANGED" });
      expect(readiness).not.toHaveBeenCalled();
      expect(deps.reserve).not.toHaveBeenCalled();
      expect(speech).not.toHaveBeenCalled();
    },
  );
  it("rejects a previously quoted price after the configured compute rate changes", async () => {
    const { service, deps, readiness, speech, approve } = setup();
    approve();
    const quote = await service.capabilities(actor);
    expect(quote.available && quote.previewReserveUsd).toBe(0.125);
    const engine = deps.engine()!;
    vi.mocked(deps.engine).mockReturnValue({ ...engine, computeUsdPerMinute: 0.2 });
    readiness.mockClear();
    await expect(
      service.preview(actor, id, {
        expectedVersion: 2,
        expectedReserveUsd: quote.available ? quote.previewReserveUsd : null,
      }),
    ).rejects.toMatchObject({ status: 409, code: "VOICE_PREVIEW_PRICE_CHANGED" });
    expect(readiness).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(speech).not.toHaveBeenCalled();
  });
  it.each(["missing", "busy", "unavailable"])(
    "does not spend when the engine is %s",
    async (state) => {
      const { service, deps, readiness, approve, speech } = setup();
      approve();
      if (state === "missing") vi.mocked(deps.engine).mockReturnValue(null);
      else if (state === "busy") readiness.mockResolvedValue({ ready: true, busy: true });
      else readiness.mockRejectedValue(new Error("private engine URL/token"));
      await expect(
        service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
      ).rejects.toBeInstanceOf(Error);
      expect(deps.reserve).not.toHaveBeenCalled();
      expect(speech).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, NaN, Infinity])(
    "refuses unsafe compute pricing %s before spending",
    async (rate) => {
      const { service, deps, approve } = setup();
      approve();
      const engine = deps.engine()!;
      vi.mocked(deps.engine).mockReturnValue({ ...engine, computeUsdPerMinute: rate });
      await expect(
        service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
      ).rejects.toMatchObject({
        code: "VOICE_ENGINE_FUNDING_UNAVAILABLE",
      });
      expect(deps.reserve).not.toHaveBeenCalled();
    },
  );
  it.each(["cap_reached", "unavailable"] as const)(
    "stops before inference when reservation is %s",
    async (reason) => {
      const { service, deps, approve, speech } = setup();
      approve();
      vi.mocked(deps.reserve).mockResolvedValue({ reserved: false, reason });
      await expect(
        service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
      ).rejects.toMatchObject({
        status: reason === "cap_reached" ? 402 : 503,
      });
      expect(speech).not.toHaveBeenCalled();
      expect(deps.commit).not.toHaveBeenCalled();
    },
  );
  it("releases a definite precompute rejection and retains uncertain compute without retrying", async () => {
    const { service, deps, approve, speech } = setup();
    approve();
    speech.mockRejectedValue(new InhouseVoiceError("BUSY", "speech", false, 429));
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(deps.release).toHaveBeenCalledOnce();
    expect(deps.commit).not.toHaveBeenCalled();
    speech.mockRejectedValue(new InhouseVoiceError("ABORTED", "speech", true));
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      code: "VOICE_PREVIEW_FAILED",
    });
    expect(deps.commit).toHaveBeenCalledOnce();
    expect(speech).toHaveBeenCalledTimes(2);
  });
  it("treats unexpected transport failure conservatively and sanitizes its details", async () => {
    const { service, deps, approve, speech } = setup();
    approve();
    speech.mockRejectedValue(new Error("secret token and reference audio"));
    const error = await service
      .preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 })
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 503, code: "VOICE_PREVIEW_FAILED" });
    expect(String(error)).not.toContain("secret token");
    expect(deps.commit).toHaveBeenCalledOnce();
  });
  it("suppresses a completed preview after concurrent deletion but retains consumed compute", async () => {
    const { service, rows, deps, approve, speech } = setup();
    approve();
    const output = new Uint8Array([1, 2, 3]);
    speech.mockImplementation(async () => {
      Object.assign(rows.get(id)!, {
        status: "deleted",
        version: 3,
        secretEncrypted: null,
        revokedAt: now,
        deletedAt: now,
      });
      return { bytes: output, contentType: "audio/wav" };
    });
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      code: "VOICE_ASSET_CHANGED",
    });
    expect(output).toEqual(new Uint8Array(3));
    expect(deps.commit).toHaveBeenCalledOnce();
    expect(deps.release).not.toHaveBeenCalled();
  });
  it("rechecks revocation after reservation and releases before inference starts", async () => {
    const { service, rows, deps, approve, speech } = setup();
    approve();
    vi.mocked(deps.reserve).mockImplementation(async () => {
      Object.assign(rows.get(id)!, { status: "revoked", version: 3, revokedAt: now });
      return { reserved: true, reservation };
    });
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      code: "VOICE_ASSET_CHANGED",
    });
    expect(deps.release).toHaveBeenCalledOnce();
    expect(speech).not.toHaveBeenCalled();
  });
  it("rejects a tampered encrypted source before reserving", async () => {
    const { service, rows, deps, approve } = setup();
    approve();
    rows.get(id)!.secretEncrypted = "vref1.invalid";
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      code: "VOICE_REFERENCE_UNAVAILABLE",
    });
    expect(deps.reserve).not.toHaveBeenCalled();
  });
  it("suppresses output if accounting cannot be confirmed", async () => {
    const { service, deps, approve, speech } = setup();
    approve();
    const output = new Uint8Array([1, 2, 3]);
    speech.mockResolvedValue({ bytes: output });
    vi.mocked(deps.commit).mockRejectedValue(new Error("private DB statement"));
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({
      code: "VOICE_PREVIEW_ACCOUNTING_UNAVAILABLE",
    });
    expect(output).toEqual(new Uint8Array(3));
    expect(deps.release).not.toHaveBeenCalled();
  });
  it("cancels before reserve when the caller leaves during readiness", async () => {
    const { service, deps, approve, readiness, speech } = setup();
    approve();
    const controller = new AbortController();
    readiness.mockImplementation(async () => {
      controller.abort();
      return { ready: true, busy: false };
    });
    await expect(
      service.preview(
        actor,
        id,
        { expectedVersion: 2, expectedReserveUsd: 0.125 },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "VOICE_PREVIEW_CANCELLED" });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(speech).not.toHaveBeenCalled();
  });
});

describe("customer voice clone preview lane", () => {
  it("fails closed unless the customer flag and allowlist both pass", async () => {
    const { service, deps, repo } = setup();
    vi.mocked(deps.enabled).mockReturnValue(false);
    vi.mocked(deps.customerEnabled).mockReturnValue(false);
    vi.mocked(deps.customerAllowed).mockReturnValue(true);
    expect(await service.capabilities(actor)).toEqual({ available: false });
    await expect(service.list(actor)).rejects.toMatchObject({
      status: 404,
      code: "VOICE_CLONE_PILOT_UNAVAILABLE",
    });
    expect(repo.list).not.toHaveBeenCalled();

    vi.mocked(deps.customerEnabled).mockReturnValue(true);
    vi.mocked(deps.customerAllowed).mockReturnValue(false);
    expect(await service.capabilities(actor)).toEqual({ available: false });
    await expect(service.create(actor, createBody())).rejects.toMatchObject({ status: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("keeps the admin pilot denial unchanged when the customer lane is open", async () => {
    const { service, deps } = setup();
    vi.mocked(deps.isAdmin).mockResolvedValue(false);
    vi.mocked(deps.customerEnabled).mockReturnValue(true);
    vi.mocked(deps.customerAllowed).mockReturnValue(false);
    await expect(service.create(actor, createBody())).rejects.toMatchObject({
      status: 403,
      message: "Private voice pilot access required.",
    });
  });

  it("reports only customer-safe capabilities and stamps bounded retention on create", async () => {
    const { service, deps, rows, repo } = customerSetup();
    const caps = await service.capabilities(actor);
    expect(caps).toEqual({
      available: true,
      scope: "private_preview",
      lane: "customer_preview",
      consentVersion: VOICE_ASSET_CONSENT_VERSION,
      qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
      maxReferenceBytes: 2_000_000,
      minReferenceSeconds: 6,
      maxReferenceSeconds: 20,
      previewReserveUsd: 0.125,
      retentionDays: 30,
    });
    expect(JSON.stringify(caps)).not.toMatch(/engineReady|serviceToken|VOICE_/);
    expect(deps.isAdmin).not.toHaveBeenCalled();

    const created = await service.create(actor, createBody());
    expect(created.asset).toMatchObject({
      status: "pending_review",
      expiresAt: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
      lastPreviewAt: null,
    });
    expect(rows.get(id)).toMatchObject({
      ...customerFields(),
      intendedUse: "private_preview",
      customerVisible: true,
    });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("fails closed when the configured retention is unsafe", async () => {
    const { service, deps, repo } = customerSetup();
    vi.mocked(deps.retentionDays).mockReturnValue(null);
    expect(await service.capabilities(actor)).toEqual({ available: false });
    await expect(service.create(actor, createBody())).rejects.toMatchObject({
      status: 503,
      code: "VOICE_CLONE_RETENTION_UNAVAILABLE",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("lets an allowlisted customer review, preview and delete their own reference", async () => {
    const { service, deps, rows, repo } = customerSetup();
    const created = await service.create(actor, createBody());
    expect(created.asset.status).toBe("pending_review");
    const sourceSha256 = rows.get(id)!.sourceSha256;
    const reviewed = await service.review(actor, id, {
      expectedVersion: 1,
      sourceSha256,
      qualityCheckVersion: VOICE_ASSET_QUALITY_CHECK_VERSION,
    });
    expect(reviewed.asset.status).toBe("approved");
    const preview = await service.preview(actor, id, {
      expectedVersion: 2,
      expectedReserveUsd: 0.125,
    });
    expect(preview.reserveUsd).toBe(0.125);
    expect(repo.recordPreview).toHaveBeenCalledWith(actor.id, id, 2, now, {
      sourceSha256,
      reservedUsdMicros: 125_000,
      committedUsdMicros: 125_000,
    });
    expect(rows.get(id)!.lastPreviewAt).toEqual(now);
    const removed = await service.remove(actor, id, { expectedVersion: 2 });
    expect(removed.asset).toMatchObject({ status: "deleted", version: 3 });
    expect(rows.get(id)).toMatchObject({
      secretEncrypted: null,
      deletedReason: "user_deleted",
    });
    expect(deps.reserve).toHaveBeenCalledOnce();
  });

  it("refuses an expired customer reference before reserving compute", async () => {
    const { service, deps, rows, approve } = customerSetup(true);
    Object.assign(rows.get(id)!, customerFields(new Date(now.getTime() - 1)));
    approve();
    await expect(
      service.preview(actor, id, { expectedVersion: 2, expectedReserveUsd: 0.125 }),
    ).rejects.toMatchObject({ code: "VOICE_REFERENCE_EXPIRED" });
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it("expires due customer assets through the fenced, versioned terminal deletion path", async () => {
    const { service, deps, rows, repo } = customerSetup(true);
    const due = {
      ...rows.get(id)!,
      ...customerFields(new Date(now.getTime() - 1_000)),
    };
    vi.mocked(repo.dueForExpiry).mockResolvedValue([due]);
    expect(await service.expireDue(now)).toBe(1);
    expect(repo.dueForExpiry).toHaveBeenCalledWith(now, VOICE_CLONE_EXPIRY_BATCH);
    expect(VOICE_CLONE_EXPIRY_BATCH).toBe(25);
    expect(deps.fenced).toHaveBeenCalledWith(
      due.userId,
      "voice_asset_expire",
      expect.any(Function),
    );
    expect(repo.update).toHaveBeenCalledWith(
      due.userId,
      due.id,
      due.version,
      {
        status: "deleted",
        secretEncrypted: null,
        revokedAt: now,
        deletedAt: now,
        deletedReason: "retention_expired",
      },
      "expired",
    );
  });

  it("keeps the retention sweep inert while the customer lane is off", async () => {
    const { service, repo } = setup();
    expect(await service.expireDue(now)).toBe(0);
    expect(repo.dueForExpiry).not.toHaveBeenCalled();
  });

  it("skips rows that are not due or were concurrently changed without failing the batch", async () => {
    const { service, rows, repo } = customerSetup(true);
    const future = { ...rows.get(id)!, ...customerFields(new Date(now.getTime() + DAY_MS)) };
    vi.mocked(repo.dueForExpiry).mockResolvedValue([future]);
    expect(await service.expireDue(now)).toBe(0);
    expect(repo.update).not.toHaveBeenCalled();

    const due = { ...rows.get(id)!, ...customerFields(new Date(now.getTime() - DAY_MS)) };
    vi.mocked(repo.dueForExpiry).mockResolvedValue([due]);
    vi.mocked(repo.update).mockResolvedValueOnce(null);
    expect(await service.expireDue(now)).toBe(0);
  });
});

describe("customer lane configuration", () => {
  it("defaults retention to 30 days and rejects unsafe values", () => {
    expect(parseVoiceCloneRetentionDays(undefined)).toBe(VOICE_CLONE_RETENTION_DAYS_DEFAULT);
    expect(parseVoiceCloneRetentionDays("")).toBe(VOICE_CLONE_RETENTION_DAYS_DEFAULT);
    expect(parseVoiceCloneRetentionDays(" 30 ")).toBe(30);
    expect(parseVoiceCloneRetentionDays("1")).toBe(1);
    expect(parseVoiceCloneRetentionDays("365")).toBe(365);
    for (const value of ["0", "366", "-1", "1.5", "30d", "abc", "1e2"])
      expect(parseVoiceCloneRetentionDays(value), value).toBeNull();
  });

  it("normalizes the canary allowlist to lowercase emails and UUIDs", () => {
    const allowlist = parseVoiceCloneAllowlist(
      " Owner@Example.ORG , ABCDEF12-3456-4789-8ABC-DEF123456789 ,, owner2@example.org ",
    );
    expect([...allowlist]).toEqual([
      "owner@example.org",
      "abcdef12-3456-4789-8abc-def123456789",
      "owner2@example.org",
    ]);
    expect(parseVoiceCloneAllowlist(undefined).size).toBe(0);
    expect(parseVoiceCloneAllowlist(" , ").size).toBe(0);
  });
});
