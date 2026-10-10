import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";

import { authFetch } from "../lib/api";
import { isWithinBusinessHours, type BusinessHours, type DayOfWeek } from "../lib/agent-runtime";
import { browserTimeZone, timeZoneOptions } from "../lib/time-zone-options";
import { cn } from "../lib/utils";
import { Badge, Button, Input, NativeSelect, Switch, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";
import { Checkbox } from "./ui/shadcn/Checkbox";

/**
 * Per-Bot business hours. Outside them, inbound calls are admitted in
 * after-hours mode (native-inbound-admission.ts): the Bot speaks the
 * after-hours greeting, takes a message, and saves it for the owner instead
 * of answering questions or booking. Until this editor, hours could only be
 * set through the API, so after-hours handling never ran for web owners.
 */

const DAYS: ReadonlyArray<{ key: DayOfWeek; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export const OUT_OF_HOURS_MESSAGE_MAX = 500;

/**
 * Midnight to 11:59 PM is saved as a day with no rule, which the runtime
 * reads as open all day. A day the runtime treats that way loads back as it.
 */
const ALL_DAY = { from: "00:00", to: "23:59" } as const;

export type HoursDay = { open: boolean; from: string; to: string };
export type HoursWeek = Record<DayOfWeek, HoursDay>;

type BusinessProfileBody = {
  business_hours?: BusinessHours | null;
  timezone?: string | null;
  out_of_hours_message?: string | null;
};

type SavedHours = { hours: BusinessHours | null; timezone: string; message: string };

function normalizeTime(value: string | undefined): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/** Monday to Friday, 9 to 5: the first schedule an owner sees. */
export function defaultHoursWeek(): HoursWeek {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      { open: key !== "sat" && key !== "sun", from: "09:00", to: "17:00" },
    ]),
  ) as HoursWeek;
}

/** The editor's week for saved hours, matching how the runtime reads each day. */
export function hoursWeekFromSaved(hours: BusinessHours | null | undefined): HoursWeek {
  const week = defaultHoursWeek();
  if (!hours || !Object.keys(hours).length) return week;
  for (const { key } of DAYS) {
    const day = hours[key];
    if (day?.closed) {
      week[key] = { ...week[key], open: false };
      continue;
    }
    const from = normalizeTime(day?.open);
    const to = normalizeTime(day?.close);
    week[key] = from && to ? { open: true, from, to } : { open: true, ...ALL_DAY };
  }
  return week;
}

/** Hours to save for the week; null when every day is open all day. */
export function businessHoursFromWeek(week: HoursWeek): BusinessHours | null {
  const hours: BusinessHours = {};
  for (const { key } of DAYS) {
    const day = week[key];
    if (!day.open) hours[key] = { closed: true };
    else if (day.from !== ALL_DAY.from || day.to !== ALL_DAY.to) {
      hours[key] = { open: day.from, close: day.to };
    }
  }
  return Object.keys(hours).length ? hours : null;
}

/** The first day whose times would not save as the owner meant them. */
export function hoursWeekProblem(week: HoursWeek): string | null {
  for (const { key, label } of DAYS) {
    const day = week[key];
    if (!day.open) continue;
    if (!normalizeTime(day.from) || !normalizeTime(day.to)) {
      return `Enter ${label}'s opening and closing times.`;
    }
    if (day.from === day.to) {
      return `${label} opens and closes at the same time. To stay open all day, use 12:00 AM to 11:59 PM.`;
    }
  }
  return null;
}

function readSavedHours(profile: BusinessProfileBody | null | undefined): SavedHours {
  const hours =
    profile?.business_hours &&
    typeof profile.business_hours === "object" &&
    Object.keys(profile.business_hours).length
      ? profile.business_hours
      : null;
  return {
    hours,
    timezone: profile?.timezone?.trim() || "UTC",
    message: profile?.out_of_hours_message?.trim() ?? "",
  };
}

/** Before any hours are set, the stored zone is the UTC default; the owner's own zone is the likelier answer. */
function startingTimeZone(saved: SavedHours): string {
  if (saved.hours || saved.timezone !== "UTC") return saved.timezone;
  return browserTimeZone() ?? saved.timezone;
}

