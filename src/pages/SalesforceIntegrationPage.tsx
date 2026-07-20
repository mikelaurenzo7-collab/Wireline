import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud, ExternalLink, FileText, Loader2, RefreshCcw, Send } from "lucide-react";

import { Badge, Button, Skeleton, Switch } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";

type SalesforceSyncPreferences = {
  callActivitySyncEnabled: boolean;
};

type SalesforceConnection = {
  connected: boolean;
  configured?: boolean;
  email?: string;
  instance_url?: string;
  connected_at?: string;
  sync_preferences?: SalesforceSyncPreferences;
};

type CrmStatusResponse = {
  salesforce?: SalesforceConnection;
};

type PreferenceResponse = {
  preferences?: SalesforceSyncPreferences;
  error?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function formatConnectedAt(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function ConnectionSummary({ connection }: { connection: SalesforceConnection | null }) {
  if (!connection) {
    return (
      <Skeleton
        shape="surface"
        className="h-[280px] w-full"
        aria-label="Loading Salesforce connection status"
      />
    );
  }

  const connected = connection.connected && connection.configured !== false;
  const detail = connection.email || connection.instance_url || "No connected Salesforce account";

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
            <Cloud size={21} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-.02em] text-foreground">
              Salesforce connection
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "warning"}>
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Organization</dt>
          <dd className="max-w-[13rem] truncate text-right font-medium text-foreground">
            {connection.instance_url || "Awaiting OAuth connection"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Activity delivery</dt>
          <dd className="font-medium text-foreground">
            {connected && connection.sync_preferences?.callActivitySyncEnabled !== false
              ? "Enabled"
              : "Paused"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Connected</dt>
          <dd className="font-medium text-foreground">
            {formatConnectedAt(connection.connected_at)}
          </dd>
        </div>
      </dl>

      <Button asChild variant="secondary" className="mt-5 w-full">
        <Link to="/connections">
          <ExternalLink size={16} />
          Manage connection
        </Link>
      </Button>
    </section>
  );
}

export default function SalesforceIntegrationPage() {
  const [connection, setConnection] = useState<SalesforceConnection | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [callActivitySyncEnabled, setCallActivitySyncEnabled] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshConnection = useCallback(async () => {
    setIsRefreshing(true);
    setConnectionError(null);
    try {
      const response = await authFetch("/api/oauth/crm/status");
      if (!response.ok) throw new Error("Could not load the Salesforce connection state.");
      const data = (await response.json()) as CrmStatusResponse;
      const salesforce = { connected: false, ...data.salesforce };
      setConnection(salesforce);
      setCallActivitySyncEnabled(salesforce.sync_preferences?.callActivitySyncEnabled ?? true);
      setSaveState("idle");
      setSaveError(null);
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not load the Salesforce connection state.",
      );
      setConnection({ connected: false });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  const isConnected = Boolean(connection?.connected && connection.configured !== false);

  const updateCallActivityPreference = async (nextValue: boolean) => {
    if (!isConnected || saveState === "saving") return;

    const previousValue = callActivitySyncEnabled;
    setCallActivitySyncEnabled(nextValue);
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await authFetch("/api/oauth/crm/salesforce/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callActivitySyncEnabled: nextValue }),
      });
      const payload = (await response.json().catch(() => ({}))) as PreferenceResponse;
      if (!response.ok || typeof payload.preferences?.callActivitySyncEnabled !== "boolean") {
        throw new Error(payload.error || "Could not update Salesforce call activity delivery.");
      }

      setCallActivitySyncEnabled(payload.preferences.callActivitySyncEnabled);
      setConnection((current) =>
        current
          ? {
              ...current,
              sync_preferences: payload.preferences,
            }
          : current,
      );
      setSaveState("saved");
    } catch (error) {
      setCallActivitySyncEnabled(previousValue);
      setSaveState("error");
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not update Salesforce call activity delivery.",
      );
    }
  };

  return (
    <WorkspaceShell
      contentClassName="pt-1 pb-10"
      action={
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "success" : "warning"}>
            {isConnected ? "Connected" : "Connection required"}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refreshConnection()}
            disabled={isRefreshing || saveState === "saving"}
          >
            {isRefreshing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCcw size={16} />
            )}
            Refresh
          </Button>
        </div>
      }
    >
      <WorkspacePageFrame mode="standard">
        {connectionError ? (
          <StatusNotice tone="warning" title="Connection state unavailable">
            {connectionError}
          </StatusNotice>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-2">
                  <Send className="size-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Call activity</h2>
                </div>
                <Badge variant={callActivitySyncEnabled && isConnected ? "success" : "warning"}>
                  {callActivitySyncEnabled && isConnected ? "Active" : "Paused"}
                </Badge>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4">
                <label
                  htmlFor="salesforce-call-activity-sync"
                  className="font-medium text-foreground"
                >
                  Log completed calls to Salesforce
                </label>
                <Switch
                  id="salesforce-call-activity-sync"
                  checked={Boolean(isConnected && callActivitySyncEnabled)}
                  onCheckedChange={(checked) => void updateCallActivityPreference(checked)}
                  disabled={!isConnected || saveState === "saving"}
                  aria-describedby="salesforce-activity-sync-description"
                  aria-label="Log completed calls to Salesforce"
                />
              </div>

              {saveState === "saving" ? (
                <StatusNotice className="mt-5" tone="info" title="Saving call activity preference">
                  Updating the delivery rule for future Salesforce Tasks.
                </StatusNotice>
              ) : null}
              {saveState === "saved" ? (
                <StatusNotice className="mt-5" tone="success" title="Call activity sync updated">
                  Future eligible calls will follow the delivery preference shown above.
                </StatusNotice>
              ) : null}
              {saveState === "error" ? (
                <StatusNotice
                  className="mt-5"
                  tone="destructive"
                  title="Call activity sync was not updated"
                >
                  {saveError}
                </StatusNotice>
              ) : null}
              {!isConnected && !isRefreshing ? (
                <StatusNotice
                  className="mt-5"
                  tone="warning"
                  title="Connect Salesforce to control delivery"
                >
                  Complete OAuth from Integrations before Wireline can create or pause Salesforce
                  call activities.
                </StatusNotice>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
                <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                  <FileText size={18} />
                </span>
                <h2 className="font-semibold text-foreground">Task fields</h2>
              </div>
              <dl className="divide-y divide-border text-sm">
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 sm:px-6">
                  <dt className="font-medium text-foreground">Subject</dt>
                  <dd className="text-muted-foreground">Intent + outcome</dd>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 sm:px-6">
                  <dt className="font-medium text-foreground">Contact</dt>
                  <dd className="text-muted-foreground">Phone match</dd>
                </div>
                <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 sm:px-6">
                  <dt className="font-medium text-foreground">Details</dt>
                  <dd className="text-muted-foreground">Agent · intent · sentiment</dd>
                </div>
              </dl>
            </section>
          </div>

          <aside className="space-y-6">
            <ConnectionSummary connection={connection} />
          </aside>
        </div>

        <div className="flex justify-center border-t border-border pt-6 sm:justify-end">
          <Button asChild variant="secondary">
            <Link to="/connections">Back to connections</Link>
          </Button>
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
