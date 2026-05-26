import { z } from "zod";
import { log } from "./server-context";

// Webhook delivery payload — ensures enqueued webhooks have valid structure
export const WebhookDeliverySchema = z
  .object({
    id: z.number(),
    user_id: z.string().uuid(),
    webhook_id: z.string(),
    event: z.string(),
    payload: z.unknown(), // Varies by event type
    attempts: z.number().int().nonnegative(),
    max_attempts: z.number().int().positive(),
    status: z.enum(["pending", "success", "failed", "dead"]),
    last_error: z.string().nullable(),
    last_status_code: z.number().int().nullable(),
    delivered_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

// Webhook metadata — validates hook configuration
export const WebhookMetadataSchema = z
  .object({
    id: z.string(),
    user_id: z.string().uuid(),
    url: z.string().url(),
    secret: z.string().optional(),
    active: z.boolean(),
    delivery_count: z.number().int().nonnegative(),
    last_triggered_at: z.string().datetime().nullable(),
    last_status: z.number().int().nullable(),
    last_error: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type WebhookMetadata = z.infer<typeof WebhookMetadataSchema>;

// Agent response from API — validates bot training data
export const AgentSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    role: z.string().max(500).optional(),
    personality: z.string().max(2000).optional(),
    directives: z
      .array(
        z.object({
          id: z.string().optional(),
          content: z.string(),
        }),
      )
      .default([]),
    knowledge: z
      .array(
        z.object({
          id: z.string().optional(),
          content: z.string(),
        }),
      )
      .default([]),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type Agent = z.infer<typeof AgentSchema>;

// API error response — prevents accessing undefined error properties
export const APIErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type APIError = z.infer<typeof APIErrorSchema>;

// Helper to safely validate and parse API responses
export function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      log.error("Validation error", { issues: err.issues });
      throw new Error(`Invalid response: ${err.issues[0]?.message || "unknown"}`);
    }
    throw err;
  }
}
