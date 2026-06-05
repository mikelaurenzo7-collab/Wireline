import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import {
  DEFAULT_DIRECTOR_MODEL_SELECTION,
  parseDirectorChatModelSelection,
  type DirectorChatModelSelection,
} from "./director-model-selection";
import { sanitizeDirectorChatModelPreference } from "./director-model-policy";

const PREF_KEY = "directorChatModel";

export async function loadDirectorChatModelPreference(
  userId: string,
): Promise<DirectorChatModelSelection> {
  const [row] = await drizzle
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);

  const prefs = row?.preferences;
  if (!prefs || typeof prefs !== "object") return DEFAULT_DIRECTOR_MODEL_SELECTION;
  const parsed = parseDirectorChatModelSelection((prefs as Record<string, unknown>)[PREF_KEY]);
  const selection = parsed ?? DEFAULT_DIRECTOR_MODEL_SELECTION;
  return sanitizeDirectorChatModelPreference(selection);
}

export async function saveDirectorChatModelPreference(
  userId: string,
  selection: DirectorChatModelSelection,
): Promise<DirectorChatModelSelection> {
  const [existing] = await drizzle
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);

  const base =
    existing?.preferences && typeof existing.preferences === "object"
      ? { ...(existing.preferences as Record<string, unknown>) }
      : {};

  const nextPrefs = { ...base, [PREF_KEY]: selection };

  await drizzle
    .insert(schema.userPreferences)
    .values({ userId, preferences: nextPrefs })
    .onConflictDoUpdate({
      target: schema.userPreferences.userId,
      set: { preferences: nextPrefs, updatedAt: new Date() },
    });

  return selection;
}
