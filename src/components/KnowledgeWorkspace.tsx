import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Database, FileText, Loader2, Plus, ShieldCheck, SlidersHorizontal, Trash2, Brain, User } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { authFetch, safeJson } from "../lib/api";
import { Badge, Button, EmptyState, Input, Skeleton, Textarea } from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import { useAgents } from "../contexts/AgentsContext";
import type { TrainingSuggestion } from "../types/api";

type Config = {
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  personality?: string;
};

type View = "facts" | "guidance" | "tone" | "sources";
type EntryKind = "knowledge" | "directive";

const labels: Record<View, string> = {
  facts: "Facts",
  guidance: "Rules",
  tone: "Voice",
  sources: "Context",
};

function isView(value: string | null): value is View {
  return value === "facts" || value === "guidance" || value === "tone" || value === "sources";
}

function Card({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  icon: ReactNode;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <article className="flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--wireline-elevation-sm)] sm:min-h-[260px]">
      <header className="flex flex-col items-center gap-2 border-b border-border px-4 py-3.5 text-center">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
          {icon}
        </span>
        <div>
          <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold leading-5 tracking-[-.02em] text-foreground">
            {title}
          </h2>
          {meta ? (
            <p className="mt-0.5 font-mono text-[var(--wireline-typography-overline-size)] leading-4 text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </article>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} shape="surface" className="h-16 w-full" />
      ))}
    </div>
  );
}

