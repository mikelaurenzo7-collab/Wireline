/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { sendManagerAlert } from "./twilio-service";

/**
 * Unified notification service for manager alerts.
 */
export class NotificationService {
  constructor(private userId: string) {}

  /**
   * Positive call outcome — Slack (normal) only; no urgent SMS unless operator opted in elsewhere.
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
   * Send an urgent alert to the manager (Slack + SMS).
   */
  async sendUrgentAlert(params: {
    title: string;
    message: string;
    callId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    log.info("Sending urgent alert", { userId: this.userId, ...params });

    await Promise.allSettled([this.sendToSlack(params), this.sendViaSMS(params)]);
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

  private async sendViaSMS(params: any): Promise<void> {
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
}
