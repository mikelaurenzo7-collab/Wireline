/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, ilike } from "drizzle-orm";
import * as schema from "../db/schema";
import { sendTenantMessage } from "./twilio-service";
import { normalizeDncPhone } from "./compliance";

export type ScopedToolContext = { toolCallId: string; userId: string; agentId: string; callerNumber?: string; agentName?: string; drizzle: any; };
const result = (toolCallId: string, text: string) => ({ toolCallId, result: text });

export async function dispatchScopedToolCall(name: string, args: any, context: ScopedToolContext) {
  const callerNumber = context.callerNumber || "";
  if (name === "create_fleet_task" || name === "escalate_to_human") {
    const description = String(args?.description || args?.reason || "Caller requested follow-up").slice(0, 2000);
    await context.drizzle.insert(schema.fleetTasks).values({ userId: context.userId, agentId: context.agentId, taskType: name === "escalate_to_human" ? "escalation" : "follow_up", description, priority: args?.priority || "high", status: "pending", sourceType: "phone_call", sourceId: args?.callId || "live-call", targetChannel: "manual" });
    return result(context.toolCallId, name === "escalate_to_human" ? "A human teammate has been alerted with the call context." : "A follow-up task has been created.");
  }
  if (name === "search_leads" || name === "crm_search_contacts") {
    const query = String(args?.query || args?.name || args?.email || args?.phone || "").replace(/[^A-Za-z0-9 @.\-+]/g, "").slice(0, 80);
    if (!query) return result(context.toolCallId, "Ask for a name, email, or phone number so I can look that up.");
    const leads = await context.drizzle.select({ name: schema.outboundLeads.customerName, number: schema.outboundLeads.customerNumber, status: schema.outboundLeads.status, context: schema.outboundLeads.context }).from(schema.outboundLeads).where(and(eq(schema.outboundLeads.userId, context.userId), ilike(schema.outboundLeads.customerName, `%${query}%`))).limit(3);
    return result(context.toolCallId, leads.length ? leads.map((lead: any) => `${lead.name || "Contact"}: ${lead.status || "unknown"}`).join("; ") : "No matching contact was found.");
  }
  if (name === "update_lead_status" || name === "crm_log_call" || name === "crm_update_deal_stage") {
    const status = String(args?.status || args?.stage || "Updated").slice(0, 120);
    if (callerNumber) await context.drizzle.update(schema.outboundLeads).set({ status, context: String(args?.notes || args?.summary || "").slice(0, 4000), lastCalledAt: new Date() }).where(and(eq(schema.outboundLeads.userId, context.userId), ilike(schema.outboundLeads.customerNumber, `%${callerNumber.replace(/\D/g, "").slice(-10)}%`)));
    return result(context.toolCallId, "The CRM outcome has been logged.");
  }
  if (name === "add_to_dnc") {
    const phone = normalizeDncPhone(String(args?.phone || callerNumber));
    if (!phone) return result(context.toolCallId, "I need a valid phone number to process that request.");
    await context.drizzle.insert(schema.doNotCall).values({ userId: context.userId, phoneNumber: phone, reason: "Caller request", source: "voice" }).onConflictDoNothing();
    return result(context.toolCallId, "That number has been added to the do-not-contact list.");
  }
  if (name === "send_text_message") {
    const to = String(args?.to || callerNumber); const body = String(args?.body || args?.message || "").slice(0, 1200);
    if (!to || !body) return result(context.toolCallId, "I need a recipient and message before I can send a text.");
    await sendTenantMessage({ userId: context.userId, to, body });
    return result(context.toolCallId, "The text message has been sent.");
  }
  if (name === "book_appointment" || name === "check_calendar_availability" || name === "generate_zoom_link" || name === "send_slack_notification" || name === "send_teams_message" || name === "log_to_google_sheets" || name === "log_to_excel" || name === "meta_submit_lead") {
    await context.drizzle.insert(schema.fleetTasks).values({ userId: context.userId, agentId: context.agentId, taskType: "integration_action", description: `${name}: ${JSON.stringify(args || {}).slice(0, 1800)}`, priority: "medium", status: "pending", sourceType: "phone_call", sourceId: "live-call", targetChannel: "integration" });
    return result(context.toolCallId, "That approved action has been queued for the connected workspace integration.");
  }
  return result(context.toolCallId, "That action is not enabled for this agent. I can capture the request and route it to a human instead.");
}
