// ────────────────────────────────────────────────────────────────────────
//  Assistants activity feed math.
//
//  /api/Assistants/activity merges 4 parallel queries (call logs, Assistants tasks,
//  agent lessons, email threads) into a single time-sorted activity feed
//  for the dashboard's Activity panel. The transformation is pure data
//  shaping but had two real defects inline:
//
//    1. `t.description.substring(...)` and `l.lesson.substring(...)`
//       crashed if the column was null (which it can be in the schema).
//    2. The slice/limit was tied to a magic number with no test guarding it.
//
//  Extracted here as a pure tested module so the route handler shrinks
//  to ownership + four queries + one helper call, and the row shaping
//  is locked in by tests.
// ────────────────────────────────────────────────────────────────────────

export interface CallLogRow {
  id: string | number | bigint;
  customerNumber?: string | null;
  leadScore?: number | null;
  intentLabel?: string | null;
  summary?: string | null;
  createdAt: Date | string | null;
}

export interface FollowUpTaskRow {
  id: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  createdAt: Date | string | null;
}

export interface AgentLessonRow {
  id: string | number | bigint;
  lesson?: string | null;
  createdAt: Date | string | null;
}

export interface EmailThreadRow {
  id: string;
  customerEmail?: string | null;
  leadScore?: number | null;
  intentLabel?: string | null;
  createdAt: Date | string | null;
}

export type ActivityImportance = "critical" | "high" | "medium" | "low";

export interface ActivityEntry {
  id: string;
  type: "SIGNAL_ANALYZED" | "MISSION_INJECTED" | "NEURAL_OPTIMIZATION" | "DIGITAL_RELAY";
  trigger: string;
  action: string;
  meta: string;
  timestamp: string;
  importance: ActivityImportance;
}

export const ACTIVITY_FEED_LIMIT = 15;
const PREVIEW_LEN = 50;

// Truncate user-supplied text for the activity row preview. Returns a
// safe placeholder when input is null/empty so render never crashes.
export function truncatePreview(text: string | null | undefined, max = PREVIEW_LEN): string {
  if (!text) return "(no detail)";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function callLogToActivity(l: CallLogRow): ActivityEntry {
  return {
    id: String(l.id),
    type: "SIGNAL_ANALYZED",
    trigger: "Voice Ingestion",
    action: `Intent extracted: ${l.intentLabel || "Analysis Pending"}`,
    meta: l.customerNumber || "",
    timestamp: String(l.createdAt),
    importance: (l.leadScore ?? 0) > 70 ? "high" : "medium",
  };
}

export function followUpTaskToActivity(t: FollowUpTaskRow): ActivityEntry {
  return {
    id: t.id,
    type: "MISSION_INJECTED",
    trigger: "Functional Requirement Detected",
    action: `New Task: ${truncatePreview(t.description)}`,
    meta: t.status || "",
    timestamp: String(t.createdAt),
    importance: t.priority === "high" ? "critical" : "medium",
  };
}

export function agentLessonToActivity(l: AgentLessonRow): ActivityEntry {
  return {
    id: String(l.id),
    type: "NEURAL_OPTIMIZATION",
    trigger: "Behavioral Deviation",
    action: `Lesson Learned: ${truncatePreview(l.lesson)}`,
    meta: "Agent Refinement",
    timestamp: String(l.createdAt),
    importance: "low",
  };
}

export function emailThreadToActivity(e: EmailThreadRow): ActivityEntry {
  return {
    id: e.id,
    type: "DIGITAL_RELAY",
    trigger: "OMNI_CHANNEL_SYNC",
    action: `Email Thread Synced: ${e.intentLabel || "Scanning"}`,
    meta: e.customerEmail || "",
    timestamp: String(e.createdAt),
    importance: "medium",
  };
}

// Returns a safe ms timestamp for sort comparisons. Invalid created_at
// strings are mapped to 0 (Unix epoch) so they sort to the bottom of any
// real-world feed. We deliberately avoid returning NaN — a comparator that
// returns NaN is implementation-defined per the ECMAScript spec.
function ts(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function compileActivityFeed(input: {
  logs: CallLogRow[];
  tasks: FollowUpTaskRow[];
  lessons: AgentLessonRow[];
  emails: EmailThreadRow[];
  limit?: number;
}): ActivityEntry[] {
  const merged: ActivityEntry[] = [
    ...input.logs.map(callLogToActivity),
    ...input.tasks.map(followUpTaskToActivity),
    ...input.lessons.map(agentLessonToActivity),
    ...input.emails.map(emailThreadToActivity),
  ];
  merged.sort((a, b) => ts(b.timestamp) - ts(a.timestamp));
  return merged.slice(0, input.limit ?? ACTIVITY_FEED_LIMIT);
}
