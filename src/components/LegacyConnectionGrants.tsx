import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../lib/api";
import { Button, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";

/** Existing grants remain manageable even when the provider is no longer offered. */
const LEGACY_PROVIDERS = [
  ["salesforce", "Salesforce"],
  ["hubspot", "HubSpot"],
  ["slack", "Slack"],
  ["x", "X"],
  ["zoom", "Zoom"],
  ["apollo", "Apollo"],
  ["meta", "Meta Lead Ads"],
  ["shopify", "Shopify"],
  ["square", "Square"],
  ["microsoft_teams", "Microsoft Teams"],
  ["microsoft_excel", "Microsoft Excel"],
  ["google_sheets", "Google Sheets"],
] as const;

type Provider = (typeof LEGACY_PROVIDERS)[number][0];
type ProviderStatus = {
  connected?: boolean;
  configured?: boolean;
  platform_active?: boolean;
  email?: string | null;
  team?: string | null;
};
type StatusResponse = Partial<Record<Provider, ProviderStatus>> & {
  saved_grants?: Partial<Record<Provider, boolean>>;
};

export default function LegacyConnectionGrants() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/oauth/crm/status");
      if (!response.ok) throw new Error("Could not load saved connections.");
      const body = (await response.json()) as unknown;
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        LEGACY_PROVIDERS.some(([key]) => {
          const entry = (body as Record<string, unknown>)[key];
          return (
            !entry ||
            typeof entry !== "object" ||
            typeof (entry as ProviderStatus).connected !== "boolean"
          );
        })
      ) {
        throw new Error("Could not load saved connections.");
      }
      setStatus(body as StatusResponse);
      setError(null);
    } catch {
      setError("Could not load saved connections. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function disconnect(provider: Provider, label: string) {
    if (!window.confirm(`Disconnect the saved ${label} account from BotBound?`)) return;
    setDisconnecting(provider);
    setError(null);
    try {
      const response = await authFetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
      if (!response.ok) throw new Error("Disconnect failed");
      await refresh();
    } catch {
      setError(`Could not disconnect ${label}. Try again.`);
    } finally {
      setDisconnecting(null);
    }
  }

  const connected = LEGACY_PROVIDERS.filter(
    ([key]) => status?.saved_grants?.[key] === true || status?.[key]?.connected === true,
  );
  if (!loading && !error && connected.length === 0) return null;

  return (
    <section
      aria-label="Saved tool connections"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold text-foreground">Saved Tool Connections</h2>
      <p className="text-sm text-muted-foreground">
        Disconnect removes the saved account from BotBound. Check the provider account to manage any
        remaining authorization.
      </p>
      {error ? (
        <StatusNotice
          tone="destructive"
          title="Connections Unavailable"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </StatusNotice>
      ) : null}
      {loading && !status ? <Skeleton className="h-12 w-full" shape="surface" /> : null}
      {connected.length ? (
        <ul className="divide-y divide-border">
          {connected.map(([key, label]) => (
            <li key={key} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{label}</span>
                {status?.[key]?.connected !== true ||
                status?.[key]?.configured === false ||
                status?.[key]?.platform_active === false ? (
                  <span className="block text-sm text-muted-foreground">Inactive</span>
                ) : null}
                {status?.[key]?.email || status?.[key]?.team ? (
                  <span className="block truncate text-sm text-muted-foreground">
                    {status[key]?.email || status[key]?.team}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disconnecting !== null}
                aria-label={`Disconnect ${label}`}
                onClick={() => void disconnect(key, label)}
              >
                {disconnecting === key ? "Disconnecting…" : "Disconnect"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
