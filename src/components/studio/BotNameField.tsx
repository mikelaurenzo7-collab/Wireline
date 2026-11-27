import { useEffect, useRef, useState, type FormEvent } from "react";

import { authFetch } from "../../lib/api";
import { BOT_NAME_MAX_CHARS, DEFAULT_BOT_NAME, cleanBotName } from "../../lib/bot-name";
import { AGENTS_CHANGED_EVENT } from "../../contexts/AgentsContext";
import { StatusNotice } from "../molecules";

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground wl-focus-ring-halo read-only:opacity-70";
const saveButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The name a Bot gives callers. Every Bot starts as Bo, so this is where an
 * owner makes it their own. It saves on its own, apart from the rest of Set
 * Up, because a name is one decision and not part of a draft.
 */
export default function BotNameField({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [draft, setDraft] = useState(agentName);
  // The name this field knows to be saved: the Bot list's, or its own last save.
  const [savedName, setSavedName] = useState(agentName);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef(0);
  const input = useRef<HTMLInputElement | null>(null);

  // Another Bot starts clean; a save in flight belongs to the Bot it began on.
  useEffect(() => {
    scope.current += 1;
    setSaving(false);
    setNotice(null);
    setError(null);
    setDraft(agentName);
    setSavedName(agentName);
    // The name's own changes are the next effect's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);
  // A name saved elsewhere (or this field's own save, arriving back from the
  // Bot list) is shown, unless the owner is part way through typing another.
  useEffect(() => {
    setDraft((typed: string) =>
      cleanBotName(typed) === cleanBotName(savedName) ? agentName : typed,
    );
    setSavedName(agentName);
    // Runs when the list's name changes, not when this field's own state does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName]);

  const name = cleanBotName(draft);
  const unchanged = name === cleanBotName(savedName);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name || unchanged) return;
    const started = scope.current;
    const current = () => scope.current === started;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json().catch(() => null)) as {
        name?: string;
        error?: string;
      } | null;
      if (!current()) return;
      if (!response.ok) throw new Error(body?.error || "The name could not be saved. Try again.");
      const saved = body?.name || name;
      setDraft(saved);
      setSavedName(saved);
      setNotice(`Saved. Your Bot is ${saved} from the next call.`);
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      // Save Name has nothing left to save and is disabled, which would drop
      // keyboard focus to the top of the page. Keep it in the field.
      input.current?.focus();
    } catch (reason) {
      if (!current()) return;
      setError(
        reason instanceof Error ? reason.message : "The name could not be saved. Try again.",
      );
    } finally {
      if (current()) setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-2" aria-label="Bot Name" aria-busy={saving}>
      <label className="text-sm font-semibold text-foreground" htmlFor="setup-bot-name">
        Name
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <input
            ref={input}
            id="setup-bot-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={BOT_NAME_MAX_CHARS}
            placeholder={DEFAULT_BOT_NAME}
            autoComplete="off"
            // Read-only, not disabled, while it saves: a disabled field loses focus.
            readOnly={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? "setup-bot-name-help setup-bot-name-error" : "setup-bot-name-help"
            }
            className={fieldClass}
          />
        </div>
        <button
          type="submit"
          disabled={!saving && (!name || unchanged)}
          className={saveButtonClass}
        >
          {saving ? "Saving…" : "Save Name"}
        </button>
      </div>
      <p id="setup-bot-name-help" className="text-xs leading-5 text-muted-foreground">
        What your Bot calls itself with callers. Every Bot starts as {DEFAULT_BOT_NAME}.
      </p>
      {/* Out of the layout until it has something to say, so it leaves no gap. */}
      <div aria-live="polite" className={notice ? "" : "sr-only"}>
        {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
      </div>
      {error ? (
        <StatusNotice id="setup-bot-name-error" tone="destructive" title="Not Saved">
          {error}
        </StatusNotice>
      ) : null}
    </form>
  );
}
