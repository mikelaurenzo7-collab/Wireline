/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Cadence engine — fires the scheduled step for every cadence run that's
 * due. Hooked into the job-worker via the `cadence_tick` job type; the
 * existing `/api/jobs/sweep` cron enqueues one tick per sweep (every
 * 5 minutes on Vercel).
 *
 * Step types:
 *   - call  → placeOutboundCall (uses the cadence's agent or the lead's)
 *   - sms   → sendTenantMessage with the template (after {{var}} substitution)
 *   - email → IntegrationService.sendEmail to the lead's email address
 *
 * After each step we advance current_step + schedule next_due_at = now +
 * next-step.delayHours. When current_step exceeds the array length, the
 * run is marked completed.
 */

import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, lte, asc, inArray, sql } from "drizzle-orm";
import { placeOutboundCall } from "./vapi-client";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";
import { sendTenantMessage } from "./twilio-service";
import { IntegrationService } from "./integrations";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { OUTBOUND_CONSENT_VERSION } from "./outbound-call-purpose";
import { jsonSafeId, toJsonbSafe } from "./server-utils";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";

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
 * `retryable` marks a failure that is BOTH transient and provably happened
 * before the provider was asked to do anything.
 *
 * That second condition is the important one. `placeOutboundCall` deliberately
 * disables transport and status retries (see vapi-client.ts) because Vapi
 * offers no idempotency key on call creation, so a timeout or 5xx can arrive
 * after the carrier already accepted the dial. A cadence that re-dialed on that
 * outcome would place a second marketing call to the same consumer — a worse
 * failure under TCPA than the dropped touch it is trying to avoid. Provider
 * send failures therefore advance the step, exactly as before.
 *
 * Permanent outcomes are likewise never retried: a hard DNC or consent denial
 * must not be re-attempted, and a lead with no phone or no configured agent
 * will still have none in fifteen minutes.
 */
