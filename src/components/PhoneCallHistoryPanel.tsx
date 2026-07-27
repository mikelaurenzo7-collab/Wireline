import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import CallLogsClaude from "./CallLogsClaude";
import { EmptyState, Button } from "./atoms";
import { StatusNotice } from "./molecules";
import { useAgents } from "../contexts/AgentsContext";

type CallsProbeResponse = {
  calls?: unknown[];
};

/**
 * Lightweight guard around the full call-ops console. When the workspace has no
 * calls yet, render the same framed empty primitive used by Inbox/Appointments
 * instead of letting the heavier console settle into an empty black pane.
 */
export default function PhoneCallHistoryPanel() {
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    phoneLookupDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const [loading, setLoading] = useState(true);
  const [hasCalls, setHasCalls] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    authFetch("/api/calls?limit=1")
      .then((response) => {
        if (!response.ok) throw new Error(`Call history request failed (${response.status})`);
        return response.json();
      })
      .then((body: CallsProbeResponse | null) => {
        if (cancelled) return;
        setHasCalls(Array.isArray(body?.calls) && body.calls.length > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setHasCalls(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loading || agentsLoading) {
    return (
      <div className="flex w-full items-center justify-center px-4 py-10 text-sm text-muted-foreground sm:px-6">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading call history…
        </span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="destructive"
          title="Call history unavailable"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Try again
            </Button>
          }
        >
          We could not load calls. Nothing has been erased; retry when the connection recovers.
        </StatusNotice>
      </div>
    );
  }

  // Only mount the heavy console when we positively know there is at least one call.
  // Probe failure (null) and empty workspaces both get the framed empty state — never
  // the black CallLogsClaude void that previously shipped on first paint.
  if (hasCalls === true) return <CallLogsClaude />;

  const hasAgents = agents.length > 0;
  if (agentsDegraded && !hasAgents) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="warning"
          title="Voice agent readiness unavailable"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={refreshAgents}>
              Retry
            </Button>
          }
        >
          Wireline could not confirm your voice agent or phone setup. Existing configuration is
          unchanged.
        </StatusNotice>
      </div>
    );
  }

  if (phoneLookupDegraded && hasAgents) {
    return (
      <div className="w-full px-4 py-8 sm:px-6">
        <StatusNotice
          tone="warning"
          title="Phone readiness unavailable"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={refreshAgents}>
              Retry
            </Button>
          }
        >
          Wireline could not confirm the phone numbers connected to your voice agents. Existing
          configuration is unchanged.
        </StatusNotice>
      </div>
    );
  }

  const livePhone = agents.find((agent) => agent.phone_number)?.phone_number ?? null;
  const emptyState = !hasAgents
    ? {
        title: "Create your first voice agent",
        description:
          "Call history starts after you create a voice agent, connect its number, and handle the first customer conversation.",
        action: (
          <Button asChild>
            <Link to="/studio?create=1">Create voice agent</Link>
          </Button>
        ),
      }
    : !livePhone
      ? {
          title: "Connect a phone number",
          description:
            "Your voice agent is ready for setup. Connect its customer line before expecting call history here.",
          action: (
            <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/settings/phone">Connect phone</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/studio?section=setup">Review voice agent</Link>
              </Button>
            </div>
          ),
        }
      : {
          title: "No call history yet",
          description:
            "Your customer line is connected. Place one real call to verify audio and populate the first summary, outcome, and follow-up.",
          action: (
            <Button asChild>
              <a href={`tel:${livePhone}`}>Call your Wireline number</a>
            </Button>
          ),
        };

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
        title={emptyState.title}
        description={emptyState.description}
        action={emptyState.action}
      />
    </div>
  );
}
