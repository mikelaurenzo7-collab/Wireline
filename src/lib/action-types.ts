import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "send_email",
  "schedule_calendar",
  "update_crm_lead",
  "create_internal_task"
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionItemSchema = z.object({
  type: ActionTypeSchema,
  priority: z.enum(["low", "medium", "high"]),
  payload: z.record(z.any()),
  reasoning: z.string().optional(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

export interface ActionResult {
  success: boolean;
  actionId?: string;
  error?: string;
}
