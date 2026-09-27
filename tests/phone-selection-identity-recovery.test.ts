import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<void>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  provision: vi.fn(),
  assign: vi.fn(),
  queue: vi.fn(),
  preview: vi.fn(),
  held: 0,
  slots: 1,
  channels: ["voice", "email"] as string[],
}));

vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method}:${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/lib/api-error", async (original) => ({
  ...(await original<typeof import("../src/lib/api-error")>()),
  asyncHandler: (handler: Handler) => handler,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
  drizzle: { select: () => ({ from: () => ({ where: async () => [{ held: h.held }] }) }) },
}));
vi.mock("../src/lib/agent-phone-lines", () => ({ isTwilioPhoneNumberSid: () => true }));
vi.mock("../src/lib/phone-line-entitlements", () => ({
  getIncludedPhoneLineSlots: async () => h.slots,
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: async () => ({ channels: h.channels }),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: vi.fn(),
}));
vi.mock("../src/lib/paid-bot-identity", () => ({ enqueuePaidBotIdentityReconciliation: h.queue }));
vi.mock("../src/lib/voice/native-phone-provisioning", () => ({
  provisionNativeTenantNumber: h.provision,
}));
vi.mock("../src/lib/voice/native-phone-assignment", () => ({ assignNativePhoneLine: h.assign }));
vi.mock("../src/lib/voice/native-phone-release", () => ({ releaseNativeTenantNumber: vi.fn() }));
vi.mock("../src/lib/voice/native-phone-carrier", () => ({
  listNativeAvailableLocalNumbers: h.preview,
  repairOwnedTwilioOpenAIRouting: vi.fn(),
}));
vi.mock("../src/lib/voice/phone-number-picker-inventory", () => ({
  listPhoneNumberPickerAreaCodes: vi.fn(),
  resolveNonProductionPhoneNumberPickerInventory: vi.fn(),
}));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => () => {},
  phoneNumberPatchSchema: {},
  phoneNumberProvisionSchema: {},
}));
vi.mock("../src/lib/trial-gate", () => ({ enforceLiveWorkActivation: () => {} }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ phoneNumberRateLimiter: () => {} }));

import "../src/routes/native-phone-routing-routes";

const number = "+15615550102";
function request(agentId: string | null = "bot") {
  return {
    user: { id: "tenant" },
    params: { id: "1" },
    body: {
      agent_id: agentId,
      phone_number: number,
      area_code: "561",
      user_id: "untrusted-tenant",
    },
  };
}
function response() {
  const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.held = 0;
  h.slots = 1;
  h.channels = ["voice", "email"];
  h.queue.mockResolvedValue({ queued: 1 });
  h.provision.mockResolvedValue({ ok: true, phoneNumber: number, reused: false });
  h.assign.mockResolvedValue({
    line: { id: 1n, agentId: "bot", phoneNumber: number },
    nativeVoice: { status: "active" },
  });
});

describe("number selection resumes managed identity", () => {
  it("does not depend on an email reconciliation job for Calls-only", async () => {
    h.channels = ["voice"];
    h.queue.mockRejectedValue(new Error("Mail worker unavailable"));
    const res = response();
    await h.routes.get("post:/api/phone-numbers/provision")!(request(), res);
    expect(h.queue).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
  it.each(["post:/api/phone-numbers/provision", "post:/api/phone-numbers/claim"])(
    "queues repair for a saved reservation even when routing is pending on %s",
    async (path) => {
      h.provision.mockResolvedValue({
        ok: false,
        phoneNumber: number,
        activationPending: true,
        code: "NATIVE_VOICE_ACTIVATION_PENDING",
        error: "Number reserved; routing not confirmed.",
      });
      const res = response();
      await h.routes.get(path)!(request(), res);
      expect(h.queue).toHaveBeenCalledExactlyOnceWith("tenant");
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          activation_pending: true,
          phone_number: number,
        }),
      );
    },
  );

  it("does not queue identity for a failed purchase with no saved line", async () => {
    h.provision.mockResolvedValue({ ok: false, code: "PHONE_CAPACITY_REACHED" });
    await h.routes.get("post:/api/phone-numbers/provision")!(request(), response());
    expect(h.queue).not.toHaveBeenCalled();
  });
  it.each(["post:/api/phone-numbers/provision", "patch:/api/phone-numbers/:id"])(
    "queues tenant-owned email setup after %s",
    async (path) => {
      const res = response();
      await h.routes.get(path)!(request(), res);
      expect(h.queue).toHaveBeenCalledWith("tenant");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining(
          path.startsWith("post") ? { ok: true, phone_number: number } : { success: true },
        ),
      );
    },
  );

  it.each(["post:/api/phone-numbers/provision", "patch:/api/phone-numbers/:id"])(
    "reports saved phone state and permits an idempotent retry after queue failure on %s",
    async (path) => {
      h.queue.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
      const failed = response();
      await expect(h.routes.get(path)!(request(), failed)).rejects.toThrow(
        "The phone change is saved, but email setup could not start",
      );
      expect(failed.json).not.toHaveBeenCalled();
      h.provision.mockResolvedValue({ ok: true, phoneNumber: number, reused: true });
      const retry = response();
      await h.routes.get(path)!(request(), retry);
      expect(h.queue).toHaveBeenCalledTimes(2);
      expect(retry.json).toHaveBeenCalled();
      if (path.startsWith("post")) expect(retry.status).toHaveBeenCalledWith(200);
    },
  );

  it("does not start managed mail when a line is unassigned", async () => {
    h.assign.mockResolvedValue({ line: { id: 1n, agentId: null, phoneNumber: number } });
    await h.routes.get("patch:/api/phone-numbers/:id")!(request(null), response());
    expect(h.queue).not.toHaveBeenCalled();
  });

  it.each(["get:/api/phone-numbers/available", "post:/api/phone-numbers/search"])(
    "distinguishes full capacity from empty carrier inventory on %s",
    async (path) => {
      h.held = h.slots;
      await expect(h.routes.get(path)!(request(), response())).rejects.toMatchObject({
        code: "PHONE_CAPACITY_REACHED",
      });
      expect(h.preview).not.toHaveBeenCalled();
      expect(h.provision).not.toHaveBeenCalled();
    },
  );
});
