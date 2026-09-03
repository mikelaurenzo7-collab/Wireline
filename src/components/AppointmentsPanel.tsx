import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
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
  const parts = [appointment.date, appointment.time].filter(Boolean);
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
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3.5 sm:px-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold text-foreground">
          {appointment.customer_name || "Customer"}
        </strong>
        <span className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          {scheduleLabel(appointment)}
        </span>
      </span>
      <Badge variant={appointment.status === "Scheduled" ? "success" : "outline"}>
        {appointment.status || "Scheduled"}
      </Badge>
    </li>
  );
}

export default function AppointmentsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [apptRes, calendarRes] = await Promise.all([
          authFetch("/api/appointments?limit=100"),
          authFetch("/api/calendar/accounts"),
        ]);
        if (cancelled) return;
        if (!apptRes.ok) {
          setError("Could not load appointments.");
          return;
        }
        const apptData = (await apptRes.json()) as { appointments?: Appointment[] };
        setAppointments(Array.isArray(apptData.appointments) ? apptData.appointments : []);
        if (calendarRes.ok) {
          const calData = (await calendarRes.json().catch(() => null)) as {
            accounts?: unknown[];
          } | null;
          setCalendarConnected(Array.isArray(calData?.accounts) && calData.accounts.length > 0);
        }
      } catch {
        if (!cancelled) setError("Could not load appointments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
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
        <StatusNotice tone="warning" title="Appointments unavailable" className="w-full max-w-lg">
          {error}
        </StatusNotice>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="flex w-full flex-col items-center px-4 py-8 sm:px-6">
        <EmptyState
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          className="w-full max-w-lg"
          icon={<CalendarDays className="size-5" aria-hidden="true" />}
          title={calendarConnected ? "No appointments yet" : "Connect a calendar"}
          action={
            <Button asChild>
              <Link to="/connections">{calendarConnected ? "Calendar" : "Connect calendar"}</Link>
            </Button>
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
            No upcoming appointments
          </div>
        )}
      </section>

      {past.length ? (
        <details
          className="rounded-xl border border-border bg-card"
          defaultOpen={upcoming.length === 0}
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
