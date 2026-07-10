/**
 * API Input Validation
 * ---------------------------------------------------------------------------
 * Zod-based input validation for API routes with helpful error messages
 * and automatic response formatting.
 */

import { z, ZodSchema, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Validation middleware factory
 * Creates Express middleware that validates request body against a Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodError(result.error);
      const firstMessage = errors[0]?.message;
      res.status(400).json({
        error: firstMessage || "Invalid request body",
        code: "VALIDATION_ERROR",
        details: errors,
      });
      return;
    }

    // Replace req.body with parsed/validated data
    req.body = result.data;
    next();
  };
}

/**
 * Validate request query parameters
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = formatZodError(result.error);
      res.status(400).json({
        error: "Invalid query parameters",
        code: "VALIDATION_ERROR",
        details: errors,
      });
      return;
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Validate request parameters (URL path params)
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = formatZodError(result.error);
      res.status(400).json({
        error: "Invalid URL parameters",
        code: "VALIDATION_ERROR",
        details: errors,
      });
      return;
    }

    req.params = result.data as typeof req.params;
    next();
  };
}

/**
 * Format Zod error into a user-friendly object
 */
function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// ============================================================================
// Common Validation Schemas
// ============================================================================

/**
 * Email validation with helpful error message
 */
export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .transform((v) => v.toLowerCase().trim());

/**
 * Password validation
 * - Min 8 characters
 * - At least one uppercase, one lowercase, one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * UUID validation
 */
export const uuidSchema = z
  .string()
  .uuid("Invalid ID format")
  .transform((v) => v.toLowerCase());

/**
 * Phone number validation (E.164 format)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +14155551234)");

/**
 * URL validation with protocols
 */
export const urlSchema = z
  .string()
  .url("Invalid URL format")
  .regex(/^https?:\/\//, "URL must start with http:// or https://");

/**
 * Non-empty string validation
 */
export const nonEmptyString = z.string().min(1, "This field is required").trim();

// ============================================================================
// Auth Route Schemas
// ============================================================================

export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(100).optional(),
  preferredPlanId: z.enum(["personal", "starter", "team", "business", "enterprise"]).optional(),
  signupWedge: z
    .enum([
      "home-services",
      "medical",
      "legal",
      "real-estate",
      "personal",
      "insurance",
      "restaurants",
      "sales",
    ])
    .optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  demoSource: z.string().trim().max(160).optional(),
});

export const signupIntentSchema = signupSchema
  .pick({
    preferredPlanId: true,
    signupWedge: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
  })
  .refine(
    (v) => !!(v.preferredPlanId || v.signupWedge || v.utmSource || v.utmMedium || v.utmCampaign),
    "At least one signup-intent field is required",
  );

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema.optional(),
    new_password: passwordSchema.optional(),
  })
  .transform((v, ctx) => {
    const password = v.password || v.new_password;
    if (!password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required",
      });
      return z.NEVER;
    }
    return { token: v.token, password };
  });

// ============================================================================
// Agent Route Schemas
// ============================================================================

export const createAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required").max(100),
  role: z.string().min(1, "Role is required").max(200),
  vibe: z.enum(["warm", "playful", "authoritative"]).default("warm"),
  firstMessage: z.string().max(500).optional(),
  // Account Holder-authored prompt that replaces the auto-composed base
  // identity. Capped well under the runtime prompt clamp so the dynamic
  // blocks + guardrails appended at call time still fit.
  systemPromptOverride: z.string().max(8000).optional(),
  knowledgeBase: z.array(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  phoneNumber: phoneSchema.optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().min(1).max(200).optional(),
  vibe: z.enum(["warm", "playful", "authoritative"]).optional(),
  firstMessage: z.string().max(500).optional(),
  // Nullable so the UI can reset back to the auto-composed prompt.
  systemPromptOverride: z.string().max(8000).nullable().optional(),
  knowledgeBase: z.array(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Campaign Route Schemas
// ============================================================================

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(200),
  description: z.string().max(1000).optional(),
  agentId: uuidSchema.optional(),
  callWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM in 24-hour format")
    .optional(),
  callWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM in 24-hour format")
    .optional(),
  timezone: z.string().optional(),
  dailyDialLimit: z.number().int().min(1).max(1000).optional(),
});

export const addLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Webhook Route Schemas
// ============================================================================

export const createWebhookSchema = z.object({
  url: urlSchema,
  events: z.array(z.string().min(1)).min(1, "At least one event is required"),
  secret: z.string().min(16, "Secret must be at least 16 characters").optional(),
  isActive: z.boolean().default(true),
});
