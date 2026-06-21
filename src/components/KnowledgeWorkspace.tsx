import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Plus, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";

type Config = {
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  personality?: string;
};
type View = "facts" | "rules" | "tone";

function Panel({
  title,
  icon,
  items,
  empty,
  loading,
  countLabel,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  empty: string;
  loading: boolean;
  countLabel?: string;
}) {
  return (
    <article className="wl-stitch-knowledge-panel">
      <header className="wl-stitch-knowledge-panel__header">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
          <h2 className="text-sm font-semibold tracking-[-.02em]">{title}</h2>
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          {loading ? "—" : countLabel || `${items.length} entries`}
        </span>
      </header>
      <div className="wl-scroll min-h-[140px] flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((id) => (
              <div key={id} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : items.length ? (
          <div className="space-y-2">
            {items.map((item, index) => (
              <p key={`${item}-${index}`} className="wl-stitch-knowledge-entry">
                {item}
              </p>
            ))}
          </div>
        ) : (
          <p className="grid min-h-[88px] place-items-center text-center text-[13px] leading-5 text-muted-foreground">
            {empty}
          </p>
        )}
      </div>
    </article>
  );
}

export default function KnowledgeWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<Config>({});
  const [kind, setKind] = useState<"knowledge" | "directive">("knowledge");
  const [entry, setEntry] = useState("");
  const [view, setView] = useState<View>("facts");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";
  const active = agents.find((agent) => agent.id === agentId);
  const facts = useMemo(
    () => config.knowledge?.map((item) => item.content || "").filter(Boolean) || [],
    [config.knowledge],
  );
  const rules = useMemo(
    () => config.directives?.map((item) => item.content || "").filter(Boolean) || [],
    [config.directives],
  );

  const load = useCallback(async () => {
    if (!agentId) return setConfig({});
    setLoading(true);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
      const payload = await safeJson(response);
      if (response.ok && payload && typeof payload === "object") setConfig(payload as Config);
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
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, content: entry.trim() }),
      });
      if (response.ok) {
        setEntry("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!agents.length) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
        Create an assistant in Studio before adding knowledge.
      </div>
    );
  }

  const tonePanel = (
    <article className="wl-stitch-knowledge-panel">
      <header className="wl-stitch-knowledge-panel__header">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal size={15} />
          </span>
          <h2 className="text-sm font-semibold tracking-[-.02em]">Tone & personality</h2>
        </div>
      </header>
      <div className="wl-scroll min-h-[120px] flex-1 overflow-y-auto p-4">
        <p className="text-[13px] italic leading-relaxed text-muted-foreground">
          {config.personality ||
            "Tone has not been set. Describe how this assistant should sound in Studio."}
        </p>
      </div>
    </article>
  );

  const selected =
    view === "facts" ? (
      <Panel
        title="Business facts"
        icon={<Database size={15} />}
        items={facts}
        empty="Add approved hours, services, policies, or context your assistant can state as truth."
        loading={loading}
      />
    ) : view === "rules" ? (
      <Panel
        title="Operating rules"
        icon={<ShieldCheck size={15} />}
        items={rules}
        empty="Add promises, boundaries, and handoff rules."
        loading={loading}
        countLabel={rules.length ? `${rules.length} active` : undefined}
      />
    ) : (
      tonePanel
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="wl-stitch-eyebrow">Knowledge base</p>
          <h2 className="wl-stitch-headline mt-1">Assistant intelligence</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
            Facts, rules, and tone stay separate so your assistant can tell business truth from
            operational boundaries.
          </p>
        </div>
        <select
          value={agentId}
          onChange={(event) => setParams({ agent: event.target.value })}
          className="wl-agent-select ml-auto rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          {agents.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="wl-segmented grid shrink-0 grid-cols-3 lg:hidden">
        {(["facts", "rules", "tone"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-selected={view === item}
            className={view === item ? "is-active capitalize" : "capitalize"}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4">
        <div className="hidden min-h-0 grid-cols-1 gap-4 xl:grid xl:grid-cols-2">
          <Panel
            title="Business facts"
            icon={<Database size={15} />}
            items={facts}
            empty="Add approved hours, services, policies, or context your assistant can state as truth."
            loading={loading}
          />
          <div className="flex flex-col gap-4">
            <Panel
              title="Operating rules"
              icon={<ShieldCheck size={15} />}
              items={rules}
              empty="Add promises, boundaries, and handoff rules."
              loading={loading}
              countLabel={rules.length ? `${rules.length} active` : undefined}
            />
            {tonePanel}
          </div>
        </div>
        <div className="min-h-0 lg:hidden">{selected}</div>

        <aside className="wl-stitch-card mt-2 flex min-h-0 flex-col p-4 lg:mt-0">
          <p className="wl-stitch-label">Add knowledge</p>
          <h2 className="mt-1 text-base font-semibold tracking-[-.025em]">{active?.name}</h2>
          <div className="wl-segmented mt-3 grid grid-cols-2">
            <button
              type="button"
              aria-selected={kind === "knowledge"}
              className={kind === "knowledge" ? "is-active" : ""}
              onClick={() => setKind("knowledge")}
            >
              Fact
            </button>
            <button
              type="button"
              aria-selected={kind === "directive"}
              className={kind === "directive" ? "is-active" : ""}
              onClick={() => setKind("directive")}
            >
              Rule
            </button>
          </div>
          <textarea
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            className="wl-stitch-input mt-3 min-h-[120px] flex-1 resize-none leading-relaxed"
            placeholder={
              kind === "knowledge"
                ? "We are open Monday–Friday, 8am–6pm…"
                : "Never quote final pricing. Escalate estimates…"
            }
          />
          <button
            type="button"
            disabled={!entry.trim() || saving}
            onClick={() => void save()}
            className="workspace-btn-primary mt-3 w-full justify-center px-3 py-2.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            Save {kind === "knowledge" ? "fact" : "rule"}
          </button>
        </aside>
      </div>

      <div className="wl-stitch-card flex shrink-0 gap-2 p-2.5 lg:hidden">
        <input
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          className="wl-stitch-input min-w-0 flex-1 py-2"
          placeholder={kind === "knowledge" ? "Add a fact…" : "Add a rule…"}
        />
        <button
          type="button"
          onClick={() => setKind(kind === "knowledge" ? "directive" : "knowledge")}
          className="workspace-btn-secondary px-2.5 py-2 text-xs"
        >
          {kind === "knowledge" ? "Fact" : "Rule"}
        </button>
        <button
          type="button"
          disabled={!entry.trim() || saving}
          onClick={() => void save()}
          className="workspace-btn-primary grid h-10 w-10 shrink-0 place-items-center rounded-xl p-0 disabled:opacity-40"
          aria-label={`Save ${kind === "knowledge" ? "fact" : "rule"}`}
        >
          {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  );
}
