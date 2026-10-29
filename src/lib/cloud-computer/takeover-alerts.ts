/**
 * src/lib/cloud-computer/takeover-alerts.ts
 *
 * Concurrent Dual-Channel Alert Dispatcher for Human Takeover.
 * Dispatches immediate SMS alerts via Twilio and rich audit alerts via AgentMail
 * when 2FA, CAPTCHA, or credentials block automated cloud browser tasks.
 */

import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { sendTenantMessage } from "../twilio-service";
import { sendAgentMail } from "../agentmail-mail";
import { resolveTakeoverUrl, type TakeoverUrls } from "./takeover-urls";
import type { AuthBarrierDetection } from "./takeover-detector";

export interface TakeoverAlertParams {
  userId: string;
  agentId?: string;
  taskId: string;
  callSid?: string;
  customerPhone?: string;
  barrier: AuthBarrierDetection;
  portalUrl: string;
  browserbaseSessionId?: string | null;
}

export interface TakeoverAlertResult {
  smsSent: boolean;
  emailSent: boolean;
  takeoverUrls: TakeoverUrls;
  smsMessageSid?: string;
}

/**
 * Dispatches concurrent alerts via Twilio SMS and AgentMail when an authentication
 * barrier is detected during an active browser task.
 */
export async function dispatchHumanTakeoverAlerts(
  params: TakeoverAlertParams,
): Promise<TakeoverAlertResult> {
  const {
    userId,
    agentId = "default-voice-agent",
    taskId,
    callSid,
    customerPhone,
    barrier,
    portalUrl,
    browserbaseSessionId,
  } = params;

  // 1. Resolve interactive takeover URL (Browserbase live canvas with Studio fallback)
  const takeoverUrls = await resolveTakeoverUrl({ taskId, browserbaseSessionId });

  // 2. Query tenant communication preferences & contact details
  let userEmail: string | null = null;
  let userPhone: string | null = null;
  try {
    const [userRow] = await drizzle
      .select({
        email: schema.users.email,
        phoneNumber: schema.users.phoneNumber,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (userRow) {
      userEmail = userRow.email ?? null;
      userPhone = userRow.phoneNumber ?? null;
    }
  } catch (err) {
    log.warn("[takeover-alerts] Could not fetch user record", { userId, error: String(err) });
  }

  let businessName = "BotBound";
  let recipientPhone = userPhone;
  let recipientEmail = userEmail;
  let smsFromNumber: string | undefined;

  try {
    const [settingsRow] = await drizzle
      .select({
        businessName: schema.settings.businessName,
        dailyBriefRecipient: schema.settings.dailyBriefRecipient,
        handoffPhone: schema.settings.handoffPhone,
        twilioManagerAlertNumber: schema.settings.twilioManagerAlertNumber,
        twilioSmsFromNumber: schema.settings.twilioSmsFromNumber,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    if (settingsRow) {
      businessName = settingsRow.businessName || businessName;
      recipientPhone =
        settingsRow.twilioManagerAlertNumber || settingsRow.handoffPhone || recipientPhone;
      recipientEmail = settingsRow.dailyBriefRecipient || recipientEmail;
      smsFromNumber = settingsRow.twilioSmsFromNumber || undefined;
    }
  } catch (err) {
    log.warn("[takeover-alerts] Could not fetch settings record", { userId, error: String(err) });
  }

  const barrierLabel =
    barrier.barrierType === "two_factor"
      ? "Two-Factor (2FA/OTP) Verification"
      : barrier.barrierType === "captcha"
        ? "CAPTCHA Verification"
        : barrier.barrierType === "credential_required"
          ? "Portal Login Required"
          : "Owner Approval Required";

  let portalHost = portalUrl;
  try {
    portalHost = new URL(portalUrl).hostname;
  } catch {
    /* ignore invalid url parse */
  }

  let smsSent = false;
  let smsMessageSid: string | undefined;
  let emailSent = false;

  // 3. Dispatch Twilio SMS Alert (Immediate Mobile Delivery)
  if (recipientPhone) {
    try {
      const smsBody = `🚨 ${businessName} Alert: Live call with ${customerPhone || "customer"} needs ${barrierLabel} on ${portalHost}.\n\nTake over browser here:\n${takeoverUrls.primaryUrl}\n\n(Bot is holding with caller)`;

      const smsResult = await sendTenantMessage(userId, {
        to: recipientPhone,
        fromNumber: smsFromNumber,
        body: smsBody,
        agentId,
        idempotencyKey: `takeover_alert_${taskId}_${barrier.detectedAt}`,
      });

      smsSent = smsResult.ok;
      smsMessageSid = smsResult.messageSid;
    } catch (error) {
      log.error("[takeover-alerts] Failed to send takeover SMS alert", { taskId, error: String(error) });
    }
  }

  // 4. Dispatch AgentMail Alert (Rich HTML Context & Audit Trail)
  if (recipientEmail) {
    try {
      const botSendingEmail = `bot-${agentId}@bots.botbound.app`;
      const emailSubject = `🚨 URGENT: Human Takeover Needed for Call (${customerPhone || callSid || "Live Call"})`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
            <h2 style="color: #b91c1c; margin: 0 0 6px 0; font-size: 18px;">⚠️ Immediate Action Required: ${barrierLabel}</h2>
            <p style="color: #7f1d1d; margin: 0; font-size: 14px;">Your AI voice bot encountered an authentication barrier while on a live call with a customer.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280; width: 130px;"><strong>Caller:</strong></td><td style="padding: 6px 0; color: #111827;">${customerPhone || "Inbound Caller"}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;"><strong>Portal:</strong></td><td style="padding: 6px 0; color: #111827;">${portalUrl}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;"><strong>Barrier:</strong></td><td style="padding: 6px 0; color: #111827;">${barrier.details}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;"><strong>Voice Call State:</strong></td><td style="padding: 6px 0; color: #059669; font-weight: 600;">Holding with customer on line</td></tr>
          </table>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${takeoverUrls.primaryUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block;">
              Open Cloud Browser & Take Over
            </a>
          </div>

          <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
            If the direct link above does not open directly on mobile, use the BotBound Studio fallback: <br/>
            <a href="${takeoverUrls.fallbackUrl}" style="color: #2563eb;">${takeoverUrls.fallbackUrl}</a>
          </p>
        </div>
      `;

      emailSent = await sendAgentMail(botSendingEmail, "botbound-managed-agentmail-v1", {
        to: recipientEmail,
        subject: emailSubject,
        body: `Urgent human takeover required for live call ${customerPhone || callSid || "Live Call"}. Open browser: ${takeoverUrls.primaryUrl}`,
        htmlBody,
      });
    } catch (error) {
      log.error("[takeover-alerts] Failed to send takeover AgentMail alert", { taskId, error: String(error) });
    }
  }

  return {
    smsSent,
    emailSent,
    takeoverUrls,
    smsMessageSid,
  };
}