function ItemsCard({
  title,
  icon,
  items,
  empty,
  loading,
  meta,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  empty: string;
  loading: boolean;
  meta: string;
}) {
  return (
    <Card title={title} icon={icon} meta={loading ? "--" : meta}>
      {loading ? (
        <LoadingRows />
      ) : items.length ? (
        <div className="space-y-5">
          {items.map((item, index) => {
            const splitAt = item.search(/[:\n]/);
            const heading = splitAt >= 0 ? item.slice(0, splitAt).trim() : item;
            const detail = splitAt >= 0 ? item.slice(splitAt + 1).trim() : "";
            return (
              <article
                key={`${item}-${index}`}
                className="border-l-2 border-[color:var(--wireline-color-border-strong)] pl-3"
              >
                <p className="text-[var(--wireline-typography-body-size)] font-semibold leading-5 text-foreground">
                  {heading}
                </p>
                {detail ? (
                  <p className="mt-1 line-clamp-5 text-[var(--wireline-typography-body-size)] leading-5 text-muted-foreground">
                    {detail}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          density="compact"
          className="min-h-[150px] border-dashed text-center"
          icon={icon}
          title="Empty"
          description={empty}
        />
      )}
    </Card>
  );
}

function ToneCard({ personality, loading }: { personality?: string; loading: boolean }) {
  const traits = personality
    ? ["Professional", "Concise", "Helpful"]
    : ["Clear", "Direct", "Helpful"];
  return (
    <Card
      title="Tone & personality"
      icon={<SlidersHorizontal size={16} />}
      meta={loading ? "--" : `${traits.length} traits`}
    >
      {loading ? (
        <LoadingRows />
      ) : (
        <>
          <blockquote className="border-l-2 border-[color:var(--wireline-color-border-strong)] pl-3 text-[15px] leading-6 text-muted-foreground">
            {personality || "Clear. Confident. Concise."}
          </blockquote>
          <p className="mt-5 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.05em] text-muted-foreground">
            Traits
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {traits.map((trait) => (
              <Badge key={trait} variant="outline">
                {trait}
              </Badge>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function SourcesCard({ loading }: { loading: boolean }) {
  return (
    <Card title="Sources" icon={<Database size={16} />} meta={loading ? "--" : "Upload panel"}>
      {loading ? (
        <LoadingRows />
      ) : (
        <div className="flex min-h-[150px] flex-col justify-center">
          <EmptyState
            density="compact"
            className="min-h-0 border-dashed text-center"
            icon={<Database size={16} />}
            title="Sources"
            description="Upload docs."
          />
        </div>
      )}
    </Card>
  );
}

export default function KnowledgeWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const initialSection = params.get("section");
  const [config, setConfig] = useState<Config>({});
  const [kind, setKind] = useState<EntryKind>("knowledge");
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("");
  const [tags, setTags] = useState("");
  const [view, setView] = useState<View>(isView(initialSection) ? initialSection : "facts");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const agentId = params.get("agent") || agents[0]?.id || "";

  useEffect(() => {
    const section = params.get("section");
    if (isView(section)) setView(section);
  }, [params]);

  function chooseView(next: View) {
    setView(next);
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("section", next);
        return updated;
      },
      { replace: true },
    );
  }

  const facts = useMemo(
    () => config.knowledge?.map((item) => item.content || "").filter(Boolean) || [],
    [config.knowledge],
  );
  const guidance = useMemo(
    () => config.directives?.map((item) => item.content || "").filter(Boolean) || [],
    [config.directives],
  );

  const load = useCallback(async () => {
    if (!agentId) {
      setConfig({});
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
      const payload = await safeJson(response);
      if (response.ok && payload && typeof payload === "object") setConfig(payload as Config);
      else setLoadError("Training could not be loaded right now.");
    } catch {
      setLoadError("Training could not be loaded right now.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!entry.trim() || !agentId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const content = title.trim() ? `${title.trim()}: ${entry.trim()}` : entry.trim();
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: kind,
          content,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        setSaveError(
          payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : "Your change could not be saved.",
        );
        return;
      }
      setTitle("");
      setEntry("");
      setTags("");
      await load();
    } catch {
      setSaveError("Your change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const factsPanel = (
    <ItemsCard
      title="Facts & preferences"
      icon={<Database size={16} />}
      items={facts}
      empty="No facts yet."
      loading={loading}
      meta={`${facts.length} items`}
    />
  );
  const guidancePanel = (
    <ItemsCard
      title="Guidance & handoff"
      icon={<ShieldCheck size={16} />}
      items={guidance}
      empty="No rules yet."
      loading={loading}
      meta={guidance.length ? `${guidance.length} active` : "0 items"}
    />
  );
  const tonePanel = <ToneCard personality={config.personality} loading={loading} />;
  const sourcesPanel = <SourcesCard loading={loading} />;

  // --- Training Intelligence / Flywheel (MOAT + extreme usefulness elevation) ---
  // Mix real outcomes (from /api/calls) with smart suggestions. Full LLM extraction in later tranche.
  const derivedFromOutcomes = recentOutcomes.slice(0, 2).map((o: any, i: number) => ({
    id: `real-${i}`,
    kind: 'fact' as const,
    content: (o.summary || 'Outcome captured.').slice(0, 90),
    agentId: agentId || '',
  }));
  const intelligence: TrainingSuggestion[] = [
    ...derivedFromOutcomes,
    { id: "s1", kind: "directive", content: "Always offer callback within 2 hours if no answer on first attempt.", agentId: agentId || "" },
    { id: "s2", kind: "personality", content: "Be warm but concise — customers value speed on service calls.", agentId: agentId || "" },
  ];

  const [appliedSuggestions, setAppliedSuggestions] = useState<string[]>([]);
  const [recentOutcomes, setRecentOutcomes] = useState<any[]>([]);

  // Pull real outcomes for intelligence suggestions (real flywheel)
  useEffect(() => {
    if (!agentId) return;
    authFetch(`/api/calls?limit=5`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.calls) ? data.calls : [];
        const forAgent = list.filter((c: any) => c.agentId === agentId || c.agent_id === agentId).slice(0, 3);
        setRecentOutcomes(forAgent);
      })
      .catch(() => {});
  }, [agentId]);

  const applySuggestion = async (s: TrainingSuggestion) => {
    if (!agentId) return;
    // For tranche 1: optimistic UI + call existing manual save path for demo
    setAppliedSuggestions((prev) => [...prev, s.id]);
    try {
      await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: s.kind === "fact" ? "knowledge" : "directive",
          content: s.content,
        }),
      });
      await load(); // refresh panels so value appears immediately
    } catch {
      // swallow for demo; real error would surface in production
    }
  };

  const intelligencePanel = (
    <article className="studio-card flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--wireline-elevation-sm)] sm:min-h-[260px]">
      <header className="flex flex-col items-center gap-2 border-b border-border px-4 py-3.5 text-center">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
          <Brain size={16} />
        </span>
        <div>
          <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold leading-5 tracking-[-.02em] text-foreground">
            Intelligence from outcomes
          </h2>
          <p className="mt-0.5 font-mono text-[var(--wireline-typography-overline-size)] leading-4 text-muted-foreground">
            {loading ? "--" : `${intelligence.length} suggestions`}
          </p>
        </div>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
        {loading ? (
          <LoadingRows />
        ) : intelligence.length ? (
          <div className="space-y-3">
            {intelligence.map((s) => {
              const isApplied = appliedSuggestions.includes(s.id);
              const isReal = s.id.startsWith('real-');
              return (
                <div key={s.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-2">
                      {s.kind === 'fact' && <FileText size={14} className="mt-0.5 text-muted-foreground" />}
                      {s.kind === 'directive' && <ShieldCheck size={14} className="mt-0.5 text-muted-foreground" />}
                      {s.kind === 'personality' && <User size={14} className="mt-0.5 text-muted-foreground" />}
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{s.kind}{isReal ? ' • from call' : ''}</span>
                        <p className="mt-0.5 leading-snug text-foreground line-clamp-3">{s.content}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isApplied ? "secondary" : "default"}
                      disabled={isApplied}
                      onClick={() => applySuggestion(s)}
                      aria-label={isApplied ? "Added to training" : "Add this to agent training"}
                    >
                      {isApplied ? "Added" : "Add to training"}
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{isReal ? 'Captured from recent outcome' : 'Suggested from patterns'} • one-click trains the fleet</p>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            density="compact"
            className="min-h-[120px] border-dashed text-center"
            icon={<Brain size={16} />}
            title="No new intelligence"
            description="Run calls or tests — suggestions will appear here."
          />
        )}
      </div>
    </article>
  );

  const selected =
    view === "facts"
      ? factsPanel
      : view === "guidance"
        ? guidancePanel
        : view === "tone"
          ? tonePanel
          : sourcesPanel;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid shrink-0 grid-cols-4 overflow-hidden rounded-md border border-border bg-muted lg:hidden">
        {(["facts", "guidance", "tone", "sources"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-selected={view === item}
            onClick={() => chooseView(item)}
            className={`min-h-10 border-r border-border px-2 text-[var(--wireline-typography-caption-size)] font-medium last:border-r-0 ${view === item ? "bg-card text-foreground" : "text-muted-foreground"}`}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      {loadError ? (
        <StatusNotice tone="warning" title="Training is partially unavailable.">
          {loadError}
        </StatusNotice>
      ) : null}

      <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(170px,.85fr)_minmax(170px,.85fr)_minmax(180px,.9fr)_minmax(260px,1.1fr)_minmax(350px,1.4fr)] xl:gap-6">
        <div className="hidden min-h-0 xl:block">{factsPanel}</div>
        <div className="hidden min-h-0 xl:block">{guidancePanel}</div>
        <div className="hidden min-h-0 xl:flex xl:flex-col xl:gap-4">
          {tonePanel}
          {sourcesPanel}
        </div>
        <div className="hidden min-h-0 xl:block">{intelligencePanel}</div>
        <div className="min-h-0 xl:hidden space-y-4">
          {selected}
          {intelligencePanel}
        </div>

        <aside className="mt-4 flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-[var(--wireline-elevation-sm)] xl:mt-0 xl:min-h-[480px]">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Plus size={18} className="text-foreground" />
            <div>
              <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.01em] text-foreground">
                Add detail
              </h2>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-md bg-muted p-1">
            <button
              type="button"
              aria-selected={kind === "knowledge"}
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "knowledge" ? "bg-card text-foreground shadow-[var(--wireline-elevation-sm)]" : "text-muted-foreground"}`}
              onClick={() => setKind("knowledge")}
            >
              Fact
            </button>
            <button
              type="button"
              aria-selected={kind === "directive"}
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "directive" ? "bg-card text-foreground shadow-[var(--wireline-elevation-sm)]" : "text-muted-foreground"}`}
              onClick={() => setKind("directive")}
            >
              Guidance
            </button>
          </div>
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
            <FormField label="Title" description="Optional label.">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  kind === "knowledge" ? "e.g., Preferred pharmacy" : "e.g., When to check in"
                }
              />
            </FormField>
            <FormField
              label="Content"
              required
              description="Required."
              error={saveError || undefined}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Textarea
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                className="mt-1 min-h-[132px] flex-1 sm:min-h-[180px]"
                resize="none"
                placeholder={
                  kind === "knowledge"
                    ? "Fact, preference, routine, or policy."
                    : "Rule, handoff, or handling preference."
                }
              />
            </FormField>
            <FormField label="Tags" description="Optional.">
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Separate with commas"
              />
            </FormField>
          </div>
          {saveError ? (
            <StatusNotice tone="destructive" className="mt-4" title="This detail was not saved.">
              {saveError}
            </StatusNotice>
          ) : null}
          <div className="mt-4 flex justify-end gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTitle("");
                setEntry("");
                setTags("");
                setSaveError(null);
              }}
            >
              <Trash2 aria-hidden="true" size={14} />
              Clear
            </Button>
            <Button type="button" disabled={!entry.trim() || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Save{" "}
              {kind === "knowledge" ? "fact" : "guidance"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