function zoneName(zone: string): string {
  return zone === "UTC" ? "UTC" : (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

function localTime(zone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

type BusinessHoursEditorProps = {
  agentId: string;
  className?: string;
  compact?: boolean;
};

export default function BusinessHoursEditor({
  agentId,
  className = "",
  compact = false,
}: BusinessHoursEditorProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<SavedHours | null>(null);
  const [useHours, setUseHours] = useState(false);
  const [week, setWeek] = useState<HoursWeek>(defaultHoursWeek);
  const [timezone, setTimezone] = useState("UTC");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savingRef = useRef(false);

  function applySaved(next: SavedHours) {
    setSaved(next);
    setUseHours(Boolean(next.hours));
    setWeek(hoursWeekFromSaved(next.hours));
    setTimezone(startingTimeZone(next));
    setMessage(next.message);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Business hours could not be loaded.");
        return (await response.json()) as { businessProfile?: BusinessProfileBody | null };
      })
      .then((body) => {
        if (!cancelled) applySaved(readSavedHours(body.businessProfile));
      })
      .catch((reason) => {
        if (!cancelled) {
          setLoadError(
            reason instanceof Error ? reason.message : "Business hours could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, reloadKey]);

  function edited() {
    setNotice(null);
    setSaveError(null);
  }

  function setDay(key: DayOfWeek, patch: Partial<HoursDay>) {
    if (savingRef.current) return;
    edited();
    setWeek((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const problem = useHours ? hoursWeekProblem(week) : null;
    if (problem) {
      setNotice(null);
      setSaveError(problem);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    edited();
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/business`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_hours: useHours ? businessHoursFromWeek(week) : null,
            timezone,
            out_of_hours_message: message.trim() || null,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        businessProfile?: BusinessProfileBody;
        error?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : "Business hours could not be saved.",
        );
      }
      const confirmed = readSavedHours(body?.businessProfile);
      applySaved(confirmed);
      setNotice(
        confirmed.hours
          ? "Calls outside these hours get your after-hours greeting."
          : "Your Bot answers every call, any time.",
      );
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Business hours could not be saved.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const now = new Date();
  const openNow = saved?.hours
    ? isWithinBusinessHours({ business_hours: saved.hours, timezone: saved.timezone }, now)
    : true;
  const savedLocalTime = saved?.hours ? localTime(saved.timezone, now) : null;

  return (
    <section
      className={cn(
        compact
          ? "rounded-xl border border-border bg-card p-3 sm:p-4"
          : "rounded-2xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
      aria-labelledby="business-hours-heading"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3
          id="business-hours-heading"
          className={`${compact ? "text-base" : "text-lg"} font-semibold tracking-tight text-foreground`}
        >
          Business Hours
        </h3>
        {saved && !loading && !loadError ? (
          <Badge variant={!saved.hours ? "default" : openNow ? "success" : "warning"}>
            {!saved.hours ? "Always open" : openNow ? "Open now" : "After hours"}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading hours…
        </div>
      ) : loadError ? (
        <StatusNotice
          tone="destructive"
          title="Hours Unavailable"
          className="mt-3"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Try Again
            </Button>
          }
        >
          {loadError} Nothing was changed.
        </StatusNotice>
      ) : (
        <form onSubmit={save} className="mt-3 space-y-4">
          {saved?.hours && savedLocalTime ? (
            <p className="text-sm leading-6 text-muted-foreground">
              It&apos;s {savedLocalTime} in {zoneName(saved.timezone)}.
              {openNow ? "" : " Callers hear your after-hours greeting now."}
            </p>
          ) : null}
          <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-4">
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
              <label
                htmlFor="business-hours-enabled"
                className="min-w-0 break-words text-sm font-semibold text-foreground"
              >
                Set business hours
              </label>
              <Switch
                id="business-hours-enabled"
                checked={useHours}
                onCheckedChange={(checked) => {
                  if (savingRef.current) return;
                  edited();
                  setUseHours(checked);
                }}
              />
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {useHours
                ? "Outside these hours, your Bot greets callers with your after-hours greeting and takes a message for you in Approvals."
                : "Your Bot answers every call, any time."}
            </p>

            {useHours ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="business-hours-time-zone" className="text-sm font-medium">
                    Time zone
                  </label>
                  <NativeSelect
                    id="business-hours-time-zone"
                    value={timezone}
                    onChange={(event) => {
                      edited();
                      setTimezone(event.target.value);
                    }}
                    required
                    className="min-w-0"
                  >
                    {timeZoneOptions(timezone).map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  {DAYS.map(({ key, label }) => {
                    const day = week[key];
                    return (
                      <div
                        key={key}
                        className={cn(
                          "grid min-w-0 gap-2",
                          !compact && "sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center",
                        )}
                      >
                        <label
                          className="flex min-h-11 items-center gap-2 text-sm"
                          htmlFor={`business-hours-${key}`}
                        >
                          <Checkbox
                            id={`business-hours-${key}`}
                            checked={day.open}
                            onChange={(event) => setDay(key, { open: event.target.checked })}
                          />
                          {label}
                        </label>
                        {day.open ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              aria-label={`${label} opens`}
                              value={day.from}
                              onChange={(event) => setDay(key, { from: event.target.value })}
                              required
                              className="min-w-0 basis-full grow px-2 sm:basis-32"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="time"
                              aria-label={`${label} closes`}
                              value={day.to}
                              onChange={(event) => setDay(key, { to: event.target.value })}
                              required
                              className="min-w-0 basis-full grow px-2 sm:basis-32"
                            />
                            {day.to < day.from ? (
                              <span className="text-xs text-muted-foreground">next day</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="business-hours-message"
                    className="text-sm font-semibold text-foreground"
                  >
                    After-hours greeting{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    id="business-hours-message"
                    rows={2}
                    maxLength={OUT_OF_HOURS_MESSAGE_MAX}
                    value={message}
                    onChange={(event) => {
                      edited();
                      setMessage(event.target.value);
                    }}
                    placeholder="Thanks for calling. We're closed right now, but I can take a message."
                    className="min-h-11"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Your Bot says this first, then takes the caller&apos;s name, number, and reason.
                    Leave it blank for a standard closed greeting.
                  </p>
                </div>
              </>
            ) : null}
          </fieldset>

          {notice ? (
            <StatusNotice tone="success" title="Hours Saved">
              {notice}
            </StatusNotice>
          ) : null}
          {saveError ? (
            <StatusNotice tone="destructive" title="Hours Need Attention">
              {saveError}
            </StatusNotice>
          ) : null}

          <Button
            type="submit"
            size={compact ? "sm" : undefined}
            className="h-auto whitespace-normal"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {saving ? "Saving…" : "Save Hours"}
          </Button>
        </form>
      )}
    </section>
  );
}
