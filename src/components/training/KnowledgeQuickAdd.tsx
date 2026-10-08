import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import { Loader2, PenLine } from "lucide-react";

import { authFetch, safeJson } from "../../lib/api";
import { emitProductEvent } from "../../lib/product-event-client";
import {
  extractionBodyPersistedSomething,
  type TrainingExtractionBody,
} from "../../lib/training-extraction-result";
import { Button } from "../atoms";

const QUICK_ADD_MAX_CHARS = 10_000;

/**
 * Plain-language training: the owner types facts, answers, or rules and the
 * server's training extractor saves only what it can verify as one.
 */
export default function KnowledgeQuickAdd({
  agentId,
  onSaved,
  disabled = false,
  onSavingChange,
}: {
  agentId: string;
  onSaved: () => void;
  disabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopeRef = useRef(0);

  useLayoutEffect(() => {
    scopeRef.current += 1;
    setDraft("");
    setSaving(false);
    setNotice(null);
    setError(null);
    return () => {
      // A save in flight belongs to its original Bot and must not touch this one.
      scopeRef.current += 1;
    };
  }, [agentId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!agentId || saving || disabled || !message) return;
    setSaving(true);
    onSavingChange?.(true);
    setNotice(null);
    setError(null);
    const scope = scopeRef.current;
    const isCurrent = () => scopeRef.current === scope;
    try {
      const response = await authFetch("/api/train/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, message }),
      });
      const body = (await safeJson(response)) as
        (TrainingExtractionBody & { error?: string }) | null;
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(body?.error || "That could not be saved. Try again.");
      if (!extractionBodyPersistedSomething(body)) {
        setError(
          "Nothing specific was saved. Write short facts, answers, or rules, such as “Service calls are $89.”",
        );
        return;
      }
      setDraft("");
      setNotice(
        typeof body?.responseContent === "string" && body.responseContent.trim()
          ? body.responseContent
          : "Saved to Knowledge.",
      );
      emitProductEvent({
        event: "training_asset_added",
        agentId,
        metadata: { source: "typed_knowledge" },
      });
      onSaved();
    } catch (reason) {
      if (!isCurrent()) return;
      setError(reason instanceof Error ? reason.message : "That could not be saved. Try again.");
    } finally {
      if (isCurrent()) {
        setSaving(false);
        onSavingChange?.(false);
      }
    }
  }

  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="knowledge-quick-add-title">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-[var(--wireline-radius-md)] bg-[var(--wireline-color-action-primary-container)] text-[var(--wireline-color-action-primary-default)]">
          <PenLine size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="knowledge-quick-add-title"
            className="text-sm font-semibold text-[var(--wireline-color-text-primary)]"
          >
            Tell Your Bot Something
          </h2>
          <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">
            Type facts, answers, or rules in plain words. Your Bot saves each one it can use.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-2">
        <label htmlFor="knowledge-quick-add-text" className="sr-only">
          Facts, answers, or rules for your Bot
        </label>
        <textarea
          id="knowledge-quick-add-text"
          rows={3}
          maxLength={QUICK_ADD_MAX_CHARS}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Service calls are $89. We don't serve Oakland. Transfer emergencies to Mike."
          disabled={disabled || saving || !agentId}
          className="min-h-24 w-full resize-y rounded-[var(--wireline-radius-md)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3 py-2 text-sm leading-6 text-[var(--wireline-color-text-primary)] outline-none transition placeholder:text-[var(--wireline-color-text-tertiary)] focus:border-[var(--wireline-color-action-primary-default)] focus:ring-2 focus:ring-[var(--wireline-color-action-primary-container)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={disabled || saving || !agentId || !draft.trim()}>
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save to Knowledge"
            )}
          </Button>
        </div>
      </form>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--wireline-radius-sm)] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-3 py-2 text-xs text-[var(--wireline-color-status-error)]"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-3 rounded-[var(--wireline-radius-sm)] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 py-2 text-xs text-[var(--wireline-color-status-success)]"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
