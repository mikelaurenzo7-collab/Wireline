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
  /** True when the action was written to the follow-up queue as a draft
   * rather than executed immediately. */
  queued?: boolean;
  actionId?: string;
  error?: string;
}
