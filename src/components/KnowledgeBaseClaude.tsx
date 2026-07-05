import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud } from "lucide-react";

import { authFetch, safeJson } from "../lib/api";
import { MetricTile } from "./atoms";

/**
 * KnowledgeBaseClaude — Claude Design Knowledge surface for the Training tab.
 *
 * Wireline tailoring: the prototype's Documents / FAQs / Scripts hero maps to
 * Wireline's real content types — Knowledge facts (uploads), Rules
 * (directives), and Tone (personality). The 3-stat row, document list, and
 * drop zone all bind to /api/agent-config and the asset ingestion endpoint.
 */

type ConfigKnowledgeRow = {
  id?: number | string;
  content?: string;
  source?: string;
  createdAt?: string;
};

type ConfigDirectiveRow = {
  id?: number | string;
  content?: string;
  priority?: number;
};

type AgentConfig = {
  knowledge?: ConfigKnowledgeRow[];
  directives?: ConfigDirectiveRow[];
  personality?: string | null;
};

type AssetBody = {
  fileName: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
};

const TEXT_HEX_DEEP = "var(--wireline-color-action-primary-pressed)";
const SUCCESS_SURFACE = "var(--wireline-color-feedback-success-surface)";

function fileBadge(content: string | undefined): string {
  if (!content) return "DOC";
  const trimmed = content.trim().toLowerCase();
  if (trimmed.endsWith(".pdf")) return "PDF";
  if (trimmed.endsWith(".csv")) return "CSV";
  if (trimmed.endsWith(".txt")) return "TXT";
  if (trimmed.endsWith(".md")) return "MD";
  return "DOC";
}

function entryHeadline(content: string | undefined, source: string | undefined): string {
  const fromSource = (source || "").trim();
  if (fromSource) return fromSource;
  const text = (content || "").trim();
  if (!text) return "Untitled entry";
  const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
  return firstLine.length > 64 ? `${firstLine.slice(0, 61)}…` : firstLine;
}

