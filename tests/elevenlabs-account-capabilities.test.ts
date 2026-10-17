import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createElevenLabsVoiceClient,
  ElevenLabsVoiceError,
} from "../src/lib/voice/elevenlabs-voice-client";

const KEY = "private-test-vendor-key";
const WORKSPACE = "workspace_123-abc";
const subscription = () => ({
  tier: "starter",
  status: "active",
  can_use_instant_voice_cloning: true,
  can_use_professional_voice_cloning: false,
  character_count: 123,
  character_limit: 30_000,
  next_character_count_reset_unix: 1_792_000_000,
  voice_slots_used: 2,
  voice_limit: 10,
  voice_add_edit_counter: 3,
  max_voice_add_edits: 65,
  professional_voice_slots_used: 0,
  professional_voice_slots_used_in_workspace: 0,
  professional_voice_limit: 0,
  can_extend_character_limit: false,
  max_credit_limit_extension: 0,
  can_extend_voice_limit: false,
  // None of these billing values may escape the allowlisted DTO.
  current_overage: { amount: "private-overage", currency: "usd" },
  open_invoices: [{ payment_method: "private-payment", address: "private-address" }],
  next_invoice: { amount_due_cents: 600, customer: "private-customer" },
});
const dto = () => ({
  tier: "starter",
  status: "active",
  canUseInstantVoiceCloning: true,
  canUseProfessionalVoiceCloning: false,
  characterCount: 123,
  characterLimit: 30_000,
  nextCharacterCountResetUnix: 1_792_000_000,
  voiceSlotsUsed: 2,
  voiceLimit: 10,
  voiceAddEditCounter: 3,
  maxVoiceAddEdits: 65,
  professionalVoiceSlotsUsed: 0,
  professionalVoiceSlotsUsedInWorkspace: 0,
  professionalVoiceLimit: 0,
  canExtendCharacterLimit: false,
  maxCreditLimitExtension: 0,
  canExtendVoiceLimit: false,
});
function setup(body: unknown, status = 200, timeoutMs = 1_000) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return { fetchImpl, client: createElevenLabsVoiceClient({ apiKey: KEY, fetchImpl, timeoutMs }) };
}
async function failure(promise: Promise<unknown>): Promise<ElevenLabsVoiceError> {
  const result = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(result).toBeInstanceOf(ElevenLabsVoiceError);
  return result as ElevenLabsVoiceError;
}

afterEach(() => vi.useRealTimers());

