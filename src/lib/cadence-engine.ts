/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Cadence engine — fires scheduled call, SMS, and email steps. Every call step
 * routes through BotBound's Twilio carrier placement and OpenAI Realtime SIP
 * and carries the existing lead id so carrier, realtime, transcript, and
 * settlement state remain attached to one authoritative record.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import * as schema from "../db/schema";
import {
  externalEntityActionPolicyForUser,
  liveExternalActionPolicyForUser,
} from "./account-environment-policy";
import { IntegrationService } from "./integrations";
import { evaluateOutboundDialGate, mergeLeadMetadata } from "./outbound-dial-gate";
import { OUTBOUND_CONSENT_VERSION } from "./outbound-call-purpose";
import { drizzle, log } from "./server-context";
import { jsonSafeId, toJsonbSafe } from "./server-utils";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";
import { sendTenantMessage } from "./twilio-service";
import { placeOutboundCall } from "./voice/outbound-call-service";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";
import { inspectOutboundRecipientPermission } from "./recipient-voice-permission-store";
import { AppError } from "./api-error";

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

async function stampCadenceComplianceDenial(
  cadence: CadenceRow,
  lead: LeadRow,
  gate: {
    status: string;
    reason: string;
    metadataPatch?: Record<string, unknown>;
    consentLogEvent?: string;
  },
): Promise<void> {
  await drizzle
    .update(schema.outboundLeads)
    .set({
      status: gate.status,
      lastContactSummary: `Cadence blocked: ${gate.reason}.`,
      metadata: toJsonbSafe(mergeLeadMetadata(lead.metadata || {}, gate.metadataPatch)) as any,
    })
    .where(
      and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, cadence.userId)),
    );
  if (gate.consentLogEvent && lead.customerNumber) {
    await drizzle.insert(schema.consentLog).values({
      userId: cadence.userId,
      customerNumber: lead.customerNumber,
      event: gate.consentLogEvent,
      state: "blocked",
      metadata: toJsonbSafe({
        leadId: jsonSafeId(lead.id),
        cadenceId: cadence.id,
        source: "cadence",
        ...(gate.metadataPatch?.tcpa ? { tcpa: gate.metadataPatch.tcpa } : {}),
      }),
    });
  }
}

/**
 * `retryable` is reserved for failures proven to occur before a provider-side
 * effect. Native call creation treats transport/5xx ambiguity as do-not-retry,
 * so a cadence never places a second marketing call merely because the first
 * carrier response was lost.
 */
