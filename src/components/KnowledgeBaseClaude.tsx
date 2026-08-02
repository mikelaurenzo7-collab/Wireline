import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { FileText, Loader2, UploadCloud } from "lucide-react";

import { authFetch, safeJson } from "../lib/api";
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  KNOWLEDGE_ASSET_MAX_FILES,
  KNOWLEDGE_ASSET_MAX_LABEL,
  knowledgeAssetFileCountNotice,
  knowledgeAssetTooLargeMessage,
} from "../lib/knowledge-asset-limits";
import { emitProductEvent } from "../lib/product-event-client";
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
// Mirrors the directives cap below — keeps the list readable for customers
// with hundreds of ingested documents instead of rendering every row.
const KNOWLEDGE_VISIBLE_CAP = 8;

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

function ruleHeadline(content: string | undefined): string {
  const text = (content || "").trim();
  if (!text) return "Rule";
  const colon = text.indexOf(":");
  if (colon > 0 && colon < 56) return text.slice(0, colon);
  const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
  return firstLine.length > 56 ? `${firstLine.slice(0, 53)}…` : firstLine;
}

function ruleBody(content: string | undefined, headline: string): string | null {
  const text = (content || "").trim();
  if (!text) return null;
  if (text.startsWith(headline)) {
    const rest = text.slice(headline.length).replace(/^:\s*/, "").trim();
    return rest || null;
  }
  return text;
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
  // Checked before the file is read, because nothing downstream reports this
  // honestly: the API body limit answers a bare "request entity too large", and
  // the drop zone used to advertise a ceiling more than ten times what the
  // request could actually carry.
  if (file.size > KNOWLEDGE_ASSET_MAX_BYTES) {
    throw new Error(knowledgeAssetTooLargeMessage(file.name, file.size));
  }
  const mimeType = (file.type || "text/plain").toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    return { fileName: file.name, mimeType, dataUrl: await readAsDataUrl(file) };
  }
  const name = file.name.toLowerCase();
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    mimeType.includes("pdf") ||
    mimeType.includes("msword") ||
    mimeType.includes("wordprocessingml")
  ) {
    throw new Error(
      `${file.name} is not supported yet. Upload TXT, MD, CSV, or a PNG/JPG/WEBP/GIF image.`,
    );
  }
  if (
    !mimeType.startsWith("text/") &&
    !name.endsWith(".txt") &&
    !name.endsWith(".md") &&
    !name.endsWith(".csv") &&
    !name.endsWith(".markdown")
  ) {
    throw new Error(
      `${file.name} is not a supported text or image type. Use TXT, MD, CSV, PNG, JPG, WEBP, or GIF.`,
    );
  }
  return { fileName: file.name, mimeType: mimeType || "text/plain", text: await file.text() };
}

