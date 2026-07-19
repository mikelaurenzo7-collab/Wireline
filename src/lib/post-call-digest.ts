/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Post-call operating system — what fires after every completed Vapi call.
 *
 * Mandatory internal work:
 *   1. Classify and persist the outcome and campaign attribution.
 *   2. Write one idempotent structured post-call note tied to the call log.
 *   3. Update outbound lead state, activation, CRM, QA, learning, and action extraction.
 *
 * User-controlled external work:
 *   4. Append the structured result to a selected Google Sheet / Excel workbook.
 *   5. Queue a polished artifact only when the Account Holder explicitly enabled it.
 *   6. Send owner digest and optional CSAT when configured.
 *
 * Raw files are not retained here. Optional artifact jobs must write the generated
 * file to the tenant's selected connected destination and retain only metadata/linkage.
 */

import { and, eq } from "drizzle-orm";

import { BRAND } from "../constants/brand-colors";
import * as schema from "../db/schema";
import { executeAction } from "./action-engine";
import { CRMService } from "./crm-service";
import { IntegrationService } from "./integrations";
import { enqueue } from "./job-queue";
import {
  DEFAULT_POST_CALL_OUTPUT_PREFERENCES,
  getPostCallOutputPreferences,
  shouldGeneratePostCallArtifact,
  type PostCallOutputPreferences,
} from "./post-call-output-preferences";
import { requiresSalesApprovalForIntegration } from "./sales-integration-policy";
import { drizzle, log } from "./server-context";
import { maybePublishCallRecap } from "./shareable-artifact/publish-call-recap";
import { sanitizePhone } from "./vapi-helpers";

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

async function ensureStructuredPostCallNote(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): Promise<boolean> {
  const sourceId = String(ctx.callLogId);
  try {
    const [existing] = await drizzle
      .select({ id: schema.followUpTasks.id })
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.userId, ctx.userId),
          eq(schema.followUpTasks.sourceType, "call_log"),
          eq(schema.followUpTasks.sourceId, sourceId),
          eq(schema.followUpTasks.taskType, "post_call_note"),
        ),
      )
      .limit(1);
    if (existing) return true;

    const nextAction = nextActionFromOutcome(outcomeTag);
    await drizzle.insert(schema.followUpTasks).values({
      userId: ctx.userId,
      agentId: ctx.agentId || null,
      sourceType: "call_log",
      sourceId,
      targetChannel: "internal",
      taskType: "post_call_note",
      status: "completed",
      priority: outcomeTag === "qualified" || outcomeTag === "booked" ? "high" : "medium",
      description: `${outcomeTag.toUpperCase()} · ${ctx.customerName || ctx.customerNumber || "Caller"}`,
      resolutionNotes: ctx.summary || "No provider summary was captured.",
      customerInfo: {
        name: ctx.customerName || null,
        phone: ctx.customerNumber || null,
      },
      payload: {
        outcome: outcomeTag,
        summary: ctx.summary || null,
        next_action: nextAction,
        sentiment: ctx.sentiment || null,
        intent: ctx.intentLabel || null,
        campaign_source: campaignSource,
        direction: ctx.direction || null,
        duration_seconds: ctx.durationSeconds || 0,
        provider_call_id: ctx.vapiCallId || null,
        transcript_available: Boolean(ctx.transcript),
      },
    });
    return true;
  } catch (err: any) {
    log.warn("post-call digest: structured note write failed", {
      userId: ctx.userId,
      callLogId: sourceId,
      error: err?.message,
    });
    return false;
  }
}

