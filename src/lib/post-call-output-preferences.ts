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

export const POST_CALL_ARTIFACT_MODES = ["off", "manual", "booked_or_qualified", "always"] as const;
export type PostCallArtifactMode = (typeof POST_CALL_ARTIFACT_MODES)[number];

export const POST_CALL_ARTIFACT_FORMATS = ["pdf", "docx", "pptx", "xlsx"] as const;
export type PostCallArtifactFormat = (typeof POST_CALL_ARTIFACT_FORMATS)[number];

export const POST_CALL_ARTIFACT_DESTINATIONS = ["google_drive", "onedrive"] as const;
export type PostCallArtifactDestination = (typeof POST_CALL_ARTIFACT_DESTINATIONS)[number];

export interface PostCallOutputPreferences {
  /** Structured call record is always written inside Wireline and cannot be disabled. */
  internal_record_enabled: true;
  spreadsheet_destination: PostCallSpreadsheetDestination;
  artifact_mode: PostCallArtifactMode;
  artifact_format: PostCallArtifactFormat;
  artifact_destination: PostCallArtifactDestination | null;
}

export const DEFAULT_POST_CALL_OUTPUT_PREFERENCES: PostCallOutputPreferences = {
  internal_record_enabled: true,
  spreadsheet_destination: "none",
  artifact_mode: "off",
  artifact_format: "pdf",
  artifact_destination: null,
};

function oneOf<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : null;
}

export function normalizePostCallOutputPreferences(
  value: unknown,
): PostCallOutputPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
  const next = normalizePostCallOutputPreferences({ ...current, ...patch });
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

export function shouldGeneratePostCallArtifact(
  preferences: PostCallOutputPreferences,
  outcomeTag: string,
): boolean {
  if (!preferences.artifact_destination || preferences.artifact_mode === "off") return false;
  if (preferences.artifact_mode === "always") return true;
  if (preferences.artifact_mode === "booked_or_qualified") {
    return outcomeTag === "booked" || outcomeTag === "qualified";
  }
  // Manual means the Account Holder must request a file from the call record.
  return false;
}
