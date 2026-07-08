/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Post-call digest — what fires after every Vapi call ends.
 *
 * Triggered by vapi-webhook-queue's end-of-call-report handler. We:
 *   1. Classify the outcome (book / qualify / followup / dnc / unreachable
 *      / info) and write `outcome_tag` back to wireline_call_logs.
 *   2. Denormalize the campaign attribution from the dialed phone number
 *      into the call log so /insights queries stay single-table.
 *   3. Auto-log the call to a connected CRM (HubSpot / Salesforce) via
 *      CRMService — silently no-ops when no CRM is connected.
 *   4. If the tenant has a connected Gmail/Outlook account, send a 3-line
 *      digest email to themselves so they get post-call awareness without
 *      logging in. Best-effort — never throws back into the webhook queue.
 *
 * The point of this file: turn "the call ended" into "I know exactly what
 * happened and what I should do about it" — without making the Account Holder
 * open the dashboard.
 */

import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { CRMService } from "./crm-service";
import { requiresSalesApprovalForIntegration } from "./sales-integration-policy";
import { executeAction } from "./action-engine";
import { IntegrationService } from "./integrations";
import { sanitizePhone } from "./vapi-helpers";
import { enqueue } from "./job-queue";
import { BRAND } from "../constants/brand-colors";

/**
 * Heuristic outcome classifier — turns a free-text Vapi summary +
 * sentiment + intent label into one of 7 buckets used everywhere
 * downstream (Insights breakdown, digest email subject, pipeline stage).
 */
export type CallOutcomeTag =
  | "booked"
  | "qualified"
  | "followup"
  | "dnc"
  | "unreachable"
  | "info"
  | "other";

export function classifyCallOutcome(input: {
  summary?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  durationSeconds?: number | null;
  /** Vapi disconnect reason — e.g. silence-timed-out, customer-ended-call */
  endedReason?: string | null;
}): CallOutcomeTag {
  const ended = (input.endedReason || "").toLowerCase();
  if (
    ended.includes("silence-timed-out") ||
    ended.includes("voicemail") ||
    ended.includes("machine-detected") ||
    ended.includes("customer-busy") ||
    ended.includes("no-answer") ||
    ended.includes("customer-did-not-answer")
  ) {
    return "unreachable";
  }
  const s = `${input.summary || ""} ${input.intentLabel || ""}`.toLowerCase();
  if (/\b(unsubscribe|stop|do not call|remove me|dnc)\b/.test(s)) return "dnc";
  if (/\b(voicemail|no answer|busy|wrong number|disconnected)\b/.test(s)) return "unreachable";
  if ((input.durationSeconds ?? 0) < 8) return "unreachable";
  if (/\b(booked|scheduled|appointment|demo confirmed|meeting set)\b/.test(s)) return "booked";
  if (/\b(qualified|interested|hot lead|budget|good fit)\b/.test(s)) return "qualified";
  if (/\b(callback|follow.?up|call.?back|reach out later|next week)\b/.test(s)) return "followup";
  if (/\b(question|info|how does|pricing|what is)\b/.test(s)) return "info";
  return "other";
}

/**
 * Best-effort lookup of the campaign label associated with the dialed
 * phone number. Returns null if the number isn't tagged.
 */
async function resolveCampaignSource(
  userId: string,
  dialedNumber: string | null | undefined,
): Promise<string | null> {
  if (!dialedNumber) return null;
  try {
    const e164 = sanitizePhone(dialedNumber) || dialedNumber;
    const [row] = await drizzle
      .select({ campaignLabel: schema.phoneNumbers.campaignLabel })
      .from(schema.phoneNumbers)
      .where(and(eq(schema.phoneNumbers.phoneNumber, e164), eq(schema.phoneNumbers.userId, userId)))
      .limit(1);
    return row?.campaignLabel || null;
  } catch (err: any) {
    log.warn("resolveCampaignSource failed", { error: err?.message });
    return null;
  }
}

interface CallContext {
  userId: string;
  callLogId: bigint | number;
  agentId?: string | null;
  dialedNumber?: string | null;
  customerNumber?: string | null;
  customerName?: string | null;
  agentName?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  endedReason?: string | null;
  vapiCallType?: string | null;
  demo?: boolean;
  vapiCallId?: string | null;
}

/**
 * The single entry point — call this from the end-of-call-report handler
 * with the freshly-stored call log. Returns the outcome tag so the
 * caller can also update related rows (lead status, etc.).
 */
