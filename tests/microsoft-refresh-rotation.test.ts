import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  values: vi.fn(),
  upsert: vi.fn(),
  accounts: [] as Record<string, unknown>[],
}));

vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    select: () => ({ from: () => ({ where: async () => state.accounts }) }),
    update: () => ({ set: state.set }),
    insert: () => ({ values: state.values }),
  },
}));

import { decryptSecret, encryptSecret } from "../src/lib/secret-vault";
import { syncOutlookCalendar } from "../src/services/outlook-calendar-sync";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-secret");
  vi.stubGlobal("fetch", state.fetch);
  state.where.mockResolvedValue(undefined);
  state.set.mockReturnValue({ where: state.where });
  state.values.mockReturnValue({ onConflictDoUpdate: state.upsert });
  state.upsert.mockResolvedValue(undefined);
  state.accounts = [];
});

describe("Outlook calendar sync outcomes", () => {
  it.each(["refresh", "graph", "storage", "missing-token"])(
    "reports %s failure instead of a successful empty refresh",
    async (failure) => {
      state.accounts = [account()];
      if (failure === "missing-token") {
        state.accounts[0].accessToken = null;
      } else if (failure === "refresh") {
        state.fetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: "invalid_grant" }),
        });
      } else {
        state.fetch.mockResolvedValueOnce(response({ access_token: "new-access" }));
        if (failure === "storage")
          state.where.mockRejectedValueOnce(new Error("Database unavailable"));
        else
          state.fetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" });
      }

      await expect(syncOutlookCalendar("test-user")).resolves.toEqual(
        expect.objectContaining({
          status: "error",
          syncedCount: 0,
          failedAccounts: 1,
          error: expect.any(String),
        }),
      );
    },
  );

  it("preserves successfully imported events and reports a partial refresh", async () => {
    state.accounts = [
      account(),
      { ...account(), id: "healthy-account", expiresAt: BigInt(Date.now() + 3_600_000) },
    ];
    state.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      })
      .mockResolvedValueOnce(
        response({
          value: [
            {
              id: "event-1",
              subject: "Appointment",
              start: { dateTime: "2026-09-21T09:00:00" },
              end: { dateTime: "2026-09-21T09:30:00" },
            },
          ],
        }),
      );

    await expect(syncOutlookCalendar("test-user")).resolves.toEqual(
      expect.objectContaining({ status: "partial", syncedCount: 1, failedAccounts: 1 }),
    );
    expect(state.values).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "healthy-account", externalEventId: "event-1" }),
    );
    expect(state.upsert).toHaveBeenCalledOnce();
  });

  it("distinguishes a healthy empty calendar plus a failed calendar from total failure", async () => {
    state.accounts = [
      account(),
      { ...account(), id: "healthy-account", expiresAt: BigInt(Date.now() + 3_600_000) },
    ];
    state.fetch
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(response({ value: [] }));

    await expect(syncOutlookCalendar("test-user")).resolves.toEqual(
      expect.objectContaining({ status: "partial", syncedCount: 0, failedAccounts: 1 }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function account() {
  return {
    id: "test-account",
    accessToken: encryptSecret("old-access"),
    refreshToken: encryptSecret("old-refresh"),
    expiresAt: 1n,
  };
}

function response(data: Record<string, unknown>) {
  return { ok: true, json: async () => data };
}

describe("Outlook calendar credential rotation", () => {
  it("persists calendar rotation before fetching events with the renewed access token", async () => {
    state.accounts = [account()];
    state.fetch
      .mockResolvedValueOnce(
        response({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(response({ value: [] }));

    await expect(syncOutlookCalendar("test-user")).resolves.toEqual({
      status: "success",
      syncedCount: 0,
    });
    const saved = state.set.mock.calls[0][0];
    expect(saved.refreshToken).not.toBe("new-refresh");
    expect(decryptSecret(saved.refreshToken)).toBe("new-refresh");
    expect(decryptSecret(saved.accessToken)).toBe("new-access");
    expect(state.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new-access");

    state.accounts = [{ ...account(), ...saved, expiresAt: 1n }];
    state.fetch
      .mockResolvedValueOnce(response({ access_token: "later-access", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ value: [] }));
    await syncOutlookCalendar("test-user");
    expect(new URLSearchParams(state.fetch.mock.calls[2][1].body).get("refresh_token")).toBe(
      "new-refresh",
    );
    expect(state.set.mock.calls[1][0]).not.toHaveProperty("refreshToken");
  });

  it.each([undefined, ""])(
    "preserves the calendar credential when rotation is %s",
    async (rotated) => {
      state.accounts = [account()];
      state.fetch
        .mockResolvedValueOnce(
          response({ access_token: "new-access", refresh_token: rotated, expires_in: 3600 }),
        )
        .mockResolvedValueOnce(response({ value: [] }));

      await syncOutlookCalendar("test-user");
      expect(state.set.mock.calls[0][0]).not.toHaveProperty("refreshToken");
    },
  );
});
