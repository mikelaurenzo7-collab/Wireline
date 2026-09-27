import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "send_email",
  "send_text_message",
  "schedule_calendar",
  "update_crm_lead",
  "create_internal_task",
  "send_contract",
  "prospect_leads",
  "notify_slack",
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionItemSchema = z.object({
  type: ActionTypeSchema,
  priority: z.enum(["low", "medium", "high"]),
  payload: z.record(z.string(), z.any()),
  reasoning: z.string().optional(),
  agentId: z.string().optional(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

export interface ActionResult {
  success: boolean;
  /** True when a durable follow-up draft or calendar request awaits approval
   * rather than being completed immediately. */
  queued?: boolean;
  actionId?: string;
  error?: string;
  errorCode?: string;
}
