import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(),
  accounts: [] as Record<string, unknown>[],
}));
vi.mock("../src/lib/server-context", () => ({
  fetchWithTimeout: h.fetch,
  log: { error: vi.fn() },
  drizzle: { select: () => ({ from: () => ({ where: async () => h.accounts }) }) },
}));
vi.mock("../src/services/calendar-sync-snapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/calendar-sync-snapshot")>()),
  replaceCalendarSnapshot: h.replace,
}));
import { encryptSecret } from "../src/lib/secret-vault";
import { syncOutlookCalendar } from "../src/services/outlook-calendar-sync";

const response = (data: Record<string, unknown>) => ({ ok: true, json: async () => data });
const event = (id = "one") => ({
  id,
  subject: "Appointment",
  start: { dateTime: "2026-10-02T15:00:00", timeZone: "UTC" },
  end: { dateTime: "2026-10-02T15:30:00Z", timeZone: "UTC" },
});
const next = "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=next";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-secret");
  h.accounts = [{ id: "account-1", accessToken: encryptSecret("test-token") }];
  h.replace.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("complete Outlook busy-time imports", () => {
  it("reads every page before replacing the cache and preserves UTC/offset instants", async () => {
    h.fetch
      .mockResolvedValueOnce(response({ value: [event()], "@odata.nextLink": next }))
      .mockImplementationOnce(async () => {
        expect(h.replace).not.toHaveBeenCalled();
        return response({
          value: [
            {
              ...event("two"),
              start: { dateTime: "2026-10-02T10:00:00-05:00" },
              end: { dateTime: "2026-10-02T10:30:00-05:00" },
            },
          ],
        });
      });
    expect(await syncOutlookCalendar("tenant-1")).toEqual({ status: "success", syncedCount: 2 });
    expect(h.fetch.mock.calls[1][0]).toBe(next);
    expect(h.fetch.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer test-token",
      Prefer: 'outlook.timezone="UTC"',
    });
    expect(h.replace).toHaveBeenCalledOnce();
    expect(h.replace.mock.calls[0][0].events).toEqual(
      ["one", "two"].map((externalEventId) =>
        expect.objectContaining({
          externalEventId,
          startTime: new Date("2026-10-02T15:00:00Z"),
          endTime: new Date("2026-10-02T15:30:00Z"),
        }),
      ),
    );
  });

  it.each(["failure", "loop", "truncated", "missing-inventory", "unexpected-zone"])(
    "preserves the prior snapshot on %s",
    async (failure) => {
      h.fetch.mockResolvedValueOnce(response({ value: [event()], "@odata.nextLink": next }));
      if (failure === "failure") h.fetch.mockRejectedValueOnce(new Error("Network unavailable"));
      else if (failure === "loop")
        h.fetch.mockResolvedValue(response({ value: [], "@odata.nextLink": next }));
      else if (failure === "truncated")
        h.fetch.mockImplementation(async () =>
          response({ value: [], "@odata.nextLink": `${next}-${h.fetch.mock.calls.length}` }),
        );
      else if (failure === "missing-inventory") h.fetch.mockResolvedValueOnce(response({}));
      else
        h.fetch.mockResolvedValueOnce(
          response({
            value: [
              {
                ...event(),
                start: { dateTime: "2026-10-02T10:00:00", timeZone: "Central Standard Time" },
              },
            ],
          }),
        );
      expect(await syncOutlookCalendar("tenant-1")).toMatchObject({
        status: "error",
        syncedCount: 0,
      });
      expect(h.replace).not.toHaveBeenCalled();
      expect(h.fetch.mock.calls.length).toBeLessThanOrEqual(20);
    },
  );

  it.each([
    "https://attacker.example/v1.0/me/calendarView?token=next",
    "https://graph.microsoft.com.attacker.example/v1.0/me/calendarView",
    "http://graph.microsoft.com/v1.0/me/calendarView",
    "https://user:password@graph.microsoft.com/v1.0/me/calendarView",
    "https://graph.microsoft.com/v1.0/me/messages",
    "https://graph.microsoft.com/v1.0/me/calendarView#fragment",
  ])("never forwards calendar credentials to unsafe continuation %s", async (url) => {
    h.fetch.mockResolvedValueOnce(response({ value: [event()], "@odata.nextLink": url }));
    expect(await syncOutlookCalendar("tenant-1")).toMatchObject({ status: "error" });
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("replaces a complete empty snapshot while ignoring free and cancelled events", async () => {
    h.fetch.mockResolvedValueOnce(
      response({
        value: [
          { ...event(), showAs: "free" },
          { ...event("cancelled"), isCancelled: true },
        ],
      }),
    );
    expect(await syncOutlookCalendar("tenant-1")).toEqual({ status: "success", syncedCount: 0 });
    expect(h.replace).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-1", accountId: "account-1", events: [] }),
    );
  });

  it("does not claim imported events when the atomic snapshot commit fails", async () => {
    h.fetch.mockResolvedValueOnce(response({ value: [event()] }));
    h.replace.mockRejectedValueOnce(new Error("Database unavailable"));
    expect(await syncOutlookCalendar("tenant-1")).toMatchObject({
      status: "error",
      syncedCount: 0,
    });
  });
});
