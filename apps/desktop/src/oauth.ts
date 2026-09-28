import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { DesktopStore, OAuthCredential } from "./store";
import { postPinned, type PostRequest } from "./transport";

const ORIGIN = "https://botbound.app";
const CLIENT_ID = "botbound-desktop";
const RESOURCE = `${ORIGIN}/mcp`;
const SCOPES = "agents.read computer.plan";
export function matchingState(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const received = Buffer.from(actual, "utf8"),
    wanted = Buffer.from(expected, "utf8");
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export class DesktopOAuth {
  private refresh: Promise<string> | null = null;
  private disconnectOperation: Promise<void> | null = null;
  private disconnecting = false;
  private pendingRotation: {
    credential: OAuthCredential;
    predecessor: string;
    accountId: string;
  } | null = null;
  private pendingIssuance: OAuthCredential | null = null;
  private connectionOperation: Promise<void> | null = null;
  constructor(
    private readonly store: DesktopStore,
    private readonly openBrowser: (url: string) => Promise<void>,
    private readonly post: PostRequest = postPinned,
  ) {}

  requiresRecovery(): boolean {
    return Boolean(
      this.pendingRotation || this.pendingIssuance || this.store.read().connectionUncertain,
    );
  }

  requiresManualRecovery(): boolean {
    return Boolean(
      this.store.read().connectionUncertain &&
      !this.pendingIssuance &&
      !this.pendingRotation &&
      !this.connectionOperation &&
      !this.refresh,
    );
  }

  async confirmRevocation(confirmed: boolean): Promise<void> {
    if (!confirmed || !this.requiresManualRecovery() || this.disconnectOperation)
      throw new Error(
        "Revoke BotBound Desktop in the account used for this connection before confirming.",
      );
    await this.store.update((current) => ({
      ...current,
      credential: null,
      connectionUncertain: false,
    }));
    // This records the owner's review. It is not a server revocation receipt.
  }

  connect(signal: AbortSignal): Promise<void> {
    if (this.connectionOperation)
      return Promise.reject(new Error("A connection is already in progress."));
    this.connectionOperation = this.connectAccount(signal).finally(() => {
      this.connectionOperation = null;
    });
    return this.connectionOperation;
  }

  async settleConnection(): Promise<void> {
    if (this.connectionOperation) await this.connectionOperation.catch(() => undefined);
    if (this.refresh) await this.refresh.catch(() => undefined);
  }

  private async connectAccount(signal: AbortSignal): Promise<void> {
    if (this.disconnectOperation)
      throw new Error("Wait for disconnection to finish before connecting again.");
    if (this.refresh || this.requiresRecovery())
      throw new Error("Finish token recovery with Disconnect before connecting again.");
    this.disconnecting = false;
    const verifier = randomBytes(48).toString("base64url");
    const state = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    let redirect = "";
    let received = false;
    let resolveCode: (code: string) => void;
    let rejectCode: (error: Error) => void;
    const codePromise = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // Attach immediately so abort while the browser opens cannot become unhandled.
    void codePromise.catch(() => undefined);
    const server = createServer((request, response) => {
      if (
        request.method !== "GET" ||
        !redirect ||
        request.headers.host !== new URL(redirect).host
      ) {
        response.writeHead(400).end();
        return;
      }
      const url = new URL(request.url || "/", redirect);
      if (
        url.pathname !== "/callback" ||
        url.searchParams.get("iss") !== ORIGIN ||
        !matchingState(url.searchParams.get("state"), state) ||
        received
      ) {
        response.writeHead(400).end("This sign-in response is not valid for this connection.");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code || code.length > 2048 || url.searchParams.has("error")) {
        response.writeHead(400).end("Connection was not approved. Return to BotBound Desktop.");
        rejectCode(new Error("The connection was not approved."));
        return;
      }
      received = true;
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'",
        "referrer-policy": "no-referrer",
      });
      response.end("BotBound connection received. Return to BotBound Desktop to finish.");
      resolveCode(code);
    });
    const abort = () => rejectCode(new Error("Connection cancelled or timed out."));
    const deadline = setTimeout(abort, 5 * 60_000);
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Could not start the sign-in callback.");
      redirect = `http://127.0.0.1:${address.port}/callback`;
      const url = new URL(`${ORIGIN}/mcp/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: redirect,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: SCOPES,
        resource: RESOURCE,
      }).toString();
      await this.openBrowser(url.toString());
      const code = await codePromise;
      signal.throwIfAborted();
      // Persist uncertainty before any one-use grant is sent. If its response is
      // lost, even a restart must not silently create another sibling grant.
      await this.store.update((current) => ({ ...current, connectionUncertain: true }));
      signal.throwIfAborted();
      // Once dispatched, the one-use code may already be consumed remotely.
      // Let the bounded transport finish so UI cancellation cannot discard its
      // issued grant; honor cancellation only after retaining the response.
      const credential = await this.exchange({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        code_verifier: verifier,
        client_id: CLIENT_ID,
        resource: RESOURCE,
      });
      // Issuance is already committed remotely, even if cancellation or local
      // persistence fails next. Keep the new grant available for revocation.
      this.pendingIssuance = credential;
      signal.throwIfAborted();
      await this.store.update((current) => {
        signal.throwIfAborted();
        if (this.disconnecting) throw new Error("This connection was cancelled.");
        const otherAccounts = { ...current.otherAccounts };
        if (current.accountId && current.accountId !== credential.accountId) {
          if (!otherAccounts[credential.accountId] && Object.keys(otherAccounts).length >= 7)
            throw new Error(
              "This desktop profile has reached its account limit. Use a separate OS profile for another account.",
            );
          otherAccounts[current.accountId] = { servers: current.servers, task: current.task };
          const restored = otherAccounts[credential.accountId];
          delete otherAccounts[credential.accountId];
          return {
            ...current,
            accountId: credential.accountId,
            credential,
            otherAccounts,
            servers: restored?.servers || [],
            task: restored?.task || null,
          };
        }
        return { ...current, accountId: credential.accountId, credential };
      });
      signal.throwIfAborted();
      await this.store.update((current) => {
        signal.throwIfAborted();
        return { ...current, connectionUncertain: false };
      });
      signal.throwIfAborted();
      this.pendingIssuance = null;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
      server.close();
      server.closeAllConnections();
    }
  }

  private async exchange(form: Record<string, string>): Promise<OAuthCredential> {
    const reply = await this.post(
      `${ORIGIN}/mcp/oauth/token`,
      new URLSearchParams(form).toString(),
      { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    );
    if (reply.status !== 200)
      throw new Error("BotBound could not authorize this connection. Sign in again.");
    const body = JSON.parse(reply.body) as Record<string, unknown>;
    const scopes = typeof body.scope === "string" ? body.scope.split(" ") : [];
    if (
      typeof body.botbound_account_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.botbound_account_id) ||
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      body.token_type?.toString().toLowerCase() !== "bearer" ||
      typeof body.expires_in !== "number" ||
      !Number.isFinite(body.expires_in) ||
      body.expires_in <= 0 ||
      body.expires_in > 86400 ||
      !scopes.includes("computer.plan") ||
      !scopes.includes("agents.read")
    )
      throw new Error("The connection did not grant the required desktop planning permissions.");
    return {
      accountId: body.botbound_account_id,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
  }

  token(): Promise<string> {
    if (this.disconnecting) return Promise.reject(new Error("This connection is disconnecting."));
    if (this.refresh) return this.refresh;
    if (this.pendingIssuance)
      return Promise.reject(
        new Error("The approved connection could not be saved. Disconnect before reconnecting."),
      );
    if (this.pendingRotation && !this.refresh)
      return Promise.reject(
        new Error(
          "The refreshed connection could not be saved. Disconnect to revoke it before reconnecting.",
        ),
      );
    if (this.store.read().connectionUncertain)
      return Promise.reject(
        new Error(
          "The connection result is unconfirmed. Revoke BotBound Desktop in account Apps settings before reconnecting.",
        ),
      );
    const credential = this.store.read().credential;
    if (!credential) return Promise.reject(new Error("Connect your BotBound account first."));
    if (credential.expiresAt > Date.now() + 60_000) return Promise.resolve(credential.accessToken);
    if (!this.refresh) {
      this.refresh = (async () => {
        await this.store.update((current) => ({ ...current, connectionUncertain: true }));
        const next = await this.exchange({
          grant_type: "refresh_token",
          refresh_token: credential.refreshToken,
          client_id: CLIENT_ID,
          resource: RESOURCE,
        });
        this.pendingRotation = {
          credential: next,
          predecessor: credential.refreshToken,
          accountId: credential.accountId,
        };
        if (next.accountId !== credential.accountId)
          throw new Error("The refreshed connection belongs to another account.");
        let retained = false;
        await this.store.update((current) => {
          if (current.credential?.refreshToken !== credential.refreshToken) return current;
          retained = true;
          return { ...current, credential: next };
        });
        if (!retained) throw new Error("This connection was disconnected during refresh.");
        await this.store.update((current) => ({ ...current, connectionUncertain: false }));
        this.pendingRotation = null;
        return next.accessToken;
      })().finally(() => {
        this.refresh = null;
      });
    }
    return this.refresh;
  }

  disconnect(): Promise<void> {
    if (this.disconnectOperation) return this.disconnectOperation;
    this.disconnecting = true;
    this.disconnectOperation = (async () => {
      // A refresh rotates the token. Revoke the newest committed token, not its spent predecessor.
      await this.settleConnection();
      const stored = this.store.read().credential;
      const rotation = this.pendingRotation;
      const issuance = this.pendingIssuance;
      if (this.requiresManualRecovery())
        throw new Error(
          "The server may have issued access, but its response was lost. Open account Apps settings, revoke BotBound Desktop in the account used for this connection, then confirm your review here.",
        );
      if (
        rotation &&
        (stored?.accountId !== rotation.accountId ||
          (stored?.refreshToken !== rotation.predecessor &&
            stored?.refreshToken !== rotation.credential.refreshToken))
      )
        throw new Error(
          "The account changed during token recovery. Revoke BotBound Desktop from your account's Apps settings.",
        );
      const credential = issuance ?? rotation?.credential ?? stored;
      if (credential) {
        const reply = await this.post(
          `${ORIGIN}/mcp/oauth/revoke`,
          new URLSearchParams({
            token: credential.refreshToken,
            token_type_hint: "refresh_token",
            client_id: CLIENT_ID,
            resource: RESOURCE,
          }).toString(),
          { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        );
        if (reply.status !== 200)
          throw new Error(
            "Access could not be revoked yet. Try Disconnect again, or revoke BotBound Desktop in your account's Apps settings.",
          );
      }
      // A failed first save may leave no local credential, or the previously
      // connected account. Revoking the new issuance must not erase that account.
      if (
        stored &&
        (!issuance ||
          (stored.accountId === issuance.accountId &&
            stored.refreshToken === issuance.refreshToken))
      ) {
        await this.store.update((current) =>
          current.credential?.accountId === stored.accountId &&
          current.credential?.refreshToken === stored.refreshToken
            ? { ...current, credential: null, connectionUncertain: false }
            : current,
        );
      } else if (this.store.read().connectionUncertain) {
        await this.store.update((current) => ({ ...current, connectionUncertain: false }));
      }
      if (this.pendingIssuance === issuance) this.pendingIssuance = null;
      if (this.pendingRotation === rotation) this.pendingRotation = null;
    })().finally(() => {
      this.disconnectOperation = null;
    });
    return this.disconnectOperation;
  }
}
