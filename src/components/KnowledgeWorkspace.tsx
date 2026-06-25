import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { authFetch, safeJson } from "../lib/api";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  NativeSelect,
  Skeleton,
  Textarea,
} from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import { useAgents } from "../contexts/AgentsContext";

type Config = {
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  personality?: string;
};

type View = "facts" | "rules" | "tone" | "sources";
type EntryKind = "knowledge" | "directive";

const VIEW_LABELS: Record<View, string> = {
  facts: "Facts",
  rules: "Guidance",
  tone: "Tone",
  sources: "Sources",
};

type PanelShellProps = {
  title: string;
  icon: ReactNode;
  countLabel?: string;
  loading: boolean;
  action?: ReactNode;
  children: ReactNode;
};

function PanelShell({ title, icon, countLabel, loading, action, children }: PanelShellProps) {
  return (
    <article className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)]">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-muted text-muted-foreground">
            {icon}
          </span>
          <div>
            <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold leading-5 tracking-[-.02em] text-foreground">
              {title}
            </h2>
            {countLabel ? (
              <p className="mt-1 font-mono text-[var(--wireline-typography-overline-size)] leading-4 text-muted-foreground">
                {loading ? "—" : countLabel}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </article>
  );
}

function PanelLoadingRows() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} shape="surface" className="h-20 w-full" />
      ))}
    </div>
  );
}

