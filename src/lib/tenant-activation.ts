/**
 * Tenant activation — north-star metric: time from signup to first live,
 * useful production conversation (not wizard completion or browser test).
 */
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { isSalesAgentRole } from "./sales-integration-policy";
import { drizzle, log } from "./server-context";
import { emitServerProductEventOnce } from "./product-event-server";
import * as schema from "../db/schema";
import { classifyCallOutcome, type CallOutcomeTag } from "./post-call-digest";

export const ACTIVATION_MIN_DURATION_SEC = 30;
export const ACTIVATION_MIN_TRANSCRIPT_CHARS = 120;

export const USEFUL_OUTCOME_TAGS = new Set<CallOutcomeTag>([
  "booked",
  "qualified",
  "followup",
  "info",
]);

export type ActivationChannel = "inbound" | "outbound";

export type ActivationCallInput = {
  demo?: boolean;
  vapiCallType?: string | null;
  direction?: string | null;
  customerNumber?: string | null;
  durationSeconds?: number | null;
  transcript?: string | null;
  summary?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  endedReason?: string | null;
  outcomeTag?: string | null;
  agentId?: string | null;
};

export type TenantActivationStatus = {
  activated: boolean;
  activatedAt: string | null;
  timeToActivationSeconds: number | null;
  activationChannel: ActivationChannel | null;
  firstActivationCallId: string | null;
  signupAt: string | null;
  /** Phase B north-star: first useful call plus at least one approved next action. */
  activationWithApprovedAction: boolean;
};

/** Phone traffic only — excludes Vapi web/simulator sessions. */
export function isPhoneProductionCall(
  input: Pick<ActivationCallInput, "vapiCallType" | "customerNumber">,
): boolean {
  const callType = (input.vapiCallType || "").toLowerCase();
  if (callType.includes("web")) return false;
  if (callType.includes("phone")) return true;
  const digits = (input.customerNumber || "").replace(/\D/g, "");
  return digits.length >= 10;
}

export function isUsefulProductionCall(input: ActivationCallInput): boolean {
  if (input.demo) return false;
  if (!isPhoneProductionCall(input)) return false;

  const duration = input.durationSeconds ?? 0;
  if (duration < ACTIVATION_MIN_DURATION_SEC) return false;

  const outcome =
    input.outcomeTag ||
    classifyCallOutcome({
      summary: input.summary,
      sentiment: input.sentiment,
      intentLabel: input.intentLabel,
      durationSeconds: duration,
      endedReason: input.endedReason,
    });

  if (outcome === "unreachable" || outcome === "dnc") return false;

  const transcriptLen = (input.transcript || "").trim().length;
  if (USEFUL_OUTCOME_TAGS.has(outcome as CallOutcomeTag)) return true;

  return transcriptLen >= ACTIVATION_MIN_TRANSCRIPT_CHARS && duration >= 45;
}

export async function hasApprovedActivationAction(
  userId: string,
  activatedAt: Date,
  firstActivationCallId?: string | null,
): Promise<boolean> {
  const approvalClauses = [
    sql`${schema.followUpTasks.resolutionNotes} ILIKE '%Approved%'`,
    eq(schema.followUpTasks.sourceType, "call_log"),
  ];
  if (firstActivationCallId) {
    approvalClauses.push(eq(schema.followUpTasks.sourceId, firstActivationCallId));
  }

  const [row] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.followUpTasks)
    .where(
      and(
        eq(schema.followUpTasks.userId, userId),
        eq(schema.followUpTasks.status, "completed"),
        gte(schema.followUpTasks.createdAt, activatedAt),
        or(...approvalClauses),
      ),
    );
  return Number(row?.count ?? 0) > 0;
}

export async function getTenantActivationStatus(userId: string): Promise<TenantActivationStatus> {
  const [row] = await drizzle
    .select({
      activatedAt: schema.settings.activatedAt,
      timeToActivationSeconds: schema.settings.timeToActivationSeconds,
      activationChannel: schema.settings.activationChannel,
      firstActivationCallId: schema.settings.firstActivationCallId,
      signupAt: schema.users.createdAt,
    })
    .from(schema.settings)
    .innerJoin(schema.users, eq(schema.users.id, schema.settings.userId))
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  if (!row) {
    const [user] = await drizzle
      .select({ signupAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return {
      activated: false,
      activatedAt: null,
      timeToActivationSeconds: null,
      activationChannel: null,
      firstActivationCallId: null,
      signupAt: user?.signupAt?.toISOString() ?? null,
      activationWithApprovedAction: false,
    };
  }

  const activationWithApprovedAction =
    row.activatedAt != null
      ? await hasApprovedActivationAction(
          userId,
          row.activatedAt,
          row.firstActivationCallId?.toString() ?? null,
        )
      : false;

  return {
    activated: row.activatedAt != null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    timeToActivationSeconds: row.timeToActivationSeconds ?? null,
    activationChannel: (row.activationChannel as ActivationChannel | null) ?? null,
    firstActivationCallId: row.firstActivationCallId?.toString() ?? null,
    signupAt: row.signupAt?.toISOString() ?? null,
    activationWithApprovedAction,
  };
}

/**
 * Idempotent — records activation once per tenant when a call qualifies.
 * Returns true when this invocation newly activated the tenant.
 */
export async function maybeRecordTenantActivation(args: {
  userId: string;
  callLogId: bigint;
  call: ActivationCallInput;
}): Promise<boolean> {
  if (!isUsefulProductionCall(args.call)) return false;

  try {
    const [settingsRow] = await drizzle
      .select({
        activatedAt: schema.settings.activatedAt,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, args.userId))
      .limit(1);

    if (settingsRow?.activatedAt) return false;

    const [user] = await drizzle
      .select({ createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.id, args.userId))
      .limit(1);

    const now = new Date();
    const signupAt = user?.createdAt ?? now;
    const timeToActivationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - signupAt.getTime()) / 1000),
    );
    const channel: ActivationChannel = args.call.direction === "outbound" ? "outbound" : "inbound";

    const updated = await drizzle
      .update(schema.settings)
      .set({
        activatedAt: now,
        firstActivationCallId: args.callLogId,
        timeToActivationSeconds,
        activationChannel: channel,
        updatedAt: now,
      })
      .where(and(eq(schema.settings.userId, args.userId), isNull(schema.settings.activatedAt)))
      .returning({ activatedAt: schema.settings.activatedAt });

    if (updated.length === 0) return false;

    log.info("Tenant activated — first useful production call", {
      userId: args.userId,
      callLogId: args.callLogId.toString(),
      timeToActivationSeconds,
      channel,
    });

    emitServerProductEventOnce({
      event: "tenant_activated",
      userId: args.userId,
      metadata: {
        call_log_id: args.callLogId.toString(),
        time_to_activation_seconds: timeToActivationSeconds,
        activation_channel: channel,
      },
    });

    let emitSalesCallEvent = false;
    if (args.call.agentId) {
      const [agent] = await drizzle
        .select({ role: schema.agents.role })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, args.call.agentId), eq(schema.agents.userId, args.userId)))
        .limit(1);
      emitSalesCallEvent = isSalesAgentRole(agent?.role);
    }

    if (emitSalesCallEvent) {
      emitServerProductEventOnce({
        event: "first_sales_call_completed",
        userId: args.userId,
        audience: "sales",
        agentId: args.call.agentId ?? undefined,
        metadata: {
          call_log_id: args.callLogId.toString(),
        },
      });
    }

    return true;
  } catch (err: unknown) {
    log.warn("maybeRecordTenantActivation failed", {
      userId: args.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