export async function executeStep(
  step: CadenceStep,
  cadence: CadenceRow,
  lead: LeadRow,
): Promise<{
  ok: boolean;
  result: string;
  defer?: boolean;
  retryable?: boolean;
  failRun?: boolean;
}> {
  // cadence_tick is a system job, so the worker-level tenant environment guard
  // cannot classify the account that owns this individual step. Recheck after
  // the deletion-fenced ownership admission and before Federal DNC lookup,
  // spend controls, or any provider transport. A policy lookup outage pauses
  // the run at the same step instead of retrying into a paid side effect.
  try {
    const environmentPolicy = await liveExternalActionPolicyForUser(cadence.userId);
    if (!environmentPolicy.allowed) {
      return {
        ok: false,
        result: `paused: ${environmentPolicy.message}`,
        failRun: true,
      };
    }

    const entityPolicy = await externalEntityActionPolicyForUser(cadence.userId, {
      leadId: lead.id,
      ...(step.type === "email" ? { email: lead.email } : { phone: lead.customerNumber }),
    });
    if (!entityPolicy.allowed) {
      // Showcase fixtures are terminal for this run. Pausing with nextDueAt
      // cleared follows the existing cadence block convention and prevents a
      // scheduler hot loop from repeatedly reaching compliance/provider code.
      return {
        ok: false,
        result: `blocked: ${entityPolicy.message}`,
        failRun: true,
      };
    }
  } catch (error) {
    log.warn("cadence account environment admission failed, failing closed", {
      userId: cadence.userId,
      leadId: jsonSafeId(lead.id),
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      result: "paused: account environment could not be verified",
      failRun: true,
    };
  }

  const agentId = step.agentId || cadence.agentId || lead.agentId;
  let voicePermissionId: string | undefined;
  if (step.type === "call" && lead.customerNumber && agentId) {
    try {
      const permission = await inspectOutboundRecipientPermission({
        userId: cadence.userId,
        agentId,
        leadId: lead.id,
        phone: lead.customerNumber,
        callPurpose: "marketing_or_sales",
        attemptId: randomUUID(),
      });
      if (permission.effectiveCallPurpose !== "marketing_or_sales")
        throw new Error("A matching marketing voice permission is required.");
      voicePermissionId = permission.artifactId;
    } catch (error) {
      if (error instanceof AppError && error.code === "OUTSIDE_PERMITTED_CALLING_HOURS")
        return { ok: false, result: "outside permitted calling hours", defer: true };
      return { ok: false, result: "voice permission could not be verified", retryable: true };
    }
  }

  if ((step.type === "call" || step.type === "sms") && lead.customerNumber) {
    try {
      const gate = await evaluateOutboundDialGate({
        userId: cadence.userId,
        phone: lead.customerNumber,
        leadId: lead.id,
        lastCalledAt: lead.lastCalledAt,
        metadata: lead.metadata || {},
        isMarketingCall: true,
        requireFederalDncScreening: true,
        hasExpressWrittenConsent: step.type === "call" && Boolean(voicePermissionId),
      });
      if (!gate.allowed) {
        const temporal =
          gate.reason === "outside_permitted_calling_hours" ||
          gate.reason === "self_recent_call_scheduled";
        if (!temporal && gate.status !== "AutoDialFailed") {
          await stampCadenceComplianceDenial(cadence, lead, gate);
          return {
            ok: false,
            result: `skipped: ${gate.reason}`,
            failRun: true,
          };
        }
        if (gate.reason === "federal_dnc_unconfigured") {
          return { ok: false, result: `skipped: ${gate.reason}`, retryable: true };
        }
        return { ok: false, result: `skipped: ${gate.reason}`, defer: temporal };
      }
    } catch (err: any) {
      log.warn("cadence outbound compliance gate failed, failing closed", {
        error: err?.message,
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
      consentArtifactId: voicePermissionId,
    });
    if (result.ok) {
      try {
        await drizzle.insert(schema.consentLog).values({
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
        });
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
    const body = applyVars(step.template || `Hi {{name}}, checking back in. BotBound`, lead);
    const result = await sendTenantMessage(cadence.userId, {
      to: lead.customerNumber,
      body,
      agentId: agentId ?? undefined,
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
    const body = applyVars(step.template || `Hi {{name}},\n\nFollowing up. BotBound`, lead);
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
const STEP_IN_FLIGHT_PREFIX = "step awaiting outcome: ";
const STEP_VERIFICATION_REQUIRED =
  "Paused: verify the previous step's outcome before re-enrolling.";

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
    .where(
      and(
        eq(schema.cadenceRuns.status, "active"),
        lte(schema.cadenceRuns.nextDueAt, now),
        // Keep a parent pause reversible, and exclude paused sequences before
        // LIMIT so their overdue runs cannot starve other scheduled outreach.
        sql`not exists (select 1 from ${schema.cadences} where ${schema.cadences.id} = ${schema.cadenceRuns.cadenceId} and ${schema.cadences.userId} = ${schema.cadenceRuns.userId} and ${schema.cadences.active} = false)`,
      ),
    )
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
    const cadenceRowRaw = cadenceById.get(run.cadenceId);
    const cadenceRow =
      cadenceRowRaw && cadenceRowRaw.userId === run.userId ? cadenceRowRaw : undefined;
    // The parent may have been paused after the due-run scan.
    if (cadenceRow?.active === false) continue;
    let ownsRun = false;
    let providerStepStarted = false;
    const leaseUntil = new Date(Date.now() + CADENCE_STEP_LEASE_MS);
    const pendingResult = `${STEP_IN_FLIGHT_PREFIX}${run.currentStep}`;
    const ownedRun = and(
      eq(schema.cadenceRuns.id, run.id),
      eq(schema.cadenceRuns.userId, run.userId),
      eq(schema.cadenceRuns.status, "active"),
      eq(schema.cadenceRuns.currentStep, run.currentStep),
      eq(schema.cadenceRuns.nextDueAt, leaseUntil),
      eq(schema.cadenceRuns.lastResult, pendingResult),
    );
    try {
      const claimed = await drizzle
        .update(schema.cadenceRuns)
        .set({ nextDueAt: leaseUntil, lastResult: pendingResult, updatedAt: now })
        .where(
          and(
            eq(schema.cadenceRuns.id, run.id),
            eq(schema.cadenceRuns.userId, run.userId),
            eq(schema.cadenceRuns.status, "active"),
            eq(schema.cadenceRuns.currentStep, run.currentStep),
            eq(schema.cadenceRuns.nextDueAt, run.nextDueAt!),
            lte(schema.cadenceRuns.nextDueAt, now),
          ),
        )
        .returning({ id: schema.cadenceRuns.id });
      if (!claimed.length) continue;
      ownsRun = true;

      // A lease expiring does not prove that a provider action failed. The
      // previous worker may have sent it and then lost database access or died.
      // Keep that durable uncertainty across restarts instead of sending again.
      if ((run.lastResult || "").startsWith(STEP_IN_FLIGHT_PREFIX)) {
        providerStepStarted = true;
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            status: "paused",
            nextDueAt: null,
            lastResult: STEP_VERIFICATION_REQUIRED,
            updatedAt: now,
          })
          .where(ownedRun);
        failed++;
        continue;
      }

      if (!cadenceRow) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "paused", updatedAt: now, lastResult: "cadence inactive or deleted" })
          .where(ownedRun);
        continue;
      }

      const leadRowRaw = leadById.get(run.leadId);
      const leadRow = leadRowRaw && leadRowRaw.userId === run.userId ? leadRowRaw : undefined;
      if (!leadRow) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "failed", updatedAt: now, lastResult: "lead no longer exists" })
          .where(ownedRun);
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
          .where(ownedRun);
        completed++;
        continue;
      }

      const fencedStep = await runTenantProviderWorkWithDeletionFence({
        userId: run.userId,
        operation: "cadence_provider_step",
        ttlMs: 15 * 60_000,
        retainOnSuccess: true,
        perform: () => {
          providerStepStarted = true;
          return executeStep(step, cadenceRow as any, leadRow as any);
        },
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
          .where(ownedRun);
        continue;
      }
      const stepResult = fencedStep.result;
      // These outcomes are explicitly proven to precede a provider side effect.
      if (stepResult.defer || stepResult.failRun || stepResult.retryable)
        providerStepStarted = false;

      if (stepResult.defer) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            nextDueAt: new Date(Date.now() + CADENCE_TEMPORAL_DEFER_MS),
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(ownedRun);
        deferred++;
        continue;
      }

      if (stepResult.failRun) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            status: "paused",
            nextDueAt: null,
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(ownedRun);
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
          .where(ownedRun);
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
          .where(ownedRun);
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
          .where(ownedRun);
        advanced++;
      }
    } catch (error: any) {
      log.error("cadence tick run failed", { runId: run.id, error: error?.message });
      if (!ownsRun) continue;
      if (providerStepStarted) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            status: "paused",
            nextDueAt: null,
            lastResult: STEP_VERIFICATION_REQUIRED,
            updatedAt: now,
          })
          .where(ownedRun);
        failed++;
        continue;
      }
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
        .where(ownedRun);
      if (alreadyRetried) failed++;
    }
  }

  return { processed: dueRuns.length, advanced, completed, failed, deferred };
}
