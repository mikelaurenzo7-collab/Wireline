import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SESSION_EXPIRED_EVENT, TRIAL_GATE_EVENT, authFetch } from "../src/lib/api-base";
import { bootstrapManagedBotIdentity } from "../src/lib/bot-identity-bootstrap";

const fetchMock = vi.fn();
let events: Array<CustomEvent>;

beforeEach(() => {
  events = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    dispatchEvent: (event: CustomEvent) => {
      events.push(event);
      return true;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("background managed identity gate handling", () => {
  it("returns an untouched 402 while suppressing only the requested global dialog", async () => {
    const body = { code: "ACTIVATION_REQUIRED", error: "Activate a live plan." };
    const response = Response.json(body, { status: 402 });
    fetchMock.mockResolvedValue(response);
    const returned = await authFetch("/api/background-check", {
      method: "POST",
      suppressTrialGateEvent: true,
    });
    expect(returned).toBe(response);
    expect(returned.status).toBe(402);
    expect(returned.ok).toBe(false);
    expect(await returned.json()).toEqual(body);
    expect(events).toEqual([]);
    const request = fetchMock.mock.calls[0][1];
    expect(request.credentials).toBe("include");
    expect(request.suppressTrialGateEvent).toBeUndefined();
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("lets the setup wizard own background activation while a later explicit paid action still opens the gate", async () => {
    const body = { code: "ACTIVATION_REQUIRED", error: "Activate a live plan." };
    fetchMock.mockImplementation(async () => Response.json(body, { status: 402 }));
    const result = await bootstrapManagedBotIdentity("bot/id");
    expect(result.phone).toMatchObject({
      requested: true,
      provisioned: false,
      activationRequired: true,
      status: 402,
    });
    expect(result.mailbox).toMatchObject({ provisioned: false, emailAddress: null, status: 402 });
    expect(events).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agents/bot%2Fid/managed-identity");

    const explicit = await authFetch("/api/phone-numbers/available", { method: "POST" });
    expect(explicit.status).toBe(402);
    expect(await explicit.json()).toEqual(body);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].type).toBe(TRIAL_GATE_EVENT);
    expect(events[0].detail).toMatchObject(body);
  });

  it("keeps default dialog handling for an unfamiliar paid-action code", async () => {
    const body = { code: "NEW_CAPACITY_LIMIT", error: "Choose more capacity." };
    fetchMock.mockResolvedValue(Response.json(body, { status: 402 }));
    const response = await authFetch("/api/paid-action", { method: "POST" });
    expect(await response.json()).toEqual(body);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].type).toBe(TRIAL_GATE_EVENT);
    expect(events[0].detail).toMatchObject(body);
  });

  it("preserves an authentication failure and emits session expiry during background setup", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: "UNAUTHENTICATED", error: "Sign in again." }, { status: 401 }),
    );
    const result = await bootstrapManagedBotIdentity("bot");
    expect(result.phone).toMatchObject({
      provisioned: false,
      activationRequired: false,
      status: 401,
    });
    expect(result.mailbox).toMatchObject({ provisioned: false, emailAddress: null, status: 401 });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].type).toBe(AUTH_SESSION_EXPIRED_EVENT);
    expect(events[0].detail).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      source: "/api/agents/bot/managed-identity",
    });
  });

  it.each([400, 403])(
    "does not turn background %s into provisioned identities or a session expiry",
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json(
          {
            ok: true,
            email: "unconfirmed@botbound.app",
            phone_number: "+12025550123",
            code: "DENIED",
          },
          { status },
        ),
      );
      const result = await bootstrapManagedBotIdentity("bot");
      expect(result.phone).toMatchObject({
        provisioned: false,
        phoneNumber: null,
        activationRequired: false,
        status,
      });
      expect(result.mailbox).toMatchObject({ provisioned: false, emailAddress: null, status });
      expect(events).toEqual([]);
    },
  );
});
