import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Switch } from "../atoms";
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

  const load = useCallback(async () => {
    setError(null);
    const response = await authFetch("/api/mcp/connections");
    const data = (await response.json().catch(() => null)) as McpConnectionsResponse | null;
    if (!response.ok) {
      throw new Error(data?.error || "Couldn't load connected apps.");
    }
    setEnabled(data?.coaching_writes_enabled === true);
    setConnections(Array.isArray(data?.connections) ? data.connections : []);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Couldn't load connected apps.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function updateWrites(next: boolean) {
    if (saving) return;
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
          ? "Connected apps can now save a confirmed Training fact or rule into Wireline."
          : "Connected-app Training writes are off. Drafts and private rehearsals still work.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update Training permission.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectAll() {
    if (disconnecting) return;
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
      setNotice("Cursor, ChatGPT, and Claude can no longer use this account until you connect again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect connected apps.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-muted/20 p-4">
        <label htmlFor="mcp-coaching-writes" className="min-w-0">
          <span className="block font-medium text-foreground">Allow Connected Apps to Save Training</span>
          <span id="mcp-coaching-writes-help" className="mt-1 block text-sm leading-6 text-muted-foreground">
            Off by default. When on, a confirmed fact or rule from Cursor, ChatGPT, or Claude lands in
            Training. It never places a live call or launches the Bot.
          </span>
        </label>
        <Switch
          id="mcp-coaching-writes"
          className="shrink-0"
          checked={enabled}
          onCheckedChange={(checked) => void updateWrites(checked)}
          disabled={loading || saving}
          aria-describedby="mcp-coaching-writes-help"
          aria-label="Allow Connected Apps to Save Training"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading connected apps…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          No connected apps yet. After OAuth, they appear here. New users create a Wireline account
          during Connect, then build their first Voice Bot in that chat.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Connected MCP apps">
          {connections.map((connection) => (
            <li
              key={`${connection.client}-${connection.created_at}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{connection.client}</p>
                <p className="text-xs text-muted-foreground">
                  Connected {formatWhen(connection.created_at)} · expires {formatWhen(connection.expires_at)}
                </p>
              </div>
              <Badge variant="outline">{connection.scope}</Badge>
            </li>
          ))}
        </ul>
      )}

      {connections.length > 0 ? (
        <Button
          type="button"
          variant={confirmDisconnect ? "destructive" : "outline"}
          size="sm"
          disabled={disconnecting}
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
