import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import CallLogsClaude from "./CallLogsClaude";
import { EmptyState, Button } from "./atoms";

type CallsProbeResponse = {
  calls?: unknown[];
};

/**
 * Lightweight guard around the full call-ops console. When the workspace has no
 * calls yet, render the same framed empty primitive used by Inbox/Appointments
 * instead of letting the heavier console settle into an empty black pane.
 */
export default function PhoneCallHistoryPanel() {
  const [loading, setLoading] = useState(true);
  const [hasCalls, setHasCalls] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authFetch("/api/calls?limit=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: CallsProbeResponse | null) => {
        if (cancelled) return;
        setHasCalls(Array.isArray(body?.calls) && body.calls.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasCalls(null);
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
      <div className="flex w-full items-center justify-center px-4 py-10 text-sm text-muted-foreground sm:px-6">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading call history…
        </span>
      </div>
    );
  }

  // Only mount the heavy console when we positively know there is at least one call.
  // Probe failure (null) and empty workspaces both get the framed empty state — never
  // the black CallLogsClaude void that previously shipped on first paint.
  if (hasCalls === true) return <CallLogsClaude />;

  // Top-align the framed empty inside the operate panel. Vertical centering
  // against a scrollable/unbounded height chain parks the card below the fold
  // (the classic Phone History black void).
  return (
    <div className="flex w-full flex-col items-center px-4 py-8 sm:px-6">
      <EmptyState
        framed
        density="compact"
        titleTone="ui"
        withHalo={false}
        className="w-full max-w-lg"
        icon={<History className="size-5" aria-hidden />}
        title="No call history yet"
        description="Real calls, test calls, summaries, outcomes, and follow-ups will land here once a number is wired."
        action={
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link to="/studio?create=1">Create first agent</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings/phone">Wire a number</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