function spreadsheetDetails(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): string {
  return [
    ctx.summary || "No summary captured.",
    `Next: ${nextActionFromOutcome(outcomeTag)}`,
    ctx.sentiment ? `Sentiment: ${ctx.sentiment}` : null,
    ctx.intentLabel ? `Intent: ${ctx.intentLabel}` : null,
    campaignSource ? `Campaign: ${campaignSource}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function writeSelectedSpreadsheetOutputs(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
  preferences: PostCallOutputPreferences,
): Promise<string[]> {
  const destination = preferences.spreadsheet_destination;
  if (destination === "none") return [];

  const caller = ctx.customerName || ctx.customerNumber || "Unknown caller";
  const details = spreadsheetDetails(ctx, outcomeTag, campaignSource);
  const durationMinutes = Math.max(1, Math.ceil((ctx.durationSeconds || 0) / 60));
  const written: string[] = [];

  if (destination === "google_sheets" || destination === "both") {
    try {
      const { logToGoogleSheets } = await import("./google-sheets-service");
      if (
        await logToGoogleSheets({
          userId: ctx.userId,
          caller,
          outcome: outcomeTag,
          details,
          agentName: ctx.agentName || undefined,
          durationMinutes,
        })
      ) {
        written.push("google_sheets");
      }
    } catch (err: any) {
      log.warn("post-call digest: Google Sheets export failed", { error: err?.message });
    }
  }

  if (destination === "microsoft_excel" || destination === "both") {
    try {
      const { logToExcel } = await import("./microsoft-graph-service");
      if (await logToExcel({ userId: ctx.userId, caller, outcome: outcomeTag, details })) {
        written.push("microsoft_excel");
      }
    } catch (err: any) {
      log.warn("post-call digest: Microsoft Excel export failed", { error: err?.message });
    }
  }

  return written;
}

async function queueSelectedArtifact(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
  preferences: PostCallOutputPreferences,
): Promise<boolean> {
  if (!shouldGeneratePostCallArtifact(preferences)) return false;
  try {
    await enqueue(drizzle, {
      userId: ctx.userId,
      type: "post_call_artifact",
      payload: {
        userId: ctx.userId,
        callLogId: String(ctx.callLogId),
        providerCallId: ctx.vapiCallId || null,
        agentId: ctx.agentId || null,
        agentName: ctx.agentName || null,
        customerName: ctx.customerName || null,
        customerNumber: ctx.customerNumber || null,
        direction: ctx.direction || null,
        durationSeconds: ctx.durationSeconds || 0,
        outcomeTag,
        summary: ctx.summary || null,
        transcript: ctx.transcript || null,
        sentiment: ctx.sentiment || null,
        intentLabel: ctx.intentLabel || null,
        campaignSource,
        format: preferences.artifact_format,
        destination: preferences.artifact_destination,
      },
    });
    return true;
  } catch (err: any) {
    log.warn("post-call digest: artifact enqueue failed", { error: err?.message });
    return false;
  }
}

export async function runPostCallDigest(ctx: CallContext): Promise<{
  outcomeTag: string;
  campaignSource: string | null;
  noteRecorded: boolean;
  spreadsheetDestinations: string[];
  artifactQueued: boolean;
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

  let callLogIdBig: bigint;
  try {
    callLogIdBig = BigInt(ctx.callLogId as any);
  } catch {
    log.warn("post-call digest: unparseable callLogId — skipping", {
      callLogId: String(ctx.callLogId),
    });
    return {
      outcomeTag,
      campaignSource,
      noteRecorded: false,
      spreadsheetDestinations: [],
      artifactQueued: false,
      crmLogged: false,
      emailSent: false,
      csatSent: false,
    };
  }

  try {
    await drizzle
      .update(schema.callLogs)
      .set({ outcomeTag, campaignSource })
      .where(eq(schema.callLogs.id, callLogIdBig));
  } catch (err: any) {
    log.warn("post-call digest: callLog update failed", { error: err?.message });
  }

  const noteRecorded = await ensureStructuredPostCallNote(ctx, outcomeTag, campaignSource);

  let outputPreferences: PostCallOutputPreferences;
  try {
    outputPreferences = await getPostCallOutputPreferences(ctx.userId);
  } catch (err: any) {
    log.warn("post-call digest: output preferences unavailable", { error: err?.message });
    outputPreferences = { ...DEFAULT_POST_CALL_OUTPUT_PREFERENCES };
  }

  const spreadsheetDestinations = await writeSelectedSpreadsheetOutputs(
    ctx,
    outcomeTag,
    campaignSource,
    outputPreferences,
  );
  const artifactQueued = await queueSelectedArtifact(
    ctx,
    outcomeTag,
    campaignSource,
    outputPreferences,
  );

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

  const recapHandle = await maybePublishCallRecap({
    userId: ctx.userId,
    agentId: ctx.agentId ?? null,
    agentName: ctx.agentName ?? null,
    callLogId: ctx.callLogId,
    customerName: ctx.customerName ?? null,
    customerNumber: ctx.customerNumber ?? null,
    direction: ctx.direction ?? null,
    durationSeconds: ctx.durationSeconds ?? null,
    summary: ctx.summary ?? null,
    transcript: ctx.transcript ?? null,
    sentiment: ctx.sentiment ?? null,
    intentLabel: ctx.intentLabel ?? null,
    outcomeTag,
    campaignSource,
    startedAtIso: new Date().toISOString(),
  });

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
      recapUrl: recapHandle?.url ?? null,
    });
    const accountHolderEmail = await pickAccountHolderEmail(ctx.userId);
    if (accountHolderEmail) {
      emailSent = await integ.sendEmail({ to: accountHolderEmail, subject, body });
    }
  } catch (err: any) {
    log.warn("post-call digest: email send failed", { error: err?.message });
  }

  try {
    await enqueue(drizzle, {
      userId: ctx.userId,
      type: "auto_qa_score",
      payload: { callLogId: String(ctx.callLogId), userId: ctx.userId },
    });
  } catch (err: any) {
    log.warn("post-call digest: auto_qa_score enqueue failed", { error: err?.message });
  }

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

  log.info("Post-call operating system completed", {
    userId: ctx.userId,
    callLogId: String(ctx.callLogId),
    outcomeTag,
    campaignSource,
    noteRecorded,
    spreadsheetDestinations,
    artifactQueued,
    crmLogged,
    emailSent,
    csatSent,
  });

  return {
    outcomeTag,
    campaignSource,
    noteRecorded,
    spreadsheetDestinations,
    artifactQueued,
    crmLogged,
    emailSent,
    csatSent,
  };
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
  if (crmLogged) return "Logged to your CRM.";
  if (crmQueuedForApproval) return "CRM note queued for approval in your Approval Inbox.";
  return "No CRM connected — connect HubSpot or Salesforce to auto-log.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  recapUrl?: string | null;
}): string {
  const dur = Math.round((d.durationSeconds || 0) / 60);
  const next = nextActionFromOutcome(d.outcomeTag);
  const identity = `${d.outcomeTag.toUpperCase()} — ${d.agentName || "Agent"} → ${d.customerName || d.customerNumber || "caller"}`;
  const metadata = `${d.direction || "Call"} · ${dur} min · ${d.sentiment || "neutral"} sentiment${d.campaignSource ? ` · Campaign: ${d.campaignSource}` : ""}`;
  const recapBlock = d.recapUrl
    ? `<p style="margin:0 0 24px;">
        <a href="${escapeHtml(d.recapUrl)}" style="display:inline-block;background:${BRAND.colors.primary};color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.02em;">Open the recap →</a>
        <span style="display:block;margin-top:8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8B87A0;">Shareable Wireline recap · private link</span>
      </p>`
    : "";
  return [
    `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;line-height:1.55;color:#1a1a1a;">`,
    `<p style="font-size:11px;text-transform:uppercase;letter-spacing:.3em;color:${BRAND.colors.primary};margin:0 0 4px;">Wireline · Post-call digest</p>`,
    `<h2 style="margin:0 0 8px;font-size:22px;font-style:italic;font-weight:500;">${escapeHtml(identity)}</h2>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#666;">${escapeHtml(metadata)}</p>`,
    `<div style="background:#f7f7f9;border-radius:12px;padding:14px 16px;margin:0 0 16px;font-size:14px;">${escapeHtml(d.summary || "(no summary captured)").replace(/\n/g, "<br/>")}</div>`,
    recapBlock,
    `<p style="margin:0 0 6px;font-size:13px;"><strong>Next action:</strong> ${escapeHtml(next)}</p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:#666;">${escapeHtml(crmDigestStatusLine(d.crmLogged, d.crmQueuedForApproval ?? false))}</p>`,
    `<p style="margin:24px 0 0;font-size:12px;color:#888;">Open the call <a href="https://trywireline.com/phone?tab=logs" style="color:${BRAND.colors.primary};text-decoration:none;">in Wireline →</a></p>`,
    `</div>`,
  ].join("");
}

export function nextActionFromOutcome(tag: string): string {
  switch (tag) {
    case "booked":
      return "Verify the calendar confirmation, attach prep notes, and assign the meeting owner.";
    case "qualified":
      return "Route to the closer or schedule a demo within 48 hours while intent is current.";
    case "followup":
      return "Create or confirm the promised callback and preserve the reason and timing.";
    case "dnc":
      return "Confirm the number is suppressed from all future outreach.";
    case "unreachable":
      return "Review retry policy and voicemail settings before another attempt.";
    case "info":
      return "Review the unanswered question and add verified guidance to the agent's Training tab.";
    default:
      return "Review the transcript, confirm the outcome, and assign any required follow-up.";
  }
}
