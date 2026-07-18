import { useEffect, useMemo, useState } from "react";
import { FileChartColumn, FileText, Presentation, Sheet, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, NativeSelect } from "../atoms";
import { StatusNotice } from "../molecules";
import { authFetch } from "../../lib/api";
import { REPORT_PREFERENCES_SAVED_EVENT } from "./RecentCallArtifactRequests";

type ArtifactFormat = "pdf" | "docx" | "pptx" | "xlsx";
type Destination = "google_drive" | "onedrive";
type Frequency = "off" | "daily" | "weekly";

type Preferences = {
  internal_record_enabled: true;
  spreadsheet_destination: "none" | "google_sheets" | "microsoft_excel" | "both";
  artifact_mode: "off" | "manual";
  artifact_format: ArtifactFormat;
  artifact_destination: Destination | null;
  scheduled_report_frequency: Frequency;
  scheduled_report_format: ArtifactFormat;
  scheduled_report_destination: Destination | null;
  scheduled_report_send_at_utc: string;
  scheduled_report_weekday: number;
  scheduled_report_version: number;
};

type ConnectionState = {
  google_sheets: boolean;
  microsoft_excel: boolean;
  google_drive: boolean;
  onedrive: boolean;
};

type ResponsePayload = {
  preferences: Preferences;
  connections: ConnectionState;
  next_scheduled_report_at?: string | null;
};

