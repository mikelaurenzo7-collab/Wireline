/**
 * Content payloads persisted in `wireline_recap_artifacts.content`.
 *
 * Every shape is versioned so the template renderer can evolve without
 * touching historical rows. Rendering never trusts unknown versions; a
 * mismatch returns the not-found page from the resolver.
 */

export interface CallRecapAction {
  description: string;
  owner?: string | null;
  dueAtLabel?: string | null;
}

export interface CallRecapMoment {
  atSeconds: number;
  note: string;
}

export interface CallRecapTranscriptLine {
  role: "agent" | "caller";
  text: string;
  atSeconds?: number | null;
}

export interface CallRecapContent {
  kind: "call_recap";
  version: 1;
  agent: { name: string; role?: string | null };
  outcome: "booked" | "qualified" | "followup" | "info" | "unreachable" | "dnc" | "other";
  outcomeLabel: string;
  hero: string;
  metadata: {
    direction?: "inbound" | "outbound" | null;
    durationSeconds?: number | null;
    startedAtIso?: string | null;
    campaignSource?: string | null;
  };
  caller?: { name?: string | null; phone?: string | null };
  moments: CallRecapMoment[];
  actions: CallRecapAction[];
  transcript: CallRecapTranscriptLine[];
  sentiment?: string | null;
  intentLabel?: string | null;
  summary?: string | null;
}

export interface WeeklyRecapVolumePoint {
  label: string;
  count: number;
}

export interface WeeklyRecapOutcomeSlice {
  tag: string;
  count: number;
}

export interface WeeklyRecapTopMoment {
  hero: string;
  caller?: string | null;
  atLabel?: string | null;
}

export interface WeeklyRecapFollowUp {
  description: string;
  priority?: "high" | "medium" | "low" | null;
  dueAtLabel?: string | null;
}

export interface WeeklyRecapContent {
  kind: "weekly_recap";
  version: 1;
  period: { startIso: string; endIso: string; label: string };
  totals: {
    calls: number;
    voiceMinutes: number;
    booked: number;
    qualified: number;
    followup: number;
  };
  volumeByDay: WeeklyRecapVolumePoint[];
  outcomeMix: WeeklyRecapOutcomeSlice[];
  averageQaScore?: number | null;
  topMoments: WeeklyRecapTopMoment[];
  followUps: WeeklyRecapFollowUp[];
  headline?: string | null;
}

export type RecapContent = CallRecapContent | WeeklyRecapContent;

export type RecapKind = RecapContent["kind"];

export function isSupportedRecapContent(candidate: unknown): candidate is RecapContent {
  if (!candidate || typeof candidate !== "object") return false;
  const record = candidate as Record<string, unknown>;
  if (record.version !== 1) return false;
  return record.kind === "call_recap" || record.kind === "weekly_recap";
}
