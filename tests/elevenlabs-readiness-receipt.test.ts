import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), tenant: vi.fn() }));
vi.mock("../src/db/schema", () => ({ auditLog: "audit_log" }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { insert: db.insert },
  tenantStore: { run: db.tenant },
}));
import {
  elevenLabsReadinessReceiptMetadata,
  recordElevenLabsReadinessReceipt,
} from "../src/lib/voice/elevenlabs-readiness-receipt";
import type { ElevenLabsReadinessStatus } from "../src/lib/voice/elevenlabs-readiness";

function status(): ElevenLabsReadinessStatus {
  return {
    enabled: false,
    configured: true,
    accountCheck: "succeeded",
    accountFailure: null,
    workspaceBinding: "matched",
    subscription: {
      tier: "starter",
      status: "active",
      canUseInstantVoiceCloning: true,
      canUseProfessionalVoiceCloning: false,
      characterCount: 100,
      characterLimit: 30_000,
      nextCharacterCountResetUnix: null,
      voiceSlotsUsed: 1,
      voiceLimit: 10,
      voiceAddEditCounter: 0,
      maxVoiceAddEdits: null,
      canExtendCharacterLimit: false,
      maxCreditLimitExtension: 0,
    },
    voicesReadCheck: "succeeded",
    voicesReadFailure: null,
    capacity: {
      workspaceCreditsRemaining: 29_900,
      workspaceVoiceSlotsRemaining: 9,
      workspaceVoiceAddEditsRemaining: null,
      restrictedKeyCreditsRemaining: null,
    },
    blockers: ["customer_saas_rights_unverified", "usd_funding_unverified"],
    enrollmentReady: false,
    liveCallsReady: false,
    endpointScopesVerified: false,
    usdFundingVerified: false,
    customerSaasRightsVerified: false,
  };
}

beforeEach(() => {
  db.insert.mockReset().mockReturnValue({ values: db.values });
  db.values.mockReset().mockResolvedValue(undefined);
  db.tenant.mockReset().mockImplementation(async (_userId, run) => run());
});
afterEach(() => vi.unstubAllEnvs());

describe("durable ElevenLabs read-only operator evidence", () => {
  it("uses only the authenticated tenant and source identity for a zero-cost audit receipt", async () => {
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_GIT_COMMIT", "a".repeat(40));
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", undefined);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    const receipt = await recordElevenLabsReadinessReceipt("operator-user", status());
    expect(receipt).toMatchObject({ sourceCommit: "a".repeat(40), stored: true });
    expect(receipt.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(Number.isFinite(Date.parse(receipt.checkedAt))).toBe(true);
    expect(db.tenant).toHaveBeenCalledExactlyOnceWith("operator-user", expect.any(Function));
    expect(db.insert).toHaveBeenCalledExactlyOnceWith("audit_log");
    expect(db.values).toHaveBeenCalledExactlyOnceWith({
      userId: "operator-user",
      action: "voice.elevenlabs.readiness.checked",
      provider: "elevenlabs",
      eventType: "voice.elevenlabs.readiness.checked",
      resourceType: "voice_provider_readiness",
      resourceId: receipt.id,
      costUsd: "0",
      metadata: expect.objectContaining({ mode: "read_only", source_commit: "a".repeat(40) }),
    });
  });

  it("does not persist private fields attached to a future DTO, subscription or capacity", () => {
    const value = status();
    Object.assign(value, {
      apiKey: "secret_key",
      workspaceId: "secret_workspace",
      voices: [{ name: "secret_name", voiceId: "secret_voice" }],
    });
    Object.assign(value.subscription!, { email: "secret_email", invoice: "secret_invoice" });
    Object.assign(value.capacity!, { providerAccount: "secret_account" });
    const metadata = elevenLabsReadinessReceiptMetadata(value, {
      id: "check-id",
      checkedAt: "2026-10-17T23:59:00Z",
      sourceCommit: null,
    });
    expect(JSON.stringify(metadata)).not.toContain("secret_");
    expect(metadata).toMatchObject({
      customer_saas_rights_verified: false,
      enrollment_ready: false,
      live_calls_ready: false,
      mutation_scopes_verified: false,
      usd_funding_verified: false,
      restricted_key_cap_verified: false,
    });
    value.blockers.push("live_calls_not_ready");
    expect(metadata.blockers).not.toContain("live_calls_not_ready");
  });

  it("preserves null unknowns without manufacturing provider capacity", () => {
    const value = status();
    value.subscription = null;
    value.capacity = null;
    const metadata = elevenLabsReadinessReceiptMetadata(value, {
      id: "check-id",
      checkedAt: "2026-10-17T23:59:00Z",
      sourceCommit: null,
    });
    expect(metadata.subscription).toBeNull();
    expect(metadata.workspace_capacity).toBeNull();
    expect(metadata.source_commit).toBeNull();
  });

  it("does not claim stored evidence after a database failure or retry the write automatically", async () => {
    db.values.mockRejectedValue(new Error("private database unavailable"));
    await expect(recordElevenLabsReadinessReceipt("operator-user", status())).rejects.toThrow(
      "private database unavailable",
    );
    expect(db.values).toHaveBeenCalledOnce();
  });
});
