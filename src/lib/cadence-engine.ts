/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Cadence engine — fires scheduled call, SMS, and email steps. Every call step
 * routes through Wireline's native Twilio + xAI placement service and carries
 * the existing lead id so carrier, realtime, transcript, and settlement state
 * remain attached to one authoritative record.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { IntegrationService } from "./integrations";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { OUTBOUND_CONSENT_VERSION } from "./outbound-call-purpose";
import { drizzle, log } from "./server-context";
import { jsonSafeId, toJsonbSafe } from "./server-utils";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";
import { sendTenantMessage } from "./twilio-service";
import { placeOutboundCall } from "./voice/outbound-call-service";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";

interface CadenceStep {
  type: "call" | "sms" | "email";
  delayHours: number;
  template?: string;
  agentId?: string;
}

interface CadenceRow {
  id: string;
  userId: string;
  name: string;
  agentId: string | null;
  steps: CadenceStep[];
}

interface LeadRow {
  id: bigint;
  customerName: string | null;
  customerNumber: string | null;
  email: string | null;
  agentId: string | null;
  lastCalledAt: Date | null;
  metadata: Record<string, unknown> | null;
}

function applyVars(template: string, lead: LeadRow): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, lead.customerName?.split(" ")[0] || "there")
    .replace(/\{\{\s*full_name\s*\}\}/gi, lead.customerName || "")
    .replace(/\{\{\s*phone\s*\}\}/gi, lead.customerNumber || "")
    .replace(/\{\{\s*email\s*\}\}/gi, lead.email || "");
}

/**
 * `retryable` is reserved for failures proven to occur before a provider-side
 * effect. Native call creation treats transport/5xx ambiguity as do-not-retry,
 * so a cadence never places a second marketing call merely because the first
 * carrier response was lost.
 */
async function executeStep(
  step: CadenceStep,
  cadence: CadenceRow,
  lead: LeadRow,
): Promise<{ ok: boolean; result: string; defer?: boolean; retryable?: boolean }> {
  const agentId = step.agentId || cadence.agentId || lead.agentId;

  if ((step.type === "call" || step.type === "sms") && lead.customerNumber) {
    try {
      const gate = await evaluateOutboundDialGate({
        userId: cadence.userId,
        phone: lead.customerNumber,
        leadId: lead.id,
        lastCalledAt: lead.lastCalledAt,
        metadata: lead.metadata || {},
      });
      if (!gate.allowed) {
        const temporal =
          gate.reason === "outside_permitted_calling_hours" ||
          gate.reason === "self_recent_call_scheduled";
        return { ok: false, result: `skipped: ${gate.reason}`, defer: temporal };
      }
    } catch (error: any) {
      log.warn("cadence outbound compliance gate failed, failing closed", {
        error: error?.message,
      });
      return { ok: false, result: "compliance gate failed (fail-closed)", retryable: true };
    }
  }

  if (step.type === "call") {
    if (!lead.customerNumber) return { ok: false, result: "no phone number on lead" };
    if (!agentId) return { ok: false, result: "no agent configured for call step" };
    try {
      await assertOutboundVoiceAllowed({ userId: cadence.userId, source: "cadence", units: 0 });
    } catch (error: any) {
      return {
        ok: false,
        result: `voice control rejected: ${error?.message || "blocked"}`,
        retryable: true,
      };
    }

    const result = await placeOutboundCall({
      userId: cadence.userId,
      agentId,
      customerName: lead.customerName,
      customerNumber: lead.customerNumber,
      context: `Cadence "${cadence.name}", step type call`,
      callPurpose: "marketing_or_sales",
      leadId: lead.id,
    });
    if (result.ok) {
      try {
        await Promise.all([
          drizzle
            .update(schema.outboundLeads)
            .set({
              lastCalledAt: new Date(),
              attempts: sql`${schema.outboundLeads.attempts} + 1`,
              callId: result.callId,
            })
            .where(eq(schema.outboundLeads.id, lead.id)),
          drizzle.insert(schema.consentLog).values({
            userId: cadence.userId,
            customerNumber: lead.customerNumber,
            callId: result.callId,
            event: "outbound_call_placed",
            state: "initiated",
            metadata: toJsonbSafe({
              leadId: jsonSafeId(lead.id),
              cadenceId: cadence.id,
              call_purpose: "marketing_or_sales",
              consent_version: OUTBOUND_CONSENT_VERSION,
              source: "cadence",
            }),
          }),
        ]);
      } catch (recordError: any) {
        log.error("cadence call placed but dial evidence write failed", {
          leadId: jsonSafeId(lead.id),
          cadenceId: cadence.id,
          error: recordError?.message,
        });
      }
    }
    return {
      ok: result.ok,
      result: result.ok
        ? `call placed ${result.callId}`
        : result.providerOutcomeAmbiguous
          ? `call outcome uncertain; automatic retry suppressed: ${result.error}`
          : `call failed: ${result.error}`,
      // Native placement marks ambiguous outcomes do-not-retry. Advancing the
      // cadence is safer than risking a duplicate call to the same consumer.
    };
  }

  if (step.type === "sms") {
    if (!lead.customerNumber) return { ok: false, result: "no phone number on lead" };
    const body = applyVars(step.template || `Hi {{name}}, checking back in. Wireline`, lead);
    const result = await sendTenantMessage(cadence.userId, {
      to: lead.customerNumber,
      body,
      agentId: cadence.agentId ?? lead.agentId ?? undefined,
    });
    return {
      ok: result.ok,
      result: result.ok
        ? `sms sent ${result.sid || ""}`
        : `sms failed: ${result.reason || "unknown"}`,
    };
  }

  if (step.type === "email") {
    if (!lead.email) return { ok: false, result: "no email on lead" };
    const body = applyVars(step.template || `Hi {{name}},\n\nFollowing up. Wireline`, lead);
    const integration = new IntegrationService(cadence.userId);
    const ok = await integration.sendEmail({
      to: lead.email,
      subject: `Following up: ${cadence.name}`,
      body,
      marketing: true,
    });
    return { ok, result: ok ? "email sent" : "email failed (suppressed or no connected mailbox?)" };
  }

  return { ok: false, result: `unknown step type ${step.type}` };
}

