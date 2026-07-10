import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";

export const POST_CALL_SPREADSHEET_DESTINATIONS = [
  "none",
  "google_sheets",
  "microsoft_excel",
  "both",
] as const;
export type PostCallSpreadsheetDestination =
  (typeof POST_CALL_SPREADSHEET_DESTINATIONS)[number];

/** Special files are generated only when the Account Holder asks for one. */
export const POST_CALL_ARTIFACT_MODES = ["off", "manual"] as const;
export type PostCallArtifactMode = (typeof POST_CALL_ARTIFACT_MODES)[number];

export const POST_CALL_ARTIFACT_FORMATS = ["pdf", "docx", "pptx", "xlsx"] as const;
export type PostCallArtifactFormat = (typeof POST_CALL_ARTIFACT_FORMATS)[number];

export const POST_CALL_ARTIFACT_DESTINATIONS = ["google_drive", "onedrive"] as const;
export type PostCallArtifactDestination = (typeof POST_CALL_ARTIFACT_DESTINATIONS)[number];

export const SCHEDULED_REPORT_FREQUENCIES = ["off", "daily", "weekly"] as const;
export type ScheduledReportFrequency = (typeof SCHEDULED_REPORT_FREQUENCIES)[number];

export interface PostCallOutputPreferences {
  /** Structured call record is always written inside Wireline and cannot be disabled. */
  internal_record_enabled: true;
  spreadsheet_destination: PostCallSpreadsheetDestination;
  artifact_mode: PostCallArtifactMode;
  artifact_format: PostCallArtifactFormat;
  artifact_destination: PostCallArtifactDestination | null;
  scheduled_report_frequency: ScheduledReportFrequency;
  scheduled_report_format: PostCallArtifactFormat;
  scheduled_report_destination: PostCallArtifactDestination | null;
  /** UTC HH:MM. UI converts from local time before saving. */
  scheduled_report_send_at_utc: string;
  /** 0=Sunday ... 6=Saturday. Used only for weekly reports. */
  scheduled_report_weekday: number;
  scheduled_report_version: number;
}

export const DEFAULT_POST_CALL_OUTPUT_PREFERENCES: PostCallOutputPreferences = {
  internal_record_enabled: true,
  spreadsheet_destination: "none",
  artifact_mode: "manual",
  artifact_format: "pdf",
  artifact_destination: null,
  scheduled_report_frequency: "off",
  scheduled_report_format: "pdf",
  scheduled_report_destination: null,
  scheduled_report_send_at_utc: "13:00",
  scheduled_report_weekday: 1,
  scheduled_report_version: 0,
};

function oneOf<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : null;
}

function validTime(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return DEFAULT_POST_CALL_OUTPUT_PREFERENCES.scheduled_report_send_at_utc;
  }
  return value;
}

export function normalizePostCallOutputPreferences(
  value: unknown,
): PostCallOutputPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const weekday = Number(record.scheduled_report_weekday);
  const version = Number(record.scheduled_report_version);
  return {
    internal_record_enabled: true,
    spreadsheet_destination:
      oneOf(record.spreadsheet_destination, POST_CALL_SPREADSHEET_DESTINATIONS) ??
      DEFAULT_POST_CALL_OUTPUT_PREFERENCES.spreadsheet_destination,
    artifact_mode:
      oneOf(record.artifact_mode, POST_CALL_ARTIFACT_MODES) ??
      DEFAULT_POST_CALL_OUTPUT_PREFERENCES.artifact_mode,
    artifact_format:
      oneOf(record.artifact_format, POST_CALL_ARTIFACT_FORMATS) ??
      DEFAULT_POST_CALL_OUTPUT_PREFERENCES.artifact_format,
    artifact_destination:
      oneOf(record.artifact_destination, POST_CALL_ARTIFACT_DESTINATIONS) ?? null,
    scheduled_report_frequency:
      oneOf(record.scheduled_report_frequency, SCHEDULED_REPORT_FREQUENCIES) ??
      DEFAULT_POST_CALL_OUTPUT_PREFERENCES.scheduled_report_frequency,
    scheduled_report_format:
      oneOf(record.scheduled_report_format, POST_CALL_ARTIFACT_FORMATS) ??
      DEFAULT_POST_CALL_OUTPUT_PREFERENCES.scheduled_report_format,
    scheduled_report_destination:
      oneOf(record.scheduled_report_destination, POST_CALL_ARTIFACT_DESTINATIONS) ?? null,
    scheduled_report_send_at_utc: validTime(record.scheduled_report_send_at_utc),
    scheduled_report_weekday:
      Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
        ? weekday
        : DEFAULT_POST_CALL_OUTPUT_PREFERENCES.scheduled_report_weekday,
    scheduled_report_version:
      Number.isInteger(version) && version >= 0 ? version : 0,
  };
}

export function postCallPreferencesFromRoot(value: unknown): PostCallOutputPreferences {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return normalizePostCallOutputPreferences(root.post_call_outputs);
}

export async function getPostCallOutputPreferences(
  userId: string,
): Promise<PostCallOutputPreferences> {
  const [row] = await drizzle
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);
  return postCallPreferencesFromRoot(row?.preferences);
}

const SCHEDULE_FIELDS = [
  "scheduled_report_frequency",
  "scheduled_report_format",
  "scheduled_report_destination",
  "scheduled_report_send_at_utc",
  "scheduled_report_weekday",
] as const satisfies readonly (keyof PostCallOutputPreferences)[];

export async function savePostCallOutputPreferences(
  userId: string,
  patch: Partial<PostCallOutputPreferences>,
): Promise<PostCallOutputPreferences> {
  const [row] = await drizzle
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);

  const root =
    row?.preferences && typeof row.preferences === "object"
      ? { ...(row.preferences as Record<string, unknown>) }
      : {};
  const current = postCallPreferencesFromRoot(root);
  const candidate = normalizePostCallOutputPreferences({ ...current, ...patch });
  const scheduleChanged = SCHEDULE_FIELDS.some(
    (key) => Object.prototype.hasOwnProperty.call(patch, key) && candidate[key] !== current[key],
  );
  const next: PostCallOutputPreferences = {
    ...candidate,
    scheduled_report_version: scheduleChanged
      ? current.scheduled_report_version + 1
      : current.scheduled_report_version,
  };
  root.post_call_outputs = next;

  await drizzle
    .insert(schema.userPreferences)
    .values({
      userId,
      preferences: root,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.userPreferences.userId,
      set: { preferences: root, updatedAt: new Date() },
    });

  return next;
}

/** Per-call native files are never automatic; the Account Holder requests each one. */
export function shouldGeneratePostCallArtifact(_preferences: PostCallOutputPreferences): boolean {
  return false;
}
