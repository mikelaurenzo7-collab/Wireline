/**
 * Identity studio.
 *
 * Live talking-head lip-sync is retired. This page shows the identity badge.
 * Video files and clip-script substitutes are not offered. Phone, email, and
 * text stay on the agent.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";

import AgentFace from "../components/AgentFace";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { StatusNotice } from "../components/molecules";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { liveVideoAddonPitch } from "../lib/video-presenter/copy";
import type { AgentVideoPresenterConfig, LiveVideoAddonState } from "../lib/video-presenter/types";

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
  addon: LiveVideoAddonState;
};

export default function LiveVideoStudioPage() {
  const { agents, loading: agentsLoading, degraded, refresh } = useAgents();
  const [searchParams] = useSearchParams();
  const requestedAgentId = searchParams.get("agent");
  const rosterAgents = agents;
  const [agentId, setAgentId] = useState("");
  const [payload, setPayload] = useState<PresenterPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!rosterAgents.length) return;
    if (requestedAgentId && rosterAgents.some((agent) => agent.id === requestedAgentId)) {
      setAgentId(requestedAgentId);
      return;
    }
    setAgentId((current) =>
      current && rosterAgents.some((agent) => agent.id === current)
        ? current
        : rosterAgents[0].id,
    );
  }, [rosterAgents, requestedAgentId]);

  const loadPresenter = useCallback(async (id: string) => {
    const res = await authFetch(`/api/agents/${encodeURIComponent(id)}/video-presenter`);
    const body = (await res.json().catch(() => ({}))) as PresenterPayload & { error?: string };
    if (!res.ok) throw new Error(body.error || "Could not load identity.");
    return body;
  }, []);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoadError(null);
    setPayload(null);
    void loadPresenter(agentId)
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load identity.");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, loadPresenter]);

  if (!agentsLoading && degraded && !rosterAgents.length) {
    return (
      <WorkspaceShell>
        <WorkspaceRecovery onRetry={refresh} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <WorkspacePageFrame>
        <WorkspacePageIntro title="Identity" description={liveVideoAddonPitch()} />
        {loadError ? <StatusNotice tone="destructive">{loadError}</StatusNotice> : null}
        {agentsLoading ? (
          <StatusNotice>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading agents
          </StatusNotice>
        ) : rosterAgents.length ? (
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">Voice agent</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              aria-label="Voice agent"
            >
              {rosterAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <StatusNotice>
            Create a voice agent first, then come back for identity.{" "}
            <Link
              to="/studio?create=1"
              className="font-medium text-primary underline underline-offset-4"
            >
              Create voice agent
            </Link>
          </StatusNotice>
        )}
        {payload ? (
          <div className="flex flex-col items-start gap-4 rounded-md border border-border bg-card p-4">
            <AgentFace seed={payload.fallbackSeed} size={96} />
            <p className="text-sm text-muted-foreground">{payload.presenter.description}</p>
            {payload.addon.reason ? (
              <p className="text-sm text-muted-foreground">{payload.addon.reason}</p>
            ) : null}
          </div>
        ) : null}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
