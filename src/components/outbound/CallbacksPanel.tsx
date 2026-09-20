import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { authFetch } from "../../lib/api";
import { EmptyState } from "../ui/EmptyState";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { OPS_CHANNEL_EMPTY } from "../../lib/wireline-ops-design";
import { formatDateTime } from "../../lib/safe-date";
import { formatPhone } from "../../lib/safe-number";

type Callback = {
  id: string;
  customer_number?: string;
  scheduled_at?: string;
  status?: string;
  agent_name?: string;
  notes?: string;
};

export default function CallbacksPanel() {
  const [loading, setLoading] = useState(true);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/callbacks")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((body) => {
        if (cancelled) return;
        setCallbacks(Array.isArray(body.callbacks) ? body.callbacks : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load scheduled callbacks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <ClientRouteLoading icon={<CalendarClock className="h-5 w-5" />} label="Loading callbacks" />
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  }

  if (callbacks.length === 0) {
    return (
      <div className="flex w-full flex-col items-center px-4 py-8 sm:px-6">
        <EmptyState
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          className="w-full max-w-lg"
          icon={CalendarClock}
          title={OPS_CHANNEL_EMPTY.callbacks.title}
          actions={[...OPS_CHANNEL_EMPTY.callbacks.actions]}
        />
      </div>
    );
  }

  return (
    <ul className="space-y-3 p-4">
      {callbacks.map((cb) => (
        <li key={cb.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-words text-sm font-semibold tabular-nums text-foreground">
              {formatPhone(cb.customer_number, "Unknown Caller")}
            </p>
            <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
              <span className="sr-only">Status: </span>
              {cb.status === "Callback-Scheduled" ? "Scheduled" : cb.status || "Pending"}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Scheduled</dt>
              <dd className="mt-1 break-words text-foreground">
                {formatDateTime(
                  cb.scheduled_at,
                  { dateStyle: "medium", timeStyle: "short" },
                  "N/A",
                )}
              </dd>
            </div>
            {cb.agent_name && (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Bot</dt>
                <dd className="mt-1 break-words text-foreground">{cb.agent_name}</dd>
              </div>
            )}
            {cb.notes && (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Last Conversation</dt>
                <dd className="mt-1 break-words text-muted-foreground">{cb.notes}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}
