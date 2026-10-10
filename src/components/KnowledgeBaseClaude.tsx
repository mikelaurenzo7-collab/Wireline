import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, FileText, Loader2, Pencil, Trash2, UploadCloud, X } from "lucide-react";

import { authFetch, safeJson } from "../lib/api";
import { OPENING_GREETING_PREFIX } from "../lib/agent-greeting";
import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  KNOWLEDGE_ASSET_MAX_FILES,
  KNOWLEDGE_ASSET_MAX_LABEL,
  knowledgeAssetFileCountNotice,
  knowledgeAssetTooLargeMessage,
} from "../lib/knowledge-asset-limits";
import { emitProductEvent } from "../lib/product-event-client";
import { Button } from "./atoms";

/**
 * KnowledgeBaseClaude — Claude Design Knowledge surface for the Training tab.
 *
 * Wireline tailoring: the prototype's Documents / FAQs / Scripts hero maps to
 * Wireline's real content types — Knowledge facts (uploads), Rules
 * (directives), and Tone (personality). The summary, document list, and
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
  capabilities?: { image_uploads?: boolean };
};

type AssetBody = {
  fileName: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
};

// Success text belongs to the success token. The violet action token read
// 3.95:1 on the green surface at 11px and broke the color grammar.
const SUCCESS_TEXT = "var(--wireline-color-status-success)";
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

function boundedPreview(text: string, limit: number): { prefix: string; label: string } {
  if (text.length <= limit) return { prefix: text, label: text };
  const candidate = text.slice(0, limit);
  const lastWord = candidate.search(/\s+\S*$/);
  const prefix =
    /\s/.test(text[limit]) || lastWord < 0 ? candidate.trimEnd() : candidate.slice(0, lastWord);
  return { prefix, label: `${prefix}${/[.!?…]$/.test(prefix) ? "" : "…"}` };
}

function entryHeadline(content: string | undefined, source: string | undefined): string {
  const fromSource = (source || "").trim();
  if (fromSource) return boundedPreview(fromSource, 64).label;
  const text = (content || "").trim();
  if (!text) return "Untitled Entry";
  const firstLine = (text.split(/\r?\n/)[0]?.trim() || text).replace(/\s+/g, " ");
  return boundedPreview(firstLine, 64).label;
}

function ruleHeadline(content: string | undefined): string {
  const text = (content || "").trim();
  if (!text) return "Rule";
  const colon = text.indexOf(":");
  if (colon > 0 && colon < 56) return text.slice(0, colon);
  const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
  // Free-text rules have no separate title. Keep their words intact instead of
  // treating a character-limit remainder as a second paragraph.
  return firstLine;
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

function entrySubtitle(content: string | undefined, source: string | undefined): string | null {
  const raw = (content || "").trim();
  if (!raw) return "Empty entry";
  const compact = raw.replace(/\s+/g, " ");
  if (source?.trim()) return boundedPreview(compact, 90).label;
  // Track the actual consumed prefix rather than stripping an ellipsis that
  // might belong to the original text. Never continue part-way through a word.
  const firstLine = (raw.split(/\r?\n/)[0]?.trim() || raw).replace(/\s+/g, " ");
  const { prefix } = boundedPreview(firstLine, 64);
  const remainder = compact.slice(prefix.length);
  if (/^\s/.test(remainder) && remainder.trim()) {
    return boundedPreview(remainder.trim(), 90).label;
  }
  return null;
}

function knowledgeRowId(entry: ConfigKnowledgeRow): string | null {
  if (typeof entry.id === "number" && Number.isSafeInteger(entry.id) && entry.id > 0) {
    return String(entry.id);
  }
  if (typeof entry.id !== "string") return null;
  const normalized = entry.id.trim();
  return /^\d+$/.test(normalized) && normalized !== "0" ? normalized : null;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

async function readAsset(file: File, imageUploadsAvailable: boolean): Promise<AssetBody> {
  // Checked before the file is read, because nothing downstream reports this
  // honestly: the API body limit answers a bare "request entity too large", and
  // the drop zone used to advertise a ceiling more than ten times what the
  // request could actually carry.
  if (file.size > KNOWLEDGE_ASSET_MAX_BYTES) {
    throw new Error(knowledgeAssetTooLargeMessage(file.name, file.size));
  }
  const mimeType = (file.type || "text/plain").toLowerCase();
  if (
    !imageUploadsAvailable &&
    (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name))
  ) {
    throw new Error("Image uploads are unavailable. Upload TXT, MD or CSV.");
  }
  if (/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    return { fileName: file.name, mimeType, dataUrl: await readAsDataUrl(file) };
  }
  const name = file.name.toLowerCase();
  const supportedTypes = imageUploadsAvailable
    ? "TXT, MD, CSV, PNG, JPG, WEBP or GIF"
    : "TXT, MD or CSV";
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    mimeType.includes("pdf") ||
    mimeType.includes("msword") ||
    mimeType.includes("wordprocessingml")
  ) {
    throw new Error(`${file.name} is not supported yet. Upload ${supportedTypes}.`);
  }
  if (
    !mimeType.startsWith("text/") &&
    !name.endsWith(".txt") &&
    !name.endsWith(".md") &&
    !name.endsWith(".csv") &&
    !name.endsWith(".markdown")
  ) {
    throw new Error(`${file.name} is not supported. Upload ${supportedTypes}.`);
  }
  return { fileName: file.name, mimeType: mimeType || "text/plain", text: await file.text() };
}

export default function KnowledgeBaseClaude({
  agentId,
  externallyBusy = false,
  onInteractionChange,
}: {
  agentId: string;
  externallyBusy?: boolean;
  onInteractionChange?: (busy: boolean) => void;
}) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const imageUploadsAvailable = config?.capabilities?.image_uploads === true;
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
  const [entryError, setEntryError] = useState<string | null>(null);
  const error = loadError || entryError || ingestError;
  const [showAllKnowledge, setShowAllKnowledge] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState("");
  const [knowledgeBusyId, setKnowledgeBusyId] = useState<string | null>(null);
  const [confirmDeleteKnowledgeId, setConfirmDeleteKnowledgeId] = useState<string | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const removeRuleButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeAgentIdRef = useRef(agentId);
  const agentScopeRevisionRef = useRef(0);
  const agentOperationControllersRef = useRef(new Set<AbortController>());
  const entryMutationPending =
    externallyBusy || uploading || loading || Boolean(knowledgeBusyId) || Boolean(ruleBusyId);
  const entryEditorOpen =
    Boolean(editingKnowledgeId) ||
    Boolean(editingRuleId) ||
    Boolean(confirmDeleteKnowledgeId) ||
    Boolean(confirmDeleteRuleId);
  useLayoutEffect(() => {
    onInteractionChange?.(
      uploading || loading || Boolean(knowledgeBusyId) || Boolean(ruleBusyId) || entryEditorOpen,
    );
  }, [uploading, loading, knowledgeBusyId, ruleBusyId, entryEditorOpen, onInteractionChange]);

  useLayoutEffect(() => {
    const operationControllers = agentOperationControllersRef.current;
    activeAgentIdRef.current = agentId;
    agentScopeRevisionRef.current += 1;
    for (const controller of operationControllers) controller.abort();
    operationControllers.clear();

    // Switching Bots must clear both the visible data and every mutation state
    // before paint. A late upload/edit/delete response from the previous Bot is
    // fenced by the scope revision captured when that operation began.
    setConfig(null);
    setLoading(Boolean(agentId));
    setUploading(false);
    setDragOver(false);
    setNotice(null);
    setLoadError(null);
    setIngestError(null);
    setShowAllKnowledge(false);
    setShowAllRules(false);
    setEditingRuleId(null);
    setRuleDraft("");
    setRuleBusyId(null);
    setConfirmDeleteRuleId(null);
    setEditingKnowledgeId(null);
    setKnowledgeDraft("");
    setKnowledgeBusyId(null);
    setConfirmDeleteKnowledgeId(null);
    setEntryError(null);
    removeButtonRefs.current.clear();
    removeRuleButtonRefs.current.clear();
    if (fileInputRef.current) fileInputRef.current.value = "";

    return () => {
      agentScopeRevisionRef.current += 1;
      for (const controller of operationControllers) controller.abort();
      operationControllers.clear();
    };
  }, [agentId]);

  const startAgentOperation = useCallback(() => {
    const requestedAgentId = agentId;
    const scopeRevision = agentScopeRevisionRef.current;
    const controller = new AbortController();
    agentOperationControllersRef.current.add(controller);
    return {
      requestedAgentId,
      controller,
      isCurrent: () =>
        !controller.signal.aborted &&
        activeAgentIdRef.current === requestedAgentId &&
        agentScopeRevisionRef.current === scopeRevision,
      finish: () => agentOperationControllersRef.current.delete(controller),
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setConfig(null);
      setLoading(false);
      setLoadError(null);
      return;
    }
    const operation = startAgentOperation();
    setLoading(true);
    setLoadError(null);
    authFetch(`/api/agent-config/${encodeURIComponent(operation.requestedAgentId)}`, {
      signal: operation.controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await safeJson(response)) as { error?: string } | null;
          throw new Error(body?.error || "Knowledge could not be loaded.");
        }
        return response.json() as Promise<AgentConfig>;
      })
      .then((data) => {
        if (operation.isCurrent()) setConfig(data);
      })
      .catch((reason) => {
        if (operation.isCurrent()) {
          setConfig(null);
          setLoadError(reason instanceof Error ? reason.message : "Knowledge could not be loaded.");
        }
      })
      .finally(() => {
        if (operation.isCurrent()) setLoading(false);
        operation.finish();
      });
    return () => {
      operation.controller.abort();
      operation.finish();
    };
  }, [agentId, startAgentOperation, version]);

  async function ingest(files: FileList | File[]) {
    if (!agentId) {
      setIngestError("Choose a Bot before adding knowledge.");
      return;
    }
    if (editingRuleId || ruleBusyId || confirmDeleteRuleId) {
      setEntryError("Finish editing or removing the rule before uploading files.");
      return;
    }
    if (editingKnowledgeId || knowledgeBusyId || confirmDeleteKnowledgeId) {
      setEntryError("Finish editing or removing the knowledge entry before uploading files.");
      return;
    }
    const picked = Array.from(files);
    const list = picked.slice(0, KNOWLEDGE_ASSET_MAX_FILES);
    if (!list.length || entryMutationPending) return;
    const operation = startAgentOperation();
    setUploading(true);
    setNotice(null);
    setEntryError(null);
    setIngestError(null);

    const summaries: string[] = [];
    let ingested = 0;
    let failure: string | null = null;

    try {
      try {
        for (const file of list) {
          const payload = await readAsset(file, imageUploadsAvailable);
          if (!operation.isCurrent()) return;
          const response = await authFetch(
            `/api/agent-config/${encodeURIComponent(operation.requestedAgentId)}/assets`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: operation.controller.signal,
            },
          );
          const body = (await safeJson(response)) as { summary?: string; error?: string } | null;
          if (!response.ok) throw new Error(body?.error || `${file.name} could not be ingested.`);
          if (!operation.isCurrent()) return;
          ingested += 1;
          if (body?.summary) summaries.push(body.summary);
          emitProductEvent({
            event: "training_asset_added",
            agentId: operation.requestedAgentId,
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

      if (!operation.isCurrent()) return;
      // A failure part-way through a batch used to discard the whole run: the
      // files already ingested were left out of the notice and the list was never
      // refetched, so the screen claimed nothing had been saved while the server
      // held the opposite. Report whatever landed before reporting what did not.
      if (ingested > 0) {
        setNotice(summaries.length ? summaries.join(" ") : "Knowledge ingested.");
        // Prevent a rule edit until the post-ingestion snapshot has arrived.
        setLoading(true);
        setVersion((value) => value + 1);
      }
      // Files past the per-batch cap were being dropped without a word.
      const problems = [failure, knowledgeAssetFileCountNotice(picked.length)].filter(Boolean);
      setIngestError(problems.length ? problems.join(" ") : null);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      operation.finish();
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

  function beginKnowledgeEdit(entry: ConfigKnowledgeRow) {
    if (entryMutationPending || entryEditorOpen) return;
    const rowId = knowledgeRowId(entry);
    if (!rowId) return;
    setEditingKnowledgeId(rowId);
    setKnowledgeDraft(entry.content || "");
    setConfirmDeleteKnowledgeId(null);
    setEntryError(null);
    setNotice(null);
  }

  function cancelKnowledgeEdit() {
    if (knowledgeBusyId) return;
    setEditingKnowledgeId(null);
    setKnowledgeDraft("");
    setEntryError(null);
  }

  function beginKnowledgeRemoval(rowId: string) {
    if (entryMutationPending || entryEditorOpen) return;
    setEditingKnowledgeId(null);
    setKnowledgeDraft("");
    setConfirmDeleteKnowledgeId(rowId);
    setEntryError(null);
    setNotice(null);
    requestAnimationFrame(() => confirmDeleteCancelRef.current?.focus());
  }

  function cancelKnowledgeRemoval(rowId: string) {
    if (knowledgeBusyId) return;
    setConfirmDeleteKnowledgeId(null);
    requestAnimationFrame(() => removeButtonRefs.current.get(rowId)?.focus());
  }

  async function saveKnowledgeEntry(rowId: string) {
    if (entryMutationPending || editingKnowledgeId !== rowId) return;
    const content = knowledgeDraft.trim();
    if (!content) {
      setEntryError("Knowledge cannot be empty. Remove the entry instead.");
      return;
    }
    const operation = startAgentOperation();
    setKnowledgeBusyId(rowId);
    setEntryError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/knowledge/${encodeURIComponent(rowId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: operation.controller.signal,
      });
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Knowledge could not be updated.");
      if (!operation.isCurrent()) return;
      setConfig((current) =>
        current
          ? {
              ...current,
              knowledge: (current.knowledge || []).map((entry) =>
                knowledgeRowId(entry) === rowId ? { ...entry, content } : entry,
              ),
            }
          : current,
      );
      setEditingKnowledgeId(null);
      setKnowledgeDraft("");
      setNotice("Knowledge updated.");
    } catch (reason) {
      if (!operation.isCurrent()) return;
      setEntryError(reason instanceof Error ? reason.message : "Knowledge could not be updated.");
    } finally {
      if (operation.isCurrent()) setKnowledgeBusyId(null);
      operation.finish();
    }
  }

  async function removeKnowledgeEntry(rowId: string) {
    if (entryMutationPending || confirmDeleteKnowledgeId !== rowId) return;
    const operation = startAgentOperation();
    setKnowledgeBusyId(rowId);
    setEntryError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/knowledge/${encodeURIComponent(rowId)}`, {
        method: "DELETE",
        signal: operation.controller.signal,
      });
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Knowledge could not be removed.");
      if (!operation.isCurrent()) return;
      setConfig((current) =>
        current
          ? {
              ...current,
              knowledge: (current.knowledge || []).filter(
                (entry) => knowledgeRowId(entry) !== rowId,
              ),
            }
          : current,
      );
      setConfirmDeleteKnowledgeId(null);
      if (editingKnowledgeId === rowId) {
        setEditingKnowledgeId(null);
        setKnowledgeDraft("");
      }
      setNotice("Knowledge removed.");
    } catch (reason) {
      if (!operation.isCurrent()) return;
      setEntryError(reason instanceof Error ? reason.message : "Knowledge could not be removed.");
    } finally {
      if (operation.isCurrent()) setKnowledgeBusyId(null);
      operation.finish();
    }
  }

  async function saveRule(rowId: string) {
    const content = ruleDraft.trim();
    if (!content || entryMutationPending || editingRuleId !== rowId) return;
    const operation = startAgentOperation();
    setRuleBusyId(rowId);
    setEntryError(null);
    setNotice(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(operation.requestedAgentId)}/directive/${encodeURIComponent(rowId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: operation.controller.signal,
        },
      );
      const body = (await safeJson(response)) as {
        success?: boolean;
        directive?: ConfigDirectiveRow;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "Rule could not be updated.");
      if (
        body?.success !== true ||
        !body.directive ||
        knowledgeRowId(body.directive) !== rowId ||
        typeof body.directive.content !== "string" ||
        !body.directive.content.trim()
      ) {
        throw new Error("The saved rule could not be confirmed. Please retry.");
      }
      if (!operation.isCurrent()) return;
      const savedContent = body.directive.content;
      setConfig((current) =>
        current
          ? {
              ...current,
              directives: (current.directives || []).map((rule) =>
                knowledgeRowId(rule) === rowId ? { ...rule, content: savedContent } : rule,
              ),
            }
          : current,
      );
      setEditingRuleId(null);
      setRuleDraft("");
      setNotice("Rule updated.");
    } catch (reason) {
      if (operation.isCurrent()) {
        setEntryError(reason instanceof Error ? reason.message : "Rule could not be updated.");
      }
    } finally {
      if (operation.isCurrent()) setRuleBusyId(null);
      operation.finish();
    }
  }

  function beginRuleRemoval(rowId: string) {
    if (entryMutationPending || entryEditorOpen) return;
    setConfirmDeleteRuleId(rowId);
    setEntryError(null);
    setNotice(null);
    requestAnimationFrame(() => confirmDeleteCancelRef.current?.focus());
  }

  function cancelRuleRemoval(rowId: string) {
    if (ruleBusyId) return;
    setConfirmDeleteRuleId(null);
    requestAnimationFrame(() => removeRuleButtonRefs.current.get(rowId)?.focus());
  }

  async function removeRule(rowId: string) {
    if (entryMutationPending || confirmDeleteRuleId !== rowId) return;
    const operation = startAgentOperation();
    setRuleBusyId(rowId);
    setEntryError(null);
    setNotice(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(operation.requestedAgentId)}/directive/${encodeURIComponent(rowId)}`,
        { method: "DELETE", signal: operation.controller.signal },
      );
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Rule could not be removed.");
      if (!operation.isCurrent()) return;
      setConfig((current) =>
        current
          ? {
              ...current,
              directives: (current.directives || []).filter(
                (rule) => knowledgeRowId(rule) !== rowId,
              ),
            }
          : current,
      );
      setConfirmDeleteRuleId(null);
      setNotice("Rule removed. Your Bot stops following it on its next call.");
    } catch (reason) {
      if (operation.isCurrent()) {
        setEntryError(reason instanceof Error ? reason.message : "Rule could not be removed.");
      }
    } finally {
      if (operation.isCurrent()) setRuleBusyId(null);
      operation.finish();
    }
  }

  const knowledge = config?.knowledge ?? [];
  const directives = config?.directives ?? [];
  const hasPersonality = !!(config?.personality && config.personality.trim());
  const compactUpload = knowledge.length > 0 || directives.length > 0;
  const showStats = loading || knowledge.length > 0 || directives.length > 0 || hasPersonality;

  const stats: Array<{ value: number | string; label: string }> = [
    // "Entries", not "Knowledge" — the page title directly above already says
    // KNOWLEDGE, and this counts entries in the base.
    { value: knowledge.length, label: "Entries" },
    { value: directives.length, label: "Rules" },
    { value: hasPersonality ? "Set" : "Not set", label: "Tone" },
  ];

  const activeRulesPanel =
    directives.length > 0 ? (
      <section className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold leading-6 text-foreground">Active Rules</h2>
        </div>
        <div className="divide-y divide-border">
          {(showAllRules ? directives : directives.slice(0, 5)).map((directive, index) => {
            const headline = ruleHeadline(directive.content);
            const body = ruleBody(directive.content, headline);
            const rowId = knowledgeRowId(directive);
            const busy = rowId !== null && ruleBusyId === rowId;
            if (rowId && editingRuleId === rowId) {
              return (
                <div key={rowId} className="py-3 first:pt-0 last:pb-0">
                  <label
                    htmlFor={`rule-entry-${rowId}`}
                    className="mb-2 block text-sm font-semibold"
                  >
                    Edit rule
                  </label>
                  <textarea
                    id={`rule-entry-${rowId}`}
                    autoFocus
                    value={ruleDraft}
                    onChange={(event) => setRuleDraft(event.target.value)}
                    maxLength={12_000}
                    rows={3}
                    disabled={busy}
                    className="w-full resize-y rounded-[var(--wireline-radius-md)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-canvas-default)] px-3 py-2 text-sm leading-6 text-[var(--wireline-color-text-primary)] outline-none focus:border-[var(--wireline-color-action-primary-default)]"
                  />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingRuleId(null);
                        setRuleDraft("");
                        setEntryError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={entryMutationPending || !ruleDraft.trim()}
                      onClick={() => void saveRule(rowId)}
                    >
                      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={directive.id ?? `d-${index}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                      <FileText
                        className="mr-1.5 inline size-3.5 text-[var(--wireline-color-action-primary-default)]"
                        aria-hidden="true"
                      />
                      {headline}
                    </p>
                    {body ? (
                      <p className="mt-1 break-words text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">
                        {body}
                      </p>
                    ) : null}
                  </div>
                  {rowId &&
                  !directive.content?.startsWith(OPENING_GREETING_PREFIX) &&
                  confirmDeleteRuleId !== rowId ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={entryMutationPending || entryEditorOpen}
                        aria-label={`Edit rule: ${headline}`}
                        onClick={() => {
                          if (entryMutationPending || entryEditorOpen) return;
                          setEditingRuleId(rowId);
                          setRuleDraft(directive.content || "");
                          setEntryError(null);
                          setNotice(null);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        ref={(node) => {
                          if (node) removeRuleButtonRefs.current.set(rowId, node);
                          else removeRuleButtonRefs.current.delete(rowId);
                        }}
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={entryMutationPending || entryEditorOpen}
                        aria-label={`Remove rule: ${headline}`}
                        onClick={() => beginRuleRemoval(rowId)}
                      >
                        <Trash2 aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                {rowId && confirmDeleteRuleId === rowId ? (
                  <div
                    className="mt-2 flex flex-wrap items-center justify-end gap-2"
                    role="group"
                    aria-label={`Remove rule: ${headline}`}
                  >
                    <span className="text-xs text-muted-foreground">Remove this rule?</span>
                    <Button
                      ref={confirmDeleteCancelRef}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => cancelRuleRemoval(rowId)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => void removeRule(rowId)}
                    >
                      {busy ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {directives.length > 5 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            aria-expanded={showAllRules}
            onClick={() => setShowAllRules((current) => !current)}
          >
            {showAllRules ? "Show Fewer Rules" : `Show All ${directives.length} Rules`}
          </Button>
        ) : null}
      </section>
    ) : null;

  const uploadTrigger = (
    <Button
      type="button"
      size="sm"
      className="shrink-0"
      onClick={() => fileInputRef.current?.click()}
      disabled={entryMutationPending || entryEditorOpen || !agentId}
    >
      {uploading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Uploading…
        </>
      ) : (
        "Choose Files"
      )}
    </Button>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={entryMutationPending || entryEditorOpen || !agentId}
        // Visually hidden but still in the accessibility tree, so it needs a
        // name of its own: axe reports an unlabelled control otherwise, and a
        // screen reader announces only "file upload button".
        aria-label="Upload knowledge files"
        className="sr-only"
        onChange={onFilePick}
        accept={
          imageUploadsAvailable
            ? ".txt,.csv,.md,.markdown,image/png,image/jpeg,image/jpg,image/webp,image/gif"
            : ".txt,.csv,.md,.markdown"
        }
      />

      {showStats ? (
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Knowledge summary">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{stat.label}</dt>
              <dd className="font-semibold text-foreground">{loading ? "Loading…" : stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-[var(--wireline-radius-md)] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-4 py-2.5 text-[13px] text-[var(--wireline-color-status-error)]"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rounded-[var(--wireline-radius-md)] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-4 py-2.5 text-[13px] text-[var(--wireline-color-action-primary-pressed)]"
        >
          {notice}
        </div>
      ) : null}

      <section
        className="flex flex-col gap-2 empty:hidden"
        aria-label="Saved knowledge"
        aria-busy={loading ? "true" : undefined}
      >
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-[68px] animate-pulse rounded-[var(--wireline-radius-lg)] bg-[var(--wireline-color-surface-subtle)]"
            />
          ))
        ) : knowledge.length === 0 ? null : ( // stats -> empty pill -> identical upload pill. // way when empty so the page reads as: stats -> upload, not // Drop zone below already invites uploads — keep this row out of the
          <>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold leading-6 text-foreground">Saved Knowledge</h2>
            </div>
            {(showAllKnowledge ? knowledge : knowledge.slice(0, KNOWLEDGE_VISIBLE_CAP)).map(
              (entry, index) => {
                const badge = fileBadge(entry.source);
                const rowId = knowledgeRowId(entry);
                const headline = entryHeadline(entry.content, entry.source);
                const subtitle = entrySubtitle(entry.content, entry.source);
                const busy = rowId !== null && knowledgeBusyId === rowId;
                if (rowId && editingKnowledgeId === rowId) {
                  return (
                    <article
                      key={entry.id ?? `k-${index}`}
                      className="rounded-[var(--wireline-radius-lg)] border border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-surface-default)] p-4"
                    >
                      <label
                        className="mb-2 block text-xs font-semibold text-[var(--wireline-color-text-primary)]"
                        htmlFor={`knowledge-entry-${rowId}`}
                      >
                        Edit knowledge
                      </label>
                      <textarea
                        id={`knowledge-entry-${rowId}`}
                        autoFocus
                        value={knowledgeDraft}
                        onChange={(event) => setKnowledgeDraft(event.target.value)}
                        maxLength={10_000}
                        rows={5}
                        disabled={busy}
                        className="w-full resize-y rounded-[var(--wireline-radius-md)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-canvas-default)] px-3 py-2 text-sm leading-6 text-[var(--wireline-color-text-primary)] outline-none focus:border-[var(--wireline-color-action-primary-default)]"
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={cancelKnowledgeEdit}
                        >
                          <X aria-hidden="true" />
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={entryMutationPending || !knowledgeDraft.trim()}
                          onClick={() => void saveKnowledgeEntry(rowId)}
                        >
                          {busy ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Check aria-hidden="true" />
                          )}
                          Save
                        </Button>
                      </div>
                    </article>
                  );
                }
                return (
                  <article
                    key={entry.id ?? `k-${index}`}
                    className="flex flex-wrap items-center gap-3.5 rounded-[var(--wireline-radius-lg)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-4 py-4 transition-colors hover:border-[var(--wireline-color-action-primary-default)] sm:flex-nowrap sm:px-5"
                  >
                    <div
                      className="grid size-9 shrink-0 place-items-center rounded-[var(--wireline-radius-md)] font-[var(--wireline-font-mono)] text-[11px] font-bold"
                      style={{ background: SUCCESS_SURFACE, color: SUCCESS_TEXT }}
                    >
                      {badge}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--wireline-color-text-primary)]">
                        {headline}
                      </div>
                      {subtitle ? (
                        <div className="mt-0.5 truncate text-xs text-[var(--wireline-color-text-tertiary)]">
                          {subtitle}
                        </div>
                      ) : null}
                    </div>
                    {rowId ? (
                      confirmDeleteKnowledgeId === rowId ? (
                        <div
                          className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"
                          role="group"
                          aria-label={`Remove ${headline}`}
                        >
                          <span className="text-xs text-muted-foreground">Remove this entry?</span>
                          <Button
                            ref={confirmDeleteCancelRef}
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => cancelKnowledgeRemoval(rowId)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => void removeKnowledgeEntry(rowId)}
                          >
                            {busy ? (
                              <Loader2 className="animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 aria-hidden="true" />
                            )}
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full justify-end gap-1 sm:w-auto">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={entryMutationPending || entryEditorOpen}
                            onClick={() => beginKnowledgeEdit(entry)}
                            aria-label={`Edit ${headline}`}
                          >
                            <Pencil aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            ref={(node) => {
                              if (node) removeButtonRefs.current.set(rowId, node);
                              else removeButtonRefs.current.delete(rowId);
                            }}
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={entryMutationPending || entryEditorOpen}
                            onClick={() => beginKnowledgeRemoval(rowId)}
                            aria-label={`Remove ${headline}`}
                          >
                            <Trash2 aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      )
                    ) : (
                      <span
                        className="rounded-[var(--wireline-radius-xs)] px-2 py-1 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em]"
                        style={{
                          background: SUCCESS_SURFACE,
                          color: "var(--wireline-color-status-success)",
                        }}
                      >
                        Active
                      </span>
                    )}
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
                {showAllKnowledge ? "Show Less" : `Show All ${knowledge.length}`}
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
        className={`flex rounded-[var(--wireline-radius-lg)] border-2 border-dashed text-center transition-colors ${
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
          <h2 className="text-sm font-semibold text-[var(--wireline-color-text-primary)]">
            Add Documents
          </h2>
          <div
            className={`text-xs text-[var(--wireline-color-text-tertiary)] ${compactUpload ? "mt-0.5" : "mt-1"}`}
          >
            {imageUploadsAvailable
              ? "Text, Markdown, or CSV files, or PNG, JPG, WEBP, or GIF images"
              : "Text, Markdown, or CSV files"}{" "}
            up to {KNOWLEDGE_ASSET_MAX_LABEL} each.
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