const FORMATS: Array<{ value: ArtifactFormat; label: string; detail: string }> = [
  {
    value: "pdf",
    label: "PDF report",
    detail: "Polished, fixed-layout client or operating report",
  },
  { value: "docx", label: "Word document", detail: "Editable proposal, recap, or report" },
  {
    value: "xlsx",
    label: "Excel workbook",
    detail: "Structured analysis, call data, and action plan",
  },
  {
    value: "pptx",
    label: "PowerPoint presentation",
    detail: "Branded executive or client-facing deck",
  },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcScheduleToLocal(
  utcTime: string,
  utcWeekday: number,
): { time: string; weekday: number } {
  const [hour, minute] = utcTime.split(":").map(Number);
  const now = new Date();
  const date = new Date(now);
  const delta = (utcWeekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  date.setUTCHours(hour || 0, minute || 0, 0, 0);
  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    weekday: date.getDay(),
  };
}

function localScheduleToUtc(
  localTime: string,
  localWeekday: number,
): { time: string; weekday: number } {
  const [hour, minute] = localTime.split(":").map(Number);
  const now = new Date();
  const date = new Date(now);
  const delta = (localWeekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  date.setHours(hour || 0, minute || 0, 0, 0);
  return {
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
    weekday: date.getUTCDay(),
  };
}

function destinationLabel(destination: Destination): string {
  return destination === "google_drive" ? "Google Drive" : "Microsoft OneDrive";
}

function FormatIcon({ format }: { format: ArtifactFormat }) {
  if (format === "pptx") return <Presentation size={17} aria-hidden="true" />;
  if (format === "xlsx") return <Sheet size={17} aria-hidden="true" />;
  if (format === "pdf") return <FileChartColumn size={17} aria-hidden="true" />;
  return <FileText size={17} aria-hidden="true" />;
}

export default function ReportingPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [connections, setConnections] = useState<ConnectionState | null>(null);
  const [localTime, setLocalTime] = useState("08:00");
  const [localWeekday, setLocalWeekday] = useState(1);
  const [nextReportAt, setNextReportAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authFetch("/api/post-call-output-preferences");
        const data = (await response.json()) as ResponsePayload & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load report settings.");
        if (!active) return;
        setPreferences(data.preferences);
        setConnections(data.connections);
        setNextReportAt(data.next_scheduled_report_at || null);
        const local = utcScheduleToLocal(
          data.preferences.scheduled_report_send_at_utc,
          data.preferences.scheduled_report_weekday,
        );
        setLocalTime(local.time);
        setLocalWeekday(local.weekday);
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load report settings.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const connectedDestinations = useMemo(() => {
    const values: Destination[] = [];
    if (connections?.google_drive) values.push("google_drive");
    if (connections?.onedrive) values.push("onedrive");
    return values;
  }, [connections]);

  function patch(next: Partial<Preferences>) {
    setPreferences((current) => (current ? { ...current, ...next } : current));
    setMessage(null);
  }

  async function save() {
    if (!preferences || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const utc = localScheduleToUtc(localTime, localWeekday);
    try {
      const response = await authFetch("/api/post-call-output-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_destination: preferences.spreadsheet_destination,
          artifact_mode: preferences.artifact_mode,
          artifact_format: preferences.artifact_format,
          artifact_destination: preferences.artifact_destination,
          scheduled_report_frequency: preferences.scheduled_report_frequency,
          scheduled_report_format: preferences.scheduled_report_format,
          scheduled_report_destination: preferences.scheduled_report_destination,
          scheduled_report_send_at_utc: utc.time,
          scheduled_report_weekday: utc.weekday,
        }),
      });
      const data = (await response.json()) as ResponsePayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save report settings.");
      setPreferences(data.preferences);
      setConnections(data.connections);
      setNextReportAt(data.next_scheduled_report_at || null);
      setMessage("Report preferences saved.");
      // Notify the sibling artifact-requests panel immediately instead of
      // relying on a background poll.
      window.dispatchEvent(
        new CustomEvent(REPORT_PREFERENCES_SAVED_EVENT, { detail: data.preferences }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save report settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="wl-paper wl-paper-elevated min-h-[320px] animate-pulse"
        aria-label="Loading report settings"
      />
    );
  }

  if (!preferences || !connections) {
    return (
      <StatusNotice tone="destructive" title="Report settings unavailable">
        {error || "Reload the page and try again."}
      </StatusNotice>
    );
  }

  const noStorageConnected = connectedDestinations.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-muted p-2.5 text-foreground" aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="wl-card-title">Normal post-call process</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Always on. Every completed call receives an outcome, structured note, next action,
              lead or CRM update, quality review, and audit trail. Special files below are optional
              and never replace this operating record.
            </p>
          </div>
        </div>
      </section>

      {noStorageConnected ? (
        <StatusNotice tone="warning" title="Connect a report destination">
          Connect Google or Microsoft before enabling native files. Wireline writes the finished
          file to your workspace and keeps only the job metadata and external link.{" "}
          <Link to="/connections" className="font-semibold underline underline-offset-4">
            Open Connections
          </Link>
        </StatusNotice>
      ) : null}

      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="wl-eyebrow wl-eyebrow--muted">On request</p>
            <h2 className="mt-2 wl-card-title">Special call files</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Choose the default file your team can request from an individual call. Nothing is
              generated or sent automatically.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={preferences.artifact_mode === "manual"}
              onChange={(event) =>
                patch({ artifact_mode: event.target.checked ? "manual" : "off" })
              }
            />
            Allow special files
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">
            Default format
            <NativeSelect
              value={preferences.artifact_format}
              disabled={preferences.artifact_mode === "off"}
              onChange={(event) => patch({ artifact_format: event.target.value as ArtifactFormat })}
            >
              {FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Save to
            <NativeSelect
              value={preferences.artifact_destination || ""}
              disabled={preferences.artifact_mode === "off"}
              onChange={(event) =>
                patch({ artifact_destination: (event.target.value || null) as Destination | null })
              }
            >
              <option value="">Choose destination</option>
              {connectedDestinations.map((destination) => (
                <option key={destination} value={destination}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {FORMATS.map((format) => (
            <div key={format.value} className="wl-data-row wl-data-row--framed">
              <span className="wl-data-row__leading rounded-lg bg-muted p-2">
                <FormatIcon format={format.value} />
              </span>
              <span className="wl-data-row__main">
                <span className="wl-data-row__title">{format.label}</span>
                <span className="wl-data-row__detail">{format.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <p className="wl-eyebrow wl-eyebrow--muted">Opt in</p>
        <h2 className="mt-2 wl-card-title">Automatic operating report</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Receive a polished daily or weekly performance report covering calls, outcomes,
          appointments, quality, open follow-ups, and the highest-value next actions.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2 text-sm font-semibold">
            Frequency
            <NativeSelect
              value={preferences.scheduled_report_frequency}
              onChange={(event) =>
                patch({ scheduled_report_frequency: event.target.value as Frequency })
              }
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Format
            <NativeSelect
              value={preferences.scheduled_report_format}
              disabled={preferences.scheduled_report_frequency === "off"}
              onChange={(event) =>
                patch({ scheduled_report_format: event.target.value as ArtifactFormat })
              }
            >
              {FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Destination
            <NativeSelect
              value={preferences.scheduled_report_destination || ""}
              disabled={preferences.scheduled_report_frequency === "off"}
              onChange={(event) =>
                patch({
                  scheduled_report_destination: (event.target.value || null) as Destination | null,
                })
              }
            >
              <option value="">Choose destination</option>
              {connectedDestinations.map((destination) => (
                <option key={destination} value={destination}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Delivery time
            <input
              type="time"
              value={localTime}
              disabled={preferences.scheduled_report_frequency === "off"}
              onChange={(event) => setLocalTime(event.target.value)}
              className="wl-stitch-input h-11 w-full"
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Your device time; Wireline converts it to UTC when saved.
            </span>
          </label>
          {preferences.scheduled_report_frequency === "weekly" ? (
            <label className="space-y-2 text-sm font-semibold">
              Delivery day
              <NativeSelect
                value={String(localWeekday)}
                onChange={(event) => setLocalWeekday(Number(event.target.value))}
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : null}
        </div>

        {nextReportAt && preferences.scheduled_report_frequency !== "off" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Next report: {new Date(nextReportAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      {message ? (
        <StatusNotice tone="success" title="Saved">
          {message}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Could not save reports">
          {error}
        </StatusNotice>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save report settings"}
        </Button>
      </div>
    </div>
  );
}