describe("ElevenLabs account capability transport", () => {
  it("binds capabilities to the documented workspace in one atomic response", async () => {
    const { client, fetchImpl } = setup({
      workspace_id: WORKSPACE,
      user_id: "private-user-id",
      first_name: "private-name",
      xi_api_key_preview: KEY,
      subscription: subscription(),
    });
    const result = await client.getAccountCapabilities();
    expect(result).toEqual({ workspaceId: WORKSPACE, subscription: dto() });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]).toMatchObject([
      "https://api.elevenlabs.io/v1/user",
      { method: "GET", headers: { "xi-api-key": KEY }, redirect: "error" },
    ]);
  });

  it("returns a subscription-only operator snapshot without inventing workspace identity", async () => {
    const { client, fetchImpl } = setup(subscription());
    const result = await client.getSubscriptionCapabilities();
    expect(result).toEqual(dto());
    expect(result).not.toHaveProperty("workspaceId");
    expect(result).not.toHaveProperty("ready");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/user/subscription");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("preserves explicit false entitlements instead of inferring cloning from the Starter label", async () => {
    const { client } = setup({
      ...subscription(),
      can_use_instant_voice_cloning: false,
      can_use_professional_voice_cloning: false,
    });
    expect(await client.getSubscriptionCapabilities()).toMatchObject({
      tier: "starter",
      canUseInstantVoiceCloning: false,
      canUseProfessionalVoiceCloning: false,
    });
  });

  it.each(["trialing", "active", "incomplete", "past_due", "free", "free_disabled"])(
    "preserves the documented %s status without converting it into admission",
    async (status) => {
      const result = await setup({
        ...subscription(),
        status,
      }).client.getSubscriptionCapabilities();
      expect(result.status).toBe(status);
      expect(result).not.toHaveProperty("ready");
      expect(result).not.toHaveProperty("available");
      expect(result).not.toHaveProperty("admitted");
    },
  );

  it.each([undefined, null, "", "ACTIVE", "unknown", "canceled", false, 1, {}])(
    "rejects an absent or unsupported status %s",
    async (status) => {
      const { client } = setup({ ...subscription(), status });
      expect(await failure(client.getSubscriptionCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
        operation: "subscription",
        providerMayHaveAccepted: false,
      });
    },
  );

  it.each([undefined, null, "", "Starter", "starter plan", "x".repeat(81), "private@example.com"])(
    "rejects malformed tier %s",
    async (tier) => {
      expect(
        await failure(setup({ ...subscription(), tier }).client.getSubscriptionCapabilities()),
      ).toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );

  it.each([
    "can_use_instant_voice_cloning",
    "can_use_professional_voice_cloning",
    "can_extend_character_limit",
    "can_extend_voice_limit",
  ])("requires an explicit boolean for %s", async (field) => {
    for (const value of [undefined, null, "true", 1, {}]) {
      const { client } = setup({ ...subscription(), [field]: value });
      expect(await failure(client.getSubscriptionCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
        providerMayHaveAccepted: false,
      });
    }
  });

  it.each([
    "character_count",
    "character_limit",
    "voice_slots_used",
    "voice_limit",
    "voice_add_edit_counter",
    "professional_voice_slots_used",
    "professional_voice_slots_used_in_workspace",
    "professional_voice_limit",
    "max_credit_limit_extension",
  ])("rejects missing, coerced or unsafe %s counters and limits", async (field) => {
    for (const value of [undefined, null, "10", -1, 0.5, Number.MAX_SAFE_INTEGER + 1, false, {}]) {
      const { client } = setup({ ...subscription(), [field]: value });
      expect(await failure(client.getSubscriptionCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
        operation: "subscription",
      });
    }
  });

  it("preserves zero limits, exhausted slots and overages without inventing spare capacity", async () => {
    const { client } = setup({
      ...subscription(),
      character_count: 32_000,
      character_limit: 30_000,
      voice_slots_used: 12,
      voice_limit: 10,
      max_voice_add_edits: 0,
      can_extend_character_limit: true,
      max_credit_limit_extension: 1_000,
    });
    expect(await client.getSubscriptionCapabilities()).toMatchObject({
      characterCount: 32_000,
      characterLimit: 30_000,
      voiceSlotsUsed: 12,
      voiceLimit: 10,
      maxVoiceAddEdits: 0,
      canExtendCharacterLimit: true,
      maxCreditLimitExtension: 1_000,
    });
  });

  it.each([undefined, null])(
    "retains optional limits and reset times as unknown: %s",
    async (value) => {
      const { client } = setup({
        ...subscription(),
        max_voice_add_edits: value,
        next_character_count_reset_unix: value,
      });
      expect(await client.getSubscriptionCapabilities()).toMatchObject({
        maxVoiceAddEdits: null,
        nextCharacterCountResetUnix: null,
      });
    },
  );

  it.each(["unlimited", 100_000, 0])(
    "preserves the explicit credit extension limit %s",
    async (limit) => {
      const { client } = setup({ ...subscription(), max_credit_limit_extension: limit });
      expect(await client.getSubscriptionCapabilities()).toMatchObject({
        maxCreditLimitExtension: limit,
      });
    },
  );

  it.each(["unlimited", -1, "65", 0.5, Number.MAX_SAFE_INTEGER + 1, {}])(
    "does not treat malformed optional add/edit limit %s as unlimited",
    async (maxVoiceAddEdits) => {
      const { client } = setup({ ...subscription(), max_voice_add_edits: maxVoiceAddEdits });
      expect(await failure(client.getSubscriptionCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );

  it.each([-1, "1792000000", 0.5, 8_640_000_000_001, {}])(
    "rejects invalid reset time %s",
    async (nextReset) => {
      const { client } = setup({ ...subscription(), next_character_count_reset_unix: nextReset });
      expect(await failure(client.getSubscriptionCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );

  it.each([undefined, null, "", " ", "../other", "https://private.example", "x".repeat(129), 1])(
    "rejects missing or malformed workspace identity %s without falling back to user ID",
    async (workspaceId) => {
      const { client } = setup({
        workspace_id: workspaceId,
        user_id: "otherwise_valid_user",
        subscription: subscription(),
      });
      expect(await failure(client.getAccountCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
        operation: "account",
        providerMayHaveAccepted: false,
      });
    },
  );

  it.each([null, [], "private-subscription", {}, undefined])(
    "rejects missing or malformed account subscription %s",
    async (value) => {
      const { client } = setup({ workspace_id: WORKSPACE, subscription: value });
      expect(await failure(client.getAccountCapabilities())).toMatchObject({
        code: "INVALID_RESPONSE",
        operation: "account",
      });
    },
  );

  it.each([401, 403, 404, 429, 500, 503])(
    "does not expose a private provider error body or retry status %s",
    async (status) => {
      const { client, fetchImpl } = setup({ detail: `private ${KEY}` }, status);
      const error = await failure(client.getAccountCapabilities());
      expect(error.operation).toBe("account");
      expect(error.providerMayHaveAccepted).toBe(false);
      expect(String(error)).not.toContain(KEY);
      expect(JSON.stringify(error)).not.toContain("private");
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it("does not contact the provider for an already aborted account read", async () => {
    const { client, fetchImpl } = setup({ workspace_id: WORKSPACE, subscription: subscription() });
    const controller = new AbortController();
    controller.abort();
    expect(
      await failure(client.getAccountCapabilities({ signal: controller.signal })),
    ).toMatchObject({
      code: "ABORTED",
      operation: "account",
      providerMayHaveAccepted: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cancels a pending account read without exposing the abort reason", async () => {
    const { client, fetchImpl } = setup({});
    fetchImpl.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = failure(client.getAccountCapabilities({ signal: controller.signal }));
    controller.abort(new Error(`private ${KEY}`));
    const error = await pending;
    expect(error).toMatchObject({
      code: "ABORTED",
      operation: "account",
      providerMayHaveAccepted: false,
    });
    expect(String(error)).not.toContain(KEY);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("times out a stalled subscription body and keeps the read nonmutating", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup({});
    fetchImpl.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start() {} })));
    const pending = failure(client.getSubscriptionCapabilities());
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await pending).toMatchObject({
      code: "ABORTED",
      operation: "subscription",
      providerMayHaveAccepted: false,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("applies the existing declared and streaming JSON body bounds to account reads", async () => {
    const first = setup({});
    first.fetchImpl.mockResolvedValue(
      new Response("{}", { headers: { "Content-Length": String(256 * 1_024 + 1) } }),
    );
    expect(await failure(first.client.getAccountCapabilities())).toMatchObject({
      code: "INVALID_RESPONSE",
      providerMayHaveAccepted: false,
    });
    const second = setup({});
    second.fetchImpl.mockResolvedValue(new Response(new Uint8Array(256 * 1_024 + 1)));
    expect(await failure(second.client.getSubscriptionCapabilities())).toMatchObject({
      code: "INVALID_RESPONSE",
      providerMayHaveAccepted: false,
    });
  });
});
