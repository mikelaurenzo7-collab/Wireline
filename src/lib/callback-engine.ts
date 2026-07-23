/**
 * Callback engine — executes caller-requested callbacks.
 *
 * `schedule_callback` (agent tool) and the Outbound dispatcher write a
 * structured `outbound_leads.callback_scheduled_at`; this engine is the part
 * that actually returns the call. Before it existed the agent told callers
 * "Callback securely scheduled" while the row only fed a display pane — the
 * system never dialed anyone back.
 *
 * Runs from the `callback_tick` job (enqueued by every /api/jobs/sweep tick,
 * same cluster-safe shape as cadence_tick). Every dial passes the shared
 * evaluateOutboundDialGate with `isRequestedCallback` (quiet hours + DNC
 * still enforced; consent comes from the caller's own request) and the
 * outbound voice spend controls.
 */
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";
import { placeOutboundCall } from "./vapi-client";

/** Quiet-hours deferrals push the callback forward instead of dropping it. */
const DEFERRAL_STEP_MS = 60 * 60 * 1000;
const MAX_DEFERRALS = 16;

export interface CallbackTickSummary {
  processed: number;
  placed: number;
  deferred: number;
  skipped: number;
}

/** Scheduling bounds for agent-captured callback times. */
const MIN_LEAD_TIME_MS = 5 * 60 * 1000;
const MAX_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Parse the `callback_datetime` an agent captured mid-call into an executable
 * Date. The tool mandate asks the model for an exact ISO datetime, but LLM
 * output drifts — this is the single tolerant/clamping parser both the tool
 * handler and tests share.
 *
 * Returns null when the input is unparseable; callers fall back to a
 * next-day attempt and phrase the caller-facing promise accordingly.
 */
export function parseCallbackDatetime(input: unknown, now: Date = new Date()): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const parsed = new Date(input.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const floor = now.getTime() + MIN_LEAD_TIME_MS;
  const ceiling = now.getTime() + MAX_HORIZON_MS;
  return new Date(Math.min(Math.max(parsed.getTime(), floor), ceiling));
}

export async function tickDueCallbacks({
  limit = 25,
}: {
  limit?: number;
} = {}): Promise<CallbackTickSummary> {
  const now = new Date();
  const due = await drizzle
    .select({
      id: schema.outboundLeads.id,
      userId: schema.outboundLeads.userId,
      agentId: schema.outboundLeads.agentId,
      customerName: schema.outboundLeads.customerName,
      customerNumber: schema.outboundLeads.customerNumber,
      lastCalledAt: schema.outboundLeads.lastCalledAt,
      callbackScheduledAt: schema.outboundLeads.callbackScheduledAt,
      metadata: schema.outboundLeads.metadata,
    })
    .from(schema.outboundLeads)
    .where(
      and(
        isNotNull(schema.outboundLeads.callbackScheduledAt),
        lte(schema.outboundLeads.callbackScheduledAt, now),
      ),
    )
    .orderBy(asc(schema.outboundLeads.callbackScheduledAt))
    .limit(limit);

  let placed = 0;
  let deferred = 0;
  let skipped = 0;

  for (const lead of due) {
    const metadata = (lead.metadata as Record<string, unknown> | null) || {};
    const finish = async (patch: {
      callbackScheduledAt: Date | null;
      summary: string;
      metadata?: Record<string, unknown>;
    }) => {
      await drizzle
        .update(schema.outboundLeads)
        .set({
          callbackScheduledAt: patch.callbackScheduledAt,
          lastContactSummary: patch.summary,
          ...(patch.metadata ? { metadata: patch.metadata } : {}),
        })
        .where(eq(schema.outboundLeads.id, lead.id));
    };

    try {
      if (!lead.customerNumber) {
        skipped++;
        await finish({
          callbackScheduledAt: null,
          summary: "Callback skipped — lead has no phone number.",
        });
        continue;
      }

      let agentId = lead.agentId;
      if (!agentId) {
        const [fallbackAgent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(eq(schema.agents.userId, lead.userId))
          .orderBy(asc(schema.agents.createdAt))
          .limit(1);
        agentId = fallbackAgent?.id || null;
      }
      if (!agentId) {
        skipped++;
        await finish({
          callbackScheduledAt: null,
          summary: "Callback skipped — no agent available to place the call.",
        });
        continue;
      }

      const gate = await evaluateOutboundDialGate({
        userId: lead.userId,
        phone: lead.customerNumber,
        leadId: lead.id,
        lastCalledAt: lead.lastCalledAt,
        metadata,
        isRequestedCallback: true,
      });

      if (!gate.allowed) {
        if (gate.reason === "outside_permitted_calling_hours") {
          // Requested time drifted into quiet hours (timezone, DST, late
          // processing). Roll forward an hour at a time until it lands in a
          // permitted window; give up after MAX_DEFERRALS so a bad number
          // can't loop forever.
          const priorDeferrals = Number(metadata.callback_deferrals) || 0;
          if (priorDeferrals >= MAX_DEFERRALS) {
            skipped++;
            await finish({
              callbackScheduledAt: null,
              summary: "Callback dropped — could not find a permitted calling window.",
              metadata: { ...metadata, callback_deferrals: 0 },
            });
          } else {
            deferred++;
            await finish({
              callbackScheduledAt: new Date(Date.now() + DEFERRAL_STEP_MS),
              summary: "Callback deferred — outside permitted calling hours.",
              metadata: { ...metadata, callback_deferrals: priorDeferrals + 1 },
            });
          }
        } else {
          skipped++;
          await finish({
            callbackScheduledAt: null,
            summary: `Callback blocked — ${gate.reason}.`,
            ...(gate.metadataPatch ? { metadata: gate.metadataPatch } : {}),
          });
        }
        continue;
      }

      try {
        await assertOutboundVoiceAllowed({ userId: lead.userId, source: "callback", units: 0 });
      } catch (err) {
        // Spend/quota gates are tenant-state, not lead-state — defer, don't
        // drop, so the callback fires once the tenant is solvent again.
        deferred++;
        await finish({
          callbackScheduledAt: new Date(Date.now() + DEFERRAL_STEP_MS),
          summary: `Callback deferred — voice controls: ${err instanceof Error ? err.message : "blocked"}.`,
        });
        continue;
      }

      const requestedFor = lead.callbackScheduledAt?.toISOString() || "the requested time";
      const res = await placeOutboundCall({
        userId: lead.userId,
        agentId,
        customerName: lead.customerName,
        customerNumber: lead.customerNumber,
        context: `Returning the callback this contact requested (scheduled for ${requestedFor}). Open by acknowledging you're calling back as promised.`,
      });

      if (res.ok) {
        placed++;
        await finish({
          callbackScheduledAt: null,
          summary: "Requested callback placed automatically.",
          metadata: { ...metadata, callback_deferrals: 0 },
        });
      } else {
        skipped++;
        await finish({
          callbackScheduledAt: null,
          summary: `Callback attempt failed: ${res.error || "call could not be placed"}.`,
        });
      }
    } catch (err) {
      skipped++;
      log.error("callback tick lead failed", {
        leadId: String(lead.id),
        error: err instanceof Error ? err.message : String(err),
      });
      await finish({
        callbackScheduledAt: null,
        summary: "Callback failed with an internal error — flagged for manual follow-up.",
      }).catch(() => {});
    }
  }

  return { processed: due.length, placed, deferred, skipped };
}
