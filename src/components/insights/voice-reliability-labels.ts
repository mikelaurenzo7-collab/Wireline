import type { VoiceLatencyRecentCallRow } from "../../types/api";

export function callEndingLabel(reason: string): string {
  // 1006 is the AI sideband closing without a clean close frame. It does not
  // establish that the caller's phone leg ended abnormally.
  if (reason === "provider-close-1006") return "Connection ended without confirmation";
  if (reason === "pre-session-rejected") return "Could not connect";
  return "Other call endings";
}

export function recentCallIssueLabel(
  call: Pick<VoiceLatencyRecentCallRow, "pipelineError" | "durationSeconds">,
): string | null {
  const error = call.pipelineError?.toLowerCase();
  if (!error) return null;
  if (error === "startup" || error.startsWith("pre-session")) return "Call setup issue";
  if (error === "connection") return "Connection issue";
  if (error === "heartbeat") return "Voice connection issue";
  return "Call processing issue";
}
