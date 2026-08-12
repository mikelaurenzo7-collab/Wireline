export type FollowUpTaskRow = {
  id: string;
  task_type?: string;
  taskType?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  payload?: Record<string, unknown> | null;
  customer_info?: Record<string, unknown> | null;
  customerInfo?: Record<string, unknown> | null;
  source_type?: string | null;
  sourceType?: string | null;
  source_id?: string | null;
  sourceId?: string | null;
  agent?: { name?: string | null };
  agentId?: string | null;
  agent_id?: string | null;
  created_at?: string;
  createdAt?: string;
};

export type TriageBucket = {
  hot_leads: Array<Record<string, unknown>>;
  compliance: FollowUpTaskRow[];
  pending_tasks: FollowUpTaskRow[];
  knowledge_gaps: Array<Record<string, unknown>>;
  escalations: Array<Record<string, unknown>>;
  counts?: Record<string, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFollowUpTaskRow(value: unknown): value is FollowUpTaskRow {
  return isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0;
}

function isTriageItem(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0;
}

function hasValidCounts(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (count) => typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  );
}

/**
 * Treat an HTTP 200 with an incomplete triage shape as unavailable data. A
 * malformed success must never turn missing approvals into a reassuring zero.
 */
export function parseTriageBucket(value: unknown): TriageBucket | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.hot_leads) || !value.hot_leads.every(isTriageItem)) return null;
  if (!Array.isArray(value.compliance) || !value.compliance.every(isFollowUpTaskRow)) return null;
  if (!Array.isArray(value.pending_tasks) || !value.pending_tasks.every(isFollowUpTaskRow)) {
    return null;
  }
  if (!Array.isArray(value.knowledge_gaps) || !value.knowledge_gaps.every(isTriageItem))
    return null;
  if (!Array.isArray(value.escalations) || !value.escalations.every(isTriageItem)) return null;
  if (value.counts !== undefined && !hasValidCounts(value.counts)) return null;

  return value as TriageBucket;
}

/** Validate the active-work envelope before the UI is allowed to show clear. */
export function parseApprovalTasks(value: unknown): FollowUpTaskRow[] | null {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return null;
  if (!value.tasks.every(isFollowUpTaskRow)) return null;
  return value.tasks;
}
