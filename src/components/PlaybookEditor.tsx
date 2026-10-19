import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Loader2, Plus, RefreshCw, Save, X } from "lucide-react";

import { authFetch } from "../lib/api";
import {
  EMPTY_PLAYBOOK,
  PLAYBOOK_LIMITS,
  PLAYBOOK_MOMENTS,
  PLAYBOOK_NEXT_STEPS,
  readStoredAgentPlaybook,
  type AgentPlaybook,
  type PlaybookMomentId,
  type PlaybookNextStep,
  type PlaybookSituation,
} from "../lib/agent-playbook";
import { Button, Input, NativeSelect, Switch, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";

type Props = {
  agentId: string;
  compact?: boolean;
};

const MOMENT_PLACEHOLDERS: Record<PlaybookMomentId, string> = {
  closing: "Thanks for calling. Have a great day!",
  transfer: "I'm connecting you with someone from our team now. One moment.",
  message: "I'll make sure the team gets your message today.",
  hold: "Give me one moment while I check that for you.",
  voicemail: "Hi, this is the front desk returning your call. Call us back anytime.",
};

/** Common starting points; every field stays editable. */
const STARTER_SITUATIONS: Array<{ label: string } & Omit<PlaybookSituation, "id">> = [
  {
    label: "Asks about price",
    when: "the caller asks how much something costs",
    say: "",
    exact: false,
    then: "continue",
  },
  {
    label: "Wants to cancel",
    when: "the caller wants to cancel or reschedule",
    say: "No problem. I can help with that or pass it to our team.",
    exact: false,
    then: "take_message",
  },
  {
    label: "Is upset",
    when: "the caller is upset or has a complaint",
    say: "I'm sorry about that. I want to make sure the right person hears this.",
    exact: false,
    then: "transfer",
  },
  {
    label: "Asks for the owner",
    when: "the caller asks to speak with the owner or a manager",
    say: "",
    exact: false,
    then: "take_message",
  },
];

const listToText = (items: string[]) => items.join("\n");
const textToList = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function situationId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function summary(playbook: AgentPlaybook): string {
  const parts = [
    Object.keys(playbook.exactLines).length
      ? `${Object.keys(playbook.exactLines).length} exact`
      : "",
    playbook.situations.length
      ? `${playbook.situations.length} ${playbook.situations.length === 1 ? "situation" : "situations"}`
      : "",
    playbook.alwaysMention.length || playbook.neverSay.length ? "must / never" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not set";
}

/**
 * The owner's Playbook: exact wording for key moments, how to handle specific
 * situations, and what to always or never say. Saved as one document and
 * applied to calls, rehearsals, and text replies.
 */
export default function PlaybookEditor({ agentId, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed load is its own state: the header must not read "Not set" when
  // the truth is unknown, and a save must not be offered over an empty draft.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<AgentPlaybook>(EMPTY_PLAYBOOK);
  const [draft, setDraft] = useState<AgentPlaybook>(EMPTY_PLAYBOOK);
  // Free-text lists keep the owner's line breaks while typing.
  const [alwaysText, setAlwaysText] = useState("");
  const [neverText, setNeverText] = useState("");

  const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { playbook?: unknown } | null;
        if (!response.ok) throw new Error("Your Playbook could not be loaded.");
        if (cancelled) return;
        const playbook = readStoredAgentPlaybook(body?.playbook);
        setSaved(playbook);
        setDraft(playbook);
        setAlwaysText(listToText(playbook.alwaysMention));
        setNeverText(listToText(playbook.neverSay));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setLoadError(
            reason instanceof Error ? reason.message : "Your Playbook could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, loadAttempt]);

  const current = useMemo<AgentPlaybook>(
    () => ({ ...draft, alwaysMention: textToList(alwaysText), neverSay: textToList(neverText) }),
    [draft, alwaysText, neverText],
  );
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  const unusedMoments = PLAYBOOK_MOMENTS.filter((moment) => !(moment.id in draft.exactLines));

  function touch() {
    setNotice(null);
    setError(null);
  }

  function setLine(moment: PlaybookMomentId, text: string | null) {
    touch();
    setDraft((previous) => {
      const exactLines = { ...previous.exactLines };
      if (text === null) delete exactLines[moment];
      else exactLines[moment] = text;
      return { ...previous, exactLines };
    });
  }

  function updateSituation(id: string, patch: Partial<PlaybookSituation>) {
    touch();
    setDraft((previous) => ({
      ...previous,
      situations: previous.situations.map((situation) =>
        situation.id === id ? { ...situation, ...patch } : situation,
      ),
    }));
  }

  function addSituation(starter?: Omit<PlaybookSituation, "id">) {
    touch();
    setDraft((previous) => ({
      ...previous,
      situations: [
        ...previous.situations,
        { id: situationId(), when: "", say: "", exact: false, then: "continue", ...starter },
      ],
    }));
  }

  function removeSituation(id: string) {
    touch();
    setDraft((previous) => ({
      ...previous,
      situations: previous.situations.filter((situation) => situation.id !== id),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || loading || loadError) return;
    setSaving(true);
    touch();
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/playbook`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playbook: current }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        playbook?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string" ? body.error : "Your Playbook could not be saved.",
        );
      const confirmed = readStoredAgentPlaybook(body?.playbook);
      setSaved(confirmed);
      setDraft(confirmed);
      setAlwaysText(listToText(confirmed.alwaysMention));
      setNeverText(listToText(confirmed.neverSay));
      setNotice("Playbook saved. Your Bot uses it on the next call, text, or rehearsal.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your Playbook could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "text-sm font-medium text-foreground";
  const hintClass = "text-xs leading-5 text-muted-foreground";

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-border bg-card p-3 sm:p-4"
          : "rounded-2xl border border-border bg-card p-5 sm:p-6"
      }
    >
      <button
        type="button"
        className="flex min-h-11 w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md text-left wl-focus-ring-halo"
        aria-expanded={open}
        aria-controls="bot-playbook"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span
            className={`${compact ? "text-base" : "text-lg"} block font-semibold tracking-tight text-foreground`}
          >
            Playbook
          </span>
          <span className="block text-xs text-muted-foreground">
            The exact words your Bot uses, and how it handles specific moments.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {loading ? "Loading…" : loadError ? "Couldn't load" : summary(saved)}
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <form id="bot-playbook" onSubmit={save} className="mt-4 space-y-6">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading Playbook…
            </p>
          ) : loadError ? (
            <StatusNotice tone="destructive" title="Playbook Not Loaded">
              <span className="block">{loadError}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={retryLoad}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Try Again
              </Button>
            </StatusNotice>
          ) : (
            <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-6">
              <div className="space-y-3">
                <div>
                  <h4 className={labelClass}>Exact Lines</h4>
                  <p className={hintClass}>Said word for word when the moment comes.</p>
                </div>
                {PLAYBOOK_MOMENTS.filter((moment) => moment.id in draft.exactLines).map(
                  (moment) => (
                    <div key={moment.id} className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`playbook-line-${moment.id}`} className={labelClass}>
                          {moment.label}
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-9 px-2 text-muted-foreground"
                          aria-label={`Remove the ${moment.label.toLowerCase()} line`}
                          onClick={() => setLine(moment.id, null)}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                      <Textarea
                        id={`playbook-line-${moment.id}`}
                        rows={2}
                        maxLength={PLAYBOOK_LIMITS.lineChars}
                        placeholder={MOMENT_PLACEHOLDERS[moment.id]}
                        value={draft.exactLines[moment.id] ?? ""}
                        onChange={(event) => setLine(moment.id, event.target.value)}
                      />
                    </div>
                  ),
                )}
                {unusedMoments.length ? (
                  <div className="flex flex-wrap gap-2" aria-label="Add an exact line">
                    {unusedMoments.map((moment) => (
                      <Button
                        key={moment.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setLine(moment.id, "")}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        {moment.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className={labelClass}>Situations</h4>
                  <p className={hintClass}>
                    When this happens, here is what your Bot says and does.
                  </p>
                </div>
                {draft.situations.map((situation, index) => (
                  <div
                    key={situation.id}
                    className="grid gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-2">
                      <label className="grid min-w-0 flex-1 gap-1.5">
                        <span className={labelClass}>When</span>
                        <Input
                          value={situation.when}
                          maxLength={PLAYBOOK_LIMITS.whenChars}
                          placeholder="the caller asks about weekend hours"
                          onChange={(event) =>
                            updateSituation(situation.id, { when: event.target.value })
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-6 min-h-9 px-2 text-muted-foreground"
                        aria-label={`Remove situation ${index + 1}`}
                        onClick={() => removeSituation(situation.id)}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <label className="grid gap-1.5">
                      <span className={labelClass}>Your Bot says</span>
                      <Textarea
                        rows={2}
                        maxLength={PLAYBOOK_LIMITS.lineChars}
                        placeholder="We're open Saturdays 9 to 2. Want me to book a time?"
                        value={situation.say}
                        onChange={(event) =>
                          updateSituation(situation.id, { say: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={situation.exact}
                          onCheckedChange={(checked) =>
                            updateSituation(situation.id, { exact: checked })
                          }
                          aria-label="Say it word for word"
                        />
                        Word for word
                      </label>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        Then
                        <NativeSelect
                          value={situation.then}
                          onChange={(event) =>
                            updateSituation(situation.id, {
                              then: event.target.value as PlaybookNextStep,
                            })
                          }
                          aria-label="What your Bot does next"
                          className="min-w-[11rem]"
                        >
                          {PLAYBOOK_NEXT_STEPS.map((step) => (
                            <option key={step.id} value={step.id}>
                              {step.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                    </div>
                  </div>
                ))}
                {draft.situations.length < PLAYBOOK_LIMITS.situations ? (
                  <div className="flex flex-wrap gap-2" aria-label="Add a situation">
                    {STARTER_SITUATIONS.filter(
                      (starter) => !draft.situations.some((item) => item.when === starter.when),
                    ).map(({ label, ...starter }) => (
                      <Button
                        key={label}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addSituation(starter)}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        {label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addSituation()}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Custom
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="playbook-always">
                  <span className={labelClass}>Always Mention</span>
                  <Textarea
                    id="playbook-always"
                    rows={3}
                    placeholder={"First visit is 10% off\nWe offer free estimates"}
                    value={alwaysText}
                    onChange={(event) => {
                      touch();
                      setAlwaysText(event.target.value);
                    }}
                  />
                  <span className={hintClass}>One per line. Mentioned when it fits.</span>
                </label>
                <label className="grid gap-1.5" htmlFor="playbook-never">
                  <span className={labelClass}>Never Say</span>
                  <Textarea
                    id="playbook-never"
                    rows={3}
                    placeholder={"Never quote exact repair prices\nDon't mention competitors"}
                    value={neverText}
                    onChange={(event) => {
                      touch();
                      setNeverText(event.target.value);
                    }}
                  />
                  <span className={hintClass}>One per line. Words, claims, or promises.</span>
                </label>
              </div>
            </fieldset>
          )}

          {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
          {error ? (
            <StatusNotice tone="destructive" title="Playbook Not Saved">
              {error}
            </StatusNotice>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size={compact ? "sm" : undefined}
              disabled={saving || loading || Boolean(loadError) || !dirty}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {saving ? "Saving…" : "Save Playbook"}
            </Button>
            <span className={hintClass}>Applies to calls, texts, and Try It.</span>
          </div>
        </form>
      ) : null}
    </section>
  );
}
