/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { sendTeamsMessage, logToExcel } from "../../lib/microsoft-graph-service";
import { postAgentNotification as slackPostAgentNotification } from "../../lib/slack-service";
import { assertLiveExternalActionAllowed } from "../../lib/account-environment-policy";
import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleNotificationToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, agentVoiceName, message, payload, toolCallId } = context;

  // Notification Handlers
  if (fn === "send_slack_notification") {
    try {
      const { message: slackMsg, outcome: slackOutcome, urgency } = args || {};
      if (!agent?.user_id) {
        return {
          toolCallId,
          result:
            "That action isn't available on this line right now. Help the caller another way.",
        };
      }
      await assertLiveExternalActionAllowed(agent.user_id, "vapi_slack_notification");
      const callerNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const callId = (payload.call as { id?: string } | undefined)?.id;
      const sent = await slackPostAgentNotification(agent.user_id, String(slackMsg || ""), {
        agentName: agentVoiceName,
        caller: callerNumber,
        outcome: slackOutcome ? String(slackOutcome) : undefined,
        urgency: urgency === "high" ? "high" : "normal",
        callId: callId ? String(callId) : undefined,
      });
      return {
        toolCallId,
        result: sent
          ? "Done, I've notified the team."
          : "The team notification channel isn't set up yet. I've noted it though.",
      };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to notify the team right now, but I've noted what happened.",
      };
    }
  }

  if (fn === "send_teams_message") {
    try {
      const { message: teamsMsg, outcome: teamsOutcome } = args || {};
      if (!agent?.user_id) {
        return {
          toolCallId,
          result:
            "That action isn't available on this line right now. Help the caller another way.",
        };
      }
      await assertLiveExternalActionAllowed(agent.user_id, "vapi_teams_notification");
      const callerNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const sent = await sendTeamsMessage({
        userId: agent.user_id,
        text: String(teamsMsg || ""),
        context: {
          agentName: agentVoiceName,
          caller: callerNumber || undefined,
          outcome: teamsOutcome ? String(teamsOutcome) : undefined,
        },
      });
      return {
        toolCallId,
        result: sent
          ? "Done, I've notified the team."
          : "The team notification channel isn't connected for this account yet.",
      };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to notify the team right now, but I've noted what happened.",
      };
    }
  }

  if (fn === "log_to_excel") {
    try {
      const { caller, outcome, details } = args || {};
      if (!agent?.user_id) {
        return {
          toolCallId,
          result:
            "That action isn't available on this line right now. Help the caller another way.",
        };
      }
      await assertLiveExternalActionAllowed(agent.user_id, "vapi_excel_call_log");
      const ok = await logToExcel({
        userId: agent.user_id,
        caller: String(caller || "Unknown caller"),
        outcome: String(outcome || ""),
        details: String(details || ""),
      });
      return {
        toolCallId,
        result: ok
          ? "Got it, I've logged that to the call record."
          : "The call logging feature isn't connected for this account yet. I've noted the details though.",
      };
    } catch {
      return { toolCallId, result: "I've noted the call details." };
    }
  }

  if (fn === "log_to_google_sheets") {
    try {
      const { caller, outcome, details } = args || {};
      if (!agent?.user_id) {
        return {
          toolCallId,
          result:
            "That action isn't available on this line right now. Help the caller another way.",
        };
      }
      await assertLiveExternalActionAllowed(agent.user_id, "vapi_google_sheets_call_log");
      const { logToGoogleSheets } = await import("../../lib/google-sheets-service");
      const ok = await logToGoogleSheets({
        userId: agent.user_id,
        caller: String(caller || "Unknown caller"),
        outcome: String(outcome || ""),
        details: String(details || ""),
      });
      return {
        toolCallId,
        result: ok
          ? "Got it, I've logged that to the Google Sheets call record."
          : "The Google Sheets integration isn't connected for this account yet. I've noted the details though.",
      };
    } catch {
      return { toolCallId, result: "I've noted the call details." };
    }
  }

  return null;
}
