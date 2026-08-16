/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useEffect, useState } from "react";
import { ArrowRight, Check, Globe, Loader2, Zap } from "lucide-react";
import { authFetch } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { FormShell, Field, TextInput, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { ShadButton } from "../../ui/shadcn/ShadButton";

export function KnowledgeFromUrlForm({
  agents,
  agentId: initAgent,
  initial,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  initial?: any;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent ?? agents[0]?.id ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [agentContext, setAgentContext] = useState("");
  const [crawl, setCrawl] = useState(false);
  const [maxPages, setMaxPages] = useState(8);
  const [loading, setLoading] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const pollJobUntilDone = async (jobId: string) => {
    const deadline = Date.now() + 8 * 60 * 1000;
    let kicked = false;
    while (Date.now() < deadline) {
      if (!kicked) {
        await authFetch(`/api/jobs/${jobId}/run`, { method: "POST" });
        kicked = true;
      }
      const pollRes = await authFetch(`/api/jobs/${jobId}`);
      const pollBody = await pollRes.json();
      if (!pollRes.ok) throw new Error(pollBody.error || "Failed to check crawl status");
      const status = pollBody.job?.status as string;
      if (status === "done") return pollBody.job?.result;
      if (status === "failed" || status === "dead") {
        throw new Error(pollBody.job?.error || "Site crawl failed");
      }
      setCrawlProgress(
        status === "running" ? "Crawling pages and extracting facts…" : "Queued. Starting crawl…",
      );
      await sleep(2500);
      if (status === "pending") {
        await authFetch(`/api/jobs/${jobId}/run`, { method: "POST" });
      }
    }
    throw new Error("Crawl timed out. Check back in a few minutes or try fewer pages.");
  };

  const run = async () => {
    setLoading(true);
    setErr(null);
    setCrawlProgress(null);
    setResult(null);
    setSelected(new Set());
    setApplied(null);
    try {
      let data: any;
      if (crawl) {
        const enqueueRes = await authFetch("/api/jobs/knowledge-crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, agentContext, maxPages, maxEntries: 20 }),
        });
        const enqueueBody = await enqueueRes.json();
        if (!enqueueRes.ok) throw new Error(enqueueBody.error);
        if (!enqueueBody.jobId) throw new Error("Crawl job was not created");
        setCrawlProgress("Queued. Starting crawl…");
        data = await pollJobUntilDone(enqueueBody.jobId);
      } else {
        const r = await authFetch("/api/claude/knowledge-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, agentContext, maxPages: 1 }),
        });
        data = await r.json();
        if (!r.ok) {
          if (r.status === 504 || String(data.error || "").includes("timeout")) {
            const enqueueRes = await authFetch("/api/jobs/knowledge-crawl", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, agentContext, maxPages: 1, maxEntries: 12 }),
            });
            const enqueueBody = await enqueueRes.json();
            if (!enqueueRes.ok) throw new Error(enqueueBody.error);
            setCrawlProgress("Single-page fetch running in background…");
            data = await pollJobUntilDone(enqueueBody.jobId);
          } else {
            throw new Error(data.error);
          }
        }
      }
      if (!data?.entries?.length) {
        throw new Error(
          "No knowledge entries extracted. Try a different URL or add agent context.",
        );
      }
      setResult(data);
      setSelected(new Set((data.entries || []).map((_: any, i: number) => i)));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setCrawlProgress(null);
    }
  };

  const apply = async () => {
    if (!agentId || !result) return;
    setApplying(true);
    try {
      const entries = result.entries.filter((_: any, i: number) => selected.has(i));
      const r = await authFetch("/api/claude/knowledge-from-url/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, entries }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setApplied(data.inserted);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setApplying(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === result.entries.length) setSelected(new Set());
    else setSelected(new Set(result.entries.map((_: any, i: number) => i)));
  };

  return (
    <FormShell>
      <Field
        label="URL"
        hint={
          crawl
            ? "Root URL. Wireline AI follows nav links from here."
            : "A homepage, services page, FAQ, pricing page. Anything customer-facing."
        }
      >
        <TextInput
          value={url}
          onChange={setUrl}
          placeholder={crawl ? "https://acme.co" : "https://acme.co/services"}
        />
      </Field>

      {/* Crawl mode toggle */}
      <div className="rounded-md wl-panel border border-white/10 p-4 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-brand" />
            <div>
              <div className="text-sm text-foreground">Crawl whole site</div>
              <div className="wl-label-muted">
                {crawl ? `Follow nav links · up to ${maxPages} pages` : "Single page only"}
              </div>
            </div>
          </div>
          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={() => setCrawl(!crawl)}
            aria-pressed={crawl}
            className={cn(
              "relative w-11 h-6 min-h-0 p-0 rounded-full shrink-0 hover:bg-transparent",
              crawl ? "bg-brand" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-card transition-all",
                crawl ? "left-[22px]" : "left-0.5",
              )}
            />
          </ShadButton>
        </label>
        {crawl && (
          <div className="flex items-center gap-3 pt-1">
            <span className="wl-label-muted shrink-0">Max pages</span>
            <div className="flex gap-2">
              {[5, 8, 12, 20, 25].map((n) => (
                <ShadButton
                  key={n}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  onClick={() => setMaxPages(n)}
                  className={cn(
                    "h-auto px-3 py-1.5 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.25em]",
                    maxPages === n
                      ? "bg-brand/20 text-brand border border-brand/40"
                      : "wl-panel border border-white/10 text-muted hover:text-foreground",
                  )}
                >
                  {n}
                </ShadButton>
              ))}
            </div>
          </div>
        )}
      </div>

      <Field
        label="Agent Context (optional)"
        hint="What's this agent's job? Helps Wireline AI prioritize relevant facts."
      >
        <TextInput
          value={agentContext}
          onChange={setAgentContext}
          placeholder="Sales/support agent that answers FAQs, routes requests, and books follow-ups."
        />
      </Field>
      <RunButton
        onClick={run}
        loading={loading}
        disabled={disabled || !url}
        label={crawl ? `Crawl ${maxPages} pages` : "Fetch & Extract"}
      />

      {crawlProgress && (
        <div className="rounded-md wl-panel border border-brand/30 p-4 flex items-center gap-3 text-sm text-foreground/80">
          <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
          <span>{crawlProgress}</span>
        </div>
      )}
      {err && <ErrCard error={err} />}
      {result && (
        <div className="space-y-4 pt-3">
          <ResultCard title="Page Summary">
            <p>{result.page_summary}</p>
          </ResultCard>
          <div className="rounded-md wl-panel border border-white/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="wl-label text-brand">
                Extracted · {selected.size}/{result.entries.length} selected
              </h4>
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={toggleAll}
                className="h-auto px-0 wl-label-muted hover:text-brand"
              >
                {selected.size === result.entries.length ? "Deselect All" : "Select All"}
              </ShadButton>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
              {result.entries.map((e: any, i: number) => {
                const isSel = selected.has(i);
                return (
                  <ShadButton
                    key={i}
                    type="button"
                    variant="ghost"
                    disableAnimations
                    onClick={() =>
                      setSelected((s) => {
                        const ns = new Set(s);
                        if (ns.has(i)) ns.delete(i);
                        else ns.add(i);
                        return ns;
                      })
                    }
                    className={cn(
                      "w-full h-auto justify-start text-left rounded-md p-3 flex items-start gap-3 border",
                      isSel
                        ? "bg-brand/10 border-brand/40"
                        : "bg-black/20 border-white/8 hover:border-white/20",
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-all",
                        isSel ? "bg-brand border-brand text-on-brand" : "border-white/30",
                      )}
                    >
                      {isSel && <Check className="w-3 h-3" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground/90">{e.fact}</div>
                      <div className="wl-label-muted mt-1">{e.category}</div>
                    </div>
                  </ShadButton>
                );
              })}
            </div>
          </div>
          <Field label="Apply to Agent">
            <Select
              value={agentId}
              onChange={setAgentId}
              options={agents.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <ShadButton
            type="button"
            variant="editorial"
            disableAnimations
            onClick={apply}
            disabled={!agentId || applying || selected.size === 0}
            className="w-full min-h-12 py-4 text-[length:var(--wireline-typography-caption-size)] tracking-[0.32em] uppercase"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Applying…
              </>
            ) : applied ? (
              <>
                <Check className="w-4 h-4" /> Applied {applied} entries
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Apply {selected.size} Entries{" "}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </ShadButton>
        </div>
      )}
    </FormShell>
  );
}
