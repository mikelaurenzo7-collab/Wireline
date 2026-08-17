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
 * evaluateOutboundDialGate and the outbound voice spend controls.
 *
 * `isRequestedCallback` is READ from the lead, never assumed. It waives express
 * written consent and flips the dial to non-marketing (which drops the 47 CFR
 * 64.1200(b)(3) opt-out announcement), so it may only be claimed for a lead a
 * consumer actually asked to be called back on. Two other writers put a due
 * timestamp on `callback_scheduled_at` for leads nobody spoke to — the intake
 * quiet-hours deferral and the summary-inferred "followup" outcome — and this
 * engine selects purely on that timestamp. Hardcoding the flag laundered those
 * into consented callbacks: a cold marketing lead submitted at 22:30 got dialed
 * next morning with no consent check and no opt-out announcement, while the
 * identical lead submitted at 10:00 was hard-blocked.
 */
import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";
import { placeOutboundCall } from "./voice/outbound-call-service";
import { OUTBOUND_CONSENT_VERSION } from "./outbound-call-purpose";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";

/** Deferrals (quiet hours or tenant insolvency) push the callback forward
 *  instead of dropping it, up to MAX_DEFERRALS so a permanently-blocked lead
 *  can't bounce every hour forever. */
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
 * Provenance stamp proving a consumer asked for this callback on a live line.
 * Written only by the `schedule_callback` tool handler
 * (`src/routes/vapi/tool-handlers-workflow.ts`) and stripped from
 * account-holder-supplied intake metadata, so it cannot be asserted from
 * outside a call.
 */
export const CALLBACK_REQUEST_MARKER = "callback_requested_via";

/**
 * A due `callback_scheduled_at` is not evidence of a request — system deferrals
 * and inferred follow-ups write it too. Only the exact internally minted
 * `phone_call` provenance value is allowed to claim the requested-callback
 * class; an arbitrary non-empty marker must fail closed.
 */
export function isConsumerRequestedCallback(metadata: Record<string, unknown>): boolean {
  return metadata[CALLBACK_REQUEST_MARKER] === "phone_call";
}

/**
 * One request authorizes one return call. The marker is consumed on every
 * terminal outcome (placed, blocked, dropped, failed) and preserved only
 * across deferrals, where the same request is still rolling forward to its
 * window. Leaving it behind would relaunder every later system-scheduled dial
 * on the lead — a summary-inferred "followup" lands 24h after the placed
 * callback, and a stale marker would send it out with consent waived and the
 * opt-out announcement dropped, on the strength of a request the consumer
 * made once, for a call they already received.
 *
 * Also the sanitizer for HTTP boundaries that store caller-supplied lead
 * metadata verbatim: the claim "a consumer asked us to call back" is only
 * mintable by the in-call tool handler, never by an imported row.
 */
export function stripCallbackRequestMarker(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  if (!(CALLBACK_REQUEST_MARKER in metadata)) return metadata;
  const { [CALLBACK_REQUEST_MARKER]: _consumed, ...rest } = metadata;
  return rest;
}

/**
 * Decide the metadata a callback-tick write should persist.
 *
 * A terminal outcome (the schedule is cleared — placed, blocked, dropped, or
 * failed) spends the consumer's request, so the marker is consumed from
 * whichever object this write persists: the caller's patch when it supplied
 * one, otherwise the lead's own metadata, and then only when it actually
 * carries the marker (rewriting untouched metadata for nothing is churn).
 *
 * A deferral persists the patch untouched — the same request is still rolling
 * forward to its permitted window and has not been used yet.
 *
 * Returning undefined means "do not write the metadata column at all".
 * Extracted and exported so the rule is unit-testable: it decides whether a
 * later system-scheduled dial may claim consent, which is too consequential to
 * leave verified only by reading the source for a substring.
 */
