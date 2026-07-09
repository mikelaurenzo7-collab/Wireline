import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { authFetch } from "../../lib/api";
import { EmptyState } from "../ui/EmptyState";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { OPS_CHANNEL_EMPTY } from "../../lib/wireline-ops-design";

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
          description="Callbacks appear when agents or callers schedule follow-up dials."
          actions={[...OPS_CHANNEL_EMPTY.callbacks.actions]}
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {callbacks.map((cb) => (
        <li
          key={cb.id}
          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
        >
          <span className="font-mono text-sm">{cb.customer_number || "Unknown"}</span>
          <span className="text-sm text-muted-foreground">
            {cb.scheduled_at ? new Date(cb.scheduled_at).toLocaleString() : "—"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted w-fit">
            {cb.status || "pending"}
          </span>
          {cb.agent_name && <span className="text-sm">{cb.agent_name}</span>}
        </li>
      ))}
    </ul>
  );
}
