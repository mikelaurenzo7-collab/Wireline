/**
 * Shared Zod schemas for the frontend. Mirror of the server-side schemas in
 * `server/lib/validation.ts`. Keeping them in two places (rather than one
 * shared module) keeps the server bundle from leaking into the browser
 * bundle and lets each side evolve formatting concerns (e.g., trim/coerce)
 * independently while staying in sync on shape.
 */
import { z } from "zod";

export const phoneNumberSchema = z
  .string()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .refine((v) => /^\+?[1-9]\d{9,14}$/.test(v), {
    message: "Must be a valid E.164-style phone number",
  });

export const createAgentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).default("New Agent"),
  voice_id: z.string().trim().min(1).max(120).optional(),
  channel: z.enum(["voice", "email", "omnichannel"]).default("voice"),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const settingsSchema = z.object({
  vapi_phone_number_id: z.string().trim().max(120).nullish(),
  subscription_status: z.enum(["active", "inactive", "trial", "canceled"]).default("active"),
  max_agents: z.coerce.number().int().min(1).max(100).default(3),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const outboundDialSchema = z.object({
  agentId: z.string().min(1),
  customerName: z.string().trim().max(120).nullish(),
  customerNumber: phoneNumberSchema,
  context: z.string().trim().max(1000).nullish(),
});
export type OutboundDialInput = z.infer<typeof outboundDialSchema>;

export const fleetTaskSchema = z.object({
  source_type: z.string().trim().max(60).nullish(),
  source_id: z.string().trim().max(200).nullish(),
  target_channel: z.string().trim().max(60).nullish(),
  customer_info: z.record(z.string(), z.unknown()).nullish(),
  task_type: z.string().trim().max(60).nullish(),
  description: z.string().trim().max(2000).nullish(),
  agent_id: z.string().trim().max(200).nullish(),
});
export type FleetTaskInput = z.infer<typeof fleetTaskSchema>;

export const agentConfigManualSchema = z.object({
  type: z.enum(["personality", "directive", "knowledge"]),
  content: z.string().trim().min(1).max(10_000),
  overrideId: z.union([z.string(), z.number()]).optional(),
});
export type AgentConfigManualInput = z.infer<typeof agentConfigManualSchema>;
