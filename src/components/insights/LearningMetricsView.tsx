import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { MetricStatTile } from "../ui/MetricStatTile";
import { EmptyState } from "../ui/EmptyState";
import { BrainCircuit } from "lucide-react";

type AgentRow = { id: string; name: string };

type LearningDigest = {
  agentId: string;
  lessonsPending: number;
  lessonsApproved: number;
  topLessons: string[];
  outcomeLiftPct: number | null;
  objectionsTrending: string[];
};

export default function LearningMetricsView() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [digests, setDigests] = useState<LearningDigest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const agentsResponse = await authFetch("/api/agents");
        if (!agentsResponse.ok) {
          if (!cancelled) {
            setAgents([]);
            setDigests([]);
            setLoadError("Could not load agents for learning metrics. Try again shortly.");
          }
          return;
        }
        const agentsRes = await agentsResponse.json();
        const list: AgentRow[] = (agentsRes?.agents ?? []).slice(0, 12);
        if (cancelled) return;
        setAgents(list);
        setLoadError(null);
        const results = await Promise.all(
          list.map((a) =>
            authFetch(`/api/agents/${a.id}/learning-digest`)
              .then((r) => (r.ok ? r.json() : null))
              .then((body) => (body?.digest as LearningDigest | undefined) ?? null)
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setDigests(results.filter((d): d is LearningDigest => d != null));
      } catch {
        if (!cancelled) {
          setAgents([]);
          setDigests([]);
          setLoadError("Could not load learning metrics. Try again shortly.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return (
      <ClientRouteLoading
        icon={<BrainCircuit className="h-5 w-5" />}
        label="Loading learning metrics"
      />
    );

  const pendingTotal = digests.reduce((n, d) => n + d.lessonsPending, 0);
  const approvedTotal = digests.reduce((n, d) => n + d.lessonsApproved, 0);

  if (loadError) {
    return (
      <EmptyState
        title="Learning metrics unavailable"
        description={loadError}
        icon={BrainCircuit}
        actions={[{ label: "Studio", to: "/studio", primary: true }]}
      />
    );
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        title="No agents"
        icon={BrainCircuit}
        actions={[{ label: "Studio", to: "/studio", primary: true }]}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricStatTile label="Lessons pending review" value={pendingTotal} tone="rose" />
        <MetricStatTile label="Lessons in runtime" value={approvedTotal} />
        <MetricStatTile label="Agents tracked" value={agents.length} tone="muted" />
      </div>

      <div className="space-y-3">
        {digests.map((d) => {
          const agent = agents.find((a) => a.id === d.agentId);
          return (
            <div key={d.agentId} className="wl-panel border border-border rounded-md p-4">
              <p className="text-sm font-semibold text-foreground mb-2">
                {agent?.name ?? d.agentId}
              </p>
              <p className="text-[var(--wireline-typography-caption-size)] text-muted mb-3">
                {d.lessonsPending} pending · {d.lessonsApproved} approved
                {d.outcomeLiftPct != null ? ` · ${d.outcomeLiftPct}% outcome lift` : ""}
              </p>
              {d.topLessons.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-[var(--wireline-typography-caption-size)] text-muted">
                  {d.topLessons.map((lesson, i) => (
                    <li key={i}>{lesson}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
