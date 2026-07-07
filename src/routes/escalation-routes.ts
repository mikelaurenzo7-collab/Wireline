/* eslint-disable @typescript-eslint/no-explicit-any -- LLM responses and dynamic call analyses include freeform JSON content. */
/**
 * Customer-service escalation endpoint.
 *
 * When one of our 4 real customer-service Vapi agents (Sarah, Liam,
 * Tyler, Maya) needs to hand a caller to a human, it invokes the
 * `escalate_to_human` tool. Vapi posts here. We:
 *
 *   1. Insert into wireline_follow_up_tasks so it appears on the admin
 *      Triage page (the existing Account Holder inbox).
 *   2. SMS the platform owner (OWNER_PHONE env var) via Twilio so
 *      they get a real-time ping for urgent issues.
 *   3. Always return 200 to the Vapi caller, even on Twilio failure —
 *      we never want a transient SMS hiccup to make the agent error
 *      out mid-call.
 *
 * The SMS sender is PLATFORM_SMS_FROM (env var). If not configured,
 * the SMS step is skipped silently — the Assistants-task insert still
 * lands so nothing falls through the cracks. Account Holders see all
 * pending escalations in Phone / Call History regardless of SMS state.
 *
 * Public endpoint (no auth) — Vapi calls it from its servers with
 * a webhook secret in the X-Vapi-Secret header. We verify against
 * the same VAPI_WEBHOOK_SECRET the main /api/vapi-webhook route uses.
 */

import { Router, Request, Response } from "express";
import { AppError } from "../lib/api-error";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import twilio from "twilio";
import { vapiWebhookSecretOk } from "../lib/vapi-webhook-auth";
import { postMessage as slackPostMessage, getDefaultChannel } from "../lib/slack-service";

// Targeted, tight rate limit on the public escalation webhook.
// Real Vapi incidents during a busy period might legitimately produce a handful of escalations.
// Abuse/flooding could spam the owner with SMS or pollute the triage queue.
// 12 req / 60s per IP is generous for legitimate traffic and still blocks scripted attacks.
const escalationRateLimiter = createIpRateLimiter({
  bucket: "webhook:escalation",
  windowMs: 60_000,
  max: 12,
  message: { error: "Too many escalation requests from this source." },
});

const router = Router();

interface EscalationBody {
  caller_phone?: string;
  caller_name?: string;
  caller_email?: string;
  summary?: string;
  urgency?: "urgent" | "normal";
  agent_name?: string;
  source_number?: string;
  /** Wireline tenant user_id — typically the platform-owner UUID for
   * customer-service escalations on the platform's own demo lines. */
  tenant_user_id?: string;
}

async function dispatchOwnerSms(
  to: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.PLATFORM_SMS_FROM;
  if (!sid || !token || !from) {
    return { ok: false, error: "Twilio platform sender not configured" };
  }
  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({ to, from, body });
    log.info("Escalation SMS sent", { sid: msg.sid, to: to.slice(0, 8) });
    return { ok: true };
  } catch (e: any) {
    log.warn("Escalation SMS failed", { error: e?.message });
    return { ok: false, error: e?.message };
  }
}

router.post("/api/escalate", escalationRateLimiter, async (req: Request, res: Response) => {
  // Auth — same secret as the main Vapi webhook (Vapi sends it as
  // X-Vapi-Secret or X-Vapi-Signature). Reject mismatches.
  if (!vapiWebhookSecretOk(req)) {
    log.warn("Rejected escalation with bad or missing Vapi webhook secret");
    throw AppError.fromHttpStatus(401, "Invalid signature");
  }

  const b = (req.body || {}) as EscalationBody;
  const callerPhone = (b.caller_phone || "unknown").trim();
  const callerName = (b.caller_name || "Unknown caller").trim();
  const callerEmail = (b.caller_email || "").trim();
  const summary = (b.summary || "").trim() || "Caller requested human follow-up.";
  const urgency = b.urgency === "urgent" ? "urgent" : "normal";
  const agentName = (b.agent_name || "Wireline agent").trim();
  const sourceNumber = (b.source_number || "").trim();
  const tenantUserId = (b.tenant_user_id || "").trim() || null;

  log.info("Escalation received", {
    urgency,
    agentName,
    callerPhone: callerPhone.slice(0, 8),
    summary: summary.slice(0, 80),
  });

  // 1. Persist as a Assistants task — surfaces in Phone / Call History automatically
  if (tenantUserId) {
    try {
      await drizzle.insert(schema.followUpTasks).values({
        userId: tenantUserId,
        taskType: "human_escalation",
        description: `[${urgency.toUpperCase()}] ${agentName} → ${callerName} (${callerPhone}). ${summary}${callerEmail ? ` · email: ${callerEmail}` : ""}`,
        priority: urgency === "urgent" ? "high" : "medium",
        status: "pending",
        sourceType: "phone_call",
        sourceId: sourceNumber || `escalation-${Date.now()}`,
        targetChannel: "manual",
      });
    } catch (e: any) {
      log.warn("Escalation Assistants-task insert failed", { error: e?.message });
    }
  }

  // 1b. Slack handoff — post to the configured channel for the originating
  //     agent (or the tenant's default channel) so the human team gets a
  //     real-time ping with a deep link to Phone. Best-effort; never
  //     breaks the call.
  let slackPosted = false;
  if (tenantUserId) {
    try {
      let channelId: string | null = null;
      if (sourceNumber) {
        const [matchAgent] = await drizzle
          .select({ slackChannelId: schema.agents.slackChannelId })
          .from(schema.agents)
          .where(eq(schema.agents.userId, tenantUserId))
          .limit(1);
        channelId = matchAgent?.slackChannelId || null;
      }
      if (!channelId) channelId = await getDefaultChannel(tenantUserId);
      if (channelId) {
        const urgencyEmoji = urgency === "urgent" ? "🚨" : "📞";
        const text = [
          `${urgencyEmoji} *Wireline escalation — ${urgency.toUpperCase()}*`,
          `*Agent:* ${agentName}${sourceNumber ? ` on ${sourceNumber}` : ""}`,
          `*Caller:* ${callerName} (${callerPhone})${callerEmail ? ` · ${callerEmail}` : ""}`,
          `*Summary:* ${summary}`,
          `<https://trywireline.com/phone?tab=logs|Open call history →>`,
        ].join("\n");
        slackPosted = await slackPostMessage(tenantUserId, channelId, text);
      }
    } catch (e: any) {
      log.warn("Escalation Slack post failed", { error: e?.message });
    }
  }

  // 2. Real-time SMS to the platform owner — only for urgent
  let smsDispatched = false;
  if (urgency === "urgent" && process.env.OWNER_PHONE) {
    const smsBody = [
      `[Wireline ESCALATION]`,
      `${agentName} on ${sourceNumber || "platform"}`,
      `${callerName} (${callerPhone})`,
      summary.slice(0, 200),
      callerEmail ? `Email: ${callerEmail}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await dispatchOwnerSms(process.env.OWNER_PHONE, smsBody);
    smsDispatched = result.ok;
  }

  // 3. Always success-back to the Vapi agent — never break the call
  return res.json({
    ok: true,
    smsDispatched,
    slackPosted,
    tracked: !!tenantUserId,
    sla: "4 business hours",
  });
});

export default router;