export function nextCallbackLeadMetadata(input: {
  terminal: boolean;
  patchMetadata?: Record<string, unknown>;
  leadMetadata: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  if (!input.terminal) return input.patchMetadata;
  const source =
    input.patchMetadata ??
    (CALLBACK_REQUEST_MARKER in input.leadMetadata ? input.leadMetadata : undefined);
  return source ? stripCallbackRequestMarker(source) : undefined;
}

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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
    const metadata = record(lead.metadata);
    const finish = async (patch: {
      callbackScheduledAt: Date | null;
      summary: string;
      metadata?: Record<string, unknown>;
    }) => {
      // Native placement, Twilio status, xAI attachment, and callback outcomes
      // all mutate the same JSON document. Serialize on the shared lead lock and
      // merge from the latest row so this worker cannot erase voice correlation
      // fields with the stale metadata snapshot selected at tick start.
      await drizzle.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(lead.id)}`}))`,
        );
        const [current] = await tx
          .select({ metadata: schema.outboundLeads.metadata })
          .from(schema.outboundLeads)
          .where(eq(schema.outboundLeads.id, lead.id))
          .limit(1);
        const latestMetadata = record(current?.metadata);
        const mergedPatch = patch.metadata
          ? { ...latestMetadata, ...patch.metadata }
          : undefined;
        const nextMetadata = nextCallbackLeadMetadata({
          terminal: patch.callbackScheduledAt === null,
          patchMetadata: mergedPatch,
          leadMetadata: latestMetadata,
        });
        await tx
          .update(schema.outboundLeads)
          .set({
            callbackScheduledAt: patch.callbackScheduledAt,
            lastContactSummary: patch.summary,
            ...(nextMetadata ? { metadata: nextMetadata } : {}),
          })
          .where(eq(schema.outboundLeads.id, lead.id));
      });
    };

    const deferOrDrop = async (why: string): Promise<"deferred" | "dropped"> => {
      const priorDeferrals = Number(metadata.callback_deferrals) || 0;
      if (priorDeferrals >= MAX_DEFERRALS) {
        await finish({
          callbackScheduledAt: null,
          summary: `Callback dropped: ${why} (max retries reached).`,
          metadata: { ...metadata, callback_deferrals: 0 },
        });
        return "dropped";
      }
      await finish({
        callbackScheduledAt: new Date(Date.now() + DEFERRAL_STEP_MS),
        summary: `Callback deferred: ${why}.`,
        metadata: { ...metadata, callback_deferrals: priorDeferrals + 1 },
      });
      return "deferred";
    };

    try {
      const claimed = await drizzle
        .update(schema.outboundLeads)
        .set({ callbackScheduledAt: null })
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            eq(schema.outboundLeads.callbackScheduledAt, lead.callbackScheduledAt!),
          ),
        )
        .returning({ id: schema.outboundLeads.id });
      if (!claimed.length) continue;

      const fencedCallback = await runTenantProviderWorkWithDeletionFence({
        userId: lead.userId,
        perform: async (): Promise<"placed" | "deferred" | "skipped"> => {
          if (!lead.customerNumber) {
            await finish({
              callbackScheduledAt: null,
              summary: "Callback skipped: lead has no phone number.",
            });
            return "skipped";
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
            await finish({
              callbackScheduledAt: null,
              summary: "Callback skipped: no agent available to place the call.",
            });
            return "skipped";
          }

          const consumerRequested = isConsumerRequestedCallback(metadata);
          const gate = await evaluateOutboundDialGate({
            userId: lead.userId,
            phone: lead.customerNumber,
            leadId: lead.id,
            lastCalledAt: lead.lastCalledAt,
            metadata,
            isRequestedCallback: consumerRequested,
          });

          if (!gate.allowed) {
            if (
              gate.reason === "outside_permitted_calling_hours" ||
              gate.reason === "self_recent_call_scheduled"
            ) {
              return (await deferOrDrop(
                gate.reason === "self_recent_call_scheduled"
                  ? "called within the last 24 hours"
                  : "outside permitted calling hours",
              )) === "deferred"
                ? "deferred"
                : "skipped";
            }
            await finish({
              callbackScheduledAt: null,
              summary: `Callback blocked: ${gate.reason}.`,
              ...(gate.metadataPatch ? { metadata: gate.metadataPatch } : {}),
            });
            return "skipped";
          }

          try {
            await assertOutboundVoiceAllowed({
              userId: lead.userId,
              source: "callback",
              units: 0,
            });
          } catch (err) {
            return (await deferOrDrop(
              `voice controls: ${err instanceof Error ? err.message : "blocked"}`,
            )) === "deferred"
              ? "deferred"
              : "skipped";
          }

          const requestedFor = lead.callbackScheduledAt?.toISOString() || "the requested time";
          const callPurpose = consumerRequested ? "callback" : "marketing_or_sales";
          const res = await placeOutboundCall({
            userId: lead.userId,
            agentId,
            customerName: lead.customerName,
            customerNumber: lead.customerNumber,
            context: consumerRequested
              ? `Returning the callback this contact requested (scheduled for ${requestedFor}). Open by acknowledging you're calling back as promised.`
              : `Scheduled outbound follow-up for this contact (queued for ${requestedFor}). They did not request this call. Introduce yourself and state why you are calling.`,
            callPurpose,
            leadId: lead.id,
          });

          if (!res.ok) {
            await finish({
              callbackScheduledAt: null,
              summary: `Callback attempt failed: ${res.error || "call could not be placed"}.`,
            });
            return "skipped";
          }

          await drizzle
            .update(schema.outboundLeads)
            .set({ lastCalledAt: new Date(), callId: res.callId })
            .where(eq(schema.outboundLeads.id, lead.id));
          await drizzle.insert(schema.consentLog).values({
            userId: lead.userId,
            customerNumber: lead.customerNumber,
            callId: res.callId,
            event: "outbound_call_placed",
            state: "initiated",
            metadata: {
              leadId: String(lead.id),
              call_purpose: callPurpose,
              consent_version: OUTBOUND_CONSENT_VERSION,
              source: "callback",
              consumer_requested: consumerRequested,
            },
          });
          await finish({
            callbackScheduledAt: null,
            summary: consumerRequested
              ? "Requested callback placed automatically."
              : "Scheduled outbound follow-up placed automatically.",
            metadata: { ...metadata, callback_deferrals: 0 },
          });
          return "placed";
        },
      });

      if (!fencedCallback.performed) {
        skipped++;
        log.warn("callback skipped: account erased or terminal deletion has begun", {
          leadId: String(lead.id),
          userId: lead.userId,
        });
        continue;
      }
      if (fencedCallback.result === "placed") placed++;
      else if (fencedCallback.result === "deferred") deferred++;
      else skipped++;
    } catch (err) {
      skipped++;
      log.error("callback tick lead failed", {
        leadId: String(lead.id),
        error: err instanceof Error ? err.message : String(err),
      });
      await runTenantProviderWorkWithDeletionFence({
        userId: lead.userId,
        perform: () =>
          finish({
            callbackScheduledAt: null,
            summary: "Callback failed with an internal error. Flagged for manual follow-up.",
          }),
      }).catch(() => {});
    }
  }

  return { processed: due.length, placed, deferred, skipped };
}
