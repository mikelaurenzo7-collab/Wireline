import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, Loader2, Play, Plus, Square, X } from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  PRONUNCIATION_LIMIT,
  PRONUNCIATION_SAY_MAX,
  PRONUNCIATION_WORD_MAX,
  RECOGNIZED_NAME_LIMIT,
  RECOGNIZED_NAME_MAX,
  SPEAKING_PACES,
  speakingPaceForRate,
  type Pronunciation,
  type SpeakingPace,
} from "../../lib/phone-voices";
import { StatusNotice } from "../molecules";

/** Call delivery as the server reports it: the pace in effect, never an unset one. */
export type CallDeliveryView = {
  speakingRate: number;
  pronunciations: Pronunciation[];
  recognizedNames: string[];
};

type CallDeliverySettingsProps = {
  agentId: string;
  agentName: string;
  initial: CallDeliveryView;
  /** Tells the picker what was saved, so its samples play at the new pace. */
  onSaved: (delivery: CallDeliveryView) => void;
  /** Plays the Bot's built-in voice as saved. Absent when callers hear another voice. */
  sample?: { playing: boolean; loading: boolean; toggle: () => void } | null;
  /** A library or cloned voice answers calls. Pace and pronunciations follow it; name recognition may not. */
  otherVoiceAnswers?: boolean;
};

/** One change, as the save route reads it. Lists change one entry at a time. */
type Change =
  | { speakingRate: number }
  | { addPronunciation: Pronunciation }
  | { removePronunciation: string }
  | { addRecognizedName: string }
  | { removeRecognizedName: string };

type Part = "pace" | "pronunciations" | "names";

const SAVE_FAILED = "That change could not be saved. Try again.";
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground wl-focus-ring-halo";
const addButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-50";

/**
 * How a Bot speaks and listens on calls, beyond which voice it has: its pace,
 * the words it should say differently, and the names it should catch. Every
 * control saves on its own, like the voice list above it.
 */
