import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/middleware/platform-admin", () => ({ isPlatformAdmin: vi.fn() }));
vi.mock("../src/lib/voice/elevenlabs-readiness-receipt", () => ({
  recordElevenLabsReadinessReceipt: vi.fn(),
}));

import {
  createElevenLabsReadinessService,
  type ElevenLabsReadinessDependencies,
} from "../src/lib/voice/elevenlabs-readiness";
import {
  ElevenLabsVoiceError,
  type ElevenLabsAccountCapabilities,
} from "../src/lib/voice/elevenlabs-voice-client";

const actor = { id: "operator", email: "operator@example.org" };
const KEY = "private-test-vendor-key";
const WORKSPACE = "private_workspace_123";
function account(): ElevenLabsAccountCapabilities {
  return {
    workspaceId: WORKSPACE,
    subscription: {
      tier: "starter",
      status: "active",
      canUseInstantVoiceCloning: true,
      canUseProfessionalVoiceCloning: false,
      characterCount: 123,
      characterLimit: 30_000,
      nextCharacterCountResetUnix: null,
      voiceSlotsUsed: 2,
      voiceLimit: 10,
      voiceAddEditCounter: 3,
      maxVoiceAddEdits: null,
      professionalVoiceSlotsUsed: 0,
      professionalVoiceSlotsUsedInWorkspace: 0,
      professionalVoiceLimit: 0,
      canExtendCharacterLimit: false,
      maxCreditLimitExtension: 0,
      canExtendVoiceLimit: false,
    },
  };
}
function setup() {
  const read = vi.fn().mockResolvedValue(account());
  const voices = vi.fn().mockResolvedValue({ voices: [], hasMore: false, nextPageToken: null });
  const receipt = vi.fn().mockResolvedValue({
    id: "read-only-check",
    checkedAt: "2026-10-17T23:59:00.000Z",
    sourceCommit: "2".repeat(40),
    stored: true,
  });
  const deps: ElevenLabsReadinessDependencies = {
    isAdmin: vi.fn().mockResolvedValue(true),
    configuration: vi.fn(() => ({ enabled: true, apiKey: KEY })),
    client: vi.fn(() => ({ getAccountCapabilities: read, listVoices: voices })),
    receipt,
  };
  return { deps, read, voices, receipt, service: createElevenLabsReadinessService(deps) };
}
function expectIndependentGatesClosed(value: unknown) {
  expect(value).toMatchObject({
    enrollmentReady: false,
    liveCallsReady: false,
    endpointScopesVerified: false,
    usdFundingVerified: false,
    customerSaasRightsVerified: false,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("operator ElevenLabs account readiness", () => {
  it("requires authentication before configuration, client construction or provider access", async () => {
    const { deps, read, service } = setup();
    await expect(service.status(undefined)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    await expect(service.status({})).rejects.toMatchObject({ status: 401 });
    expect(deps.isAdmin).not.toHaveBeenCalled();
    expect(deps.configuration).not.toHaveBeenCalled();
    expect(deps.client).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("requires platform admin independently of the HTTP middleware", async () => {
    const { deps, read, service } = setup();
    vi.mocked(deps.isAdmin).mockResolvedValue(false);
    await expect(service.status(actor)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(deps.configuration).not.toHaveBeenCalled();
    expect(deps.client).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed on an authorization lookup error without exposing private detail", async () => {
    const { deps, read, service } = setup();
    vi.mocked(deps.isAdmin).mockRejectedValue(new Error(`private SQL ${KEY}`));
    await expect(service.status(actor)).rejects.toMatchObject({
      status: 503,
      message: "Operator authorization could not be confirmed.",
    });
    expect(deps.configuration).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("sanitizes configuration reader failures", async () => {
    const { deps, read, service } = setup();
    vi.mocked(deps.configuration).mockImplementation(() => {
      throw new Error(KEY);
    });
    await expect(service.status(actor)).rejects.toMatchObject({
      status: 503,
      message: "Voice provider configuration could not be checked.",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("never calls a provider while the feature is disabled even with a credential", async () => {
    const { deps, read, service } = setup();
    vi.mocked(deps.configuration).mockReturnValue({ enabled: false, apiKey: KEY });
    const result = await service.status(actor);
    expect(result).toMatchObject({
      enabled: false,
      configured: true,
      accountCheck: "not_run",
      accountFailure: null,
      workspaceBinding: "unconfigured",
      subscription: null,
    });
    expectIndependentGatesClosed(result);
    expect(deps.client).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([undefined, "", "   "])(
    "does not create a client without a credential: %s",
    async (apiKey) => {
      const { deps, read, service } = setup();
      vi.mocked(deps.configuration).mockReturnValue({ enabled: true, apiKey });
      const result = await service.status(actor);
      expect(result).toMatchObject({ enabled: true, configured: false, accountCheck: "not_run" });
      expectIndependentGatesClosed(result);
      expect(deps.client).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "false", "TRUE", " true ", "1", "yes"])(
    "requires the exact enabled environment value true, not %s",
    async (flag) => {
      const { deps, read } = setup();
      vi.stubEnv("BOTBOUND_ELEVENLABS_VOICE_ENABLED", flag);
      vi.stubEnv("BOTBOUND_ELEVENLABS_VOICE_API_KEY", KEY);
      vi.stubEnv("BOTBOUND_ELEVENLABS_WORKSPACE_ID", undefined);
      const service = createElevenLabsReadinessService({
        isAdmin: deps.isAdmin,
        client: deps.client,
      });
      const result = await service.status(actor);
      expect(result).toMatchObject({ enabled: false, configured: true, accountCheck: "not_run" });
      expect(deps.client).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("uses only the explicit new credential when enabled, never the retired key", async () => {
    const { deps, read } = setup();
    vi.stubEnv("BOTBOUND_ELEVENLABS_VOICE_ENABLED", "true");
    vi.stubEnv("BOTBOUND_ELEVENLABS_VOICE_API_KEY", undefined);
    vi.stubEnv("BOTBOUND_ELEVENLABS_WORKSPACE_ID", undefined);
    vi.stubEnv("ELEVENLABS_API_KEY", KEY);
    const service = createElevenLabsReadinessService({
      isAdmin: deps.isAdmin,
      client: deps.client,
    });
    expect(await service.status(actor)).toMatchObject({
      configured: false,
      accountCheck: "not_run",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("makes one account read with cancellation and never auto-adopts its workspace", async () => {
    const { deps, read, service } = setup();
    const controller = new AbortController();
    const result = await service.status(actor, controller.signal);
    expect(deps.client).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(read).toHaveBeenCalledExactlyOnceWith({ signal: controller.signal });
    expect(result).toMatchObject({
      accountCheck: "succeeded",
      accountFailure: null,
      workspaceBinding: "unconfigured",
      subscription: {
        tier: "starter",
        status: "active",
        canUseInstantVoiceCloning: true,
        canUseProfessionalVoiceCloning: false,
        voiceSlotsUsed: 2,
        voiceLimit: 10,
        maxVoiceAddEdits: null,
      },
    });
    expectIndependentGatesClosed(result);
    expect(result).not.toHaveProperty("workspaceId");
    expect(JSON.stringify(result)).not.toContain(WORKSPACE);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([
    [WORKSPACE, "matched"],
    ["other_workspace", "mismatch"],
  ] as const)(
    "checks an explicitly configured workspace without returning its identity: %s",
    async (expectedWorkspaceId, workspaceBinding) => {
      const { deps, service } = setup();
      vi.mocked(deps.configuration).mockReturnValue({
        enabled: true,
        apiKey: KEY,
        expectedWorkspaceId,
      });
      const result = await service.status(actor);
      expect(result.workspaceBinding).toBe(workspaceBinding);
      expectIndependentGatesClosed(result);
      expect(JSON.stringify(result)).not.toContain(WORKSPACE);
      expect(JSON.stringify(result)).not.toContain(expectedWorkspaceId);
    },
  );

  it("reports a configured binding as unchecked when no provider request runs", async () => {
    const { deps, service, read } = setup();
    vi.mocked(deps.configuration).mockReturnValue({
      enabled: false,
      apiKey: KEY,
      expectedWorkspaceId: WORKSPACE,
    });
    expect(await service.status(actor)).toMatchObject({
      workspaceBinding: "not_checked",
      accountCheck: "not_run",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["../other", "private@example.org", "x".repeat(129)])(
    "rejects invalid expected workspace configuration before provider I/O: %s",
    async (expectedWorkspaceId) => {
      const { deps, service, read } = setup();
      vi.mocked(deps.configuration).mockReturnValue({
        enabled: true,
        apiKey: KEY,
        expectedWorkspaceId,
      });
      expect(await service.status(actor)).toMatchObject({
        accountCheck: "failed",
        accountFailure: "invalid_configuration",
        workspaceBinding: "not_checked",
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("explicitly allowlists subscription fields instead of spreading future private metadata", async () => {
    const { service, read } = setup();
    const value = account();
    Object.assign(value, { user_id: "private_user", api_key_preview: KEY });
    Object.assign(value.subscription, {
      invoice: "private_invoice",
      personal_data: "private_name",
    });
    read.mockResolvedValue(value);
    const result = await service.status(actor);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.subscription).toEqual({
      tier: "starter",
      status: "active",
      canUseInstantVoiceCloning: true,
      canUseProfessionalVoiceCloning: false,
      characterCount: 123,
      characterLimit: 30_000,
      nextCharacterCountResetUnix: null,
      voiceSlotsUsed: 2,
      voiceLimit: 10,
      voiceAddEditCounter: 3,
      maxVoiceAddEdits: null,
      canExtendCharacterLimit: false,
      maxCreditLimitExtension: 0,
    });
  });

  it.each([
    ["INVALID_INPUT", "invalid_configuration"],
    ["PROVIDER_REJECTED", "provider_rejected"],
    ["PROVIDER_UNAVAILABLE", "provider_unavailable"],
    ["INVALID_RESPONSE", "invalid_response"],
    ["ABORTED", "interrupted"],
  ] as const)("sanitizes %s without granting any readiness", async (code, accountFailure) => {
    const { service, read } = setup();
    read.mockRejectedValue(new ElevenLabsVoiceError(code, "account", false, 403));
    const result = await service.status(actor);
    expect(result).toMatchObject({ accountCheck: "failed", accountFailure, subscription: null });
    expectIndependentGatesClosed(result);
    expect(read).toHaveBeenCalledOnce();
  });

  it("sanitizes unexpected provider errors and does not retry", async () => {
    const { service, read } = setup();
    read.mockRejectedValue(new Error(`private ${KEY} ${WORKSPACE}`));
    const result = await service.status(actor);
    expect(result).toMatchObject({
      accountCheck: "failed",
      accountFailure: "provider_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(read).toHaveBeenCalledOnce();
  });

  it("does not start a client for an already cancelled check", async () => {
    const { service, deps, read } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await service.status(actor, controller.signal)).toMatchObject({
      accountCheck: "failed",
      accountFailure: "interrupted",
    });
    expect(deps.client).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("discards an account result after caller cancellation", async () => {
    const { service, read } = setup();
    const controller = new AbortController();
    read.mockImplementation(async () => {
      controller.abort();
      return account();
    });
    expect(await service.status(actor, controller.signal)).toMatchObject({
      accountCheck: "failed",
      accountFailure: "interrupted",
      subscription: null,
      workspaceBinding: "unconfigured",
    });
    expect(read).toHaveBeenCalledOnce();
  });

  it("verifies the staged key explicitly without changing the disabled voice flag", async () => {
    const { service, deps, read, voices, receipt } = setup();
    vi.mocked(deps.configuration).mockReturnValue({
      enabled: false,
      apiKey: KEY,
      expectedWorkspaceId: WORKSPACE,
    });
    voices.mockResolvedValue({
      voices: [{ voiceId: "private_voice", name: "private_name" }],
      hasMore: false,
      nextPageToken: null,
    });
    const controller = new AbortController();
    const result = await service.verify(actor, controller.signal);
    expect(result).toMatchObject({
      enabled: false,
      accountCheck: "succeeded",
      workspaceBinding: "matched",
      voicesReadCheck: "succeeded",
      voicesReadFailure: null,
      capacity: {
        workspaceCreditsRemaining: 29_877,
        workspaceVoiceSlotsRemaining: 8,
        workspaceVoiceAddEditsRemaining: null,
        restrictedKeyCreditsRemaining: null,
      },
      receipt: { id: "read-only-check", stored: true },
    });
    expectIndependentGatesClosed(result);
    expect(read).toHaveBeenCalledExactlyOnceWith({ signal: controller.signal });
    expect(voices).toHaveBeenCalledExactlyOnceWith({ pageSize: 1 }, { signal: controller.signal });
    expect(receipt).toHaveBeenCalledExactlyOnceWith(
      actor.id,
      expect.objectContaining({ enabled: false }),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private_voice|private_name|private_workspace|private-test/,
    );
    expect(JSON.stringify(receipt.mock.calls)).not.toMatch(
      /private_voice|private_name|private_workspace|private-test/,
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "restricted_key_cap_unverified",
        "mutation_scopes_unverified",
        "customer_saas_rights_unverified",
        "enrollment_not_ready",
        "live_calls_not_ready",
      ]),
    );
  });

  it.each([undefined, "different_workspace"])(
    "does not list voices without an exact explicit workspace match: %s",
    async (expectedWorkspaceId) => {
      const { service, deps, voices, receipt } = setup();
      vi.mocked(deps.configuration).mockReturnValue({
        enabled: false,
        apiKey: KEY,
        expectedWorkspaceId,
      });
      const result = await service.verify(actor);
      expect(result.accountCheck).toBe("succeeded");
      expect(result.voicesReadCheck).toBe("not_run");
      expect(voices).not.toHaveBeenCalled();
      expect(receipt).toHaveBeenCalledOnce();
      expectIndependentGatesClosed(result);
    },
  );

  it("reports denied voices-read scope separately from successful account access", async () => {
    const { service, deps, voices } = setup();
    vi.mocked(deps.configuration).mockReturnValue({
      enabled: true,
      apiKey: KEY,
      expectedWorkspaceId: WORKSPACE,
    });
    voices.mockRejectedValue(new ElevenLabsVoiceError("PROVIDER_REJECTED", "list", false, 403));
    const result = await service.verify(actor);
    expect(result).toMatchObject({
      accountCheck: "succeeded",
      workspaceBinding: "matched",
      voicesReadCheck: "failed",
      voicesReadFailure: "provider_rejected",
    });
    expect(result.blockers).toContain("voices_read_unverified");
    expectIndependentGatesClosed(result);
    expect(voices).toHaveBeenCalledOnce();
  });

  it("clamps exhausted workspace counters and does not count optional overages as funding", async () => {
    const { service, read } = setup();
    const value = account();
    Object.assign(value.subscription, {
      status: "past_due",
      characterCount: 30_010,
      voiceSlotsUsed: 11,
      voiceAddEditCounter: 8,
      maxVoiceAddEdits: 5,
      canUseInstantVoiceCloning: false,
      canExtendCharacterLimit: true,
      maxCreditLimitExtension: "unlimited",
    });
    read.mockResolvedValue(value);
    const result = await service.verify(actor);
    expect(result.capacity).toEqual({
      workspaceCreditsRemaining: 0,
      workspaceVoiceSlotsRemaining: 0,
      workspaceVoiceAddEditsRemaining: 0,
      restrictedKeyCreditsRemaining: null,
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "subscription_not_active",
        "instant_cloning_unavailable",
        "workspace_credits_exhausted",
        "workspace_voice_slots_exhausted",
        "workspace_voice_edits_exhausted",
      ]),
    );
    expectIndependentGatesClosed(result);
  });

  it("does not record a receipt or reach the provider for a non-admin explicit check", async () => {
    const { service, deps, read, voices, receipt } = setup();
    vi.mocked(deps.isAdmin).mockResolvedValue(false);
    await expect(service.verify(actor)).rejects.toMatchObject({ status: 403 });
    expect(read).not.toHaveBeenCalled();
    expect(voices).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
  });

  it("does not call a provider without a key and records the precise missing configuration", async () => {
    const { service, deps, read, voices, receipt } = setup();
    vi.mocked(deps.configuration).mockReturnValue({ enabled: false });
    const result = await service.verify(actor);
    expect(result).toMatchObject({ configured: false, accountCheck: "not_run", capacity: null });
    expect(result.blockers).toContain("credential_missing");
    expect(read).not.toHaveBeenCalled();
    expect(voices).not.toHaveBeenCalled();
    expect(receipt).toHaveBeenCalledOnce();
  });

  it("requires a durable receipt and sanitizes storage failures", async () => {
    const { service, receipt } = setup();
    receipt.mockRejectedValue(new Error(`private SQL ${KEY}`));
    await expect(service.verify(actor)).rejects.toMatchObject({
      status: 503,
      message: "The provider check receipt could not be saved. Try again.",
    });
    expect(receipt).toHaveBeenCalledOnce();
  });

  it("never saves a completed check after cancellation during the voice read", async () => {
    const { service, deps, voices, receipt } = setup();
    vi.mocked(deps.configuration).mockReturnValue({
      enabled: false,
      apiKey: KEY,
      expectedWorkspaceId: WORKSPACE,
    });
    const controller = new AbortController();
    voices.mockImplementation(async () => {
      controller.abort();
      return { voices: [], hasMore: false, nextPageToken: null };
    });
    await expect(service.verify(actor, controller.signal)).rejects.toMatchObject({
      status: 503,
      message: "The provider check was interrupted.",
    });
    expect(receipt).not.toHaveBeenCalled();
  });
});
