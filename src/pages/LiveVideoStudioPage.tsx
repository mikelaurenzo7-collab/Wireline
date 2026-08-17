/**
 * Identity studio.
 *
 * Live talking-head lip-sync is retired. This page shows the identity badge.
 * Video files and clip-script substitutes are not offered. Phone, email, and
 * text stay on the agent.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
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
  const { agents, loading: agentsLoading, error: agentsError, reload } = useAgents();
  const [searchParams] = useSearchParams();
  const requestedAgentId = searchParams.get("agent");
  const businessAgents = agents.filter((agent) => agent.is_business_agent);
  const [agentId, setAgentId] = useState("");
  const [payload, setPayload] = useState<PresenterPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessAgents.length) return;
    if (requestedAgentId && businessAgents.some((agent) => agent.id === requestedAgentId)) {
      setAgentId(requestedAgentId);
      return;
    }
    setAgentId((current) => current || businessAgents[0].id);
  }, [businessAgents, requestedAgentId]);

  const loadPresenter = useCallback(async (id: string) => {
    const res = await authFetch(`/api/agents/${id}/video-presenter`);
    const body = (await res.json().catch(() => ({}))) as PresenterPayload & { error?: string };
    if (!res.ok) throw new Error(body.error || "Could not load identity.");
    setPayload(body);
  }, []);

  useEffect(() => {
    if (!agentId) return;
    setLoadError(null);
    void loadPresenter(agentId).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : "Could not load identity.");
    });
  }, [agentId, loadPresenter]);

  if (agentsError) {
    return (
      <WorkspaceShell>
        <WorkspaceRecovery
          title="Couldn't load agents"
          description={agentsError}
          onRetry={() => void reload()}
        />
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
        ) : null}
        {businessAgents.length ? (
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">Business agent</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              aria-label="Business agent"
            >
              {businessAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <StatusNotice>Create a business agent first, then come back for identity.</StatusNotice>
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
