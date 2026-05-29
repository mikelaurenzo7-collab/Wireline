/**
 * Small presentation helpers shared by the chat mission-control docks
 * (AgentDock + DirectorDock) for rendering recent-call rows.
 */

/** Map a free-text sentiment to a status-dot color class. */
export function sentimentTone(sentiment: string | null): string {
  const s = (sentiment || "").toLowerCase();
  if (s.includes("pos")) return "bg-emerald-500";
  if (s.includes("neg")) return "bg-rose-500";
  return "bg-amber-400";
}

/** Compact "just now / 5m ago / 3h ago / 2d ago" relative time from an ISO string. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
