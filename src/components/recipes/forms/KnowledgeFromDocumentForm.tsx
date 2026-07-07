/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import React, { useEffect, useState } from "react";
import { ArrowRight, Check, FileText, FileUp, Loader2, Trash2, Zap } from "lucide-react";
import { authFetch } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { FormShell, Field, TextInput, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { Input } from "../../ui/shadcn/Input";
import { ShadButton } from "../../ui/shadcn/ShadButton";

export function KnowledgeFromDocumentForm({
  agents,
  agentId: initAgent,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent ?? agents[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [agentContext, setAgentContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
      setErr("Please choose a PDF file.");
      return;
    }
    if (f.size > 32 * 1024 * 1024) {
      setErr(`PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB — the per-file limit is 32 MB.`);
      return;
    }
    setErr(null);
    setFile(f);
    setResult(null);
    setApplied(null);
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    onFile({ target: { files: [f] } } as any);
  };

  const fileToBase64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        const idx = r.indexOf(",");
        resolve(idx >= 0 ? r.slice(idx + 1) : r);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    setSelected(new Set());
    setApplied(null);
    try {
      const pdfBase64 = await fileToBase64(file);
      const r = await authFetch("/api/claude/knowledge-from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, fileName: file.name, agentContext }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
      setSelected(new Set((data.entries || []).map((_: any, i: number) => i)));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
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
    if (!result) return;
    if (selected.size === result.entries.length) setSelected(new Set());
    else setSelected(new Set(result.entries.map((_: any, i: number) => i)));
  };

  return (
    <FormShell>
      {!result ? (
        <>
          <Field
            label="Document"
            hint="PDF up to 32 MB. Brochures, menus, FAQ docs, policies, price sheets — anything customer-facing."
          >
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="relative flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-md wl-panel border-2 border-dashed border-white/15 hover:border-brand/40 transition-all cursor-pointer text-center"
            >
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={onFile}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {file ? (
                <>
                  <div className="w-12 h-12 rounded-md wl-panel border border-brand/30 flex items-center justify-center text-brand">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground leading-tight">{file.name}</p>
                    <p className="wl-label-muted">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · ready
                    </p>
                  </div>
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disableAnimations
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      setResult(null);
                      setApplied(null);
                    }}
                    className="relative z-10 h-auto px-0 wl-label text-rose-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </ShadButton>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-md wl-panel border border-white/10 flex items-center justify-center text-brand">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-foreground/85">
                      Drop a PDF here, or click to choose
                    </p>
                    <p className="wl-label-muted">Up to 32 MB · Wireline AI reads it natively</p>
                  </div>
                </>
              )}
            </label>
          </Field>
          <Field
            label="Agent Context (optional)"
            hint="What's this agent's job? Helps Wireline AI prioritize relevant facts."
          >
            <TextInput
              value={agentContext}
              onChange={setAgentContext}
              placeholder="Sales and support agent for onboarding, scheduling, and follow-up."
            />
          </Field>
          <RunButton
            onClick={run}
            loading={loading}
            disabled={disabled || !file}
            label="Read & Extract"
          />
        </>
      ) : (
        <div className="flex items-center justify-between mb-2">
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={() => {
              setResult(null);
              setApplied(null);
            }}
            className="h-auto px-0 wl-label-muted hover:text-brand"
          >
            ← Back to Upload
          </ShadButton>
        </div>
      )}

      {err && <ErrCard error={err} />}
      {result && (
        <div className="space-y-4 pt-1">
          <ResultCard title="Document Summary">
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
            className="w-full min-h-12 py-4 text-[var(--wireline-typography-caption-size)] tracking-[0.32em] uppercase"
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
