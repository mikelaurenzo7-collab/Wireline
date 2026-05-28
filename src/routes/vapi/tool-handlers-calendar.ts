/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { dispatchWebhook } from "../../lib/webhook-helpers";
import { IntegrationService } from "../../lib/integrations";
import { postAgentNotification as slackPostAgentNotification } from "../../lib/slack-service";

import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleCalendarToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, agentVoiceName, message, toolCallId } = context;

  if (fn === "check_calendar_availability") {
    try {
      const { date } = args || {};
      const service = new IntegrationService(agent?.user_id);
      const result = await service.checkAvailability(date);
      return { toolCallId, result };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble checking availability right now. Can I take your details and have someone call you back with times?",
      };
    }
  }

  if (fn === "book_appointment") {
    try {
      const { date, time, customer_name, service_type } = args || {};
      const service = new IntegrationService(agent?.user_id);

      // Simple date/time parsing for now.
      const startTime = new Date(`${date} ${time}`).toISOString();
      const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
      const title = `${service_type} for ${customer_name}`;

      const success = await service.bookAppointment({
        title,
        description: `Booked via Wireline AI Agent`,
        startTime,
        endTime,
        agentId: agent?.id,
      });
      if (success && agent?.user_id) {
        void dispatchWebhook(agent.user_id, "appointment.booked", {
          agent_id: agent.id,
          title,
          start_time: startTime,
          end_time: endTime,
          customer_name,
          service_type,
        });
        void slackPostAgentNotification(
          agent.user_id,
          "Appointment booked: " +
            title +
            "\n" +
            new Date(startTime).toLocaleString() +
            " → " +
            new Date(endTime).toLocaleString(),
          { agentName: agentVoiceName, caller: customer_name, outcome: "booked" },
        );
        // Operator SMS alert — positive event. Fires only when the
        // operator opted in (twilio_manager_alerts_enabled = true
        // + twilio_manager_alert_number set). Keeps the operator
        // in the loop on wins, not just escalations.
        try {
          const { NotificationService } = await import("../../lib/notifications");
          const notif = new NotificationService(agent.user_id);
          void notif.sendWinAlert({
            title: "Meeting booked",
            message: `${customer_name} · ${service_type} · ${new Date(startTime).toLocaleString()}`,
            callId: (message.call as { id?: string } | undefined)?.id,
            agentName: agentVoiceName,
            caller: customer_name,
            outcome: "booked",
          });
        } catch {
          /* best-effort; never block the tool response */
        }
      }
      return {
        toolCallId,
        result: success
          ? "Appointment booked."
          : "I wasn't able to lock that in right now. Let me take your info and have someone confirm the appointment.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I ran into a hiccup booking that. Let me take your details and have someone confirm the appointment for you.",
      };
    }
  }

  if (fn === "send_contract") {
    try {
      const { recipient_name, recipient_email, template_id } = args || {};
      const { sendContract } = await import("../../lib/docusign-service");
      const result = await sendContract({
        recipientName: recipient_name,
        recipientEmail: recipient_email,
        templateId: template_id,
      });
      return {
        toolCallId,
        result: result
          ? `Contract sent. Envelope ID: ${result.envelopeId}`
          : "The document sending feature isn't set up for this account yet. I'll have someone from the team send it to you directly.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to send that document right now. I'll have someone from the team send it to you directly.",
      };
    }
  }

  return null;
}
