import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * Unified notification service for manager alerts.
 */
export class NotificationService {
  constructor(private userId: string) {}

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

    await Promise.allSettled([
      this.sendToSlack(params),
      this.sendViaSMS(params)
    ]);
  }

  private async sendToSlack(params: any): Promise<void> {
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
                text: `*🚨 URGENT ALERT: ${params.title}*\n${params.message}`
              }
            },
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: `*Call ID:* ${params.callId || "N/A"}` }
              ]
            }
          ]
        })
      });
    } catch (err) {
      log.error("Slack notification failed", { error: getErrorMessage(err) });
    }
  }

  private async sendViaSMS(params: any): Promise<void> {
    // For now, we log it or use a placeholder for Twilio/Vapi SMS.
    // Logic: In a real environment, we'd use process.env.TWILIO_AUTH_TOKEN
    log.info("[SMS] Notification queued", { to: "Manager", body: params.message });
  }
}