export async function runPostCallDigest(ctx: CallContext): Promise<{
  outcomeTag: string;
  campaignSource: string | null;
  crmLogged: boolean;
  emailSent: boolean;
  csatSent: boolean;
}> {
  const outcomeTag = classifyCallOutcome({
    summary: ctx.summary,
    sentiment: ctx.sentiment,
    intentLabel: ctx.intentLabel,
    durationSeconds: ctx.durationSeconds,
    endedReason: ctx.endedReason,
  });
  const campaignSource = await resolveCampaignSource(ctx.userId, ctx.dialedNumber);

  // Safe-parse the callLogId. The digest is fire-and-forget from the
  // webhook handler, so a parse failure must not throw — log + bail.
  let callLogIdBig: bigint;
  try {
    callLogIdBig = BigInt(ctx.callLogId as any);
  } catch {
    log.warn("post-call digest: unparseable callLogId — skipping", {
      callLogId: String(ctx.callLogId),
    });
    return { outcomeTag, campaignSource, crmLogged: false, emailSent: false, csatSent: false };
  }

  // 1. Write outcome + campaign back to the call log
  try {
    await drizzle
      .update(schema.callLogs)
      .set({ outcomeTag, campaignSource })
      .where(eq(schema.callLogs.id, callLogIdBig));
  } catch (err: any) {
    log.warn("post-call digest: callLog update failed", { error: err?.message });
  }

  // 1a. Update outbound lead status on call end
  if (ctx.direction === "outbound") {
    try {
      const { updateLeadStatusOnCallEnd } = await import("./outbound-call-tracking");
      await updateLeadStatusOnCallEnd(
        ctx.userId,
        ctx.customerNumber || "",
        outcomeTag,
        ctx.vapiCallId,
      );
    } catch (err: any) {
      log.warn("post-call digest: lead status update failed", { error: err?.message });
    }
  }

  // 1b. Activation — first useful production call (idempotent per tenant).
  try {
    const { maybeRecordTenantActivation } = await import("./tenant-activation");
    await maybeRecordTenantActivation({
      userId: ctx.userId,
      callLogId: callLogIdBig,
      call: {
        demo: ctx.demo,
        vapiCallType: ctx.vapiCallType,
        direction: ctx.direction,
        customerNumber: ctx.customerNumber,
        durationSeconds: ctx.durationSeconds,
        transcript: ctx.transcript,
        summary: ctx.summary,
        sentiment: ctx.sentiment,
        intentLabel: ctx.intentLabel,
        endedReason: ctx.endedReason,
        outcomeTag,
        agentId: ctx.agentId ?? null,
      },
    });
  } catch (err: any) {
    log.warn("post-call digest: activation check failed", { error: err?.message });
  }

  // 2. CRM log — approval-gated for sales agents by default
  let crmLogged = false;
  let crmQueuedForApproval = false;
  try {
    const [settings] = await drizzle
      .select({
        crmType: schema.settings.crmType,
        autonomyLevel: schema.settings.autonomyLevel,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, ctx.userId))
      .limit(1);

    let agentRole: string | null = null;
    if (ctx.agentId) {
      const [agent] = await drizzle
        .select({ role: schema.agents.role })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, ctx.agentId), eq(schema.agents.userId, ctx.userId)))
        .limit(1);
      agentRole = agent?.role ?? null;
    }

    if (settings?.crmType === "hubspot" || settings?.crmType === "salesforce") {
      const crmPayload = {
        subject: `${ctx.direction === "outbound" ? "Outbound" : "Inbound"} call — ${outcomeTag}`,
        description: ctx.summary || "(no summary)",
        to_number: ctx.customerNumber || "",
        duration_minutes: Math.round((ctx.durationSeconds || 0) / 60),
        outcome: outcomeTag,
        crm_type: settings.crmType,
      };

      if (
        requiresSalesApprovalForIntegration({
          agentRole,
          autonomyLevel: settings.autonomyLevel,
          actionType: "update_crm_lead",
        })
      ) {
        const queued = await executeAction(
          ctx.userId,
          {
            type: "update_crm_lead",
            priority: "medium",
            payload: crmPayload,
            agentId: ctx.agentId || undefined,
            reasoning: `Post-call CRM note for ${outcomeTag} outcome`,
          },
          { sourceId: String(ctx.callLogId), sourceType: "call_log" },
          "draft",
        );
        crmQueuedForApproval = !!(queued.success && queued.queued);
      } else {
        const crm = new CRMService(ctx.userId);
        const logId = await crm.logCall({
          crmType: settings.crmType,
          subject: crmPayload.subject,
          description: crmPayload.description,
          to_number: crmPayload.to_number,
          duration_minutes: crmPayload.duration_minutes,
          outcome: outcomeTag,
        });
        crmLogged = !!logId;
      }
    }
  } catch (err: any) {
    log.warn("post-call digest: CRM log failed", { error: err?.message });
  }

  // 3. Digest email — best effort, never blocks
  let emailSent = false;
  try {
    const integ = new IntegrationService(ctx.userId);
    const subject = `[Wireline · ${outcomeTag.toUpperCase()}] ${ctx.agentName || "Agent"} → ${ctx.customerName || ctx.customerNumber || "caller"}`;
    const body = renderDigestEmail({
      ...ctx,
      outcomeTag,
      campaignSource,
      crmLogged,
      crmQueuedForApproval,
    });
    // Send to the Account Holder's own connected mailbox address (first one we find).
    // If they have no mailbox connected we skip — log only.
    const accountHolderEmail = await pickAccountHolderEmail(ctx.userId);
    if (accountHolderEmail) {
      emailSent = await integ.sendEmail({ to: accountHolderEmail, subject, body });
    }
  } catch (err: any) {
    log.warn("post-call digest: email send failed", { error: err?.message });
  }

  // 4. Auto-QA — enqueue a background scoring job; the handler stores the
  // breakdown and chains adaptive_optimization (Claude-generated lesson →
  // wireline_agent_lessons) on low scores. Fire-and-forget; the agent
  // gets smarter without anyone clicking anything.
  try {
    await enqueue(drizzle, {
      userId: ctx.userId,
      type: "auto_qa_score",
      payload: { callLogId: String(ctx.callLogId), userId: ctx.userId },
    });
  } catch (err: any) {
    log.warn("post-call digest: auto_qa_score enqueue failed", { error: err?.message });
  }

  // 5. Post-call CSAT SMS — opt-in, best effort.
  //    Only fires for real conversations (>30s, not voicemail/DNC).
  let csatSent = false;
  try {
    if (
      ctx.customerNumber &&
      outcomeTag !== "unreachable" &&
      outcomeTag !== "dnc" &&
      (ctx.durationSeconds ?? 0) > 30
    ) {
      const { sendPostCallCsatSms } = await import("./csat-service");
      const csatResult = await sendPostCallCsatSms({
        userId: ctx.userId,
        customerNumber: ctx.customerNumber,
        agentName: ctx.agentName,
        callLogId: String(ctx.callLogId),
      });
      csatSent = csatResult.sent;
    }
  } catch (err: any) {
    log.warn("post-call digest: CSAT SMS failed", { error: err?.message });
  }

  log.info("Post-call digest completed", {
    userId: ctx.userId,
    callLogId: String(ctx.callLogId),
    outcomeTag,
    campaignSource,
    crmLogged,
    emailSent,
    csatSent,
  });

  return { outcomeTag, campaignSource, crmLogged, emailSent, csatSent };
}

