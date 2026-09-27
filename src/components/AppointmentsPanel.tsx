import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
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
};

function scheduleLabel(appointment: Appointment): string {
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
  if (!appointment.date) return null;
  const value = appointment.time
    ? `${appointment.date} ${appointment.time}`
    : `${appointment.date} 23:59`;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3.5 sm:px-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <strong className="min-w-0 break-words text-sm font-semibold text-foreground">
            {appointment.customer_name || "Customer"}
          </strong>
          <Badge variant={appointment.status === "Scheduled" ? "success" : "outline"}>
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
        <span className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{scheduleLabel(appointment)}</span>
        </span>
      </div>
    </li>
  );
}

export default function AppointmentsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
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
  }, [loadAppointments]);

  useEffect(() => {
    let cancelled = false;
    async function loadCalendar() {
      try {
        const calendarRes = await authFetch("/api/calendar/accounts");
        const calData = calendarRes.ok
          ? ((await calendarRes.json().catch(() => null)) as { accounts?: unknown[] } | null)
          : null;
        if (cancelled) return;
        setCalendarConnected(Array.isArray(calData?.accounts) ? calData.accounts.length > 0 : null);
      } catch {
        if (!cancelled) setCalendarConnected(null);
      }
    }
    void loadCalendar();
    return () => {
      cancelled = true;
    };
  }, []);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const future: Appointment[] = [];
    const history: Appointment[] = [];
    for (const appointment of appointments) {
      const timestamp = appointmentTimestamp(appointment);
      if (timestamp !== null && timestamp < now) history.push(appointment);
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
      <div className="wl-call-history-empty mx-auto my-4 grid min-h-[24rem] w-full max-w-[980px] flex-1 place-items-center px-4 py-8 sm:px-8">
        <EmptyState
          density="compact"
          titleTone="ui"
          withHalo={false}
          className="w-full max-w-lg"
          icon={<CalendarDays className="size-5" aria-hidden="true" />}
          title={calendarConnected === false ? "Connect a Calendar" : "No Appointments Yet"}
          action={
            calendarConnected !== null ? (
              <Button asChild variant="secondary" size="sm">
                <Link to="/connections">{calendarConnected ? "Calendar" : "Connect calendar"}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 sm:px-6">
      <section aria-labelledby="upcoming-appointments">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="upcoming-appointments" className="text-sm font-semibold text-foreground">
            Upcoming
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">{upcoming.length}</span>
        </div>
        {upcoming.length ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
            ))}
          </ul>
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
            Past
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
    </div>
  );
}
