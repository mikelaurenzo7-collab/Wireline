import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, RefreshCw } from "lucide-react";

import { Link } from "react-router";

import { authFetch } from "../lib/api";
import { addDaysToIsoDate } from "../lib/calendar-time";
import { isoToLocalDateKey, localDateKey } from "../lib/date-display";
import { formatPhone } from "../lib/safe-number";
import { Badge, Button, EmptyState, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";

type Appointment = {
  id: string;
  date: string | null;
  time: string | null;
  customer_name: string | null;
  service_type: string | null;
  status: string | null;
  phone_number: string | null;
  demo?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  time_zone?: string | null;
  booking_source?: string | null;
};

function scheduleLabel(appointment: Appointment): string {
  if (appointment.start_at && appointment.time_zone) {
    const instant = new Date(appointment.start_at);
    if (Number.isFinite(instant.getTime())) {
      try {
        const start = new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: appointment.time_zone,
          timeZoneName: "short",
        }).format(instant);
        const duration = appointment.end_at
          ? (new Date(appointment.end_at).getTime() - instant.getTime()) / 60_000
          : NaN;
        return appointment.booking_source === "native" && Number.isFinite(duration) && duration > 0
          ? `${start} · ${Math.round(duration)} min`
          : start;
      } catch {
        /* Retain the original local date/time for older records. */
      }
    }
  }
  let date = appointment.date;
  let time = appointment.time;
  // These are local calendar/clock strings, not instants. UTC formatting keeps
  // their stored values intact regardless of the viewer's timezone.
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) {
      date = parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  if (time && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    time = new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  const parts = [date, time].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Time to be confirmed";
}

function appointmentTimestamp(appointment: Appointment): number | null {
  if (appointment.start_at) {
    const instant = new Date(appointment.start_at).getTime();
    if (Number.isFinite(instant)) return instant;
  }
  if (!appointment.date) return null;
  const value = appointment.time
    ? `${appointment.date} ${appointment.time}`
    : `${appointment.date} 23:59`;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function AppointmentRow({
  appointment,
  busy,
  confirmingCancel,
  onCancelIntent,
  onStatus,
}: {
  appointment: Appointment;
  busy?: boolean;
  confirmingCancel?: boolean;
  onCancelIntent?: (id: string | null) => void;
  onStatus?: (appointment: Appointment, status: "Confirmed" | "Cancelled") => void;
}) {
  const editable =
    appointment.booking_source === "native" &&
    ["Requested", "Confirmed", "Scheduled", "Rescheduled"].includes(appointment.status || "");
  const isGoogle =
    appointment.booking_source === "google" || appointment.booking_source === "google_calendar";

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3.5 sm:px-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2">
            <strong className="min-w-0 break-words text-sm font-semibold text-foreground">
              {appointment.customer_name || "Customer"}
            </strong>
            {isGoogle ? (
              <span className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Google Calendar
              </span>
            ) : null}
          </div>
          <Badge
            variant={
              ["Scheduled", "Confirmed"].includes(appointment.status || "") ? "success" : "outline"
            }
          >
            {appointment.status || "Scheduled"}
          </Badge>
        </div>
        {appointment.service_type ? (
          <p className="mt-1 break-words text-sm text-foreground">{appointment.service_type}</p>
        ) : null}
        {appointment.phone_number ? (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {formatPhone(appointment.phone_number)}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{scheduleLabel(appointment)}</span>
          </span>
          {isGoogle ? (
            <a
              href="https://calendar.google.com/calendar/u/0/r"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Open Google Calendar
            </a>
          ) : null}
        </div>
        {editable && onStatus ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirmingCancel ? (
              <>
                <span className="w-full text-sm">Cancel this appointment?</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onCancelIntent?.(null)}
                >
                  Keep Appointment
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus(appointment, "Cancelled")}
                >
                  {busy ? "Saving…" : "Cancel Appointment"}
                </Button>
              </>
            ) : (
              <>
                {appointment.status === "Requested" ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onStatus(appointment, "Confirmed")}
                  >
                    {busy ? "Saving…" : "Confirm"}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onCancelIntent?.(appointment.id)}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function GoogleCalendarCard() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [otherCalendarConnected, setOtherCalendarConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setConnectionError(false);
    authFetch("/api/calendar/accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { accounts?: Array<{ provider?: string }> } | null) => {
        if (cancelled) return;
        if (!Array.isArray(body?.accounts)) throw new Error("Calendar connection unavailable.");
        const hasGoogle = body.accounts.some((a) => a.provider === "google");
        setConnected(hasGoogle);
        setOtherCalendarConnected(!hasGoogle && body.accounts.length > 0);
      })
      .catch(() => {
        if (!cancelled) setConnectionError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionRevision]);

  async function handleSync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncNotice(null);
    setSyncError(null);
    try {
      const res = await authFetch("/api/calendar/sync", { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        google?: { status?: string };
      } | null;
      if (!res.ok || body?.google?.status !== "success")
        throw new Error(
          "Google busy times could not be fully refreshed. Check the connection and retry; saved busy times may be incomplete.",
        );
      setSyncNotice(
        `Google busy times refreshed at ${new Date().toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}.`,
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Could not refresh busy times. Retry.");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  if (loading) return null;

  if (connectionError) {
    return (
      <StatusNotice
        tone="warning"
        title="Couldn’t check connected calendars"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConnectionRevision((value) => value + 1)}
          >
            Retry
          </Button>
        }
      />
    );
  }

  if (connected) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <strong className="text-sm font-semibold text-foreground">
                  Google Calendar connected
                </strong>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Confirmed bookings are added to your Google Calendar. Refresh busy times after you
                change it.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={syncing}
              onClick={handleSync}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={`size-3.5 ${syncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {syncing ? "Refreshing…" : "Refresh busy times"}
            </Button>
            <a
              href="https://calendar.google.com/calendar/u/0/r"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open Calendar
            </a>
          </div>
        </div>
        {syncNotice ? (
          <p role="status" className="mt-2.5 text-xs font-medium text-primary">
            {syncNotice}
          </p>
        ) : null}
        {syncError ? (
          <p role="status" className="mt-2.5 text-xs font-medium text-destructive">
            {syncError}
          </p>
        ) : null}
      </div>
    );
  }

  // Calendars are connected in one place, Connections. This page only says
  // where busy times come from, so the same connect step is not offered twice.
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {otherCalendarConnected
        ? "Your Bot checks your connected calendar before it books, and adds confirmed bookings to it. "
        : "Your Bot books within the hours you set in Availability. Connect Google or Outlook to avoid conflicts with your own calendar and see confirmed bookings there. "}
      <Link
        to="/connections"
        className="font-medium text-foreground underline underline-offset-2 wl-focus-ring-halo"
      >
        {otherCalendarConnected ? "Manage in Connections" : "Open Connections"}
      </Link>
    </p>
  );
}

function groupAppointmentsByDay(items: Appointment[], calendarTimeZone?: string) {
  const groups: Array<{ label: string; date: string; items: Appointment[] }> = [];
  const now = new Date();
  const todayStr = localDateKey(now, calendarTimeZone) || localDateKey(now);
  const tomorrowStr = addDaysToIsoDate(todayStr, 1);

  for (const item of items) {
    const bookedDate = item.time_zone && isoToLocalDateKey(item.start_at, item.time_zone);
    const rawDate =
      bookedDate || item.date || isoToLocalDateKey(item.start_at, calendarTimeZone) || "Upcoming";
    let label = rawDate;
    if (rawDate === todayStr) label = "Today";
    else if (rawDate === tomorrowStr) label = "Tomorrow";
    else if (rawDate !== "Upcoming") {
      try {
        const d = new Date(`${rawDate}T00:00:00Z`);
        label = d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
      } catch {
        label = rawDate;
      }
    }

    const existing = groups.find((g) => g.date === rawDate);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label, date: rawDate, items: [item] });
    }
  }
  return groups;
}

export default function AppointmentsPanel({
  calendarConfigured = null,
  calendarTimeZone,
  onConfigure,
  reloadKey = 0,
  onAppointmentUpdated,
}: {
  calendarConfigured?: boolean | null;
  calendarTimeZone?: string;
  onConfigure?: () => void;
  reloadKey?: number;
  onAppointmentUpdated?: () => void;
} = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<{ message: string; expired: boolean } | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadAppointments = useCallback(async (cursor: string | null = null) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && requestRef.current === controller;
    setLoading(!cursor);
    setLoadingMore(Boolean(cursor));
    setMoreError(null);
    if (!cursor) setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const response = await authFetch(`/api/appointments?${params}`, {
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as {
        appointments?: Appointment[];
        hasMore?: boolean;
        nextCursor?: string | null;
        error?: string;
        code?: string;
      } | null;
      if (!isCurrent()) return;
      if (!response.ok) {
        const message = data?.error || "Could not load appointments.";
        if (cursor) setMoreError({ message, expired: data?.code === "APPOINTMENT_CURSOR_EXPIRED" });
        else setError(message);
        return;
      }
      if (!Array.isArray(data?.appointments) || (data.hasMore && !data.nextCursor))
        throw new Error("Could not load appointment history. Try again.");
      const page = data.appointments;
      if (!cursor) {
        setMutationError(null);
        setCancelConfirmId(null);
      }
      setAppointments((current) => {
        if (!cursor) return page;
        const known = new Set(current.map((appointment) => appointment.id));
        return [...current, ...page.filter((appointment) => !known.has(appointment.id))];
      });
      setHasMore(data.hasMore === true);
      setNextCursor(data.nextCursor || null);
    } catch (cause) {
      if (!isCurrent()) return;
      const message = cause instanceof Error ? cause.message : "Could not load appointments.";
      if (cursor) setMoreError({ message, expired: false });
      else setError(message);
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [loadAppointments, reloadKey]);

  async function changeStatus(appointment: Appointment, status: "Confirmed" | "Cancelled") {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setMutatingId(appointment.id);
    setMutationError(null);
    try {
      const response = await authFetch(`/api/appointments/${encodeURIComponent(appointment.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expected_status: appointment.status }),
      });
      const body = (await response.json().catch(() => null)) as {
        appointment?: { id?: string; status?: string };
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "The appointment could not be updated. Try again.");
      if (body?.appointment?.id !== appointment.id || body.appointment.status !== status)
        throw new Error("We couldn't confirm this update. Refresh Calendar before retrying.");
      setAppointments((current) =>
        current.map((row) => (row.id === appointment.id ? { ...row, status } : row)),
      );
      setCancelConfirmId(null);
      onAppointmentUpdated?.();
    } catch (reason) {
      setMutationError(
        reason instanceof Error
          ? reason.message
          : "The appointment could not be updated. Try again.",
      );
    } finally {
      mutationRef.current = false;
      setMutatingId(null);
    }
  }

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const future: Appointment[] = [];
    const history: Appointment[] = [];
    for (const appointment of appointments) {
      const timestamp = appointmentTimestamp(appointment);
      if (
        ["Cancelled", "Completed"].includes(appointment.status || "") ||
        (timestamp !== null && timestamp < now)
      )
        history.push(appointment);
      else future.push(appointment);
    }
    future.sort(
      (a, b) =>
        (appointmentTimestamp(a) ?? Number.MAX_SAFE_INTEGER) -
        (appointmentTimestamp(b) ?? Number.MAX_SAFE_INTEGER),
    );
    history.sort((a, b) => (appointmentTimestamp(b) ?? 0) - (appointmentTimestamp(a) ?? 0));
    return { upcoming: future, past: history };
  }, [appointments]);
  const [pastOpen, setPastOpen] = useState<boolean | null>(null);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-2 px-4 py-6 sm:px-6" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} shape="text" className="h-14 w-full max-w-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full justify-center px-4 py-8 sm:px-6">
        <StatusNotice
          tone="warning"
          title="Appointments Unavailable"
          className="w-full max-w-lg"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadAppointments()}
            >
              Retry
            </Button>
          }
        >
          {error}
        </StatusNotice>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:px-6">
        <EmptyState
          headingAs="h2"
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          className="w-full"
          icon={<CalendarDays className="size-5" aria-hidden="true" />}
          title="No Appointments Yet"
          description={
            calendarConfigured === false
              ? "Set your availability and booking rules so your Bot can take appointments."
              : "Appointments your Bot books will appear here."
          }
          action={
            calendarConfigured === false && onConfigure ? (
              <Button variant="secondary" size="sm" onClick={onConfigure}>
                Set Availability
              </Button>
            ) : undefined
          }
        />
        <GoogleCalendarCard />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:px-6">
      {mutationError ? (
        <StatusNotice
          tone="warning"
          title="Appointment Not Updated"
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                onAppointmentUpdated?.();
                void loadAppointments();
              }}
            >
              Refresh Calendar
            </Button>
          }
        >
          {mutationError}
        </StatusNotice>
      ) : null}
      <section aria-labelledby="upcoming-appointments">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="upcoming-appointments" className="text-sm font-semibold text-foreground">
            Upcoming
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">{upcoming.length}</span>
        </div>
        {upcoming.length ? (
          <div className="space-y-4">
            {groupAppointmentsByDay(upcoming, calendarTimeZone).map((group) => (
              <div key={group.date} className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-muted/80 px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {group.items.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      busy={mutatingId !== null}
                      confirmingCancel={cancelConfirmId === appointment.id}
                      onCancelIntent={setCancelConfirmId}
                      onStatus={changeStatus}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {hasMore ? "No upcoming appointments in loaded history" : "No upcoming appointments"}
          </div>
        )}
      </section>

      {hasMore || moreError ? (
        <div className="space-y-2">
          {moreError ? (
            <StatusNotice tone="warning" title="More Appointments Unavailable">
              {moreError.message}
            </StatusNotice>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            disabled={loading || loadingMore}
            onClick={() => void loadAppointments(moreError?.expired ? null : nextCursor)}
          >
            {loadingMore
              ? "Loading…"
              : moreError?.expired
                ? "Refresh Appointments"
                : moreError
                  ? "Retry More Appointments"
                  : "Load More Appointments"}
          </Button>
        </div>
      ) : null}

      {past.length ? (
        <details
          className="rounded-xl border border-border bg-card"
          open={pastOpen ?? upcoming.length === 0}
          onToggle={(event) => setPastOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
            History
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {past.length}
            </span>
          </summary>
          <ul className="space-y-2 border-t border-border p-3">
            {past.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        </details>
      ) : null}
      <GoogleCalendarCard />
    </div>
  );
}
