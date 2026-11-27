import { useEffect, useRef, useState, type FormEvent } from "react";

import { authFetch } from "../../lib/api";
import { BOT_NAME_MAX_CHARS, DEFAULT_BOT_NAME } from "../../lib/bot-name";
import { AGENTS_CHANGED_EVENT } from "../../contexts/AgentsContext";
import { StatusNotice } from "../molecules";

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground wl-focus-ring-halo";
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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef(0);

  // Another Bot starts clean; a save in flight belongs to the Bot it began on.
  useEffect(() => {
    scope.current += 1;
    setSaving(false);
    setNotice(null);
    setError(null);
  }, [agentId]);
  // The saved name, when it changes here or anywhere else, is what the field shows.
  useEffect(() => setDraft(agentName), [agentId, agentName]);

  const name = draft.replace(/\s+/g, " ").trim();
  const unchanged = name === agentName.trim();

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
      setNotice(`Saved. Your Bot is ${saved} from the next call.`);
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
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
    <form onSubmit={save} className="grid gap-2" aria-label="Bot Name">
      <label className="text-sm font-semibold text-foreground" htmlFor="setup-bot-name">
        Name
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <input
            id="setup-bot-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={BOT_NAME_MAX_CHARS}
            placeholder={DEFAULT_BOT_NAME}
            autoComplete="off"
            disabled={saving}
            aria-describedby="setup-bot-name-help"
            className={fieldClass}
          />
        </div>
        <button type="submit" disabled={saving || !name || unchanged} className={saveButtonClass}>
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
        <StatusNotice tone="destructive" title="Not Saved">
          {error}
        </StatusNotice>
      ) : null}
    </form>
  );
}