async function pickAccountHolderEmail(userId: string): Promise<string | null> {
  try {
    const [acct] = await drizzle
      .select({ emailAddress: schema.emailAccounts.emailAddress })
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.userId, userId))
      .limit(1);
    return acct?.emailAddress || null;
  } catch {
    return null;
  }
}

function crmDigestStatusLine(crmLogged: boolean, crmQueuedForApproval: boolean): string {
  if (crmLogged) return "✅ Logged to your CRM.";
  if (crmQueuedForApproval) {
    return "📋 CRM note queued for approval in your Approval Inbox.";
  }
  return "ℹ︎ No CRM connected — connect HubSpot or Salesforce in /integrations to auto-log.";
}

function renderDigestEmail(d: {
  agentName?: string | null;
  customerName?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  sentiment?: string | null;
  outcomeTag: string;
  campaignSource: string | null;
  crmLogged: boolean;
  crmQueuedForApproval?: boolean;
}): string {
  const dur = Math.round((d.durationSeconds || 0) / 60);
  const next = nextActionFromOutcome(d.outcomeTag);
  return [
    `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; line-height: 1.55; color: #1a1a1a;">`,
    `<p style="font-size:11px;text-transform:uppercase;letter-spacing:.3em;color:${BRAND.colors.primary};margin:0 0 4px;">Wireline · Post-call digest</p>`,
    `<h2 style="margin:0 0 8px;font-size:22px;font-style:italic;font-weight:500;">${d.outcomeTag.toUpperCase()} — ${d.agentName || "Agent"} → ${d.customerName || d.customerNumber || "caller"}</h2>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#666;">${d.direction || "Call"} · ${dur} min · ${d.sentiment || "neutral"} sentiment${d.campaignSource ? ` · Campaign: <strong>${d.campaignSource}</strong>` : ""}</p>`,
    `<div style="background:#f7f7f9;border-radius:12px;padding:14px 16px;margin:0 0 16px;font-size:14px;">${(d.summary || "(no summary captured)").replace(/\n/g, "<br/>")}</div>`,
    `<p style="margin:0 0 6px;font-size:13px;"><strong>Next action:</strong> ${next}</p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:#666;">${crmDigestStatusLine(d.crmLogged, d.crmQueuedForApproval ?? false)}</p>`,
    `<p style="margin:24px 0 0;font-size:12px;color:#888;">Open the call <a href="https://trywireline.com/phone?tab=logs" style="color:${BRAND.colors.primary};text-decoration:none;">in Wireline →</a></p>`,
    `</div>`,
  ].join("");
}

function nextActionFromOutcome(tag: string): string {
  switch (tag) {
    case "booked":
      return "Confirmation sent — calendar invite landed. Review the prep notes before the meeting.";
    case "qualified":
      return "Move to your closer or schedule a demo within 48 hours while interest is hot.";
    case "followup":
      return "Callback scheduled — Wireline will dial again at the agreed time.";
    case "dnc":
      return "Added to your DNC list automatically. No further outreach to this number.";
    case "unreachable":
      return "Retry queued. Voicemail dropped if enabled.";
    case "info":
      return "Training gap captured — review and add it from your agent's Training tab in Studio.";
    default:
      return "Review the full transcript in Phone > Call History and label the outcome if you want this in funnel reporting.";
  }
}
