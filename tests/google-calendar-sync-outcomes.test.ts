import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  list: vi.fn(),
  replace: vi.fn(),
  update: vi.fn(),
  tokenListener: null as ((tokens: Record<string, unknown>) => unknown) | null,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    select: () => ({ from: () => ({ where: async () => h.accounts }) }),
    update: () => ({ set: () => ({ where: h.update }) }),
  },
}));
vi.mock("../src/services/calendar-sync-snapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/calendar-sync-snapshot")>()),
  replaceCalendarSnapshot: h.replace,
}));
vi.mock("../src/lib/google-apis", () => ({
  googleApis: async () => ({
    auth: {
      OAuth2: class {
        setCredentials() {}
        on(_event: string, listener: (tokens: Record<string, unknown>) => unknown) {
          h.tokenListener = listener;
        }
      },
    },
    calendar: () => ({ events: { list: h.list } }),
  }),
}));

import { encryptSecret } from "../src/lib/secret-vault";
import { syncGoogleCalendar } from "../src/services/google-calendar-sync";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  h.accounts = [];
  h.replace.mockResolvedValue(undefined);
  h.update.mockResolvedValue(undefined);
  h.tokenListener = null;
});
afterEach(() => vi.unstubAllEnvs());

function account(id = "google-account") {
  return {
    id,
    accessToken: encryptSecret("test-access"),
    refreshToken: encryptSecret("test-refresh"),
  };
}
function event(id = "event-1") {
  return {
    id,
    summary: "Appointment",
    start: { dateTime: "2026-09-21T09:00:00Z" },
    end: { dateTime: "2026-09-21T09:30:00Z" },
  };
}

describe("Google calendar sync outcomes", () => {
  it("waits for token persistence and reports a failed credential write", async () => {
    h.accounts = [account()];
    let rejectWrite!: (error: Error) => void;
    h.update.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    h.list.mockImplementationOnce(async () => {
      // OAuth2Client emits tokens synchronously; EventEmitter ignores listener promises.
      const callback = h.tokenListener?.({ access_token: "renewed-access" });
      // Catch the old implementation's promise so a red regression does not
      // leave an unhandled rejection in the test runner.
      if (callback instanceof Promise) void callback.catch(() => undefined);
      return { data: { items: [] } };
    });
    let settled = false;
    const pending = syncGoogleCalendar("user-1").then((result) => {
      settled = true;
      return result;
    });
    for (let turn = 0; turn < 25; turn++) await Promise.resolve();
    const settledBeforeWrite = settled;
    rejectWrite(new Error("Database unavailable"));

    await expect(pending).resolves.toEqual(
      expect.objectContaining({ status: "error", failedAccounts: 1 }),
    );
    expect(settledBeforeWrite).toBe(false);
  });

  it.each(["provider", "storage", "missing-token"])(
    "reports %s failure without claiming an empty success",
    async (failure) => {
      h.accounts = [account()];
      if (failure === "missing-token") h.accounts[0].accessToken = null;
      else if (failure === "provider")
        h.list.mockRejectedValueOnce(new Error("Connection revoked"));
      else {
        h.list.mockResolvedValueOnce({ data: { items: [event()] } });
        h.replace.mockRejectedValueOnce(new Error("Database unavailable"));
      }

      await expect(syncGoogleCalendar("user-1")).resolves.toEqual(
        expect.objectContaining({
          status: "error",
          syncedCount: 0,
          failedAccounts: 1,
          error: expect.any(String),
        }),
      );
    },
  );

  it("keeps imported events and exposes another account's failure", async () => {
    h.accounts = [account("failed"), account("healthy")];
    h.list
      .mockRejectedValueOnce(new Error("Connection revoked"))
      .mockResolvedValueOnce({ data: { items: [event()] } });

    await expect(syncGoogleCalendar("user-1")).resolves.toEqual(
      expect.objectContaining({ status: "partial", syncedCount: 1, failedAccounts: 1 }),
    );
    expect(h.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "healthy",
        events: [expect.objectContaining({ externalEventId: "event-1" })],
      }),
    );
  });

  it("does not report partial imports when the atomic snapshot write fails", async () => {
    h.accounts = [account()];
    h.list.mockResolvedValueOnce({ data: { items: [event("one"), event("two")] } });
    h.replace.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(syncGoogleCalendar("user-1")).resolves.toEqual(
      expect.objectContaining({ status: "error", syncedCount: 0, failedAccounts: 1 }),
    );
  });

  it("counts a healthy empty calendar as partial reach when another account fails", async () => {
    h.accounts = [account("failed"), account("healthy")];
    h.list
      .mockRejectedValueOnce(new Error("Connection revoked"))
      .mockResolvedValueOnce({ data: { items: [] } });

    await expect(syncGoogleCalendar("user-1")).resolves.toEqual(
      expect.objectContaining({ status: "partial", syncedCount: 0, failedAccounts: 1 }),
    );
  });

  it("keeps a healthy empty calendar successful", async () => {
    h.accounts = [account()];
    h.list.mockResolvedValueOnce({ data: { items: [] } });

    await expect(syncGoogleCalendar("user-1")).resolves.toEqual({
      status: "success",
      syncedCount: 0,
    });
  });

  it("keeps an unconnected account distinct from an empty calendar", async () => {
    await expect(syncGoogleCalendar("user-1")).resolves.toEqual({ status: "no_accounts" });
    expect(h.list).not.toHaveBeenCalled();
  });

  it("reads every page before replacing the cache, including all-day busy time", async () => {
    h.accounts = [account()];
    h.list
      .mockResolvedValueOnce({ data: { items: [event()], nextPageToken: "page-2" } })
      .mockImplementationOnce(async () => {
        expect(h.replace).not.toHaveBeenCalled();
        return {
          data: {
            timeZone: "America/Chicago",
            items: [{ id: "all-day", start: { date: "2026-10-02" }, end: { date: "2026-10-03" } }],
          },
        };
      });
    expect(await syncGoogleCalendar("user-1")).toEqual({ status: "success", syncedCount: 2 });
    expect(h.list.mock.calls[1][0].pageToken).toBe("page-2");
    expect(h.replace.mock.calls[0][0].events[1]).toMatchObject({
      startTime: new Date("2026-10-02T05:00:00Z"),
      endTime: new Date("2026-10-03T05:00:00Z"),
    });
  });

  it.each(["failure", "loop", "truncated"])(
    "retains the cache when pagination ends with %s",
    async (kind) => {
      h.accounts = [account()];
      h.list.mockResolvedValueOnce({ data: { items: [event()], nextPageToken: "next" } });
      if (kind === "failure") h.list.mockRejectedValueOnce(new Error("Page unavailable"));
      else if (kind === "loop")
        h.list.mockResolvedValue({ data: { items: [], nextPageToken: "next" } });
      else
        h.list.mockImplementation(async () => ({
          data: { items: [], nextPageToken: `page-${h.list.mock.calls.length}` },
        }));
      expect(await syncGoogleCalendar("user-1")).toMatchObject({ status: "error", syncedCount: 0 });
      expect(h.replace).not.toHaveBeenCalled();
      expect(h.list.mock.calls.length).toBeLessThanOrEqual(20);
    },
  );
});
