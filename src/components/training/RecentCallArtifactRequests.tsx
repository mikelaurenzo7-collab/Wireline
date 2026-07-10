import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FilePlus2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../../lib/api";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";

type ArtifactFormat = "pdf" | "docx" | "pptx" | "xlsx";
type ArtifactDestination = "google_drive" | "onedrive";

type ArtifactPreferences = {
  artifact_mode: "off" | "manual";
  artifact_format: ArtifactFormat;
  artifact_destination: ArtifactDestination | null;
};

type PreferencesResponse = { preferences?: ArtifactPreferences };

type Call = {
  id: string;
  agent_name?: string | null;
  customer_number?: string | null;
  summary?: string | null;
  outcome_tag?: string | null;
  created_at?: string | null;
};

type JobState = {
  status: "pending" | "running" | "done" | "failed" | "dead";
  error?: string | null;
  result?: {
    external_url?: string;
    file_name?: string;
  } | null;
};

type RequestState = {
  jobId: string;
  status: JobState["status"];
  error?: string | null;
  externalUrl?: string;
  fileName?: string;
};

export const REPORT_PREFERENCES_SAVED_EVENT = "wireline:report-preferences-saved";

const FORMAT_LABELS: Record<ArtifactFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
};

function callLabel(call: Call): string {
  return call.agent_name || call.customer_number || "Completed call";
}

function callTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

