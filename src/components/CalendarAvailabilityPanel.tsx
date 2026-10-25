import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { authFetch } from "../lib/api";
import { readCalendarSettings, type CalendarSettings } from "../lib/calendar-settings-client";
import { timeZoneOptions } from "../lib/time-zone-options";
import { Button, Input, NativeSelect, Switch } from "./atoms";
import { StatusNotice } from "./molecules";
import { Checkbox } from "./ui/shadcn/Checkbox";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function CalendarAvailabilityPanel({
  settings,
  configured,
  onChange,
  onSaved,
}: {
  settings: CalendarSettings;
  configured: boolean;
  onChange: (settings: CalendarSettings) => void;
  onSaved: (settings: CalendarSettings) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  async function syncBusyTimes() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncNotice(null);
    setSyncError(null);
    try {
      const accountsResponse = await authFetch("/api/calendar/accounts");
      const accountsBody = (await accountsResponse.json().catch(() => null)) as {
        accounts?: Array<{ provider?: string }>;
      } | null;
      if (!accountsResponse.ok || !Array.isArray(accountsBody?.accounts))
        throw new Error("Could not check connected calendars. Try again.");
      const providers = [
        ...new Set(
          accountsBody.accounts
            .map((account) => account.provider)
            .filter(
              (provider): provider is "google" | "microsoft" =>
                provider === "google" || provider === "microsoft",
            ),
        ),
      ];
      if (!providers.length) {
        setSyncNotice("Connect Google or Outlook to import busy times.");
        return;
      }
      const response = await authFetch("/api/calendar/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as Record<
        string,
        { status?: string }
      > | null;
      if (!response.ok || !body) throw new Error("Calendar sync failed. Try again.");
      const incomplete = providers.filter(
        (provider) => body[provider === "microsoft" ? "outlook" : "google"]?.status !== "success",
      );
      if (incomplete.length)
        throw new Error(
          `${incomplete.map((provider) => (provider === "google" ? "Google" : "Outlook")).join(" and ")} did not fully sync. Check the connection and retry; saved busy times may be incomplete.`,
        );
      setSyncNotice(
        `Busy times refreshed at ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`,
      );
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : "Calendar sync failed. Try again.");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  function change(patch: Partial<CalendarSettings>) {
    if (savingRef.current) return;
    setSaved(false);
    onChange({ ...settings, ...patch });
  }

  function setDay(day: number, hours: { start: string; end: string } | null) {
    change({
      weekly_hours: [
        ...settings.weekly_hours.filter((entry) => entry.day !== day),
        ...(hours ? [{ day, ...hours }] : []),
      ].sort((a, b) => a.day - b.day),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const next = { ...settings, enabled: configured ? settings.enabled : true };
    if (!readCalendarSettings(next) || (next.enabled && next.weekly_hours.length === 0)) {
      setError(
        "Choose a valid timezone and at least one available day, with an end time after its start.",
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await authFetch("/api/calendar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await response.json().catch(() => null)) as {
        settings?: unknown;
        configured?: boolean;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "Availability could not be saved. Try again.");
      const confirmed = readCalendarSettings(body?.settings);
      if (!confirmed || body?.configured !== true)
        throw new Error(
          "We couldn't confirm the saved availability. Reload Calendar to check it before retrying.",
        );
      onSaved(confirmed);
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Availability could not be saved. Try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 py-5 sm:px-6">
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          {configured ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
              <label
                htmlFor="calendar-enabled"
                className="min-w-0 break-words text-sm font-semibold"
              >
                Accept Bookings
              </label>
              <Switch
                id="calendar-enabled"
                checked={settings.enabled}
                onCheckedChange={(enabled) => change({ enabled })}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set your hours to let your Bot book appointments here.
            </p>
          )}

          <section
            aria-labelledby="calendar-hours-heading"
            className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <h2 id="calendar-hours-heading" className="text-sm font-semibold">
              Weekly Hours
            </h2>
            <div className="space-y-1.5">
              <label htmlFor="calendar-time-zone" className="text-sm font-medium">
                Timezone
              </label>
              <NativeSelect
                id="calendar-time-zone"
                value={settings.time_zone}
                onChange={(event) => change({ time_zone: event.target.value })}
                required
                className="min-w-0"
              >
                {timeZoneOptions(settings.time_zone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-3">
              {DAY_ORDER.map((day) => {
                const hours = settings.weekly_hours.find((entry) => entry.day === day);
                return (
                  <div
                    key={day}
                    className="grid min-w-0 gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center"
                  >
                    <label
                      className="flex min-h-11 items-center gap-2 text-sm"
                      htmlFor={`calendar-day-${day}`}
                    >
                      <Checkbox
                        id={`calendar-day-${day}`}
                        checked={Boolean(hours)}
                        onChange={(event) =>
                          setDay(
                            day,
                            event.target.checked ? { start: "09:00", end: "17:00" } : null,
                          )
                        }
                      />
                      {DAYS[day]}
                    </label>
                    {hours ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${DAYS[day]} start`}
                          value={hours.start}
                          onChange={(event) => setDay(day, { ...hours, start: event.target.value })}
                          required
                          className="min-w-0 basis-32 grow px-2"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="time"
                          aria-label={`${DAYS[day]} end`}
                          value={hours.end}
                          onChange={(event) => setDay(day, { ...hours, end: event.target.value })}
                          required
                          className="min-w-0 basis-32 grow px-2"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            aria-labelledby="calendar-rules-heading"
            className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <h2 id="calendar-rules-heading" className="text-sm font-semibold">
              Booking Rules
            </h2>
            <div className="space-y-1.5">
              <label htmlFor="calendar-appointment-name" className="text-sm font-medium">
                Appointment name
              </label>
              <Input
                id="calendar-appointment-name"
                value={settings.appointment_name}
                onChange={(event) => change({ appointment_name: event.target.value })}
                required
                maxLength={100}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["duration_minutes", "Duration (min)", 15, 240],
                  ["buffer_minutes", "Buffer (min)", 0, 120],
                  ["minimum_notice_minutes", "Notice (min)", 0, 10080],
                ] as const
              ).map(([key, label, min, max]) => (
                <div key={key} className="min-w-0 space-y-1.5">
                  <label htmlFor={`calendar-${key}`} className="text-sm font-medium">
                    {label}
                  </label>
                  <Input
                    id={`calendar-${key}`}
                    type="number"
                    min={min}
                    max={max}
                    step={1}
                    value={Number.isFinite(settings[key]) ? settings[key] : ""}
                    onChange={(event) =>
                      change({
                        [key]: event.target.value === "" ? Number.NaN : Number(event.target.value),
                      })
                    }
                    required
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="calendar-booking-mode" className="text-sm font-medium">
                Confirmation
              </label>
              <NativeSelect
                id="calendar-booking-mode"
                value={settings.booking_mode}
                onChange={(event) =>
                  change({ booking_mode: event.target.value as CalendarSettings["booking_mode"] })
                }
              >
                <option value="automatic">Book automatically</option>
                <option value="approval">Ask for approval</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {settings.booking_mode === "approval"
                  ? "Requests hold their time until you confirm or cancel them."
                  : "Your Bot confirms available times without waiting for approval."}
              </p>
            </div>
          </section>
        </fieldset>
        {error ? (
          <StatusNotice tone="warning" title="Availability Not Saved">
            {error}
          </StatusNotice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : configured ? "Save Changes" : "Enable Booking"}
          </Button>
          {saved ? (
            <span role="status" className="text-sm text-muted-foreground">
              Availability saved.
            </span>
          ) : null}
        </div>
      </form>
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Connected calendars <span className="font-normal text-muted-foreground">(optional)</span>
        </summary>
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">
            Import Google or Outlook busy times for the next 30 days. Sync again after changes; this
            is not live sync. New BotBound bookings stay here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={syncBusyTimes} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Busy Times"}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/connections">Manage Connections</Link>
            </Button>
          </div>
          {syncError ? (
            <StatusNotice tone="warning" title="Calendar Sync Incomplete">
              {syncError}
            </StatusNotice>
          ) : null}
          {syncNotice ? (
            <p role="status" className="text-sm text-muted-foreground">
              {syncNotice}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
