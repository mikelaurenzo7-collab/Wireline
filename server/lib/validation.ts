/**
 * Validation helpers + shared Zod schemas. Schemas live here so the frontend
 * can also import the *types* (we don't ship Zod itself to the browser
 * bundle for free, but `z.infer` types are used freely).
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, type ZodTypeAny } from "zod";

import { AppError } from "./errors";

// ---------- Primitive helpers ----------

export const phoneNumberSchema = z
  .string()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .refine((v) => /^\+?[1-9]\d{9,14}$/.test(v), {
    message: "Must be a valid E.164-style phone number",
  });

export const emailAddressSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine(
    (v) => {
      // Disallow whitespace anywhere (mirrors prior `isValidEmailAddress`).
      for (const c of v) if (c <= " ") return false;
      const at = v.indexOf("@");
      if (at <= 0 || at !== v.lastIndexOf("@") || at === v.length - 1) return false;
      const local = v.slice(0, at);
      const domain = v.slice(at + 1);
      if (!local || !domain || domain.startsWith(".") || domain.endsWith(".") || !domain.includes("."))
        return false;
      return true;
    },
    { message: "Must be a valid email address" }
  );

export const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length ? v : null))
    .nullable()
    .optional();

export function sanitizeLikeInput(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

// Backwards-compatible helpers used by routes that haven't been migrated to
// the schema-driven `validateBody` middleware yet.
export function normalizePhoneNumber(value: unknown) {
  const result = phoneNumberSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isValidEmailAddress(value: unknown): value is string {
  return emailAddressSchema.safeParse(value).success;
}

// ---------- Middleware ----------

type Source = "body" | "query" | "params";

function pickSource(req: Request, source: Source) {
  switch (source) {
    case "body":
      return req.body;
    case "query":
      return req.query;
    case "params":
      return req.params;
  }
}

export function validate<S extends ZodTypeAny>(
  schema: S,
  source: Source = "body"
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(pickSource(req, source));
    if (!result.success) {
      return next(
        AppError.badRequest("Invalid request payload", {
          source,
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        })
      );
    }
    // Attach parsed data to req so downstream handlers get the typed value.
    if (source === "body") req.body = result.data;
    if (source === "query") (req as { query: unknown }).query = result.data;
    if (source === "params") (req as { params: unknown }).params = result.data;
    next();
  };
}

// ---------- Domain schemas (the 5 most-used mutating endpoints) ----------

export const createAgentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).default("New Agent"),
  voice_id: z.string().trim().min(1).max(120).optional(),
  channel: z.enum(["voice", "email", "omnichannel"]).default("voice"),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  voice_id: z.string().trim().max(120).nullish(),
  voice_id_inbound: z.string().trim().max(120).nullish(),
  voice_id_outbound: z.string().trim().max(120).nullish(),
  voice_provider: z.string().trim().max(60).nullish(),
  first_message: z.string().trim().max(2000).nullish(),
  archetype: z.enum(["Receptionist", "The Closer", "Support Tech", "The Empath"]).optional(),
  ambient_noise: z.string().trim().max(60).nullish(),
  website_url: z.string().trim().url().max(500).nullish(),
  transfer_phone: phoneNumberSchema.nullish(),
  email_auto_respond: z.boolean().optional(),
  email_agent_tone: z.string().trim().max(120).nullish(),
  email_signature: z.string().trim().max(2000).nullish(),
  channel: z.enum(["voice", "email", "omnichannel"]).optional(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

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
