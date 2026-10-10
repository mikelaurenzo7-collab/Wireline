import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import CallLogsClaude from "./CallLogsClaude";
import { EmptyState, Button } from "./atoms";
import { StatusNotice } from "./molecules";
import { useAgents } from "../contexts/AgentsContext";

type CallsProbeResponse = {
  calls?: unknown[];
};

export default function PhoneCallHistoryPanel({ agentId }: { agentId?: string | null }) {
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    phoneLookupDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const [loading, setLoading] = useState(true);
  const [hasCalls, setHasCalls] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const endpoint = agentId
      ? `/api/agents/${encodeURIComponent(agentId)}/calls?limit=1`
      : "/api/calls?limit=1";
    authFetch(endpoint)
      .then((response) => {
        if (!response.ok) throw new Error(`Call history request failed (${response.status})`);
        return response.json();
      })
      .then((body: CallsProbeResponse | null) => {
        if (cancelled) return;
        setHasCalls(Array.isArray(body?.calls) && body.calls.length > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setHasCalls(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, attempt]);

  if (loading || agentsLoading) {
    return (
      <div className="flex w-full items-center justify-center px-4 py-10 text-sm text-muted-foreground sm:px-6">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading calls…
        </span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="destructive"
          title="Calls Unavailable"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Try Again
            </Button>
          }
        >
          Nothing has been erased. Retry when the connection recovers.
        </StatusNotice>
      </div>
    );
  }

  if (hasCalls === true) return <CallLogsClaude agentId={agentId} />;

  const scopedAgent = agentId ? agents.find((agent) => agent.id === agentId) : null;
  const relevantAgents = scopedAgent ? [scopedAgent] : agents;
  const hasAgents = relevantAgents.length > 0;
  if (agentsDegraded && !hasAgents) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="warning"
          title="Bot Status Unavailable"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={refreshAgents}>
              Retry
            </Button>
          }
        >
          Existing configuration is unchanged.
        </StatusNotice>
      </div>
    );
  }

  if (phoneLookupDegraded && hasAgents) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="warning"
          title="Line Status Unavailable"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={refreshAgents}>
              Retry
            </Button>
          }
        >
          Existing configuration is unchanged.
        </StatusNotice>
      </div>
    );
  }

  const livePhone = relevantAgents.find((agent) => agent.phone_number)?.phone_number ?? null;
  const emptyState = !hasAgents
    ? { title: "Create a Bot", action: { label: "New Bot", to: "/studio?create=1" } }
    : !livePhone
      ? { title: "Connect a Line", action: { label: "Add a Line", to: "/phone?tab=setup" } }
      : {
          title: agentId ? "No Calls for This Bot" : "No Calls Yet",
          action: { label: "Call the Line", to: `tel:${livePhone}` },
        };

  // The same compact framed card as Callbacks and Lines: one next step, not a
  // viewport-tall empty panel with a lone link in the middle.
  return (
    <div className="flex w-full flex-col items-center px-4 py-8 sm:px-6">
      <EmptyState
        framed
        density="compact"
        titleTone="ui"
        withHalo={false}
        className="w-full max-w-lg"
        icon={History}
        title={emptyState.title}
        actions={[{ ...emptyState.action, primary: true }]}
      />
    </div>
  );
}
