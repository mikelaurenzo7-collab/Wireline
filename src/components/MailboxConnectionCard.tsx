import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

import { authFetch, safeJson } from "../lib/api";
import { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import { Badge, Button, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";
import { getIntegrationLogo } from "./layout/IntegrationLogos";

type MailboxProvider = "google" | "microsoft" | "yahoo" | "icloud" | "agentmail";
type ConnectableMailboxProvider = Exclude<MailboxProvider, "agentmail" | "yahoo">;
type MailboxAccount = {
  id: string;
  emailAddress: string;
  provider: MailboxProvider;
};

const PROVIDERS: Array<{
  id: ConnectableMailboxProvider;
  label: string;
  detail: string;
  logo: string;
}> = [
  { id: "google", label: "Gmail", detail: "Mail + calendar", logo: "gmail" },
  {
    id: "microsoft",
    label: "Outlook",
    detail: "Mail + calendar",
    logo: "microsoft_outlook",
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    detail: "App-specific password required",
    logo: "icloud",
  },
];

export default function MailboxConnectionCard() {
  const access = useChannelEntitlements();
  const emailIncluded = access.includes("email");
  const [accounts, setAccounts] = useState<MailboxAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [busy, setBusy] = useState<MailboxProvider | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcloudForm, setShowIcloudForm] = useState(false);
  const [icloudEmail, setIcloudEmail] = useState("");
  const [icloudPassword, setIcloudPassword] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/emails/accounts");
      const body = (await safeJson(response)) as {
        accounts?: MailboxAccount[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "Could not load inbox connections.");
      setAccounts(Array.isArray(body?.accounts) ? body.accounts : []);
      setStatusUnavailable(false);
      setError(null);
    } catch (reason) {
      setStatusUnavailable(true);
      setError(reason instanceof Error ? reason.message : "Could not load inbox connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const popupPollRef = useRef<number | null>(null);
  const stopPopupPoll = useCallback(() => {
    if (popupPollRef.current !== null) {
      window.clearInterval(popupPollRef.current);
      popupPollRef.current = null;
    }
  }, []);
  useEffect(() => stopPopupPoll, [stopPopupPoll]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_AUTH_SUCCESS" && event.data?.type !== "EMAIL_OAUTH_SUCCESS") {
        return;
      }
      stopPopupPoll();
      setBusy(null);
      void loadAccounts().then(() => {
        if (emailIncluded)
          void authFetch("/api/emails/sync", { method: "POST" }).catch(() => undefined);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [emailIncluded, loadAccounts, stopPopupPoll]);

  async function connect(provider: ConnectableMailboxProvider) {
    if (access.status !== "ready" || (provider === "icloud" && !emailIncluded)) return;
    if (provider === "icloud") {
      setShowIcloudForm(true);
      setError(null);
      return;
    }
    setBusy(provider);
    setError(null);
    try {
      const response = await authFetch(`/api/oauth/${provider}/url`);
      const body = (await safeJson(response)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url) {
        throw new Error(
          body?.error || `${PROVIDERS.find((item) => item.id === provider)?.label} is unavailable.`,
        );
      }
      const popup = window.open(
        body.url,
        `${provider}_mail_oauth`,
        "width=600,height=720,popup=yes",
      );
      if (!popup) throw new Error("Allow popups, then try connecting again.");
      stopPopupPoll();
      popupPollRef.current = window.setInterval(() => {
        if (!popup.closed) return;
        stopPopupPoll();
        setBusy(null);
        void loadAccounts();
      }, 500);
    } catch (reason) {
      setBusy(null);
      setError(reason instanceof Error ? reason.message : "Could not start mailbox connection.");
    }
  }

  async function connectIcloud(event: React.FormEvent) {
    event.preventDefault();
    if (!emailIncluded) return;
    setBusy("icloud");
    setError(null);
    try {
      const response = await authFetch("/api/integrations/icloud/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_address: icloudEmail, app_password: icloudPassword }),
      });
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Could not connect iCloud Mail.");
      setIcloudPassword("");
      setShowIcloudForm(false);
      await loadAccounts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect iCloud Mail.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(account: MailboxAccount) {
    // Managed Bot mailboxes are platform identity, not customer connections.
    // They are intentionally absent from this surface and cannot be removed here.
    if (account.provider === "agentmail") return;
    if (!window.confirm(`Disconnect ${account.emailAddress}? New messages will stop syncing.`))
      return;
    setBusy(account.id);
    setError(null);
    try {
      const response = await authFetch(`/api/emails/accounts/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
      });
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Could not disconnect this inbox.");
      await loadAccounts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not disconnect this inbox.");
    } finally {
      setBusy(null);
    }
  }

  const customerAccounts = accounts.filter((account) => account.provider !== "agentmail");
  const visibleProviders = PROVIDERS.filter(
    (provider) =>
      provider.id !== "icloud" ||
      emailIncluded ||
      customerAccounts.some((account) => account.provider === "icloud"),
  );

  return (
    <section aria-labelledby="mailbox-connections-title">
      <div>
        <div className="min-w-0">
          <h2 id="mailbox-connections-title" className="text-base font-semibold text-foreground">
            {access.status !== "ready"
              ? "Account Connections"
              : emailIncluded
                ? "Email & Calendar"
                : "Calendar"}
          </h2>
        </div>
      </div>

      {loading || access.status === "loading" ? (
        <div
          className="mt-5 grid gap-3 md:grid-cols-3"
          aria-busy="true"
          aria-label="Checking inbox connections"
        >
          {PROVIDERS.map((provider) => (
            <Skeleton key={provider.id} shape="surface" className="h-[140px] w-full" />
          ))}
        </div>
      ) : statusUnavailable ? (
        <div className="mt-5">
          <StatusNotice
            tone="destructive"
            title="Inbox Connection Status Unavailable"
            action={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadAccounts()}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            }
          >
            {error ||
              "BotBound couldn't verify your connected mailboxes. No connection state was changed."}
          </StatusNotice>
        </div>
      ) : (
        <>
          {access.status === "error" ? (
            <StatusNotice
              tone="warning"
              title="Connection Access Unavailable"
              className="mt-4"
              action={
                <Button size="sm" variant="secondary" onClick={access.retry}>
                  Retry
                </Button>
              }
            >
              Try again to connect an account.
            </StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice tone="destructive" title="Connection Unavailable" className="mt-4">
              {error}
            </StatusNotice>
          ) : null}
          <div
            className={`mt-5 grid gap-3 ${visibleProviders.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
          >
            {visibleProviders.map((provider) => {
              const providerAccounts = customerAccounts.filter(
                (item) => item.provider === provider.id,
              );
              const isBusy = busy === provider.id;
              const label =
                !emailIncluded && provider.id === "google"
                  ? "Google Calendar"
                  : !emailIncluded && provider.id === "microsoft"
                    ? "Outlook Calendar"
                    : provider.label;
              return (
                <article
                  key={provider.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background p-1.5">
                      {getIntegrationLogo(
                        !emailIncluded && provider.id === "google"
                          ? "google_calendar"
                          : provider.logo,
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        {providerAccounts.length ? (
                          <Badge variant="outline">Connected</Badge>
                        ) : null}
                      </span>
                      {emailIncluded || provider.id === "icloud" ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {provider.detail}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  {providerAccounts.length ? (
                    <ul className="mt-3 divide-y divide-border">
                      {providerAccounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex min-h-11 min-w-0 items-center gap-2 py-1"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {account.emailAddress}
                          </span>
                          <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Disconnect ${account.emailAddress}`}
                            disabled={busy === account.id}
                            onClick={() => void disconnect(account)}
                          >
                            {busy === account.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="size-4" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {provider.id === "icloud" && showIcloudForm && emailIncluded ? (
                    <form
                      className="mt-auto grid gap-2 pt-4"
                      onSubmit={(event) => void connectIcloud(event)}
                    >
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={icloudEmail}
                        onChange={(event) => setIcloudEmail(event.target.value)}
                        placeholder="name@icloud.com"
                        aria-label="iCloud email address"
                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                      />
                      <input
                        type="password"
                        required
                        autoComplete="off"
                        value={icloudPassword}
                        onChange={(event) => setIcloudPassword(event.target.value)}
                        placeholder="App-specific password"
                        aria-label="Apple app-specific password"
                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Generate one in Apple ID under Sign-In and Security → App-Specific
                        Passwords.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="submit" size="sm" disabled={isBusy}>
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : null}
                          Connect
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setShowIcloudForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : provider.id !== "icloud" || emailIncluded ? (
                    <div className="mt-auto pt-3">
                      {/* Providers are equal choices, so none outranks the others. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        disabled={isBusy || access.status !== "ready"}
                        onClick={() => void connect(provider.id)}
                      >
                        {isBusy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        {providerAccounts.length ? "Connect Another" : `Connect ${label}`}
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
