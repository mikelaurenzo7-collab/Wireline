import { describe, expect, it, vi } from "vitest";
import { DesktopOAuth } from "../apps/desktop/src/oauth";
import type { DesktopStore, SavedState } from "../apps/desktop/src/store";
import type { HttpReply, PostRequest } from "../apps/desktop/src/transport";
import type { TaskView } from "../apps/desktop/src/contracts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
function memoryStore(initial?: Partial<SavedState>) {
  let state: SavedState = { version: 1, credential: null, task: null, servers: [], ...initial };
  return {
    read: () => structuredClone(state),
    update: async (change: (current: SavedState) => SavedState) => {
      state = structuredClone(change(state));
    },
  } as DesktopStore;
}
function issued(accountId = ownerA, refreshToken = "refresh-new"): HttpReply {
  return {
    status: 200,
    headers: {},
    body: JSON.stringify({
      access_token: "access-new",
      refresh_token: refreshToken,
      botbound_account_id: accountId,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "agents.read computer.plan",
    }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function callback(authorize: string, issuer = "https://botbound.app"): Promise<Response> {
  const request = new URL(authorize);
  const redirect = new URL(request.searchParams.get("redirect_uri")!);
  redirect.search = new URLSearchParams({
    code: "test-code",
    state: request.searchParams.get("state")!,
    iss: issuer,
  }).toString();
  return fetch(redirect, { signal: AbortSignal.timeout(2000) });
}

describe("desktop OAuth account and revocation boundaries", () => {
  it("retains an unsaved first grant for explicit Disconnect and failed-revoke retry", async () => {
    const store = memoryStore();
    const originalUpdate = store.update.bind(store);
    vi.spyOn(store, "update")
      .mockImplementationOnce(originalUpdate)
      .mockRejectedValueOnce(new Error("Disk full"));
    let revoked = 0;
    const post = vi.fn<PostRequest>(async (url, body) => {
      if (url.endsWith("/token")) return issued(ownerA, "new-unsaved-grant");
      expect(new URLSearchParams(body).get("token")).toBe("new-unsaved-grant");
      return { status: ++revoked === 1 ? 503 : 200, headers: {}, body: "" };
    });
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      post,
    );
    await expect(oauth.connect(new AbortController().signal)).rejects.toThrow("Disk full");
    expect(oauth.requiresRecovery()).toBe(true);
    expect(store.read().credential).toBeNull();
    await expect(oauth.connect(new AbortController().signal)).rejects.toThrow("Disconnect");
    await expect(oauth.token()).rejects.toThrow("could not be saved");
    await expect(oauth.disconnect()).rejects.toThrow("could not be revoked");
    expect(oauth.requiresRecovery()).toBe(true);
    await oauth.disconnect();
    expect(oauth.requiresRecovery()).toBe(false);
    expect(store.read().connectionUncertain).toBe(false);
    expect(post).toHaveBeenCalledTimes(3);
  });
  it("does not discard a grant issued after connection cancellation while Disconnect waits", async () => {
    const store = memoryStore(),
      controller = new AbortController(),
      reply = deferred<HttpReply>();
    const post = vi.fn<PostRequest>(async (url, body, _headers, signal) => {
      if (url.endsWith("/token")) {
        // A real transport honors abort even after the server consumed the code.
        // UI cancellation must not be passed to this already-dispatched exchange.
        expect(signal).toBeUndefined();
        return reply.promise;
      }
      expect(new URLSearchParams(body).get("token")).toBe("late-grant");
      return { status: 200, headers: {}, body: "" };
    });
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      post,
    );
    const connected = oauth.connect(controller.signal);
    const rejected = expect(connected).rejects.toThrow();
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    controller.abort();
    const disconnected = oauth.disconnect();
    expect(post).toHaveBeenCalledTimes(1);
    reply.resolve(issued(ownerA, "late-grant"));
    await rejected;
    await disconnected;
    expect(post).toHaveBeenCalledTimes(2);
    expect(oauth.requiresRecovery()).toBe(false);
    expect(store.read().credential).toBeNull();
  });
  it("requires the canonical issuer and an exact loopback PKCE callback", async () => {
    const store = memoryStore();
    const post = vi.fn<PostRequest>(async (_url, body) => {
      const form = new URLSearchParams(body);
      expect(form.get("code_verifier")?.length).toBeGreaterThanOrEqual(43);
      expect(form.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      return issued();
    });
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        const authorize = new URL(url);
        expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
        expect(authorize.searchParams.get("scope")).toBe("agents.read computer.plan");
        expect((await callback(url, "https://untrusted.example")).status).toBe(400);
        expect(post).not.toHaveBeenCalled();
        expect((await callback(url)).status).toBe(200);
      },
      post,
    );
    await oauth.connect(new AbortController().signal);
    expect(store.read().credential?.accountId).toBe(ownerA);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("isolates one owner's tool credentials when another account connects", async () => {
    const tools = [
      {
        id: "private-tools",
        label: "Owner A",
        url: "https://example.com/mcp",
        token: "owner-a-secret",
        tools: [],
        catalogDigest: "digest",
        approvedDigest: null,
        selectedTools: [],
      },
    ];
    const store = memoryStore({ accountId: ownerA, servers: tools });
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      async () => issued(ownerB),
    );
    await oauth.connect(new AbortController().signal);
    expect(store.read().accountId).toBe(ownerB);
    expect(store.read().servers).toEqual([]);
    expect(store.read().otherAccounts?.[ownerA].servers[0].token).toBe("owner-a-secret");
  });

  it("restores a returning owner's stopped task and unknown receipts without crossing accounts", async () => {
    const savedTask: TaskView = {
      id: "owner-a-task",
      bot: { id: "bot-a", name: "Owner A Bot" },
      goal: "Prepare a sourced prospect report.",
      window: null,
      status: "stopped",
      step: 1,
      expiresAt: 0,
      message: "Check the destination before repeating the action.",
      proposal: null,
      receipts: [
        {
          id: "uncertain-action",
          summary: "Save the report.",
          action: { type: "mcp_call", serverId: "owner-a-tools", name: "save", arguments: {} },
          status: "unknown",
          result: "The connection closed after dispatch.",
          createdAt: 1,
        },
      ],
    };
    const store = memoryStore({ accountId: ownerA, task: savedTask });
    let returningAccount = ownerB;
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      async (url) =>
        url.endsWith("/revoke") ? { status: 200, headers: {}, body: "" } : issued(returningAccount),
    );
    await oauth.connect(new AbortController().signal);
    expect(store.read().task).toBeNull();
    expect(store.read().otherAccounts?.[ownerA].task).toEqual(savedTask);
    await oauth.disconnect();
    returningAccount = ownerA;
    await oauth.connect(new AbortController().signal);
    expect(store.read().task).toEqual(savedTask);
    expect(store.read().task?.receipts[0].status).toBe("unknown");
    expect(store.read().otherAccounts?.[ownerA]).toBeUndefined();
    expect(store.read().otherAccounts?.[ownerB].task).toBeNull();
  });

  it("waits for token rotation and revokes the latest refresh token", async () => {
    const rotated = deferred<HttpReply>();
    const store = memoryStore({
      accountId: ownerA,
      credential: { accountId: ownerA, accessToken: "expired", refreshToken: "old", expiresAt: 0 },
    });
    const post = vi.fn<PostRequest>(async (url, body) => {
      if (url.endsWith("/token")) return rotated.promise;
      expect(new URLSearchParams(body).get("token")).toBe("rotated");
      return { status: 200, headers: {}, body: "" };
    });
    const oauth = new DesktopOAuth(store, async () => undefined, post);
    const token = oauth.token();
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    const disconnected = oauth.disconnect();
    await expect(oauth.token()).rejects.toThrow("disconnecting");
    expect(post).toHaveBeenCalledTimes(1);
    rotated.resolve(issued(ownerA, "rotated"));
    await token;
    await disconnected;
    expect(store.read().credential).toBeNull();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("retains the revocable credential when the server cannot confirm revocation", async () => {
    const credential = {
      accountId: ownerA,
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3600000,
    };
    const store = memoryStore({ accountId: ownerA, credential });
    const oauth = new DesktopOAuth(
      store,
      async () => undefined,
      async () => ({ status: 503, headers: {}, body: "" }),
    );
    await expect(oauth.disconnect()).rejects.toThrow("could not be revoked");
    expect(store.read().credential).toEqual(credential);
    await expect(oauth.token()).rejects.toThrow("disconnecting");
  });

  it("revokes a rotated token even when its local save failed", async () => {
    const store = memoryStore({
      accountId: ownerA,
      credential: { accountId: ownerA, accessToken: "expired", refreshToken: "old", expiresAt: 0 },
    });
    const originalUpdate = store.update.bind(store);
    vi.spyOn(store, "update")
      .mockImplementationOnce(originalUpdate)
      .mockRejectedValueOnce(new Error("Disk full"));
    let revocations = 0;
    const post = vi.fn<PostRequest>(async (url, body) => {
      if (url.endsWith("/token")) return issued(ownerA, "rotated-unsaved");
      expect(new URLSearchParams(body).get("token")).toBe("rotated-unsaved");
      return { status: ++revocations === 1 ? 503 : 200, headers: {}, body: "" };
    });
    const openBrowser = vi.fn(async () => undefined);
    const oauth = new DesktopOAuth(store, openBrowser, post);
    await expect(oauth.token()).rejects.toThrow("Disk full");
    expect(store.read().credential?.refreshToken).toBe("old");
    await expect(oauth.token()).rejects.toThrow("could not be saved");
    await expect(oauth.connect(new AbortController().signal)).rejects.toThrow("Disconnect");
    expect(openBrowser).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    await expect(oauth.disconnect()).rejects.toThrow("could not be revoked");
    expect(store.read().credential?.refreshToken).toBe("old");
    await oauth.disconnect();
    expect(store.read().credential).toBeNull();
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("does not erase a different account while recovering an unsaved rotation", async () => {
    const store = memoryStore({
      accountId: ownerA,
      credential: { accountId: ownerA, accessToken: "expired", refreshToken: "old", expiresAt: 0 },
    });
    const post = vi.fn<PostRequest>(async () => issued(ownerA, "rotated-unsaved"));
    const originalUpdate = store.update.bind(store);
    vi.spyOn(store, "update")
      .mockImplementationOnce(originalUpdate)
      .mockRejectedValueOnce(new Error("Disk full"));
    const oauth = new DesktopOAuth(store, async () => undefined, post);
    await expect(oauth.token()).rejects.toThrow("Disk full");
    await store.update((state) => ({
      ...state,
      accountId: ownerB,
      credential: {
        accountId: ownerB,
        accessToken: "other",
        refreshToken: "other-refresh",
        expiresAt: 0,
      },
    }));
    await expect(oauth.disconnect()).rejects.toThrow("account changed");
    expect(store.read().credential?.accountId).toBe(ownerB);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("coalesces duplicate disconnects and blocks reconnection until revocation finishes", async () => {
    const reply = deferred<HttpReply>();
    const store = memoryStore({
      accountId: ownerA,
      credential: { accountId: ownerA, accessToken: "a", refreshToken: "r", expiresAt: 0 },
    });
    const post = vi.fn<PostRequest>(async () => reply.promise);
    const oauth = new DesktopOAuth(store, async () => undefined, post);
    const first = oauth.disconnect(),
      second = oauth.disconnect();
    expect(first).toBe(second);
    await expect(oauth.connect(new AbortController().signal)).rejects.toThrow("disconnection");
    reply.resolve({ status: 200, headers: {}, body: "" });
    await Promise.all([first, second]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(store.read().credential).toBeNull();
  });

  it("does not commit a token response after local Stop", async () => {
    const controller = new AbortController(),
      reply = deferred<HttpReply>(),
      store = memoryStore();
    const post = vi.fn<PostRequest>(async () => reply.promise);
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      post,
    );
    const connected = oauth.connect(controller.signal);
    const rejected = expect(connected).rejects.toThrow();
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    controller.abort();
    reply.resolve(issued());
    await rejected;
    expect(store.read().credential).toBeNull();
  });
});

describe("desktop uncertain authorization recovery", () => {
  it.each(["initial", "refresh"])(
    "persists a lost %s response and requires account revocation review after restart",
    async (kind) => {
      const store = memoryStore(
        kind === "refresh"
          ? {
              accountId: ownerA,
              credential: {
                accountId: ownerA,
                accessToken: "expired",
                refreshToken: "old",
                expiresAt: 0,
              },
            }
          : {},
      );
      const post = vi.fn<PostRequest>(async () => {
        throw new Error("Response timed out");
      });
      const oauth = new DesktopOAuth(
        store,
        async (url) => {
          await callback(url);
        },
        post,
      );
      await expect(
        kind === "initial" ? oauth.connect(new AbortController().signal) : oauth.token(),
      ).rejects.toThrow("timed out");
      expect(store.read().connectionUncertain).toBe(true);
      const restarted = new DesktopOAuth(store, async () => undefined, post);
      expect(restarted.requiresManualRecovery()).toBe(true);
      await expect(restarted.token()).rejects.toThrow("unconfirmed");
      await expect(restarted.connect(new AbortController().signal)).rejects.toThrow("recovery");
      await expect(restarted.disconnect()).rejects.toThrow("response was lost");
      await expect(restarted.confirmRevocation(false)).rejects.toThrow("Revoke");
      expect(restarted.requiresManualRecovery()).toBe(true);
      await restarted.confirmRevocation(true);
      expect(restarted.requiresRecovery()).toBe(false);
      expect(store.read().credential).toBeNull();
      // Owner acknowledgement is not a remote revocation receipt.
      expect(post).toHaveBeenCalledOnce();
    },
  );
  it("retains a mismatched rotated grant only for revocation", async () => {
    const store = memoryStore({
      accountId: ownerA,
      credential: { accountId: ownerA, accessToken: "expired", refreshToken: "old", expiresAt: 0 },
    });
    const post = vi.fn<PostRequest>(async (url, body) => {
      if (url.endsWith("/token")) return issued(ownerB, "mismatched-grant");
      expect(new URLSearchParams(body).get("token")).toBe("mismatched-grant");
      return { status: 200, headers: {}, body: "" };
    });
    const oauth = new DesktopOAuth(store, async () => undefined, post);
    await expect(oauth.token()).rejects.toThrow("another account");
    expect(store.read().credential?.accountId).toBe(ownerA);
    await expect(oauth.token()).rejects.toThrow("could not be saved");
    await oauth.disconnect();
    expect(store.read().credential).toBeNull();
    expect(oauth.requiresRecovery()).toBe(false);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it.each([2, 3])("retains a grant when cancelled during durable write %s", async (writeNumber) => {
    const store = memoryStore(),
      controller = new AbortController(),
      gate = deferred<void>();
    const update = store.update.bind(store);
    let writes = 0;
    vi.spyOn(store, "update").mockImplementation(async (change) => {
      const snapshot = change(store.read());
      if (++writes === writeNumber) await gate.promise;
      await update(() => snapshot);
    });
    const post = vi.fn<PostRequest>(async (url, body) => {
      if (url.endsWith("/token")) return issued(ownerA, "cancel-during-save");
      expect(new URLSearchParams(body).get("token")).toBe("cancel-during-save");
      return { status: 200, headers: {}, body: "" };
    });
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      post,
    );
    const connected = oauth.connect(controller.signal);
    const rejected = expect(connected).rejects.toThrow();
    await vi.waitFor(() => expect(writes).toBe(writeNumber));
    controller.abort();
    gate.resolve();
    await rejected;
    expect(oauth.requiresRecovery()).toBe(true);
    await oauth.disconnect();
    expect(store.read().credential).toBeNull();
    expect(oauth.requiresRecovery()).toBe(false);
  });
  it("does not dispatch a grant when the uncertainty marker cannot be saved", async () => {
    const store = memoryStore();
    vi.spyOn(store, "update").mockRejectedValueOnce(new Error("Disk full"));
    const post = vi.fn<PostRequest>();
    const oauth = new DesktopOAuth(
      store,
      async (url) => {
        await callback(url);
      },
      post,
    );
    await expect(oauth.connect(new AbortController().signal)).rejects.toThrow("Disk full");
    expect(post).not.toHaveBeenCalled();
    expect(oauth.requiresRecovery()).toBe(false);
  });
});
