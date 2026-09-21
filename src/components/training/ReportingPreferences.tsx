import { useEffect, useMemo, useRef, useState } from "react";
import { FileChartColumn, FileText, Presentation, Sheet, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

import { Button, NativeSelect } from "../atoms";
import { StatusNotice } from "../molecules";
import { Checkbox } from "../ui/shadcn/Checkbox";
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
    label: "PDF Report",
    detail: "Fixed layout for sharing.",
  },
  { value: "docx", label: "Word Document", detail: "Editable proposals and recaps." },
  {
    value: "xlsx",
    label: "Excel Workbook",
    detail: "Call data in a spreadsheet.",
  },
  {
    value: "pptx",
    label: "PowerPoint Presentation",
    detail: "Slides for presenting results.",
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
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
  }, [loadAttempt]);

  const connectedDestinations = useMemo(() => {
    const values: Destination[] = [];
    if (connections?.google_drive) values.push("google_drive");
    if (connections?.onedrive) values.push("onedrive");
    return values;
  }, [connections]);

  function patch(next: Partial<Preferences>) {
    if (savingRef.current) return;
    setPreferences((current) => (current ? { ...current, ...next } : current));
    setMessage(null);
  }

  async function save() {
    if (!preferences || savingRef.current) return;
    if (
      preferences.scheduled_report_frequency !== "off" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)
    ) {
      setError("Choose a delivery time.");
      setMessage(null);
      return;
    }
    savingRef.current = true;
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
      const local = utcScheduleToLocal(
        data.preferences.scheduled_report_send_at_utc,
        data.preferences.scheduled_report_weekday,
      );
      setLocalTime(local.time);
      setLocalWeekday(local.weekday);
      setMessage("Report preferences saved.");
      // Notify the sibling artifact-requests panel immediately instead of
      // relying on a background poll.
      window.dispatchEvent(
        new CustomEvent(REPORT_PREFERENCES_SAVED_EVENT, { detail: data.preferences }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save report settings.");
    } finally {
      savingRef.current = false;
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
      <StatusNotice
        tone="destructive"
        title="Report Settings Unavailable"
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
        }
      >
        {error || "Could not load report settings."}
      </StatusNotice>
    );
  }

  const noStorageConnected = connectedDestinations.length === 0;

  return (
    <fieldset
      disabled={saving}
      aria-busy={saving}
      aria-label="Report settings"
      className="mx-auto min-w-0 max-w-5xl space-y-5"
    >
      <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
        <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        Call records stay in BotBound. File exports are optional.
      </p>

      {noStorageConnected ? (
        <StatusNotice tone="warning" title="Connect a Report Destination">
          Connect Google Drive or OneDrive to save report files.{" "}
          <Link to="/connections" className="font-semibold underline underline-offset-4">
            Open Connections
          </Link>
        </StatusNotice>
      ) : null}

      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="wl-card-title">Call Files</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Files are created only when you request them.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={preferences.artifact_mode === "manual"}
              onChange={(event) =>
                patch({ artifact_mode: event.target.checked ? "manual" : "off" })
              }
            />
            Enable call files
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

        <details className="mt-4 text-sm">
          <summary className="w-fit cursor-pointer rounded font-semibold text-muted-foreground wl-focus-ring">
            Format Guide
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
        </details>
      </section>

      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <h2 className="wl-card-title">Scheduled Reports</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Optional daily or weekly summaries of calls, outcomes, and follow-ups.
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
              onChange={(event) => {
                if (savingRef.current) return;
                setLocalTime(event.target.value);
                setMessage(null);
              }}
              className="wl-stitch-input h-11 w-full"
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Shown in your device’s time zone.
            </span>
          </label>
          {preferences.scheduled_report_frequency === "weekly" ? (
            <label className="space-y-2 text-sm font-semibold">
              Delivery day
              <NativeSelect
                value={String(localWeekday)}
                onChange={(event) => {
                  if (savingRef.current) return;
                  setLocalWeekday(Number(event.target.value));
                  setMessage(null);
                }}
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
        <StatusNotice tone="destructive" title="Could Not Save Reports">
          {error}
        </StatusNotice>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save report settings"}
        </Button>
      </div>
    </fieldset>
  );
}