async function executeStep(
  step: CadenceStep,
  cadence: CadenceRow,
  lead: LeadRow,
): Promise<{ ok: boolean; result: string; defer?: boolean; retryable?: boolean }> {
  const agentId = step.agentId || cadence.agentId || lead.agentId;

  // TCPA/federal DNC/express-written-consent: a cadence step is marketing
  // outbound exactly like a campaign dial or intake auto-dial, and a lead
  // can land on DNC (or lose consent) after being enrolled — re-check at
  // execution time through the same shared gate campaign-dialer.ts and
  // intake-routes.ts use, not just tenant-internal DNC. Covers call and
  // SMS steps; both are marketing outbound under TCPA.
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
        // Temporal denials (quiet hours, the lead's own 24h window) resolve on
        // their own within a day — defer the step instead of skipping it, or a
        // call step that comes due at 9pm lead-local simply never happens.
        // Hard denials (DNC, lost consent) still skip: the touch must not run.
        const temporal =
          gate.reason === "outside_permitted_calling_hours" ||
          gate.reason === "self_recent_call_scheduled";
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
    } catch (err: any) {
      return {
        ok: false,
        result: `voice control rejected: ${err?.message || "blocked"}`,
        retryable: true,
      };
    }
    const res = await placeOutboundCall({
      userId: cadence.userId,
      agentId,
      customerName: lead.customerName,
      customerNumber: lead.customerNumber,
      context: `Cadence "${cadence.name}", step type call`,
      callPurpose: "marketing_or_sales",
    });
    if (res.ok) {
      // Mirror the campaign dialer: stamp the dial on the lead so the shared
      // gate's 24h duplicate window sees it (a lead enrolled in a cadence AND
      // a campaign must not get both calls the same morning), and write the
      // consent-ledger evidence row for the marketing dial.
      try {
        await Promise.all([
          drizzle
            .update(schema.outboundLeads)
            .set({
              lastCalledAt: new Date(),
              attempts: sql`${schema.outboundLeads.attempts} + 1`,
              callId: res.callId,
            })
            .where(eq(schema.outboundLeads.id, lead.id)),
          drizzle.insert(schema.consentLog).values({
            userId: cadence.userId,
            customerNumber: lead.customerNumber,
            callId: res.callId,
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
      } catch (recordErr: any) {
        log.error("cadence call placed but dial evidence write failed", {
          leadId: jsonSafeId(lead.id),
          cadenceId: cadence.id,
          error: recordErr?.message,
        });
      }
    }
    return {
      ok: res.ok,
      result: res.ok ? `call placed ${res.callId}` : `call failed: ${res.error}`,
      // Not retryable: Vapi call creation has no idempotency key, so a failed
      // response may still have produced a dial. Advancing is the safe side.
    };
  }

  if (step.type === "sms") {
    if (!lead.customerNumber) return { ok: false, result: "no phone number on lead" };
    const body = applyVars(step.template || `Hi {{name}}, checking back in. Wireline`, lead);
    const res = await sendTenantMessage(cadence.userId, {
      to: lead.customerNumber,
      body,
      agentId: cadence.agentId ?? lead.agentId ?? undefined,
    });
    return {
      ok: res.ok,
      result: res.ok ? `sms sent ${res.sid || ""}` : `sms failed: ${res.reason || "unknown"}`,
      // Not retryable, for the same reason as the call step: message creation
      // is not idempotent, and a re-send is a second message to a consumer.
    };
  }

  if (step.type === "email") {
    if (!lead.email) return { ok: false, result: "no email on lead" };
    const body = applyVars(step.template || `Hi {{name}},\n\nFollowing up. Wireline`, lead);
    const integ = new IntegrationService(cadence.userId);
    // Cadence email is recurring commercial mail: honor the suppression list
    // and carry an unsubscribe affordance on every transport, including the
    // tenant's own connected mailbox.
    const ok = await integ.sendEmail({
      to: lead.email,
      subject: `Following up: ${cadence.name}`,
      body,
      marketing: true,
    });
    // IntegrationService.sendEmail returns only a boolean, so a transport error,
    // a suppression, and a partially-delivered send are indistinguishable. Not
    // retryable: a duplicate marketing email is the worse outcome.
    return { ok, result: ok ? "email sent" : "email failed (suppressed or no connected mailbox?)" };
  }

  return { ok: false, result: `unknown step type ${step.type}` };
}

/**
 * Lease window for an atomically-claimed cadence step. The claim pushes
 * nextDueAt out by this much before the side-effecting step runs; a tick that
 * dies mid-step self-heals when the lease expires (the step is retried) rather
 * than stranding the run forever, which a null-claim (as callback-engine uses
 * for its one-shot) would do to a multi-step cadence.
 */
const CADENCE_STEP_LEASE_MS = 15 * 60 * 1000;

/** Retry delay when a step is deferred by a temporal gate (quiet hours). */
const CADENCE_TEMPORAL_DEFER_MS = 60 * 60 * 1000;
/** Retry delay after a step exception; one retry before the run fails. */
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

  const cadenceIds = [...new Set(dueRuns.map((r) => r.cadenceId).filter(Boolean))] as string[];
  const leadIds = [...new Set(dueRuns.map((r) => r.leadId).filter((v): v is bigint => v != null))];

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

  const cadenceById = new Map(cadenceRows.map((c) => [c.id, c]));
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  for (const run of dueRuns) {
    try {
      // Atomic lease-claim BEFORE any side-effecting work so a concurrent or
      // retried cadence_tick (the sweep enqueues one every 5 min with no
      // dedup, and workers drain with FOR UPDATE SKIP LOCKED) can't select the
      // same due run and dial/SMS/email the same step twice. Postgres
      // serializes the two UPDATEs on the row: the winner flips nextDueAt to a
      // future lease and returns its id; the loser's `nextDueAt <= now`
      // predicate no longer holds, returns zero rows, and skips. On success
      // the step-advance below overwrites the lease with the real next time.
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
      const currentIdx = run.currentStep ?? 0;
      const step = steps[currentIdx];
      if (!step) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({ status: "completed", updatedAt: now, lastResult: "all steps complete" })
          .where(eq(schema.cadenceRuns.id, run.id));
        completed++;
        continue;
      }

      // `cadence_tick` is system-owned, so the worker-level deletion fence has
      // no tenant to protect. Fence at the run boundary and retain the lock
      // across DNC vendor lookup, provider submission, and evidence writes.
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
        // Temporal gate denial: hold the run at this step and retry when the
        // window can plausibly be open. Quiet hours re-open daily, so the
        // deferral is self-limiting; advancing instead would silently drop
        // the touch.
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
        // A returned failure is the same event as a thrown one — a provider
        // outage, a fail-closed gate, a spend control — and until now only the
        // thrown form was retried. The returned form fell through to the
        // advance below, so a Twilio 500 or a rejected dial consumed the step
        // and the customer simply never received that touch. Same single-retry
        // budget and the same marker the catch block uses, so a run cannot
        // ping-pong between the two paths.
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

      const nextIdx = currentIdx + 1;
      const nextStep = steps[nextIdx];
      if (!nextStep) {
        await drizzle
          .update(schema.cadenceRuns)
          .set({
            currentStep: nextIdx,
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
            currentStep: nextIdx,
            nextDueAt: new Date(Date.now() + nextStep.delayHours * 3_600_000),
            lastResult: stepResult.result,
            updatedAt: now,
          })
          .where(eq(schema.cadenceRuns.id, run.id));
        advanced++;
      }
    } catch (err: any) {
      log.error("cadence tick run failed", { runId: run.id, error: err?.message });
      // One transient exception (SMS provider hiccup, DB blip) must not kill a
      // multi-week cadence. Grant a single retry, marked in lastResult; a
      // second consecutive exception is treated as real and fails the run.
      const alreadyRetried = (run.lastResult || "").startsWith(STEP_EXCEPTION_RETRY_PREFIX);
      await drizzle
        .update(schema.cadenceRuns)
        .set(
          alreadyRetried
            ? { status: "failed", lastResult: err?.message || "step exception", updatedAt: now }
            : {
                nextDueAt: new Date(Date.now() + CADENCE_EXCEPTION_RETRY_MS),
                lastResult: `${STEP_EXCEPTION_RETRY_PREFIX}${err?.message || "step exception"}`,
                updatedAt: now,
              },
        )
        .where(eq(schema.cadenceRuns.id, run.id));
      if (alreadyRetried) failed++;
    }
  }

  return { processed: dueRuns.length, advanced, completed, failed, deferred };
}
