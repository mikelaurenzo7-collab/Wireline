/** Account-level Director chat thread (fleet, coach, logos). */
export const DIRECTOR_THREAD_KEY = "director";

/** Painter design studio thread — Wireline Design renders and iterations. */
export const PAINTER_THREAD_KEY = "painter";

export type DirectorConversationThreadKey = typeof DIRECTOR_THREAD_KEY | typeof PAINTER_THREAD_KEY;

export function parseDirectorThreadKey(
  raw: string | undefined | null,
): DirectorConversationThreadKey {
  if (raw === PAINTER_THREAD_KEY) return PAINTER_THREAD_KEY;
  return DIRECTOR_THREAD_KEY;
}