function entrySubtitle(content: string | undefined): string {
  const raw = (content || "").trim();
  if (!raw) return "Empty entry";
  const compact = raw.replace(/\s+/g, " ");
  const length = compact.length;
  return length > 90 ? `${compact.slice(0, 87)}…` : `${length} char${length === 1 ? "" : "s"}`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

async function readAsset(file: File): Promise<AssetBody> {
  const mimeType = file.type || "text/plain";
  if (/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    return { fileName: file.name, mimeType, dataUrl: await readAsDataUrl(file) };
  }
  return { fileName: file.name, mimeType, text: await file.text() };
}

export default function KnowledgeBaseClaude({ agentId }: { agentId: string }) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agentId) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AgentConfig | null) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, version]);

  async function ingest(files: FileList | File[]) {
    if (!agentId) {
      setError("Pick an agent before adding knowledge.");
      return;
    }
    const list = Array.from(files).slice(0, 5);
    if (!list.length || uploading) return;
    setUploading(true);
    setNotice(null);
    setError(null);
    try {
      const summaries: string[] = [];
      for (const file of list) {
        const payload = await readAsset(file);
        const response = await authFetch(
          `/api/agent-config/${encodeURIComponent(agentId)}/assets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const body = (await safeJson(response)) as { summary?: string; error?: string } | null;
        if (!response.ok) throw new Error(body?.error || `${file.name} could not be ingested.`);
        if (body?.summary) summaries.push(body.summary);
      }
      setNotice(summaries.length ? summaries.join(" ") : "Knowledge ingested.");
      setVersion((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Knowledge could not be ingested.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onFilePick(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files.length) void ingest(files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = event.dataTransfer?.files;
    if (files && files.length) void ingest(files);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave() {
    if (dragOver) setDragOver(false);
  }

  const knowledge = config?.knowledge ?? [];
  const directives = config?.directives ?? [];
  const hasPersonality = !!(config?.personality && config.personality.trim());

  const stats: Array<{ value: number; label: string }> = [
    { value: knowledge.length, label: "Knowledge" },
    { value: directives.length, label: "Rules" },
    { value: hasPersonality ? 1 : 0, label: "Tone" },
  ];

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !agentId}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: "var(--wireline-color-action-primary-default)",
            color: "var(--wireline-color-text-onAction)",
          }}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <span>+ Add document</span>}
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={onFilePick}
        accept=".pdf,.doc,.docx,.txt,.csv,.md,image/*"
      />

      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3" aria-label="Knowledge stats">
        {stats.map((stat, index) => (
          <MetricTile
            key={stat.label}
            label={stat.label}
            value={loading ? "—" : stat.value}
            reveal={((index % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            className="items-center text-center [&_.wl-metric-tile__value]:text-[2.25rem]"
          />
        ))}
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-[10px] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-4 py-2.5 text-[13px] text-[var(--wireline-color-status-error)]"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rounded-[10px] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-4 py-2.5 text-[13px] text-[var(--wireline-color-action-primary-pressed)]"
        >
          {notice}
        </div>
      ) : null}

      <section
        className="flex flex-col gap-2"
        aria-label="Ingested knowledge"
        aria-busy={loading ? "true" : undefined}
      >
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-[68px] animate-pulse rounded-[12px] bg-[var(--wireline-color-surface-subtle)]"
              />
            ))
          : knowledge.length === 0
            ? // Drop zone below already invites uploads — keep this row out of the
              // way when empty so the page reads as: stats -> upload, not
              // stats -> empty pill -> identical upload pill.
              null
            : knowledge.map((entry, index) => {
                const badge = fileBadge(entry.source);
                return (
                  <article
                    key={entry.id ?? `k-${index}`}
                    className="flex items-center gap-3.5 rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-5 py-4 transition-colors hover:border-[var(--wireline-color-action-primary-default)]"
                  >
                    <div
                      className="grid size-9 shrink-0 place-items-center rounded-[9px] font-[var(--wireline-font-mono)] text-[11px] font-bold"
                      style={{ background: SUCCESS_SURFACE, color: TEXT_HEX_DEEP }}
                    >
                      {badge}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                        {entryHeadline(entry.content, entry.source)}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--wireline-color-text-tertiary)]">
                        {entrySubtitle(entry.content)}
                      </div>
                    </div>
                    <span
                      className="rounded-[5px] px-2 py-1 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em]"
                      style={{
                        background: SUCCESS_SURFACE,
                        color: "var(--wireline-color-status-success)",
                      }}
                    >
                      Active
                    </span>
                  </article>
                );
              })}
      </section>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? "border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-container)]"
            : "border-[var(--wireline-color-border-strong)] bg-transparent hover:border-[var(--wireline-color-action-primary-default)] hover:bg-[var(--wireline-color-surface-subtle)]"
        }`}
      >
        <UploadCloud
          className="mb-2 size-5 text-[var(--wireline-color-text-tertiary)]"
          aria-hidden="true"
        />
        <div className="text-sm font-medium text-[var(--wireline-color-text-secondary)]">
          Drop files here or click to upload
        </div>
        <div className="mt-1 text-xs text-[var(--wireline-color-text-tertiary)]">
          PDF, DOCX, TXT, CSV — max 50 MB
        </div>
      </div>

      {directives.length > 0 ? (
        <section className="rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="wl-eyebrow">Active rules</div>
            <span className="text-[11px] font-medium text-[var(--wireline-color-action-primary-default)]">
              {directives.length} total
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {directives.slice(0, 5).map((directive, index) => (
              <div
                key={directive.id ?? `d-${index}`}
                className="rounded-[10px] border border-[var(--wireline-color-border-subtle)] px-3.5 py-2.5 text-xs leading-snug text-[var(--wireline-color-text-secondary)]"
              >
                <FileText
                  className="mr-1 inline size-3 text-[var(--wireline-color-action-primary-default)]"
                  aria-hidden="true"
                />
                {directive.content}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
