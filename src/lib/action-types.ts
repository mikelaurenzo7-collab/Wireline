import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "send_email",
  "send_text_message",
  "schedule_calendar",
  "create_internal_task",
  "send_contract",
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
  /**
   * Nothing reached a carrier or provider, so the same action may run again
   * (for example after a consent box is ticked or a line finishes registering).
   * Leave unset for any outcome that might have delivered.
   */
  retryable?: boolean;
}
