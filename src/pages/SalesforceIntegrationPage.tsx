import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Settings2,
} from "lucide-react";

import { Badge, Button, NativeSelect, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";

type SalesforceConnection = {
  connected: boolean;
  configured?: boolean;
  email?: string;
  instance_url?: string;
  connected_at?: string;
};

type CrmStatusResponse = {
  salesforce?: SalesforceConnection;
};

type Mapping = {
  id: string;
  source: string;
  direction: "outbound" | "bidirectional";
  target: string;
  options: string[];
};

const INITIAL_MAPPINGS: Mapping[] = [
  {
    id: "lead-name",
    source: "Lead name",
    direction: "outbound",
    target: "Contact.Name",
    options: ["Contact.Name", "Lead.Name"],
  },
  {
    id: "email-address",
    source: "Email address",
    direction: "bidirectional",
    target: "Contact.Email",
    options: ["Contact.Email", "Lead.Email"],
  },
  {
    id: "sentiment-score",
    source: "Sentiment score",
    direction: "outbound",
    target: "Custom_Sentiment__c",
    options: ["Custom_Sentiment__c"],
  },
];

const INITIAL_SYNC_OPTIONS = {
  logCalls: true,
  attachTranscripts: true,
  attachAudio: false,
};

function ConnectionSummary({ connection }: { connection: SalesforceConnection | null }) {
  if (!connection) {
    return <Skeleton shape="surface" className="h-[280px] w-full" aria-label="Loading Salesforce connection status" />;
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
            <h2 className="text-lg font-semibold tracking-[-.02em] text-foreground">Salesforce</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "warning"}>{connected ? "Connected" : "Not connected"}</Badge>
      </div>

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Environment</dt>
          <dd className="font-medium text-foreground">{connection.instance_url ? "Connected organization" : "Awaiting OAuth connection"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Connection</dt>
          <dd className="font-medium text-foreground">{connected ? "OAuth available" : "Not available"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Connected</dt>
          <dd className="font-medium text-foreground">{connection.connected_at ? new Date(connection.connected_at).toLocaleDateString() : "—"}</dd>
        </div>
      </dl>

      <Button asChild variant="secondary" className="mt-5 w-full">
        <Link to="/actions">
          <ExternalLink size={16} />
          Manage connections
        </Link>
      </Button>
    </section>
  );
}

export default function SalesforceIntegrationPage() {
  const [connection, setConnection] = useState<SalesforceConnection | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [mappings, setMappings] = useState(INITIAL_MAPPINGS);
  const [syncOptions, setSyncOptions] = useState(INITIAL_SYNC_OPTIONS);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refreshConnection = useCallback(async () => {
    setIsRefreshing(true);
    setConnectionError(null);
    try {
      const response = await authFetch("/api/oauth/crm/status");
      if (!response.ok) throw new Error("Could not load the Salesforce connection state.");
      const data = (await response.json()) as CrmStatusResponse;
      setConnection({ connected: false, ...data.salesforce });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not load the Salesforce connection state.");
      setConnection({ connected: false });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  const hasLocalChanges = useMemo(
    () => JSON.stringify(mappings) !== JSON.stringify(INITIAL_MAPPINGS) || JSON.stringify(syncOptions) !== JSON.stringify(INITIAL_SYNC_OPTIONS),
    [mappings, syncOptions],
  );

  const updateMapping = (mappingId: string, target: string) => {
    setMappings((current) => current.map((mapping) => (mapping.id === mappingId ? { ...mapping, target } : mapping)));
    setSavedAt(null);
  };

  const saveDraft = () => {
    setSavedAt(Date.now());
  };

  return (
    <WorkspaceShell
      eyebrow="Connections"
      title="Salesforce"
      contentClassName="pt-6"
      action={
        <div className="flex items-center gap-2">
          <Badge variant={connection?.connected ? "success" : "warning"}>
            {connection?.connected ? "Connected" : "Connection required"}
          </Badge>
          <Button type="button" variant="secondary" size="sm" onClick={() => void refreshConnection()} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            Refresh
          </Button>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
        <div className="max-w-3xl">
          <p className="wl-page-copy">
            Review the current OAuth connection and prepare how assistant context should map into Salesforce. Mapping persistence and automatic CRM writes are not enabled on this route yet.
          </p>
        </div>

        {connectionError ? <StatusNotice tone="warning" title="Connection state unavailable">{connectionError}</StatusNotice> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2">
                  <Settings2 className="size-5 text-primary" />
                  <div>
                    <h2 className="font-semibold text-foreground">Field mappings</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">Draft mapping decisions for assistant-generated CRM context.</p>
                  </div>
                </div>
                <Badge variant="outline">Preview configuration</Badge>
              </div>

              <div className="p-5 sm:p-6">
                <div className="hidden grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)] gap-4 px-3 pb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:grid">
                  <span>Wireline context</span>
                  <span className="text-center">Direction</span>
                  <span>Salesforce field</span>
                </div>
                <div className="space-y-3">
                  {mappings.map((mapping) => {
                    const DirectionIcon = mapping.direction === "bidirectional" ? ArrowLeftRight : ArrowRight;
                    return (
                      <div key={mapping.id} className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)] md:items-center">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:hidden">Wireline context</p>
                          <p className="mt-1 font-medium text-foreground md:mt-0">{mapping.source}</p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground md:justify-center">
                          <DirectionIcon size={16} className="text-primary" />
                          <span className="md:hidden">{mapping.direction === "bidirectional" ? "Two-way" : "Outbound"}</span>
                        </div>
                        <label className="block">
                          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:hidden">Salesforce field</span>
                          <NativeSelect value={mapping.target} onChange={(event) => updateMapping(mapping.id, event.target.value)} className="mt-1 md:mt-0">
                            {mapping.options.map((option) => <option key={option} value={option}>{option}</option>)}
                          </NativeSelect>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-foreground">Interaction sync</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Choose the records Wireline should prepare when CRM write-back becomes available.</p>
                </div>
                <Badge variant="outline">Preview configuration</Badge>
              </div>
              <div className="mt-6 space-y-5">
                {[
                  ["logCalls", "Log calls as activities", "Prepare a Salesforce Task when a call completes and the contact can be matched."],
                  ["attachTranscripts", "Attach transcripts", "Prepare the conversation transcript for the related CRM activity."],
                  ["attachAudio", "Attach audio recording links", "Prepare a secure recording link for the activity description when one is available."],
                ].map(([key, title, description]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/20">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 rounded border-border text-primary focus:ring-primary"
                      checked={syncOptions[key as keyof typeof syncOptions]}
                      onChange={(event) => {
                        setSyncOptions((current) => ({ ...current, [key]: event.target.checked }));
                        setSavedAt(null);
                      }}
                    />
                    <span>
                      <span className="block font-medium text-foreground">{title}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {savedAt ? (
              <StatusNotice tone="info" title="Draft saved for this session">
                Your preview choices are retained while this page remains open. CRM persistence will be enabled only when the server-side configuration contract is available.
              </StatusNotice>
            ) : null}
          </div>

          <aside className="space-y-6">
            <ConnectionSummary connection={connection} />
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-semibold text-foreground">Recent integration activity</h2>
              <ul className="mt-4 space-y-4">
                <li className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--wl-success)]" />
                  <div><p className="text-sm font-medium text-foreground">Connection status checked</p><p className="mt-1 text-xs text-muted-foreground">Live OAuth state from Wireline</p></div>
                </li>
                <li className="flex gap-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--wl-warning)]" />
                  <div><p className="text-sm font-medium text-foreground">Automatic write-back is staged</p><p className="mt-1 text-xs text-muted-foreground">No mapping or activity setting is sent to Salesforce from this page yet.</p></div>
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-end">
          <Button asChild variant="secondary"><Link to="/actions">Back to connections</Link></Button>
          <Button type="button" onClick={saveDraft} disabled={!hasLocalChanges && Boolean(savedAt)}>
            Save preview choices
          </Button>
        </div>
      </div>
    </WorkspaceShell>
  );
}
