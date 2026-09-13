import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/lib/api", () => ({ authFetch: h.request, safeJson: (r: Response) => r.json() }));
import { bootstrapManagedBotIdentity } from "../src/lib/bot-identity-bootstrap";

beforeEach(() => vi.resetAllMocks());

describe("web managed identity setup", () => {
  it("uses one authenticated reconciliation request and returns both confirmed identities", async () => {
    h.request.mockResolvedValue(
      Response.json({
        ok: true,
        email: "bot@botbound.me",
        phone_number: "+12025550123",
        custom_domain: true,
      }),
    );
    const result = await bootstrapManagedBotIdentity("bot/id");
    expect(h.request).toHaveBeenCalledExactlyOnceWith("/api/agents/bot%2Fid/managed-identity", {
      method: "POST",
    });
    expect(result.mailbox).toMatchObject({
      provisioned: true,
      emailAddress: "bot@botbound.me",
      customDomain: true,
    });
    expect(result.phone).toMatchObject({ provisioned: true, phoneNumber: "+12025550123" });
  });
  it("retains the activation prompt when shared admission rejects the Bot", async () => {
    h.request.mockResolvedValue(Response.json({ code: "ACTIVATION_REQUIRED" }, { status: 402 }));
    const result = await bootstrapManagedBotIdentity("bot");
    expect(result.phone).toMatchObject({
      provisioned: false,
      activationRequired: true,
      status: 402,
    });
    expect(result.mailbox.provisioned).toBe(false);
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: true }, { ok: false, email: "bot@botbound.me", phone_number: "+12025550123" }])(
    "does not report unconfirmed resources as provisioned",
    async (body) => {
      h.request.mockResolvedValue(Response.json(body));
      const result = await bootstrapManagedBotIdentity("bot");
      expect(result.mailbox.provisioned).toBe(false);
      expect(result.phone.provisioned).toBe(false);
    },
  );
  it("leaves network failure retryable without starting independent provider requests", async () => {
    h.request.mockRejectedValue(new Error("offline"));
    const result = await bootstrapManagedBotIdentity("bot");
    expect(result.mailbox).toMatchObject({ provisioned: false, status: 0 });
    expect(result.phone).toMatchObject({ provisioned: false, status: 0 });
    expect(h.request).toHaveBeenCalledTimes(1);
  });
});
