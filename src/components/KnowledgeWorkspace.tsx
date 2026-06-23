import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";

type Config = {
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  personality?: string;
};
type View = "facts" | "rules" | "tone" | "sources";

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
    <article className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)]">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-muted text-muted-foreground">
            {icon}
          </span>
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-.02em] text-foreground">
            {title}
          </h2>
        </div>
        <span className="font-mono text-[11px] leading-4 text-muted-foreground">
          {loading ? "—" : countLabel || `${items.length} items`}
        </span>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((id) => (
              <div key={id} className="h-16 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : items.length ? (
          <div className="space-y-5">
            {items.map((item, index) => (
              <article
                className="border-l-2 border-[color:var(--wl-line-strong)] pl-3"
                key={`${item}-${index}`}
              >
                <p className="text-[15px] font-semibold leading-5 text-foreground">
                  {item.split(/[:\n]/)[0]}
                </p>
                <p className="mt-1 line-clamp-5 text-[14px] leading-5 text-muted-foreground">
                  {item.includes(":") ? item.slice(item.indexOf(":") + 1).trim() : item}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="grid min-h-[180px] place-items-center text-center text-[13px] leading-5 text-muted-foreground">
            {empty}
          </p>
        )}
      </div>
    </article>
  );
}

function TonePanel({ personality, loading }: { personality?: string; loading: boolean }) {
  const traits = personality
    ? ["Professional", "Concise", "Helpful"]
    : ["Clear", "Direct", "Helpful"];
  return (
    <article className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)]">
      <header className="flex items-center gap-2 border-b border-border px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-sm bg-muted text-muted-foreground">
          <SlidersHorizontal size={16} />
        </span>
        <h2 className="text-[18px] font-semibold leading-5 tracking-[-.02em] text-foreground">
          Tone &amp; personality
        </h2>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 animate-pulse bg-muted" />
            <div className="h-4 w-5/6 animate-pulse bg-muted" />
            <div className="h-4 w-4/5 animate-pulse bg-muted" />
          </div>
        ) : (
          <>
            <blockquote className="border-l-2 border-[color:var(--wl-line-strong)] pl-3 text-[15px] italic leading-6 text-muted-foreground">
              {personality ||
                "Define how your assistant should sound. Keep it clear, confident, concise, and appropriate to every conversation."}
            </blockquote>
            <p className="mt-8 font-mono text-[11px] font-medium uppercase tracking-[.05em] text-muted-foreground">
              Key traits
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {traits.map((trait) => (
                <span
                  key={trait}
                  className="rounded-sm bg-muted px-2 py-1 font-mono text-[12px] text-foreground"
                >
                  {trait}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function SourcesPanel({ loading }: { loading: boolean }) {
  const sources = [
    {
      id: 1,
      name: "Company Website",
      type: "Web",
      url: "https://wireline.com",
      lastSync: "2 hours ago",
      status: "Fresh",
    },
    {
      id: 2,
      name: "Product Specs",
      type: "PDF",
      url: "product-v2.pdf",
      lastSync: "5 days ago",
      status: "Stale",
    },
    {
      id: 3,
      name: "Support Playbook",
      type: "Notion",
      url: "notion.so/playbook",
      lastSync: "10 mins ago",
      status: "Fresh",
    },
  ];

  return (
    <article className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)]">
      <header className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-primary/10 text-primary">
            <Database size={16} />
          </span>
          <h2 className="text-[18px] font-semibold leading-5 tracking-[-.02em] text-foreground">
            Sources &amp; Freshness
          </h2>
        </div>
        <button className="text-[12px] font-semibold text-primary hover:underline flex items-center gap-1">
          <Plus size={14} /> Add Source
        </button>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((id) => (
              <div key={id} className="h-16 animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground leading-5 mb-2">
              Keep your assistant up to date. Stale sources may contain outdated pricing or
              policies.
            </p>
            {sources.map((src) => (
              <div
                key={src.id}
                className="border border-border rounded-lg p-3 flex items-center justify-between hover:border-[color:var(--wl-line-strong)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-muted w-10 h-10 rounded flex items-center justify-center font-mono text-[10px] font-semibold text-muted-foreground">
                    {src.type}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                      {src.name}
                      {src.status === "Stale" && (
                        <span className="bg-error/10 text-error text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-bold">
                          Stale
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5 font-mono truncate max-w-[200px]">
                      {src.url}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-[12px] font-medium text-foreground">
                    Synced {src.lastSync}
                  </div>
                  <button className="text-[11px] font-semibold text-primary mt-1 hover:underline">
                    Re-sync now
                  </button>
                </div>
              </div>
            ))}
          </div>
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
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("");
  const [tags, setTags] = useState("");
  const [view, setView] = useState<View>("facts");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";
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
      if (response.ok) {
        setTitle("");
        setEntry("");
        setTags("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  const factsPanel = (
    <Panel
      title="Facts & preferences"
      icon={<Database size={16} />}
      items={facts}
      empty="Add preferences, routines, important details, and approved information your assistant can use."
      loading={loading}
      countLabel={`${facts.length} items`}
    />
  );
  const rulesPanel = (
    <Panel
      title="Rules & boundaries"
      icon={<ShieldCheck size={16} />}
      items={rules}
      empty="Add promises, limits, and situations where your assistant should ask you first."
      loading={loading}
      countLabel={rules.length ? `${rules.length} active` : "0 items"}
    />
  );
  const tonePanel = <TonePanel personality={config.personality} loading={loading} />;
  const sourcesPanel = <SourcesPanel loading={loading} />;

  const selected =
    view === "facts"
      ? factsPanel
      : view === "rules"
        ? rulesPanel
        : view === "tone"
          ? tonePanel
          : sourcesPanel;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end lg:hidden">
        <select
          value={agentId}
          onChange={(event) => setParams({ agent: event.target.value })}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          {agents.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid shrink-0 grid-cols-4 overflow-hidden rounded-md border border-border bg-muted lg:hidden">
        {(["facts", "rules", "tone", "sources"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-selected={view === item}
            onClick={() => setView(item)}
            className={`min-h-10 border-r border-border px-3 text-[12px] font-medium capitalize last:border-r-0 ${view === item ? "bg-card text-foreground" : "text-muted-foreground"}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(170px,.85fr)_minmax(170px,.85fr)_minmax(180px,.9fr)_minmax(350px,1.65fr)] xl:gap-6">
        <div className="hidden min-h-0 xl:block">{factsPanel}</div>
        <div className="hidden min-h-0 xl:block">{rulesPanel}</div>
        <div className="hidden min-h-0 xl:flex xl:flex-col xl:gap-4">
          {tonePanel}
          {sourcesPanel}
        </div>
        <div className="min-h-0 xl:hidden">{selected}</div>

        <aside className="mt-4 flex min-h-[520px] flex-col rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)] xl:mt-0">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Plus size={19} className="text-foreground" />
            <h2 className="text-[20px] font-semibold tracking-[-.01em]">Add a detail</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-md bg-muted p-1">
            <button
              type="button"
              aria-selected={kind === "knowledge"}
              className={`min-h-9 rounded-sm text-[14px] font-medium ${kind === "knowledge" ? "bg-card text-foreground shadow-[0_1px_1px_rgba(93,63,211,.04)]" : "text-muted-foreground"}`}
              onClick={() => setKind("knowledge")}
            >
              Add fact
            </button>
            <button
              type="button"
              aria-selected={kind === "directive"}
              className={`min-h-9 rounded-sm text-[14px] font-medium ${kind === "directive" ? "bg-card text-foreground shadow-[0_1px_1px_rgba(93,63,211,.04)]" : "text-muted-foreground"}`}
              onClick={() => setKind("directive")}
            >
              Add rule
            </button>
          </div>
          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="wl-stitch-input mt-2"
              placeholder={
                kind === "knowledge" ? "e.g., Preferred pharmacy" : "e.g., When to ask me first"
              }
            />
          </label>
          <label className="mt-4 flex min-h-0 flex-1 flex-col">
            <span className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">
              Content
            </span>
            <textarea
              value={entry}
              onChange={(event) => setEntry(event.target.value)}
              className="wl-stitch-input mt-2 min-h-[150px] flex-1 resize-none leading-6"
              placeholder={
                kind === "knowledge"
                  ? "Describe a fact, preference, routine, or policy clearly…"
                  : "Describe what the assistant must do or avoid…"
              }
            />
          </label>
          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">
              Tags (optional)
            </span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="wl-stitch-input mt-2"
              placeholder="Separate with commas"
            />
          </label>
          <div className="mt-4 flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                setTitle("");
                setEntry("");
                setTags("");
              }}
              className="studio-secondary-button text-sm"
            >
              <Trash2 size={14} />
              Clear
            </button>
            <button
              type="button"
              disabled={!entry.trim() || saving}
              onClick={() => void save()}
              className="studio-primary-button text-sm disabled:opacity-40"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Save{" "}
              {kind === "knowledge" ? "fact" : "rule"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