export default function KnowledgeBaseClaude({ agentId }: { agentId: string }) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Loading and ingesting need separate error slots. They shared one, and the
  // refetch that follows a successful upload clears it on the way out — so an
  // upload that partly failed had its message wiped by its own refresh before
  // the user could read it. A failed load is the more fundamental problem, so
  // it wins when somehow both are set.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const error = loadError || ingestError;
  const [showAllKnowledge, setShowAllKnowledge] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Switching voice agents should not carry over an expanded list from a
    // different (possibly much longer) knowledge base.
    setShowAllKnowledge(false);
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setConfig(null);
      setLoading(false);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await safeJson(response)) as { error?: string } | null;
          throw new Error(body?.error || "Knowledge could not be loaded.");
        }
        return response.json() as Promise<AgentConfig>;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((reason) => {
        if (!cancelled) {
          setConfig(null);
          setLoadError(reason instanceof Error ? reason.message : "Knowledge could not be loaded.");
        }
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
      setIngestError("Choose a voice agent before adding knowledge.");
      return;
    }
    const picked = Array.from(files);
    const list = picked.slice(0, KNOWLEDGE_ASSET_MAX_FILES);
    if (!list.length || uploading) return;
    setUploading(true);
    setNotice(null);
    setIngestError(null);

    const summaries: string[] = [];
    let ingested = 0;
    let failure: string | null = null;

    try {
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
        ingested += 1;
        if (body?.summary) summaries.push(body.summary);
        emitProductEvent({
          event: "training_asset_added",
          agentId,
          metadata: {
            source: "knowledge_upload",
            file_name: file.name,
            mime_type: payload.mimeType,
          },
        });
      }
    } catch (reason) {
      failure = reason instanceof Error ? reason.message : "Knowledge could not be ingested.";
    }

    // A failure part-way through a batch used to discard the whole run: the
    // files already ingested were left out of the notice and the list was never
    // refetched, so the screen claimed nothing had been saved while the server
    // held the opposite. Report whatever landed before reporting what did not.
    if (ingested > 0) {
      setNotice(summaries.length ? summaries.join(" ") : "Knowledge ingested.");
      setVersion((value) => value + 1);
    }
    // Files past the per-batch cap were being dropped without a word.
    const problems = [failure, knowledgeAssetFileCountNotice(picked.length)].filter(Boolean);
    setIngestError(problems.length ? problems.join(" ") : null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
  const compactUpload = knowledge.length === 0 && directives.length > 0;

  const stats: Array<{ value: number; label: string }> = [
    // "Entries", not "Knowledge" — the page title directly above already says
    // KNOWLEDGE, and this counts entries in the base.
    { value: knowledge.length, label: "Entries" },
    { value: directives.length, label: "Rules" },
    { value: hasPersonality ? 1 : 0, label: "Tone" },
  ];

  const activeRulesPanel =
    directives.length > 0 ? (
      <section className="wl-paper wl-paper-elevated p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="wl-eyebrow">Active rules</div>
          <span className="text-[11px] font-medium text-[var(--wireline-color-action-primary-default)]">
            {directives.length} total
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {directives.slice(0, 5).map((directive, index) => {
            const headline = ruleHeadline(directive.content);
            const body = ruleBody(directive.content, headline);
            return (
              <div
                key={directive.id ?? `d-${index}`}
                className="rounded-[10px] border border-[var(--wireline-color-border-soft)] px-3.5 py-2.5"
              >
                <p className="text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                  <FileText
                    className="mr-1.5 inline size-3.5 text-[var(--wireline-color-action-primary-default)]"
                    aria-hidden="true"
                  />
                  {headline}
                </p>
                {body ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">
                    {body}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const uploadTrigger = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading || !agentId}
      className="inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-[8px] px-3.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: "var(--wireline-color-action-primary-default)",
        color: "var(--wireline-color-text-onAction)",
      }}
    >
      {uploading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Uploading…
        </>
      ) : (
        "Choose files"
      )}
    </button>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        // Visually hidden but still in the accessibility tree, so it needs a
        // name of its own: axe reports an unlabelled control otherwise, and a
        // screen reader announces only "file upload button".
        aria-label="Upload knowledge files"
        className="sr-only"
        onChange={onFilePick}
        accept=".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"
      />

      <section className="grid grid-cols-3 gap-2 sm:gap-3.5" aria-label="Knowledge stats">
        {stats.map((stat, index) => (
          <MetricTile
            key={stat.label}
            label={stat.label}
            value={loading ? "—" : stat.value}
            reveal={((index % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            className="wl-metric-tile--compact min-w-0 items-center px-2 text-center [&_.wl-metric-tile__label]:text-[9px] [&_.wl-metric-tile__label]:tracking-[0.08em]"
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
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-[68px] animate-pulse rounded-[12px] bg-[var(--wireline-color-surface-subtle)]"
            />
          ))
        ) : knowledge.length === 0 ? null : ( // stats -> empty pill -> identical upload pill. // way when empty so the page reads as: stats -> upload, not // Drop zone below already invites uploads — keep this row out of the
          <>
            <div className="mb-1 flex items-center justify-between">
              <div className="wl-eyebrow">Ingested knowledge</div>
              <span className="text-[11px] font-medium text-[var(--wireline-color-action-primary-default)]">
                {knowledge.length} total
              </span>
            </div>
            {(showAllKnowledge ? knowledge : knowledge.slice(0, KNOWLEDGE_VISIBLE_CAP)).map(
              (entry, index) => {
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
              },
            )}
            {knowledge.length > KNOWLEDGE_VISIBLE_CAP ? (
              <button
                type="button"
                onClick={() => setShowAllKnowledge((value) => !value)}
                className="self-start text-[12px] font-semibold text-[var(--wireline-color-action-primary-default)] hover:underline"
              >
                {showAllKnowledge ? "Show less" : `Show all ${knowledge.length}`}
              </button>
            ) : null}
          </>
        )}
      </section>

      {compactUpload ? activeRulesPanel : null}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`flex rounded-[12px] border-2 border-dashed text-center transition-colors ${
          compactUpload
            ? "min-h-[72px] flex-col items-stretch justify-center gap-3 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-start sm:gap-4 sm:px-5"
            : knowledge.length === 0
              ? "min-h-[96px] flex-col items-center justify-center px-6 py-5"
              : "min-h-[120px] flex-col items-center justify-center px-6 py-8"
        } ${
          dragOver
            ? "border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-container)]"
            : "border-[var(--wireline-color-border-strong)] bg-transparent hover:border-[var(--wireline-color-action-primary-default)] hover:bg-[var(--wireline-color-surface-subtle)]"
        }`}
      >
        <UploadCloud
          className={`shrink-0 text-[var(--wireline-color-text-tertiary)] ${compactUpload ? "size-4" : "mb-2 size-5"}`}
          aria-hidden="true"
        />
        <div className={compactUpload ? "min-w-0 flex-1" : undefined}>
          <div className="text-sm font-medium text-[var(--wireline-color-text-secondary)]">
            Add documents
          </div>
          <div
            className={`text-xs text-[var(--wireline-color-text-tertiary)] ${compactUpload ? "mt-0.5" : "mt-1"}`}
          >
            TXT, MD, CSV, or images (PNG, JPG, WEBP, GIF) — max {KNOWLEDGE_ASSET_MAX_LABEL} per file
          </div>
        </div>
        <div
          className={
            compactUpload ? "shrink-0 [&>button]:w-full sm:[&>button]:w-auto" : "mt-3 shrink-0"
          }
        >
          {uploadTrigger}
        </div>
      </div>

      {!compactUpload ? activeRulesPanel : null}
    </div>
  );
}