const CADENCE_STEP_LEASE_MS = 15 * 60 * 1000;
const CADENCE_TEMPORAL_DEFER_MS = 60 * 60 * 1000;
const CADENCE_EXCEPTION_RETRY_MS = 15 * 60 * 1000;
const STEP_EXCEPTION_RETRY_PREFIX = "step exception (will retry): ";

export async function tickDueCadenceRuns({ limit = 50 }: { limit?: number }): Promise<{
  processed: number;
  advanced: number;
  completed: number;
  failed: number;
  deferred: number;
}> {
  const now = new Date();
  const dueRuns = await drizzle
    .select()
    .from(schema.cadenceRuns)
    .where(and(eq(schema.cadenceRuns.status, "active"), lte(schema.cadenceRuns.nextDueAt, now)))
    .orderBy(asc(schema.cadenceRuns.nextDueAt))
    .limit(limit);

  let advanced = 0;
  let completed = 0;
  let failed = 0;
  let deferred = 0;

  const cadenceIds = [...new Set(dueRuns.map((run) => run.cadenceId).filter(Boolean))] as string[];
  const leadIds = [
    ...new Set(dueRuns.map((run) => run.leadId).filter((value): value is bigint => value != null)),
  ];

  const [cadenceRows, leadRows] = await Promise.all([
    cadenceIds.length
      ? drizzle.select().from(schema.cadences).where(inArray(schema.cadences.id, cadenceIds))
      : Promise.resolve([]),
    leadIds.length
      ? drizzle
          .select({
            id: schema.outboundLeads.id,
            userId: schema.outboundLeads.userId,
            customerName: schema.outboundLeads.customerName,
            customerNumber: schema.outboundLeads.customerNumber,
            email: schema.outboundLeads.email,
            agentId: schema.outboundLeads.agentId,
            lastCalledAt: schema.outboundLeads.lastCalledAt,
            metadata: schema.outboundLeads.metadata,
          })
          .from(schema.outboundLeads)
          .where(inArray(schema.outboundLeads.id, leadIds))
      : Promise.resolve([]),
  ]);

  const cadenceById = new Map(cadenceRows.map((cadence) => [cadence.id, cadence]));
  const leadById = new Map(leadRows.map((lead) => [lead.id, lead]));

  for (const run of dueRuns) {
    try {
      const claimed = await drizzle
        .update(schema.cadenceRuns)
        .set({ nextDueAt: new Date(Date.now() + CADENCE_STEP_LEASE_MS), updatedAt: now })
        .where(
          and(
            eq(schema.cadenceRuns.id, run.id),
            eq(schema.cadenceRuns.status, "active"),
            lte(schema.cadenceRuns.nextDueAt, now),
          ),
        )
        .returning({ id: schema.cadenceRuns.id });
      if (!claimed.length) continue;

      const cadenceRowRaw = cadenceById.get(run.cadenceId);
      const cadenceRow =
        cadenceRowRaw && cadenceRowRaw.userId === run.userId ? cadenceRowRaw : undefined;
      if (!cadenceRow || cadenceRow.active === false) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "paused", updatedAt: now, lastResult: "cadence inactive or deleted" })
          .where(eq(schema.cadenceRuns.id, run.id));
        continue;
      }

      const leadRowRaw = leadById.get(run.leadId);
      const leadRow = leadRowRaw && leadRowRaw.userId === run.userId ? leadRowRaw : undefined;
      if (!leadRow) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "failed", updatedAt: now, lastResult: "lead no longer exists" })
          .where(eq(schema.cadenceRuns.id, run.id));
        failed++;
        continue;
      }

      const steps = (cadenceRow.steps as CadenceStep[]) || [];
      const currentIndex = run.currentStep ?? 0;
      const step = steps[currentIndex];
      if (!step) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "completed", updatedAt: now, lastResult: "all steps complete" })
          .where(eq(schema.cadenceRuns.id, run.id));
        completed++;
        continue;
      }

      const fencedStep = await runTenantProviderWorkWithDeletionFence({
        userId: run.userId,
        perform: () => executeStep(step, cadenceRow as any, leadRow as any),
      });
      if (!fencedStep.performed) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            status: "paused",
            nextDueAt: null,
            lastResult: "account deletion in progress, provider step cancelled",
            updatedAt: now,
          })
          .where(eq(schema.cadenceRuns.id, run.id));
        continue;
      }
      const stepResult = fencedStep.result;

      if (stepResult.defer) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            nextDueAt: new Date(Date.now() + CADENCE_TEMPORAL_DEFER_MS),
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(eq(schema.cadenceRuns.id, run.id));
        deferred++;
        continue;
      }

      if (!stepResult.ok && stepResult.retryable) {
        const alreadyRetried = (run.lastResult || "").startsWith(STEP_EXCEPTION_RETRY_PREFIX);
        await drizzle
          .update(schema.cadenceRuns)
          .set(
            alreadyRetried
              ? { status: "failed", lastResult: stepResult.result, updatedAt: now }
              : {
                  nextDueAt: new Date(Date.now() + CADENCE_EXCEPTION_RETRY_MS),
                  lastResult: `${STEP_EXCEPTION_RETRY_PREFIX}${stepResult.result}`,
                  updatedAt: now,
                },
          )
          .where(eq(schema.cadenceRuns.id, run.id));
        if (alreadyRetried) failed++;
        else deferred++;
        continue;
      }

      const nextIndex = currentIndex + 1;
      const nextStep = steps[nextIndex];
      if (!nextStep) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            currentStep: nextIndex,
            nextDueAt: null,
            status: "completed",
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(eq(schema.cadenceRuns.id, run.id));
        completed++;
      } else {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            currentStep: nextIndex,
            nextDueAt: new Date(Date.now() + nextStep.delayHours * 3_600_000),
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(eq(schema.cadenceRuns.id, run.id));
        advanced++;
      }
    } catch (error: any) {
      log.error("cadence tick run failed", { runId: run.id, error: error?.message });
      const alreadyRetried = (run.lastResult || "").startsWith(STEP_EXCEPTION_RETRY_PREFIX);
      await drizzle
        .update(schema.cadenceRuns)
        .set(
          alreadyRetried
            ? { status: "failed", lastResult: error?.message || "step exception", updatedAt: now }
            : {
                nextDueAt: new Date(Date.now() + CADENCE_EXCEPTION_RETRY_MS),
                lastResult: `${STEP_EXCEPTION_RETRY_PREFIX}${error?.message || "step exception"}`,
                updatedAt: now,
              },
        )
        .where(eq(schema.cadenceRuns.id, run.id));
      if (alreadyRetried) failed++;
    }
  }

  return { processed: dueRuns.length, advanced, completed, failed, deferred };
}
