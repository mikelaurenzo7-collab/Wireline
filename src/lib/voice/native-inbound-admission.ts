/**
 * Native inbound PSTN verifies paid voice coverage before accepting AI work.
 * Exhausted coverage or capacity rejects the new session; an already admitted
 * call can finish normally. Outbound is gated before Twilio dials.
 *
 * Verify the independent voice coverage before accepting provider work. A
 * lookup failure is retryable; it must not grant an unverified full session.
 * Covered after-hours calls retain bounded message-taking. Per-call duration
 * bounds alone cannot fund unlimited AI messages after a balance is depleted.
 */
import { and, eq, isNull } from "drizzle-orm";

import * as schema from "../../db/schema";
import { isWithinBusinessHours, type AgentRuntimeProfile } from "../agent-runtime";
import { inboundConcurrencyExceeded } from "../inbound-concurrency";
import { drizzle, log, quotaTracker } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getVoiceWalletSnapshot } from "../voice-wallet-guard";
import { AppError } from "../api-error";
import { providerSpendMeter } from "../provider-spend-meter";

export type NativeInboundAdmissionMode = "full" | "suspended" | "take_message" | "recovery_notice";

export type NativeInboundAdmission = {
  mode: NativeInboundAdmissionMode;
  reason?:
    | "subscription"
    | "completion_grace"
    | "coverage"
    | "concurrency"
    | "daily_minutes"
    | "after_hours"
    | "recovery";
  greeting?: string;
};

/** A signed redelivery may recover work already admitted before coverage changed. */
export async function resolveNativeInboundCallAdmission(input: {
  userId: string;
  agentId: string;
  callId: string;
  twilioCallSid: string;
  callerNumber: string | null;
  /** The claim source id of this leg; defaults to the primary leg's. */
  sourceId?: string;
}): Promise<NativeInboundAdmission> {
  const [prior] = await drizzle
    .select({
      action: schema.auditLog.action,
      provider: schema.auditLog.provider,
      metadata: schema.auditLog.metadata,
      costUsd: schema.auditLog.costUsd,
      phase: schema.callLogs.openaiSipPhase,
    })
    .from(schema.callLogs)
    .innerJoin(
      schema.auditLog,
      and(
        eq(schema.auditLog.userId, schema.callLogs.userId),
        eq(schema.auditLog.action, "voice.realtime.session"),
        eq(schema.auditLog.idempotencyKey, `openai-sip:${input.callId}`),
      ),
    )
    .where(
      and(
        eq(schema.callLogs.userId, input.userId),
        eq(schema.callLogs.agentId, input.agentId),
        eq(schema.callLogs.vapiCallId, `openai:${input.callId}`),
        eq(schema.callLogs.openaiSipSourceId, input.sourceId ?? `twilio:${input.twilioCallSid}`),
        eq(schema.callLogs.direction, "inbound"),
        input.callerNumber === null
          ? isNull(schema.callLogs.customerNumber)
          : eq(schema.callLogs.customerNumber, input.callerNumber),
      ),
    )
    .limit(1)
    .catch((error: unknown) => {
      log.error("Native inbound recovery lookup failed closed", {
        userId: input.userId,
        error: getErrorMessage(error),
      });
      throw AppError.serviceUnavailable("Voice admission could not be verified. Please try again.");
    });
  if (
    prior &&
    providerSpendMeter(prior) === "live_voice" &&
    Number.isFinite(Number(prior.costUsd)) &&
    Number(prior.costUsd) > 0
  ) {
    const metadata = prior.metadata as Record<string, unknown>;
    if (
      ["claimed", "running", "terminal"].includes(String(prior.phase)) &&
      ["reserved_before_provider", "provider_outcome_ambiguous", "committed"].includes(
        String(metadata.accounting_state),
      )
    ) {
      const admission = metadata.inbound_admission;
      if (admission && typeof admission === "object" && !Array.isArray(admission)) {
        const saved = admission as Record<string, unknown>;
        if (saved.mode === "full") return { mode: "full" };
        if (saved.mode === "take_message" && saved.reason === "after_hours") {
          return {
            mode: "take_message",
            reason: "after_hours",
            ...(typeof saved.greeting === "string" ? { greeting: saved.greeting } : {}),
          };
        }
      } else if (admission === undefined) {
        // A legacy receipt proves prior funding but not full Bot privileges.
        // Recover only a brief tool-free notice for this exact existing call;
        // claim fencing still suppresses active/terminal duplicates.
        return { mode: "recovery_notice", reason: "recovery" };
      }
    }
  }
  return resolveNativeInboundAdmission(input.userId, input.agentId);
}

export async function resolveNativeInboundAdmission(
  userId: string,
  agentId?: string,
): Promise<NativeInboundAdmission> {
  try {
    const [settings] = await drizzle
      .select({ subscriptionStatus: schema.settings.subscriptionStatus })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);
    if (settings?.subscriptionStatus !== "active") {
      return { mode: "suspended", reason: "subscription" };
    }
  } catch (error) {
    log.error("Native inbound subscription check failed closed", {
      userId,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable(
      "Voice subscription could not be verified. Please try again.",
    );
  }

  let admission: NativeInboundAdmission = { mode: "full" };
  if (agentId) {
    try {
      const [agent] = await drizzle
        .select({
          businessHours: schema.agents.businessHours,
          timezone: schema.agents.timezone,
          outOfHoursMessage: schema.agents.outOfHoursMessage,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, agentId)))
        .limit(1);
      if (
        agent &&
        !isWithinBusinessHours({
          business_hours: agent.businessHours as AgentRuntimeProfile["business_hours"],
          timezone: agent.timezone,
        })
      ) {
        admission = {
          mode: "take_message",
          reason: "after_hours",
          greeting: agent.outOfHoursMessage?.trim() || undefined,
        };
      }
    } catch (error) {
      log.warn("Native inbound after-hours lookup failed closed", {
        userId,
        agentId,
        error: getErrorMessage(error),
      });
      throw AppError.serviceUnavailable(
        "Voice availability could not be verified. Please try again.",
      );
    }
  }

  try {
    const wallet = await getVoiceWalletSnapshot(userId);
    if (!wallet.live_voice_enabled) return { mode: "suspended", reason: "subscription" };
    if (wallet.completion_grace_due_usd > 0) {
      return { mode: "suspended", reason: "completion_grace" };
    }
    if (!wallet.sufficient) {
      return { mode: "suspended", reason: "coverage" };
    }
  } catch (error) {
    log.error("Native inbound wallet check failed closed", {
      userId,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable("Voice coverage could not be verified. Please try again.");
  }

  if (await inboundConcurrencyExceeded(userId)) {
    return { mode: "suspended", reason: "concurrency" };
  }

  try {
    const dailyDecision = await quotaTracker.checkAndIncrement(userId, "voice_minutes_daily", 0);
    if (!dailyDecision?.persisted) throw new Error("Voice quota lookup was not durable.");
    if (!dailyDecision.allowed) {
      return { mode: "suspended", reason: "daily_minutes" };
    }
  } catch (error) {
    log.error("Native inbound daily-minute check failed closed", {
      userId,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable("Voice allowance could not be verified. Please try again.");
  }

  return admission;
}
