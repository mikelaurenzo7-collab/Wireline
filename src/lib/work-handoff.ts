/** A review-only handoff. Fragment content is never sent in HTTP requests/referrers. */
export const WORK_HANDOFF_MAX_CHARS = 2000;
export function readWorkHandoff(hash: string): string | null {
  if (!hash.startsWith("#task=") || hash.length > 24_000) return null;
  const params = new URLSearchParams(hash.slice(1));
  const goal = params.get("task")?.trim();
  return params.size === 1 && goal && goal.length >= 4 && goal.length <= WORK_HANDOFF_MAX_CHARS
    ? goal
    : null;
}
export function buildWorkHandoffUrl(origin: string, agentId: string, goal: string): string {
  const url = new URL("/studio", origin);
  url.searchParams.set("agent", agentId);
  url.searchParams.set("chat", "computer");
  url.hash = new URLSearchParams({ task: goal }).toString();
  return url.toString();
}
