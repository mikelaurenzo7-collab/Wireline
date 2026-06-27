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

type View = "facts" | "guidance" | "tone" | "sources";
type EntryKind = "knowledge" | "directive";

const labels: Record<View, string> = {
  facts: "Facts",
  guidance: "Guidance",
  tone: "Tone",
  sources: "Sources",
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
    <article className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--wireline-elevation-sm)]">
      <header className="flex items-start gap-3 border-b border-border px-4 py-4 justify-center text-center">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
          {icon}
        </span>
        <div>
          <h2 className="text-[var(--wireline-typography-h3-size)] font-semibold leading-5 tracking-[-.02em] text-foreground text-center">
            {title}
          </h2>
          {meta ? (
            <p className="mt-1 font-mono text-[var(--wireline-typography-overline-size)] leading-4 text-muted-foreground text-center">
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
          className="min-h-[190px] border-dashed"
          icon={icon}
          title="Nothing here yet"
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
          <blockquote className="border-l-2 border-[color:var(--wireline-color-border-strong)] pl-3 text-[var(--wireline-typography-body-size)] italic leading-6 text-muted-foreground">
            {personality || "Clear. Confident. Concise."}
          </blockquote>
          <p className="mt-7 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.05em] text-muted-foreground">
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
    </Card>
  );
}

function SourcesCard({ loading }: { loading: boolean }) {
  return (
    <Card title="Sources" icon={<Database size={16} />} meta={loading ? "--" : "Upload panel"}>
      {loading ? (
        <LoadingRows />
      ) : (
        <div className="flex min-h-[190px] flex-col justify-center">
          <EmptyState
            density="compact"
            className="min-h-0 border-dashed"
            icon={<Database size={16} />}
            title="Sources live here"
            description="Ingest docs and images."
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
      empty="Facts. Preferences. Details."
      loading={loading}
      meta={`${facts.length} items`}
    />
  );
  const guidancePanel = (
    <ItemsCard
      title="Guidance & handoff"
      icon={<ShieldCheck size={16} />}
      items={guidance}
      empty="Rules. Handoffs. Preferences."
      loading={loading}
      meta={guidance.length ? `${guidance.length} active` : "0 items"}
    />
  );
  const tonePanel = <ToneCard personality={config.personality} loading={loading} />;
  const sourcesPanel = <SourcesCard loading={loading} />;
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
      <div className="flex shrink-0 items-center justify-end lg:hidden">
        <NativeSelect
          value={agentId}
          onChange={(event) =>
            setParams(
              (current) => {
                const updated = new URLSearchParams(current);
                updated.set("agent", event.target.value);
                return updated;
              },
              { replace: true },
            )
          }
          className="max-w-[260px]"
          aria-label="Choose agent"
        >
          {agents.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </NativeSelect>
      </div>
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

      <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(170px,.85fr)_minmax(170px,.85fr)_minmax(180px,.9fr)_minmax(350px,1.65fr)] xl:gap-6">
        <div className="hidden min-h-0 xl:block">{factsPanel}</div>
        <div className="hidden min-h-0 xl:block">{guidancePanel}</div>
        <div className="hidden min-h-0 xl:flex xl:flex-col xl:gap-4">
          {tonePanel}
          {sourcesPanel}
        </div>
        <div className="min-h-0 xl:hidden">{selected}</div>

        <aside className="mt-4 flex min-h-[480px] flex-col rounded-xl border border-border bg-card p-4 shadow-[var(--wireline-elevation-sm)] xl:mt-0">
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
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "knowledge" ? "bg-card text-foreground shadow-[var(--wireline-elevation-sm)]" : "text-muted-foreground"}`}
              onClick={() => setKind("knowledge")}
            >
              Add fact
            </button>
            <button
              type="button"
              aria-selected={kind === "directive"}
              className={`min-h-9 rounded-sm text-[var(--wireline-typography-body-size)] font-medium ${kind === "directive" ? "bg-card text-foreground shadow-[var(--wireline-elevation-sm)]" : "text-muted-foreground"}`}
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
                  ? "Name for easy scan."
                  : "Rule or handoff."
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
                  ? "Fact or detail."
                  : "How to handle."
              }
              error={saveError || undefined}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Textarea
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                className="mt-1 min-h-[180px] flex-1"
                resize="none"
                placeholder={
                  kind === "knowledge"
                    ? "Describe a fact, preference, routine, or policy clearly..."
                    : "Explain how you want the agent to handle this..."
                }
              />
            </FormField>
            <FormField
              label="Tags"
              description="Tags (optional)."
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