async function fetchArtifactPreferences(): Promise<ArtifactPreferences | null> {
  const response = await authFetch("/api/post-call-output-preferences");
  const body = (await response.json()) as PreferencesResponse & { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not load report defaults.");
  return body.preferences || null;
}

export default function RecentCallArtifactRequests() {
  const [preferences, setPreferences] = useState<ArtifactPreferences | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [requests, setRequests] = useState<Record<string, RequestState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(new Map<string, number>());

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchArtifactPreferences(),
      authFetch("/api/calls?limit=12").then(async (response) => {
        const body = (await response.json()) as { calls?: Call[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load recent calls.");
        return Array.isArray(body.calls) ? body.calls : [];
      }),
    ])
      .then(([nextPreferences, nextCalls]) => {
        if (!active) return;
        setPreferences(nextPreferences);
        setCalls(nextCalls);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load recent calls.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const refreshPreferences = () => {
      void fetchArtifactPreferences()
        .then((next) => {
          if (active) setPreferences(next);
        })
        .catch(() => undefined);
    };
    const onPreferencesSaved = (event: Event) => {
      const detail = (event as CustomEvent<ArtifactPreferences | undefined>).detail;
      if (detail) setPreferences(detail);
      else refreshPreferences();
    };
    window.addEventListener(REPORT_PREFERENCES_SAVED_EVENT, onPreferencesSaved);
    const preferencesRefreshTimer = window.setInterval(refreshPreferences, 5_000);

    const timers = polling.current;
    return () => {
      active = false;
      window.removeEventListener(REPORT_PREFERENCES_SAVED_EVENT, onPreferencesSaved);
      window.clearInterval(preferencesRefreshTimer);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const enabled =
    preferences?.artifact_mode === "manual" && Boolean(preferences.artifact_destination);
  const formatLabel = preferences ? FORMAT_LABELS[preferences.artifact_format] : "file";
  const visibleCalls = useMemo(() => calls.filter((call) => Boolean(call.id)).slice(0, 8), [calls]);

  async function pollJob(callId: string, jobId: string, attempt = 0): Promise<void> {
    if (attempt >= 100) {
      polling.current.delete(callId);
      setRequests((current) => ({
        ...current,
        [callId]: {
          ...current[callId],
          jobId,
          status: "failed",
          error: "The file is still processing. Check this call again shortly.",
        },
      }));
      return;
    }

    try {
      const response = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
      const body = (await response.json()) as { job?: JobState; error?: string };
      if (!response.ok || !body.job) throw new Error(body.error || "Could not check file status.");
      const job = body.job;
      const externalUrl = job.result?.external_url;
      setRequests((current) => ({
        ...current,
        [callId]: {
          jobId,
          status: job.status,
          error: job.error || null,
          externalUrl,
          fileName: job.result?.file_name,
        },
      }));
      if (job.status === "pending" || job.status === "running") {
        const prior = polling.current.get(callId);
        if (prior) window.clearTimeout(prior);
        const timer = window.setTimeout(() => void pollJob(callId, jobId, attempt + 1), 3_000);
        polling.current.set(callId, timer);
      } else {
        polling.current.delete(callId);
      }
    } catch (cause) {
      polling.current.delete(callId);
      setRequests((current) => ({
        ...current,
        [callId]: {
          ...current[callId],
          jobId,
          status: "failed",
          error: cause instanceof Error ? cause.message : "Could not check file status.",
        },
      }));
    }
  }

  async function requestFile(callId: string): Promise<void> {
    const currentStatus = requests[callId]?.status;
    if (!enabled || !preferences || currentStatus === "pending" || currentStatus === "running") {
      return;
    }
    setRequests((current) => ({
      ...current,
      [callId]: { jobId: "", status: "pending" },
    }));
    try {
      const response = await authFetch(`/api/call-logs/${encodeURIComponent(callId)}/artifact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as { job_id?: string; error?: string };
      if (!response.ok || !body.job_id) {
        throw new Error(body.error || "Could not queue the requested file.");
      }
      const jobId = body.job_id;
      setRequests((current) => ({
        ...current,
        [callId]: { jobId, status: "pending" },
      }));

      // Serverless workers otherwise wait for the periodic queue sweep. Start this
      // owned job immediately, but do not block the interface while OpenAI and the
      // connected storage provider finish. Polling remains the source of UI truth.
      void authFetch(`/api/jobs/${encodeURIComponent(jobId)}/run`, {
        method: "POST",
        timeoutMs: 540_000,
      }).catch(() => undefined);
      void pollJob(callId, jobId);
    } catch (cause) {
      setRequests((current) => ({
        ...current,
        [callId]: {
          jobId: "",
          status: "failed",
          error: cause instanceof Error ? cause.message : "Could not queue the requested file.",
        },
      }));
    }
  }

  if (loading) {
    return <section className="wl-paper wl-paper-elevated min-h-[180px] animate-pulse" />;
  }

  return (
    <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="wl-eyebrow wl-eyebrow--muted">Create on demand</p>
          <h2 className="mt-2 wl-card-title">Recent call files</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Request the default {formatLabel} file for an individual completed call. Wireline saves
            it to your configured destination and keeps only the job metadata and link.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/phone?tab=logs">Open full call history</Link>
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <StatusNotice tone="destructive" title="Recent calls unavailable">
            {error}
          </StatusNotice>
        </div>
      ) : null}

      {!enabled ? (
        <div className="mt-4">
          <StatusNotice tone="warning" title="Choose defaults first">
            Enable special files and select a connected destination above, then save your report
            preferences.
          </StatusNotice>
        </div>
      ) : null}

      {!error && visibleCalls.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Completed calls will appear here when they have a saved operating record.
        </p>
      ) : null}

      {visibleCalls.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {visibleCalls.map((call) => {
            const request = requests[call.id];
            const busy = request?.status === "pending" || request?.status === "running";
            return (
              <li key={call.id} className="wl-data-row wl-data-row--framed items-start gap-3">
                <span className="wl-data-row__leading rounded-lg bg-muted p-2">
                  {busy ? (
                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <FilePlus2 size={17} aria-hidden="true" />
                  )}
                </span>
                <span className="wl-data-row__main min-w-0">
                  <span className="wl-data-row__title truncate">{callLabel(call)}</span>
                  <span className="wl-data-row__detail line-clamp-2">
                    {[callTime(call.created_at), call.outcome_tag, call.summary]
                      .filter(Boolean)
                      .join(" · ") || "Saved call record"}
                  </span>
                  {request?.error ? (
                    <span className="mt-1 block text-xs text-destructive">{request.error}</span>
                  ) : null}
                </span>
                <span className="ml-auto shrink-0">
                  {request?.status === "done" && request.externalUrl ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={request.externalUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} aria-hidden="true" />
                        Open {request.fileName || formatLabel}
                      </a>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!enabled || busy}
                      onClick={() => void requestFile(call.id)}
                    >
                      {busy ? "Creating…" : `Create ${formatLabel}`}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