export default function CallDeliverySettings({
  agentId,
  agentName,
  initial,
  onSaved,
  sample = null,
  otherVoiceAnswers = false,
}: CallDeliverySettingsProps) {
  const [delivery, setDelivery] = useState(initial);
  const [saving, setSaving] = useState<Part | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [say, setSay] = useState("");
  const [name, setName] = useState("");
  const paceLabelId = useId();
  const pronunciationHelpId = useId();
  const nameHelpId = useId();
  const alive = useRef(true);
  // Removing an entry removes the button that had focus; these give it somewhere to go.
  const wordInput = useRef<HTMLInputElement | null>(null);
  const nameInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const pace = speakingPaceForRate(delivery.speakingRate);
  const busy = saving !== null;

  async function save(part: Part, change: Change, savedNotice: string): Promise<boolean> {
    if (busy) return false;
    setSaving(part);
    setNotice(null);
    setError(null);
    // Only the server's own reason is shown; a dropped connection reads as a plain retry.
    let failure = SAVE_FAILED;
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/voice/delivery`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        delivery?: CallDeliveryView;
      } | null;
      if (!response.ok || !body?.delivery) {
        failure = body?.error || SAVE_FAILED;
        throw new Error(failure);
      }
      if (!alive.current) return false;
      setDelivery(body.delivery);
      onSaved(body.delivery);
      setNotice(savedNotice);
      return true;
    } catch {
      if (alive.current) setError(failure);
      return false;
    } finally {
      if (alive.current) setSaving(null);
    }
  }

  function choosePace(next: SpeakingPace) {
    if (next.id === pace.id) return;
    void save(
      "pace",
      { speakingRate: next.rate },
      `Saved. ${agentName} speaks at a ${next.label} pace from the next call.`,
    );
  }

  function movePace(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SPEAKING_PACES.length - 1;
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(last, index + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    if (nextIndex === index || busy) return;
    const group = event.currentTarget.parentElement;
    choosePace(SPEAKING_PACES[nextIndex]);
    requestAnimationFrame(() => {
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
    });
  }

  async function addPronunciation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = { word: oneLine(word), say: oneLine(say) };
    if (!entry.word || !entry.say || busy) return;
    if (entry.word.toLowerCase() === entry.say.toLowerCase()) {
      setNotice(null);
      setError("Spell it the way it sounds, not the way it is written.");
      return;
    }
    // A word that is already listed is saved with its new spelling.
    const saved = await save(
      "pronunciations",
      { addPronunciation: entry },
      "Saved. Rehearse to hear it.",
    );
    if (saved && alive.current) {
      setWord("");
      setSay("");
    }
  }

  async function remove(part: Part, change: Change, removedNotice: string) {
    const removed = await save(part, change, removedNotice);
    if (!removed || !alive.current) return;
    const next = part === "names" ? nameInput : wordInput;
    requestAnimationFrame(() => next.current?.focus());
  }

  async function addName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = oneLine(name);
    if (!entry || busy) return;
    if (delivery.recognizedNames.some((saved) => saved.toLowerCase() === entry.toLowerCase())) {
      setNotice(null);
      setError(`${entry} is already on the list.`);
      return;
    }
    const saved = await save(
      "names",
      { addRecognizedName: entry },
      otherVoiceAnswers
        ? `Saved. ${agentName} listens for ${entry} when a built-in voice answers.`
        : `Saved. ${agentName} listens for ${entry} from the next call.`,
    );
    if (saved && alive.current) setName("");
  }

  const pronunciationsFull = delivery.pronunciations.length >= PRONUNCIATION_LIMIT;
  const namesFull = delivery.recognizedNames.length >= RECOGNIZED_NAME_LIMIT;
  const summary = [
    `${pace.label} Pace`,
    delivery.pronunciations.length ? plural(delivery.pronunciations.length, "Pronunciation") : "",
    delivery.recognizedNames.length ? plural(delivery.recognizedNames.length, "Name") : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="group rounded-xl border border-border bg-background">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-3 wl-focus-ring-halo sm:px-3">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold text-foreground">
            Pace &amp; Pronunciation
          </span>
          <span className="mt-0.5 block break-words text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="min-w-0 space-y-5 border-t border-border p-2.5 sm:p-3">
        <div aria-live="polite">
          {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
        </div>
        {error ? (
          <StatusNotice tone="destructive" title="Not Saved">
            {error}
          </StatusNotice>
        ) : null}

        <section className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={paceLabelId} className="text-sm font-semibold text-foreground">
              Speaking Pace
            </p>
            {sample ? (
              <button
                type="button"
                onClick={sample.toggle}
                aria-pressed={sample.playing}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
              >
                {sample.loading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : sample.playing ? (
                  <Square className="size-3 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="size-3.5" aria-hidden="true" />
                )}
                {sample.playing ? "Stop" : "Hear It"}
              </button>
            ) : null}
          </div>
          <div
            role="radiogroup"
            aria-labelledby={paceLabelId}
            className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-muted/40 p-1"
          >
            {SPEAKING_PACES.map((option, index) => {
              const checked = option.id === pace.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={busy || undefined}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => choosePace(option)}
                  onKeyDown={(event) => movePace(event, index)}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-0.5 text-[11px] font-semibold transition-colors wl-focus-ring-halo sm:px-1 sm:text-xs ${
                    checked
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  } ${busy ? "cursor-wait" : ""}`}
                >
                  {checked && saving === "pace" ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : null}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            How fast {agentName} talks on calls and in rehearsals. Saves when you pick.
          </p>
        </section>

        <section className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">Pronunciations</p>
          <p id={pronunciationHelpId} className="text-xs leading-5 text-muted-foreground">
            When the voice says a word wrong, spell it the way it sounds. Transcripts keep the
            original spelling.
          </p>
          {delivery.pronunciations.length ? (
            <ul className="space-y-1.5">
              {delivery.pronunciations.map((entry) => (
                <li
                  key={entry.word.toLowerCase()}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border py-0.5 pl-3 pr-0.5"
                >
                  <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                    <span className="font-semibold">{entry.word}</span>
                    <span aria-hidden="true" className="px-1.5 text-muted-foreground">
                      →
                    </span>
                    <span className="sr-only"> is said as </span>
                    <span>{entry.say}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void remove(
                        "pronunciations",
                        { removePronunciation: entry.word },
                        `Removed. ${agentName} says ${entry.word} as written again.`,
                      )
                    }
                    aria-label={`Remove Pronunciation For ${entry.word}`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo disabled:cursor-wait disabled:opacity-50"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {pronunciationsFull ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {PRONUNCIATION_LIMIT} is the most one Bot can keep. Remove one to add another.
            </p>
          ) : (
            <form
              onSubmit={(event) => void addPronunciation(event)}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="min-w-0 flex-1 basis-32 space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  Word As Written
                </span>
                <input
                  ref={wordInput}
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  maxLength={PRONUNCIATION_WORD_MAX}
                  placeholder="Siobhan"
                  autoComplete="off"
                  aria-describedby={pronunciationHelpId}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 flex-1 basis-32 space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">Say It Like</span>
                <input
                  value={say}
                  onChange={(event) => setSay(event.target.value)}
                  maxLength={PRONUNCIATION_SAY_MAX}
                  placeholder="Shi-vawn"
                  autoComplete="off"
                  className={fieldClass}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !oneLine(word) || !oneLine(say)}
                aria-label="Add Pronunciation"
                className={addButtonClass}
              >
                {saving === "pronunciations" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                Add
              </button>
            </form>
          )}
        </section>

        <section className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">Names To Recognize</p>
          <p id={nameHelpId} className="text-xs leading-5 text-muted-foreground">
            Names, products and places callers say, so {agentName} hears them right.
            {otherVoiceAnswers ? " Used when a built-in voice answers calls." : ""}
          </p>
          {delivery.recognizedNames.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {delivery.recognizedNames.map((entry) => (
                <li key={entry.toLowerCase()} className="min-w-0 max-w-full">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void remove("names", { removeRecognizedName: entry }, `Removed ${entry}.`)
                    }
                    aria-label={`Remove ${entry}`}
                    className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3.5 text-sm text-foreground transition-colors hover:bg-muted wl-focus-ring-halo disabled:cursor-wait disabled:opacity-50"
                  >
                    <span className="min-w-0 break-words text-left">{entry}</span>
                    <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {namesFull ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {RECOGNIZED_NAME_LIMIT} is the most one Bot can keep. Remove one to add another.
            </p>
          ) : (
            <form onSubmit={(event) => void addName(event)} className="flex items-end gap-2">
              <input
                ref={nameInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={RECOGNIZED_NAME_MAX}
                placeholder="A Name, Product Or Place"
                autoComplete="off"
                aria-label="Name To Recognize"
                aria-describedby={nameHelpId}
                className={fieldClass}
              />
              <button
                type="submit"
                disabled={busy || !oneLine(name)}
                aria-label="Add Name"
                className={addButtonClass}
              >
                {saving === "names" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                Add
              </button>
            </form>
          )}
        </section>
      </div>
    </details>
  );
}
