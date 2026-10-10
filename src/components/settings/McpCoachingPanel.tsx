import { useEffect, useState } from "react";

import { Button, Switch } from "../atoms";
import { StatusNotice } from "../molecules";
import { authFetch } from "../../lib/api";

type McpConnection = {
  client: string;
  scope: string;
  created_at: string;
  expires_at: string;
};

type McpConnectionsResponse = {
  coaching_writes_enabled?: boolean;
  connections?: McpConnection[];
  error?: string;
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function McpCoachingPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const response = await authFetch("/api/mcp/connections");
        const data = (await response.json().catch(() => null)) as McpConnectionsResponse | null;
        if (!active) return;
        if (!response.ok) {
          throw new Error(data?.error || "Couldn't load connected apps.");
        }
        if (
          typeof data?.coaching_writes_enabled !== "boolean" ||
          !Array.isArray(data.connections)
        ) {
          throw new Error("Couldn't load connected apps.");
        }
        setEnabled(data.coaching_writes_enabled);
        setConnections(data.connections);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load connected apps.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadVersion]);

  function retryLoad() {
    if (loading) return;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setLoadVersion((value) => value + 1);
  }

  async function updateWrites(next: boolean) {
    if (loading || loadError || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch("/api/mcp/coaching-writes", {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await response.json().catch(() => null)) as {
        coaching_writes_enabled?: boolean;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Couldn't update Training permission.");
      }
      setEnabled(data?.coaching_writes_enabled === true);
      setNotice(
        data?.coaching_writes_enabled
          ? "Connected apps can now save a confirmed Training fact or rule into BotBound."
          : "Connected-app Training writes are off. Drafts and private rehearsals still work.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update Training permission.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectAll() {
    if (loading || loadError || disconnecting) return;
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch("/api/mcp/connections", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as {
        disconnected?: boolean;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Couldn't disconnect connected apps.");
      }
      setConnections([]);
      setConfirmDisconnect(false);
      setNotice("Connected apps can no longer use this account until you connect again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect connected apps.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-start justify-between gap-4 py-3">
        <label
          htmlFor="mcp-coaching-writes"
          className="wl-preserve-case min-w-0 normal-case tracking-normal"
        >
          <span className="block font-medium text-foreground">Save Training</span>
          <span
            id="mcp-coaching-writes-help"
            className="mt-1 block text-sm leading-6 text-muted-foreground"
          >
            Save only facts and rules you confirm. Off by default. No live calls or Bot activation.
          </span>
        </label>
        <Switch
          id="mcp-coaching-writes"
          className="shrink-0"
          checked={enabled}
          onCheckedChange={(checked) => void updateWrites(checked)}
          disabled={loading || Boolean(loadError) || saving}
          aria-describedby="mcp-coaching-writes-help"
          aria-label="Allow connected apps to save Training"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading connected apps…</p>
      ) : loadError ? (
        <StatusNotice tone="destructive" title="App Access Unavailable">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retryLoad}>
            Retry
          </Button>
        </StatusNotice>
      ) : connections.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">No connected apps.</p>
      ) : (
        <ul className="divide-y divide-border/60" aria-label="Connected MCP apps">
          {connections.map((connection) => (
            <li key={`${connection.client}-${connection.created_at}`} className="py-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{connection.client}</p>
                <p className="text-xs text-muted-foreground">
                  Expires {formatWhen(connection.expires_at)}
                </p>
              </div>
              <details className="mt-1 text-sm text-muted-foreground">
                <summary className="w-fit cursor-pointer py-2 wl-focus-ring-halo">
                  Permissions
                </summary>
                <p className="pb-1">Connected {formatWhen(connection.created_at)}</p>
                <p className="break-words pb-2">
                  {connection.scope
                    .split(/\s+/)
                    .map((scope) =>
                      scope === "agents.read"
                        ? "Read Bot Context"
                        : scope === "agents.write"
                          ? "Edit Drafts & Training"
                          : scope === "demo.voice"
                            ? "Private Rehearsals"
                            : scope === "computer.plan"
                              ? "Plan Computer Tasks"
                              : scope,
                    )
                    .join(" · ")}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}

      {connections.length > 0 ? (
        <Button
          type="button"
          variant={confirmDisconnect ? "destructive" : "outline"}
          size="sm"
          disabled={loading || Boolean(loadError) || disconnecting}
          onClick={() => void disconnectAll()}
        >
          {disconnecting
            ? "Disconnecting…"
            : confirmDisconnect
              ? "Confirm Disconnect All"
              : "Disconnect All Connected Apps"}
        </Button>
      ) : null}

      {notice ? (
        <StatusNotice tone="success" title="Connected Apps Updated">
          {notice}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Connected Apps">
          {error}
        </StatusNotice>
      ) : null}
    </div>
  );
}