function ItemsPanel({
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
  countLabel: string;
}) {
  return (
    <PanelShell title={title} icon={icon} loading={loading} countLabel={countLabel}>
      {loading ? (
        <PanelLoadingRows />
      ) : items.length ? (
        <div className="space-y-5">
          {items.map((item, index) => (
            <article
              className="border-l-2 border-[color:var(--wireline-color-border-strong)] pl-3"
              key={`${item}-${index}`}
            >
              <p className="text-[var(--wireline-typography-body-size)] font-semibold leading-5 text-foreground">
                {item.split(/[:\n]/)[0]}
              </p>
              <p className="mt-1 line-clamp-5 text-[var(--wireline-typography-body-size)] leading-5 text-muted-foreground">
                {item.includes(":") ? item.slice(item.indexOf(":") + 1).trim() : item}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          density="compact"
          className="min-h-[220px] border-dashed"
          icon={icon}
          title="Nothing here yet"
          description={empty}
        />
      )}
    </PanelShell>
  );
}

function TonePanel({ personality, loading }: { personality?: string; loading: boolean }) {
  const traits = personality
    ? ["Professional", "Concise", "Helpful"]
    : ["Clear", "Direct", "Helpful"];

  return (
    <PanelShell
      title="Tone & personality"
      icon={<SlidersHorizontal size={16} />}
      loading={loading}
      countLabel={`${traits.length} traits`}
    >
      {loading ? (
        <PanelLoadingRows />
      ) : (
        <>
          <blockquote className="border-l-2 border-[color:var(--wireline-color-border-strong)] pl-3 text-[var(--wireline-typography-body-size)] italic leading-6 text-muted-foreground">
            {personality ||
              "Define how your assistant should sound. Keep it clear, confident, concise, and appropriate to every conversation."}
          </blockquote>
          <p className="mt-8 font-mono text-[var(--wireline-typography-overline-size)] font-medium uppercase tracking-[.05em] text-muted-foreground">
            Key traits
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
    </PanelShell>
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
      stale: false,
    },
    {
      id: 2,
      name: "Product Specs",
      type: "PDF",
      url: "product-v2.pdf",
      lastSync: "5 days ago",
      stale: true,
    },
    {
      id: 3,
      name: "Support Playbook",
      type: "Notion",
      url: "notion.so/playbook",
      lastSync: "10 mins ago",
      stale: false,
    },
  ];

  return (
    <PanelShell
      title="Sources & freshness"
      icon={<Database size={16} />}
      loading={loading}
      countLabel={`${sources.length} tracked`}
      action={
        <Button type="button" variant="secondary" size="sm" disabled>
          <Plus aria-hidden="true" size={14} />
          Add source
        </Button>
      }
    >
      {loading ? (
        <PanelLoadingRows />
      ) : (
        <div className="space-y-4">
          <StatusNotice tone="info" title="Source controls are staged next.">
            This panel shows freshness design states now. Connector-backed source management will
            replace these preview actions in the next knowledge pass.
          </StatusNotice>
          {sources.map((src) => (
            <article
              key={src.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 transition-colors hover:border-[color:var(--wireline-color-border-strong)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted font-mono text-[var(--wireline-typography-overline-size)] font-semibold text-muted-foreground">
                  {src.type}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[var(--wireline-typography-body-size)] font-semibold text-foreground">
                      {src.name}
                    </p>
                    <Badge variant={src.stale ? "warning" : "success"}>
                      {src.stale ? "Stale" : "Fresh"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[var(--wireline-typography-caption-size)] text-muted-foreground">
                    {src.url}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                <p className="text-[var(--wireline-typography-caption-size)] font-medium text-foreground">
                  Synced {src.lastSync}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-xs"
                  disabled
                >
                  Re-sync next
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

export default function KnowledgeWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<Config>({});
  const [kind, setKind] = useState<EntryKind>("knowledge");
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("");
  const [tags, setTags] = useState("");
  const [view, setView] = useState<View>("facts");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const agentId = params.get("agent") || agents[0]?.id || "";
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
      if (response.ok && payload && typeof payload === "object") {
        setConfig(payload as Config);
      } else {
        setLoadError("Knowledge could not be loaded right now.");
      }
    } catch {
      setLoadError("Knowledge could not be loaded right now.");
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

  function clearDraft() {
    setTitle("");
    setEntry("");
    setTags("");
    setSaveError(null);
  }

  const factsPanel = (
    <ItemsPanel
      title="Facts & preferences"
      icon={<Database size={16} />}
      items={facts}
      empty="Add preferences, routines, important details, and approved information your assistant can use."
      loading={loading}
      countLabel={`${facts.length} items`}
    />
  );
  const guidancePanel = (
    <ItemsPanel
      title="Guidance & handoff"
      icon={<ShieldCheck size={16} />}
      items={guidance}
      empty="Add the instructions and handoff preferences that shape each conversation."
      loading={loading}
      countLabel={guidance.length ? `${guidance.length} active` : "0 items"}
    />
  );
  const tonePanel = <TonePanel personality={config.personality} loading={loading} />;
  const sourcesPanel = <SourcesPanel loading={loading} />;

  const selected =
    view === "facts"
      ? factsPanel
      : view === "rules"
        ? guidancePanel
        : view === "tone"
          ? tonePanel
          : sourcesPanel;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end lg:hidden">
        <NativeSelect
          value={agentId}
          onChange={(event) => setParams({ agent: event.target.value })}
          className="max-w-[260px]"
          aria-label="Choose assistant"
        >
          {agents.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid shrink-0 grid-cols-4 overflow-hidden rounded-md border border-border bg-muted lg:hidden">
        {(["facts", "rules", "tone", "sources"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-selected={view === item}
            onClick={() => setView(item)}
            className={`min-h-10 border-r border-border px-3 text-[var(--wireline-typography-caption-size)] font-medium capitalize last:border-r-0 ${view === item ? "bg-card text-foreground" : "text-muted-foreground"}`}
          >
            {VIEW_LABELS[item]}
          </button>
        ))}
      </div>

      {loadError ? (
        <StatusNotice tone="warning" title="Knowledge is partially unavailable.">
          {loadError}
        </StatusNotice>
      ) : null}

      <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(170px,.85fr)_minmax(170px,.85fr)_minmax(180px,.9fr)_minmax(350px,1.65fr)] xl:gap-6">
        <div className="hidden min-h-0 xl:block">{factsPanel}</div>
        <div className="hidden min-h-0 xl:block">{guidancePanel}</div>
        <div className="hidden min-h-0 xl:flex xl:flex-col xl:gap-4">
          {tonePanel}
          {sourcesPanel}
        </div>
        <div className="min-h-0 xl:hidden">{selected}</div>

        <aside className="mt-4 flex min-h-[520px] flex-col rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)] xl:mt-0">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Plus size={19} className="text-foreground" />
            <div>
              <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.01em] text-foreground">
                Add a detail
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a fact, preference, or handoff preference.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 rounded-md bg-muted p-1">
            <button
              type="button"
              aria-selected={kind === "knowledge"}
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "knowledge" ? "bg-card text-foreground shadow-[0_1px_1px_rgba(93,63,211,.04)]" : "text-muted-foreground"}`}
              onClick={() => setKind("knowledge")}
            >
              Add fact
            </button>
            <button
              type="button"
              aria-selected={kind === "directive"}
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "directive" ? "bg-card text-foreground shadow-[0_1px_1px_rgba(93,63,211,.04)]" : "text-muted-foreground"}`}
              onClick={() => setKind("directive")}
            >
              Add guidance
            </button>
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
            <FormField
              label="Title"
              description={
                kind === "knowledge"
                  ? "Name the fact so it is easy to scan later."
                  : "Summarize the preference, instruction, or handoff."
              }
            >
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
              description={
                kind === "knowledge"
                  ? "Describe a fact, preference, routine, or policy clearly."
                  : "Explain how you want the assistant to handle this."
              }
              error={saveError ? saveError : undefined}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Textarea
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                className="mt-1 min-h-[180px] flex-1"
                resize="none"
                placeholder={
                  kind === "knowledge"
                    ? "Describe a fact, preference, routine, or policy clearly…"
                    : "Explain how you want the assistant to handle this…"
                }
              />
            </FormField>

            <FormField
              label="Tags"
              description="Optional comma-separated labels for future filtering and retrieval."
            >
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
            <Button type="button" variant="secondary" onClick={clearDraft}>
              <Trash2 aria-hidden="true" size={14} />
              Clear
            </Button>
            <Button type="button" disabled={!entry.trim() || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              Save {kind === "knowledge" ? "fact" : "guidance"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
