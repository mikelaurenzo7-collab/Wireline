import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ zoom: vi.fn(), fetch: vi.fn(), googleList: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ autoZoomLink: true }] }) }),
    }),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  fetchWithTimeout: h.fetch,
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => ({ performed: true, result: await perform() }),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  assertExternalEntityActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/google-apis", () => ({
  googleApis: async () => ({ calendar: () => ({ events: { list: h.googleList } }) }),
}));
vi.mock("../src/lib/secret-vault", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn() }));
vi.mock("../src/lib/zoom-service", () => ({ createMeeting: h.zoom }));
vi.mock("../src/lib/icloud-mail", () => ({ fetchIcloudInbox: vi.fn(), sendIcloudMail: vi.fn() }));
vi.mock("../src/lib/agentmail-mail", () => ({
  fetchAgentMailInbox: vi.fn(),
  sendAgentMail: vi.fn(),
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: vi.fn() }));
vi.mock("../src/lib/managed-mail-send-spend", () => ({ sendFundedManagedEmail: vi.fn() }));
import { IntegrationService } from "../src/lib/integrations";

type CalendarMethods = {
  getAccounts: () => Promise<Array<{ provider: string }>>;
  getGoogleBusySlots: (...args: unknown[]) => Promise<string[]>;
  getMicrosoftBusySlots: (...args: unknown[]) => Promise<string[]>;
  createGoogleEvent: (...args: unknown[]) => Promise<boolean>;
  getGoogleClient: (...args: unknown[]) => Promise<unknown>;
  getMicrosoftToken: (...args: unknown[]) => Promise<string>;
};
const params = {
  title: "Consultation",
  description: "Caller confirmed",
  startTime: "2026-10-02T15:00:00Z",
  endTime: "2026-10-02T15:30:00Z",
  agentId: "bot",
};
beforeEach(() => {
  vi.restoreAllMocks();
  h.zoom.mockReset().mockResolvedValue(null);
  h.fetch.mockReset();
  h.googleList.mockReset();
});

describe("connected calendar availability privacy and failure honesty", () => {
  function providerService(provider: string) {
    const instance = new IntegrationService("tenant");
    const methods = instance as unknown as CalendarMethods;
    vi.spyOn(methods, "getAccounts").mockResolvedValue([{ provider }]);
    vi.spyOn(methods, "getGoogleClient").mockResolvedValue({});
    vi.spyOn(methods, "getMicrosoftToken").mockResolvedValue("token");
    return instance;
  }

  it.each(["google", "microsoft"])(
    "never treats malformed %s inventory as free time",
    async (provider) => {
      const instance = providerService(provider);
      h.googleList.mockResolvedValue({ data: { items: {} } });
      h.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      expect(await instance.checkAvailability({ date: "2026-10-02", timeZone: "UTC" })).toBe(
        "Failed to check calendar availability.",
      );
      expect(await instance.bookAppointment(params)).toBe(false);
      expect(h.zoom).not.toHaveBeenCalled();
    },
  );

  it.each(["google", "microsoft"])(
    "omits other customers' details from %s busy times",
    async (provider) => {
      const instance = providerService(provider);
      const event = {
        summary: "Private customer name and service",
        subject: "Private customer name and service",
        start: { dateTime: "2026-10-02T15:00:00Z", timeZone: "UTC" },
        end: { dateTime: "2026-10-02T15:30:00Z", timeZone: "UTC" },
      };
      h.googleList.mockResolvedValue({
        data: {
          items: [
            event,
            {
              summary: "Private all-day appointment",
              start: { date: "2026-10-02" },
              end: { date: "2026-10-03" },
            },
          ],
        },
      });
      h.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          value: [event, { subject: "Private all-day appointment", isAllDay: true }],
        }),
      });
      const result = await instance.checkAvailability({ date: "2026-10-02", timeZone: "UTC" });
      expect(result).toContain("Busy slots in UTC:");
      expect(result).toContain("All day: Busy");
      expect(result).toContain("3:30 PM");
      expect(result).not.toContain("Private");
    },
  );

  it.each(["google", "microsoft"])("does not block free/cancelled %s events", async (provider) => {
    const instance = providerService(provider);
    h.googleList.mockResolvedValue({
      data: { items: [{ status: "cancelled" }, { transparency: "transparent" }] },
    });
    h.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [{ isCancelled: true }, { showAs: "free" }] }),
    });
    expect(await instance.checkAvailability({ date: "2026-10-02", timeZone: "UTC" })).toBe(
      "The whole day is currently free in UTC.",
    );
  });

  it.each(["google", "microsoft"])(
    "fails closed for an incomplete %s busy event",
    async (provider) => {
      const instance = providerService(provider);
      h.googleList.mockResolvedValue({
        data: { items: [{ start: { dateTime: "2026-10-02T15:00:00Z" } }] },
      });
      h.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ value: [{ start: { dateTime: "2026-10-02T15:00:00Z" } }] }),
      });
      expect(await instance.checkAvailability({ date: "2026-10-02", timeZone: "UTC" })).toBe(
        "Failed to check calendar availability.",
      );
    },
  );
});

describe("connected calendar booking conflict recheck", () => {
  function service() {
    const instance = new IntegrationService("tenant");
    const methods = instance as unknown as CalendarMethods;
    vi.spyOn(methods, "getAccounts").mockResolvedValue([
      { provider: "google" },
      { provider: "microsoft" },
    ]);
    const google = vi.spyOn(methods, "getGoogleBusySlots").mockResolvedValue([]);
    const microsoft = vi.spyOn(methods, "getMicrosoftBusySlots").mockResolvedValue([]);
    const create = vi.spyOn(methods, "createGoogleEvent").mockResolvedValue(true);
    return { instance, google, microsoft, create };
  }

  it("rechecks the exact interval on every connected account before creating an event", async () => {
    const s = service();
    expect(await s.instance.bookAppointment(params)).toBe(true);
    for (const check of [s.google, s.microsoft]) {
      expect(check).toHaveBeenCalledWith(
        expect.any(Object),
        new Date(params.startTime),
        new Date(params.endTime),
        "UTC",
      );
      expect(check.mock.invocationCallOrder[0]).toBeLessThan(s.create.mock.invocationCallOrder[0]);
    }
  });

  it("does not create a Zoom meeting or event when another connected account is busy", async () => {
    const s = service();
    s.microsoft.mockResolvedValue(["Busy"]);
    expect(await s.instance.bookAppointment(params)).toBe(false);
    expect(h.zoom).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });

  it("fails closed when the recheck fails or the requested interval is invalid", async () => {
    const s = service();
    s.google.mockRejectedValue(new Error("Provider unavailable"));
    expect(await s.instance.bookAppointment(params)).toBe(false);
    expect(await s.instance.bookAppointment({ ...params, endTime: params.startTime })).toBe(false);
    expect(h.zoom).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });
});
