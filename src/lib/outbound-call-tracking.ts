import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";
import { LEAD_STATUS } from "./outbound-status";
import { normalizeDncPhone } from "./compliance";

/** Summary written when Vapi accepts an outbound dial — replaced by end-of-call report. */
export const OUTBOUND_CALL_PLACEHOLDER_SUMMARY = "Outbound call in progress…";

/** pipeline_error marker while the call is ringing / in flight. */
export const OUTBOUND_CALL_DIALING_MARKER = "dialing";

export function isOutboundCallPlaceholder(row: {
  summary?: string | null;
  pipelineError?: string | null;
}): boolean {
  return (
    row.pipelineError === OUTBOUND_CALL_DIALING_MARKER ||
    row.summary === OUTBOUND_CALL_PLACEHOLDER_SUMMARY
  );
}

/**
 * Insert a stub call log as soon as Vapi accepts the dial so Phone → Call
 * History shows the attempt before the end-of-call webhook lands.
 */
export async function recordOutboundCallPlaced(input: {
  userId: string;
  agentId: string;
  vapiCallId: string;
  customerNumber: string;
}): Promise<void> {
  try {
    await drizzle.insert(schema.callLogs).values({
      userId: input.userId,
      vapiCallId: input.vapiCallId,
      agentId: input.agentId,
      direction: "outbound",
      customerNumber: input.customerNumber,
      durationSeconds: 0,
      cost: "0",
      summary: OUTBOUND_CALL_PLACEHOLDER_SUMMARY,
      transcript: "",
      pipelineError: OUTBOUND_CALL_DIALING_MARKER,
    });
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if ((err as { code?: string })?.code === "23505" || /duplicate key/i.test(msg)) {
      return;
    }
    log.warn("Outbound call placeholder log skipped", {
      vapiCallId: input.vapiCallId,
      error: msg,
    });
  }
}

export async function findCallLogByVapiCallId(vapiCallId: string) {
  const [row] = await drizzle
    .select({
      id: schema.callLogs.id,
      summary: schema.callLogs.summary,
      pipelineError: schema.callLogs.pipelineError,
    })
    .from(schema.callLogs)
    .where(eq(schema.callLogs.vapiCallId, vapiCallId))
    .limit(1);
  return row ?? null;
}

export async function updateLeadStatusOnCallEnd(
  userId: string,
  customerNumber: string,
  outcomeTag: string,
  vapiCallId?: string | null,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lead: any = null;

    // First try by vapiCallId
    if (vapiCallId) {
      const [row] = await drizzle
        .select()
        .from(schema.outboundLeads)
        .where(
          and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.callId, vapiCallId)),
        )
        .limit(1);
      lead = row;
    }

    // Fallback to customerNumber + active dialing status
    if (!lead && customerNumber) {
      const [row] = await drizzle
        .select()
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, userId),
            eq(schema.outboundLeads.customerNumber, customerNumber),
            inArray(schema.outboundLeads.status, ["Dialing", "Connected"]),
          ),
        )
        .limit(1);
      lead = row;
    }

    if (!lead) {
      log.info("No active outbound lead found for status update on call end", {
        userId,
        customerNumber,
        vapiCallId,
      });
      return;
    }

    let maxAttempts = 3;
    if (lead.campaignId) {
      const [camp] = await drizzle
        .select({ maxAttempts: schema.outboundCampaigns.maxAttempts })
        .from(schema.outboundCampaigns)
        .where(eq(schema.outboundCampaigns.id, lead.campaignId))
        .limit(1);
      if (camp?.maxAttempts !== null && camp?.maxAttempts !== undefined) {
        maxAttempts = camp.maxAttempts;
      }
    }

    let currentAttempts = lead.attempts ?? 0;
    if (currentAttempts === 0) {
      currentAttempts = 1;
    }

    let newStatus: string = LEAD_STATUS.FAILED;

    if (outcomeTag === "booked" || outcomeTag === "qualified") {
      newStatus = LEAD_STATUS.COMPLETED;
    } else if (outcomeTag === "dnc") {
      newStatus = LEAD_STATUS.BLOCKED_DNC;
      /*
       * Make the classification operative, not just cosmetic.
       *
       * The transcript matcher in vapi-handlers writes the tenant DNC row when
       * a raw opt-out PHRASE matches. This tag comes from a different signal —
       * a regex over the model's post-call summary — so it catches requests the
       * phrase matcher missed ("caller asked to be removed from the list").
       * Setting lead status alone marked ONE row Blocked-DNC while
       * `isDncBlocked` kept answering false, because it reads the DNC list:
       * a second campaign, a re-import, or any other lead row for the same
       * person was still dialable after they had asked us to stop.
       *
       * Idempotent on (user_id, phone), and best-effort — a suppression write
       * failing must not abandon the lead-status update that records the
       * outcome, but it is logged at error because it is a compliance write.
       */
      const suppressible = normalizeDncPhone(customerNumber);
      if (suppressible) {
        try {
          await drizzle
            .insert(schema.dncList)
            .values({
              userId,
              phone: suppressible,
              reason: "Post-call summary classified the outcome as a do-not-call request",
              source: "call_outcome",
            })
            .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });
        } catch (dncError) {
          log.error("DNC suppression write failed for a dnc-classified call outcome", {
            userId,
            leadId: lead.id?.toString?.() ?? String(lead.id),
            error: getErrorMessage(dncError),
          });
        }
      }
    } else if (outcomeTag === "unreachable") {
      if (currentAttempts < maxAttempts) {
        newStatus = LEAD_STATUS.RETRYING;
      } else {
        newStatus = LEAD_STATUS.MAX_ATTEMPTS;
      }
    } else if (outcomeTag === "followup") {
      newStatus = LEAD_STATUS.CALLBACK_SCHEDULED;
    } else {
      newStatus = LEAD_STATUS.COMPLETED;
    }

    await drizzle
      .update(schema.outboundLeads)
      .set({
        status: newStatus,
        attempts: currentAttempts,
        // "followup" can be inferred from summary text alone ("call me back
        // next week") with no schedule_callback tool call, so the lead enters
        // the terminal Callback-Scheduled status with a NULL timestamp — a
        // callback no engine will ever place and no UI pane shows. Default to
        // tomorrow (COALESCE keeps a real in-call booking); the callback
        // engine re-checks quiet hours at dial time.
        ...(newStatus === LEAD_STATUS.CALLBACK_SCHEDULED
          ? {
              callbackScheduledAt: sql`COALESCE(${schema.outboundLeads.callbackScheduledAt}, ${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}::timestamptz)`,
            }
          : {}),
      })
      .where(eq(schema.outboundLeads.id, lead.id));

    log.info("Updated lead status on call end", {
      leadId: lead.id.toString(),
      outcomeTag,
      newStatus,
      attempts: currentAttempts,
    });
  } catch (err: unknown) {
    log.error("Failed to update lead status on call end", {
      error: getErrorMessage(err),
      userId,
      customerNumber,
      vapiCallId,
    });
  }
}
