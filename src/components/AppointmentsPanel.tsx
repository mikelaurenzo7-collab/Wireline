import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";

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
          setError("Couldn't load appointments. Refresh to try again.");
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
        if (!cancelled)
          setError("Couldn't load appointments. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
          icon={<CalendarDays className="size-5" aria-hidden />}
          title={calendarConnected ? "No appointments yet" : "Connect a calendar"}
          description={
            calendarConnected
              ? "When an employee books during a call, the appointment appears here."
              : "Sync Google Workspace or Microsoft 365 so employees can book during live calls."
          }
          action={
            <Button asChild>
              {/* Calendar access is granted with the Google/Microsoft account
                  connected on /connections, so both states route there. */}
              <Link to="/connections">
                {calendarConnected ? "Manage calendar" : "Connect a calendar"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-6 sm:px-6">
      <ul className="flex flex-col gap-2">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="wl-data-row wl-data-row--framed">
            <span className="wl-data-row__leading rounded-lg bg-muted p-2">
              <CalendarDays className="size-4 text-primary" aria-hidden />
            </span>
            <span className="wl-data-row__main">
              <span className="wl-data-row__title">
                {appointment.customer_name || "Customer"}
                {appointment.service_type ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {appointment.service_type}
                  </span>
                ) : null}
              </span>
              <span className="wl-data-row__detail inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" aria-hidden />
                {scheduleLabel(appointment)}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {appointment.demo ? <Badge variant="outline">Demo</Badge> : null}
              <Badge variant={appointment.status === "Scheduled" ? "success" : "outline"}>
                {appointment.status || "Scheduled"}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
