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
import { eq, and, lte, asc, inArray } from "drizzle-orm";
import { placeOutboundCall } from "./vapi-client";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";
import { sendTenantMessage } from "./twilio-service";
import { IntegrationService } from "./integrations";
import { isDncBlocked } from "./compliance";

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
}

function applyVars(template: string, lead: LeadRow): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, lead.customerName?.split(" ")[0] || "there")
    .replace(/\{\{\s*full_name\s*\}\}/gi, lead.customerName || "")
    .replace(/\{\{\s*phone\s*\}\}/gi, lead.customerNumber || "")
    .replace(/\{\{\s*email\s*\}\}/gi, lead.email || "");
}

async function executeStep(
  step: CadenceStep,
  cadence: CadenceRow,
  lead: LeadRow,
): Promise<{ ok: boolean; result: string }> {
  const agentId = step.agentId || cadence.agentId || lead.agentId;

  // TCPA/GDPR: refuse any call or SMS step when the number is on this
  // tenant's DNC list. A lead can land on DNC after being enrolled — we
  // must re-check at execution time, not just at enroll time.
  if ((step.type === "call" || step.type === "sms") && lead.customerNumber) {
    try {
      if (await isDncBlocked(cadence.userId, lead.customerNumber)) {
        return { ok: false, result: "skipped — number on DNC" };
      }
    } catch (err: any) {
      log.warn("cadence DNC check failed — failing closed", { error: err?.message });
      return { ok: false, result: "DNC check failed (fail-closed)" };
    }
  }

  if (step.type === "call") {
    if (!lead.customerNumber) return { ok: false, result: "no phone number on lead" };
    if (!agentId) return { ok: false, result: "no agent configured for call step" };
    try {
      await assertOutboundVoiceAllowed({ userId: cadence.userId, source: "cadence", units: 0 });
    } catch (err: any) {
      return { ok: false, result: `voice control rejected: ${err?.message || "blocked"}` };
    }
    const res = await placeOutboundCall({
      userId: cadence.userId,
      agentId,
      customerName: lead.customerName,
      customerNumber: lead.customerNumber,
      context: `Cadence "${cadence.name}" — step type call`,
    });
    return {
      ok: res.ok,
      result: res.ok ? `call placed ${res.callId}` : `call failed: ${res.error}`,
    };
  }

  if (step.type === "sms") {
    if (!lead.customerNumber) return { ok: false, result: "no phone number on lead" };
    const body = applyVars(step.template || `Hi {{name}}, checking back in — Wireline`, lead);
    const res = await sendTenantMessage(cadence.userId, {
      to: lead.customerNumber,
      body,
      agentId: cadence.agentId ?? lead.agentId ?? undefined,
    });
    return {
      ok: res.ok,
      result: res.ok ? `sms sent ${res.sid || ""}` : `sms failed: ${res.reason || "unknown"}`,
    };
  }

  if (step.type === "email") {
    if (!lead.email) return { ok: false, result: "no email on lead" };
    const body = applyVars(step.template || `Hi {{name}},\n\nFollowing up — Wireline`, lead);
    const integ = new IntegrationService(cadence.userId);
    const ok = await integ.sendEmail({
      to: lead.email,
      subject: `Following up — ${cadence.name}`,
      body,
    });
    return { ok, result: ok ? "email sent" : "email failed (no connected mailbox?)" };
  }

  return { ok: false, result: `unknown step type ${step.type}` };
}

export async function tickDueCadenceRuns({
  limit = 50,
}: {
  limit?: number;
}): Promise<{ processed: number; advanced: number; completed: number; failed: number }> {
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
          })
          .from(schema.outboundLeads)
          .where(inArray(schema.outboundLeads.id, leadIds))
      : Promise.resolve([]),
  ]);

  const cadenceById = new Map(cadenceRows.map((c) => [c.id, c]));
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  for (const run of dueRuns) {
    try {
      const cadenceRow = cadenceById.get(run.cadenceId);
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

      const stepResult = await executeStep(step, cadenceRow as any, leadRow as any);

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
      await drizzle
        .update(schema.cadenceRuns)
        .set({ status: "failed", lastResult: err?.message || "step exception", updatedAt: now })
        .where(eq(schema.cadenceRuns.id, run.id));
      failed++;
    }
  }

  return { processed: dueRuns.length, advanced, completed, failed };
}
