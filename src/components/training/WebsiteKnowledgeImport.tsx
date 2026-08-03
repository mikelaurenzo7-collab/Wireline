import { type FormEvent, useState } from "react";
import { Globe2, Loader2 } from "lucide-react";

import { authFetch, safeJson } from "../../lib/api";
import { emitProductEvent } from "../../lib/product-event-client";
import { Button } from "../atoms";

type ImportResponse = {
  summary?: string;
  error?: string;
  sourceUrl?: string;
  factsAdded?: number;
  rulesAdded?: number;
};

export default function WebsiteKnowledgeImport({
  agentId,
  onImported,
}: {
  agentId: string;
  onImported: () => void;
}) {
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentId || importing) return;
    const value = url.trim();
    if (!value) {
      setError("Enter a public HTTPS website page.");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      setError("Enter a valid public HTTPS URL.");
      return;
    }
    if (parsed.protocol !== "https:") {
      setError("Website imports require HTTPS.");
      return;
    }
    if (parsed.port && parsed.port !== "443") {
      setError("Website imports use the standard HTTPS port.");
      return;
    }
    if (parsed.username || parsed.password) {
      setError("Website URLs must not contain credentials.");
      return;
    }

    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/website`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: parsed.toString() }),
        },
      );
      const body = (await safeJson(response)) as ImportResponse | null;
      if (!response.ok) {
        throw new Error(body?.error || "That website page could not be imported.");
      }
      setNotice(body?.summary || "Website knowledge imported.");
      emitProductEvent({
        event: "training_asset_added",
        agentId,
        metadata: {
          source: "website_import",
          hostname: parsed.hostname,
          facts_added: body?.factsAdded || 0,
          rules_added: body?.rulesAdded || 0,
        },
      });
      onImported();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "That website page could not be imported.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="website-knowledge-title">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--wireline-color-action-primary-container)] text-[var(--wireline-color-action-primary-default)]">
          <Globe2 size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="website-knowledge-title"
            className="text-sm font-semibold text-[var(--wireline-color-text-primary)]"
          >
            Train from a website page
          </h2>
          <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">
            Paste one public HTTPS page. Wireline reads page text only, blocks private networks and
            unsafe redirects, and saves only explicit business facts and operating rules.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="website-knowledge-url" className="sr-only">
          Public website page URL
        </label>
        <input
          id="website-knowledge-url"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={2048}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://yourcompany.com/services"
          disabled={importing || !agentId}
          className="min-h-[40px] min-w-0 flex-1 rounded-[9px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3 text-sm text-[var(--wireline-color-text-primary)] outline-none transition placeholder:text-[var(--wireline-color-text-tertiary)] focus:border-[var(--wireline-color-action-primary-default)] focus:ring-2 focus:ring-[var(--wireline-color-action-primary-container)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button type="submit" disabled={importing || !agentId || !url.trim()} className="sm:w-auto">
          {importing ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Importing…
            </>
          ) : (
            "Import page"
          )}
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[8px] border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-3 py-2 text-xs text-[var(--wireline-color-status-error)]"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-3 rounded-[8px] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 py-2 text-xs text-[var(--wireline-color-action-primary-pressed)]"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
