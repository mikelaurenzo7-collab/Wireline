import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { authFetch } from "../lib/api";
import {
  handoffKeywords,
  humanHandoffProblem,
  normalizeHandoffPhone,
  readHumanHandoffProfile,
  sameHumanHandoff,
  type HumanHandoffDraft,
  type HumanHandoffValues,
} from "../lib/human-handoff-settings";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { Button, Input, Switch, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";

type Props = {
  agentId: string;
  ownerId: string | null;
  botPhone?: string | null;
  drafts: Map<string, HumanHandoffDraft>;
  compact?: boolean;
};

/** Routing is optional; keep it folded until an owner needs a person involved. */
export default function HumanHandoffEditor({ agentId, ownerId, botPhone, drafts, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [, redraw] = useState(0);
  const scope = `${ownerId ?? ""}:${agentId}`;
  const active = useRef({ scope, drafts, mounted: true });
  active.current.scope = scope;
  active.current.drafts = drafts;
  let entry = drafts.get(agentId);
  if (!entry) {
    entry = { saved: null, values: null, saving: false };
    drafts.set(agentId, entry);
  }
  const draft = entry;
  draft.listeners ??= new Set();
  const current = useCallback(
    () =>
      active.current.mounted && active.current.scope === scope && active.current.drafts === drafts,
    [scope, drafts],
  );
  const refresh = useCallback(() => {
    draft.listeners?.forEach((listener) => listener());
  }, [draft]);

  useEffect(() => {
    const lifecycle = active.current;
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
    };
  }, []);

  useEffect(() => {
    const listener = () => {
      if (current()) redraw((value) => value + 1);
    };
    draft.listeners?.add(listener);
    return () => {
      draft.listeners?.delete(listener);
    };
  }, [current, draft]);

  useEffect(() => {
    if (!open || !ownerId) return;
    // Refresh a clean snapshot on reopening. Unsaved edits and an in-flight
    // save belong to the retained draft and cannot be replaced by a read.
    if (draft.saving || (draft.values && !sameHumanHandoff(draft.values, draft.saved))) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          businessProfile?: unknown;
        } | null;
        const values = readHumanHandoffProfile(body?.businessProfile);
        if (!response.ok || !values) throw new Error("Human handoff settings could not be loaded.");
        if (cancelled || !current()) return;
        draft.saved = values;
        draft.values = values;
        refresh();
      })
      .catch((error: unknown) => {
        if (!cancelled && current())
          setLoadError(
            error instanceof Error ? error.message : "Human handoff settings could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled && current()) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, ownerId, drafts, open, reload, current, draft, refresh]);

  function edit<K extends keyof HumanHandoffValues>(field: K, value: HumanHandoffValues[K]) {
    if (loading || draft.saving || !draft.values || !current()) return;
    draft.values = { ...draft.values, [field]: value };
    draft.error = null;
    setSaveError(null);
    setNotice(null);
    refresh();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (loading || draft.saving || !draft.values || !draft.saved || !ownerId || !current()) return;
    const submitted = { ...draft.values };
    const problem = humanHandoffProblem(submitted, botPhone ? [botPhone] : []);
    setNotice(null);
    if (problem) {
      setSaveError(problem);
      return;
    }
    draft.saving = true;
    draft.error = null;
    setSaveError(null);
    refresh();
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/business`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            escalation_phone: normalizeHandoffPhone(submitted.phone),
            escalation_email: submitted.email.trim() || null,
            escalation_handoff_enabled: submitted.transfer,
            escalation_keywords: handoffKeywords(submitted.keywords),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        businessProfile?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Human handoff settings could not be saved.",
        );
      const confirmed = readHumanHandoffProfile(body?.businessProfile);
      if (!confirmed)
        throw new Error("The save could not be confirmed. Your draft is preserved; try again.");
      draft.saved = confirmed;
      if (sameHumanHandoff(draft.values, submitted)) draft.values = confirmed;
      if (current()) {
        setNotice(
          confirmed.transfer
            ? "Live transfers are on. Test your connected phone before sharing it."
            : "Human handoff settings saved.",
        );
        window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      }
    } catch (error) {
      draft.error =
        error instanceof Error ? error.message : "Human handoff settings could not be saved.";
      if (current()) setSaveError(draft.error);
    } finally {
      draft.saving = false;
      refresh();
    }
  }

  const values = draft.values;
  const pending = !sameHumanHandoff(values, draft.saved);
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
        aria-controls="human-handoff-settings"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`${compact ? "text-base" : "text-lg"} min-w-0 max-w-full break-words font-semibold tracking-tight text-foreground`}
        >
          Human Handoff
        </span>
        <span className="flex max-w-full shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {draft.saved ? (draft.saved.transfer ? "Live transfer" : "Notify & review") : "Optional"}
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div id="human-handoff-settings" className="mt-3">
          {!draft.saved && loading ? (
            <p className="flex min-w-0 items-center gap-2 break-words text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading handoff…
            </p>
          ) : loadError ? (
            <StatusNotice
              tone="destructive"
              title="Handoff Unavailable"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try Again
                </Button>
              }
            >
              {loadError}
            </StatusNotice>
          ) : values ? (
            <form onSubmit={save} className="space-y-4">
              <fieldset
                disabled={draft.saving || loading}
                aria-busy={draft.saving || loading}
                className="min-w-0 space-y-4"
              >
                <label className="grid min-w-0 gap-1.5" htmlFor="human-handoff-phone">
                  <span className="text-sm font-medium">Phone number</span>
                  <Input
                    id="human-handoff-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+1 (312) 555-0123"
                    value={values.phone}
                    maxLength={32}
                    onChange={(event) => edit("phone", event.target.value)}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5" htmlFor="human-handoff-email">
                  <span className="text-sm font-medium">Notification email</span>
                  <Input
                    id="human-handoff-email"
                    type="email"
                    autoComplete="email"
                    placeholder="team@yourbusiness.com"
                    value={values.email}
                    maxLength={254}
                    onChange={(event) => edit("email", event.target.value)}
                  />
                </label>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
                  <label
                    htmlFor="human-handoff-transfer"
                    className="min-w-0 max-w-full break-words text-sm font-semibold"
                  >
                    Transfer live calls
                  </label>
                  <Switch
                    id="human-handoff-transfer"
                    checked={values.transfer}
                    onCheckedChange={(checked) => edit("transfer", checked)}
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {values.transfer
                    ? "When a caller needs a person, transfer to this number. If transfer fails, your Bot offers to take a message."
                    : "Escalations are saved for review. Notifications use these contacts; workspace defaults apply when blank."}
                </p>
                <label className="grid min-w-0 gap-1.5" htmlFor="human-handoff-keywords">
                  <span className="text-sm font-medium">
                    Escalate when callers mention{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <Textarea
                    id="human-handoff-keywords"
                    rows={2}
                    placeholder="Urgent complaint, speak to a manager…"
                    value={values.keywords}
                    onChange={(event) => edit("keywords", event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Separate triggers with commas or new lines.
                  </span>
                </label>
              </fieldset>
              {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
              {saveError || draft.error ? (
                <StatusNotice tone="destructive" title="Handoff Not Saved">
                  {saveError || draft.error}
                </StatusNotice>
              ) : null}
              <Button
                type="submit"
                size={compact ? "sm" : undefined}
                disabled={draft.saving || loading || !pending}
              >
                {draft.saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {draft.saving ? "Saving…" : "Save Handoff"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
