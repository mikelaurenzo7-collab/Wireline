import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { MetricStatTile } from "../ui/MetricStatTile";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import { BrainCircuit } from "lucide-react";

type AgentRow = { id: string; name: string };

type LearningDigest = {
  agentId: string;
  lessonsPending: number;
  lessonsApproved: number;
  topLessons: string[];
};

function isAgentRow(value: unknown): value is AgentRow {
  if (!value || typeof value !== "object") return false;
  const agent = value as Partial<AgentRow>;
  return typeof agent.id === "string" && agent.id.length > 0 && typeof agent.name === "string";
}

function isLearningDigest(value: unknown, agentId: string): value is LearningDigest {
  if (!value || typeof value !== "object") return false;
  const digest = value as Partial<LearningDigest>;
  return (
    digest.agentId === agentId &&
    Number.isInteger(digest.lessonsPending) &&
    (digest.lessonsPending as number) >= 0 &&
    Number.isInteger(digest.lessonsApproved) &&
    (digest.lessonsApproved as number) >= 0 &&
    Array.isArray(digest.topLessons) &&
    digest.topLessons.every((lesson) => typeof lesson === "string")
  );
}

export default function LearningMetricsView() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [digests, setDigests] = useState<LearningDigest[]>([]);
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const agentsResponse = await authFetch("/api/agents", { signal: controller.signal });
        if (!agentsResponse.ok) throw new Error("Agents unavailable");
        const agentsRes = await agentsResponse.json();
        if (
          agentsRes?.degraded === true ||
          !Array.isArray(agentsRes?.agents) ||
          !agentsRes.agents.every(isAgentRow) ||
          new Set(agentsRes.agents.map((agent: AgentRow) => agent.id)).size !==
            agentsRes.agents.length
        ) {
          throw new Error("Invalid agent list");
        }
        const list: AgentRow[] = agentsRes.agents.slice(0, 12);
        if (cancelled) return;
        const results = await Promise.all(
          list.map(async (agent) => {
            try {
              const response = await authFetch(
                `/api/agents/${encodeURIComponent(agent.id)}/learning-digest`,
                { signal: controller.signal },
              );
              if (!response.ok) return null;
              const body = await response.json();
              return body?.ok === true && isLearningDigest(body.digest, agent.id)
                ? body.digest
                : null;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setAgents(list);
        setAgentCount(agentsRes.agents.length);
        setLoadError(null);
        setUnavailableIds(list.filter((_, index) => results[index] === null).map((a) => a.id));
        setDigests((previous) =>
          list.flatMap((agent, index) => {
            const digest = results[index] ?? previous.find((d) => d.agentId === agent.id);
            return digest ? [digest] : [];
          }),
        );
      } catch {
        if (!cancelled) {
          setLoadError("Could not refresh the Bot list. Previously loaded results are kept below.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  if (loading && agents.length === 0 && !loadError)
    return (
      <ClientRouteLoading
        icon={<BrainCircuit className="h-5 w-5" />}
        label="Loading learning metrics"
      />
    );

  const pendingTotal = digests.reduce((n, d) => n + d.lessonsPending, 0);
  const approvedTotal = digests.reduce((n, d) => n + d.lessonsApproved, 0);

  if (!loadError && agents.length === 0) {
    return (
      <EmptyState
        title="No Bots"
        icon={BrainCircuit}
        actions={[{ label: "Open Workspace", to: "/studio", primary: true }]}
      />
    );
  }

  return (
    <div className="space-y-6" aria-busy={loading}>
      {(loadError || unavailableIds.length > 0) && (
        <StatusNotice
          tone="warning"
          title={
            digests.length > 0
              ? "Some Learning Metrics Unavailable"
              : "Learning Metrics Unavailable"
          }
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {loading ? "Retrying…" : "Retry"}
            </Button>
          }
        >
          {loadError
            ? digests.length > 0
              ? loadError
              : "Could not load the Bot list. Retry to load learning metrics."
            : `Unavailable: ${agents
                .filter((a) => unavailableIds.includes(a.id))
                .map((a) => a.name)
                .join(
                  ", ",
                )}. ${digests.length > 0 ? "Totals cover only the summaries shown below." : "Retry to load these summaries."}`}
        </StatusNotice>
      )}

      {digests.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Latest 50 lessons per Bot.
            {agentCount > agents.length ? ` Showing ${agents.length} of ${agentCount} Bots.` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricStatTile label="Lessons pending review" value={pendingTotal} tone="rose" />
            <MetricStatTile label="Approved lessons" value={approvedTotal} />
            <MetricStatTile label="Bots loaded" value={digests.length} tone="muted" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {digests.map((d) => {
          const agent = agents.find((a) => a.id === d.agentId);
          return (
            <section
              key={d.agentId}
              aria-label={`${agent?.name ?? d.agentId} learning summary`}
              className="wl-panel border border-border rounded-md p-4"
            >
              <p className="text-sm font-semibold text-foreground mb-2">
                {agent?.name ?? d.agentId}
              </p>
              {(loadError || unavailableIds.includes(d.agentId)) && (
                <p className="text-xs text-muted mb-3">Last loaded results · Refresh unavailable</p>
              )}
              <p className="text-[length:var(--wireline-typography-caption-size)] text-muted mb-3">
                {d.lessonsPending} pending · {d.lessonsApproved} approved
              </p>
              {d.topLessons.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-[length:var(--wireline-typography-caption-size)] text-muted">
                  {d.topLessons.map((lesson, i) => (
                    <li key={i}>{lesson}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
