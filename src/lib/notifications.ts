/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { sendManagerAlert, sendDirectAlert } from "./twilio-service";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Unified notification service for manager alerts.
 *
 * Layered routing for `escalate_to_human` and similar urgent events:
 *
 *   1. PER-AGENT override (agent.escalation_phone / .escalation_email).
 *      When set, urgent alerts route to THIS agent's configured
 *      destinations — lets a tenant route sales escalations to the
 *      sales manager and support escalations to the support lead.
 *
 *   2. TENANT default (wireline_settings.twilio_manager_alert_number)
 *      via sendManagerAlert. Fires whenever the SMS sub-handler is
 *      called WITHOUT an explicit override.
 *
 *   3. SLACK — always fired (per-agent slack_channel_id if set, else
 *      the tenant's Slack OAuth integration, else the legacy
 *      SLACK_MANAGEMENT_WEBHOOK env). Slack works in parallel to SMS.
 *
 *   4. EMAIL (new channel) — if agent.escalation_email is set, an
 *      email lands in that inbox via Resend. Lets SMBs who prefer
 *      email get the same alert without an SMS plan.
 *
 * Failures in any channel are isolated (Promise.allSettled). One down
 * channel never blocks the others.
 */
export class NotificationService {
  constructor(
    private userId: string,
    /** Optional — when provided, per-agent escalation overrides apply. */
    private agentId?: string,
  ) {}

  /**
   * Positive call outcome — Slack (normal) only; no urgent SMS unless Account Holder opted in elsewhere.
   */
  async sendWinAlert(params: {
    title: string;
    message: string;
    callId?: string;
    agentName?: string;
    caller?: string;
    outcome?: string;
  }): Promise<void> {
    log.info("Sending win alert", { userId: this.userId, ...params });
    try {
      const { postAgentNotification } = await import("./slack-service");
      await postAgentNotification(this.userId, `${params.title}: ${params.message}`, {
        urgency: "normal",
        callId: params.callId,
        agentName: params.agentName,
        caller: params.caller,
        outcome: params.outcome ?? "booked",
      });
    } catch (err) {
      log.error("Win Slack notification failed", { error: getErrorMessage(err) });
    }
  }

  /**
   * Send an urgent alert to the manager. Fans out to Slack + SMS + email
   * in parallel, honouring per-agent overrides when an agentId is set.
   */
  async sendUrgentAlert(params: {
    title: string;
    message: string;
    callId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    log.info("Sending urgent alert", { userId: this.userId, agentId: this.agentId, ...params });

    // Resolve per-agent escalation overrides (escalation_phone +
    // escalation_email columns on wireline_agents). One DB call, then
    // fan out to the three channels in parallel.
    const overrides = await this.loadAgentOverrides();

    await Promise.allSettled([
      this.sendToSlack(params),
      this.sendViaSMS(params, overrides.phone),
      this.sendViaEmail(params, overrides.email),
    ]);
  }

  /**
   * Look up the agent's escalation overrides. Returns nulls when no
   * agentId was provided or the agent has no overrides set — callers
   * then fall back to tenant defaults.
   */
  private async loadAgentOverrides(): Promise<{
    phone: string | null;
    email: string | null;
  }> {
    if (!this.agentId) return { phone: null, email: null };
    try {
      const [agent] = await drizzle
        .select({
          escalationPhone: schema.agents.escalationPhone,
          escalationEmail: schema.agents.escalationEmail,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, this.agentId), eq(schema.agents.userId, this.userId)))
        .limit(1);
      return {
        phone: agent?.escalationPhone?.trim() || null,
        email: agent?.escalationEmail?.trim() || null,
      };
    } catch (err) {
      log.warn("Failed to read per-agent escalation overrides", {
        agentId: this.agentId,
        error: getErrorMessage(err),
      });
      return { phone: null, email: null };
    }
  }

  private async sendToSlack(params: {
    title: string;
    message: string;
    callId?: string;
  }): Promise<void> {
    try {
      const { postAgentNotification } = await import("./slack-service");
      const ok = await postAgentNotification(this.userId, params.title + ": " + params.message, {
        urgency: "high",
        callId: params.callId,
      });
      if (ok) return;
    } catch (err) {
      log.error("Slack OAuth notification failed", { error: getErrorMessage(err) });
    }

    const webhookUrl = process.env.SLACK_MANAGEMENT_WEBHOOK;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 *URGENT ALERT: ${params.title}*\n${params.message}\nCall ID: ${params.callId || "N/A"}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*🚨 URGENT ALERT: ${params.title}*\n${params.message}`,
              },
            },
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: `*Call ID:* ${params.callId || "N/A"}` }],
            },
          ],
        }),
      });
    } catch (err) {
      log.error("Slack notification failed", { error: getErrorMessage(err) });
    }
  }

  /**
   * SMS path. Routing precedence:
   *   1. agent.escalation_phone (per-agent override) — `sendDirectAlert`
   *      with explicit destination.
   *   2. tenant default via `sendManagerAlert` — reads
   *      wireline_settings.twilio_manager_alert_number.
   */
  private async sendViaSMS(params: any, phoneOverride: string | null): Promise<void> {
    if (phoneOverride) {
      const result = await sendDirectAlert(this.userId, phoneOverride, {
        title: params.title,
        message: params.message,
        callId: params.callId,
      });
      if (!result.ok) {
        log.info("[SMS] Per-agent override notification skipped", { reason: result.reason });
      } else {
        log.info("[SMS] Per-agent override notification sent", {
          to: result.to,
          sid: result.sid,
          agentId: this.agentId,
        });
      }
      return;
    }

    const result = await sendManagerAlert(this.userId, {
      title: params.title,
      message: params.message,
      callId: params.callId,
    });

    if (!result.ok) {
      log.info("[SMS] Notification skipped", { reason: result.reason });
      return;
    }

    log.info("[SMS] Notification sent", { to: result.to, sid: result.sid });
  }

  /**
   * Email path — new in May 2026. Only fires when the agent has an
   * `escalation_email` configured. There's no tenant-wide fallback for
   * email because account holders who want async-via-email opt in explicitly;
   * spam-by-default would be a worse failure mode.
   */
  private async sendViaEmail(
    params: { title: string; message: string; callId?: string },
    emailOverride: string | null,
  ): Promise<void> {
    if (!emailOverride) return;
    try {
      const { sendUrgentEscalationEmail } = await import("./email-service");
      const result = await sendUrgentEscalationEmail({
        to: emailOverride,
        title: params.title,
        message: params.message,
        callId: params.callId,
      });
      if (!result.ok) {
        log.info("[EMAIL] Escalation notification skipped", { reason: result.error });
        return;
      }
      log.info("[EMAIL] Escalation notification sent", { to: emailOverride });
    } catch (err) {
      log.error("[EMAIL] Escalation notification failed", { error: getErrorMessage(err) });
    }
  }
}
