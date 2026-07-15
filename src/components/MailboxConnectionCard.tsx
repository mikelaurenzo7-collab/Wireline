import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";

import { authFetch, safeJson } from "../lib/api";
import { Badge, Button } from "./atoms";
import { StatusNotice } from "./molecules";
import { getIntegrationLogo } from "./layout/IntegrationLogos";

type MailboxProvider = "google" | "microsoft" | "yahoo" | "icloud";
type MailboxAccount = {
  id: string;
  emailAddress: string;
  provider: MailboxProvider;
};

const PROVIDERS: Array<{
  id: MailboxProvider;
  label: string;
  detail: string;
  logo: string;
}> = [
  { id: "google", label: "Gmail", detail: "Mail and Google Calendar", logo: "gmail" },
  {
    id: "microsoft",
    label: "Outlook",
    detail: "Mail and Microsoft Calendar",
    logo: "microsoft_outlook",
  },
  { id: "yahoo", label: "Yahoo Mail", detail: "Mail sync", logo: "yahoo" },
  {
    id: "icloud",
    label: "iCloud Mail",
    detail: "Apple app-specific password",
    logo: "icloud",
  },
];

export default function MailboxConnectionCard() {
  const [accounts, setAccounts] = useState<MailboxAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<MailboxProvider | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcloudForm, setShowIcloudForm] = useState(false);
  const [icloudEmail, setIcloudEmail] = useState("");
  const [icloudPassword, setIcloudPassword] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const response = await authFetch("/api/emails/accounts");
      const body = (await safeJson(response)) as {
        accounts?: MailboxAccount[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "Could not load inbox connections.");
      setAccounts(Array.isArray(body?.accounts) ? body.accounts : []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load inbox connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_AUTH_SUCCESS" && event.data?.type !== "EMAIL_OAUTH_SUCCESS") {
        return;
      }
      setBusy(null);
      void loadAccounts().then(() => {
        void authFetch("/api/emails/sync", { method: "POST" }).catch(() => undefined);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadAccounts]);

  async function connect(provider: MailboxProvider) {
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
      const poll = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(poll);
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

  return (
    <section
      className="wl-paper wl-paper-elevated p-5 sm:p-6"
      aria-labelledby="mailbox-connections-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="mailbox-connections-title"
            className="text-base font-semibold text-foreground"
          >
            Inbox connections
          </h2>
        </div>
        <Mail className="size-5 text-primary" aria-hidden="true" />
      </div>

      {error ? (
        <StatusNotice tone="destructive" title="Inbox connection unavailable" className="mt-4">
          {error}
        </StatusNotice>
      ) : null}

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking inbox connections…
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PROVIDERS.map((provider) => {
            const providerAccounts = accounts.filter((item) => item.provider === provider.id);
            const isBusy = busy === provider.id;
            return (
              <article
                key={provider.id}
                className="rounded-xl border border-border bg-card px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background p-1.5">
                    {getIntegrationLogo(provider.logo)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {provider.label}
                      </span>
                      {providerAccounts.length ? <Badge variant="outline">Connected</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {provider.detail}
                    </span>
                  </span>
                </div>
                {providerAccounts.length ? (
                  <ul className="mt-4 grid gap-2">
                    {providerAccounts.map((account) => (
                      <li
                        key={account.id}
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
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
                {provider.id === "icloud" && showIcloudForm ? (
                  <form className="mt-4 grid gap-2" onSubmit={(event) => void connectIcloud(event)}>
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
                      Generate one in Apple ID under Sign-In and Security → App-Specific Passwords.
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
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 w-full"
                    disabled={isBusy}
                    onClick={() => void connect(provider.id)}
                  >
                    {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {providerAccounts.length ? "Connect another" : `Connect ${provider.label}`}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
