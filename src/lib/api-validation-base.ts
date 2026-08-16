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
export function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
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
  preferredPlanId: z.enum(["personal", "starter", "team", "business"]).optional(),
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
      "support",
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

// `name` is required, not optional: wireline_webhooks.name is NOT NULL and the
// handler rejects a body without it. Omitting it here made POST /api/webhooks
// unsatisfiable — validateBody replaces req.body with the parsed result, so zod
// stripped the name the client sent and the handler 400'd every request.
// `active` (not `isActive`) is what the handler and updateWebhookSchema read;
// the mismatched name was silently dropped and masked by an `?? true` default.
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  url: urlSchema,
  events: z.array(z.string().min(1)).min(1, "At least one event is required"),
  secret: z.string().min(16, "Secret must be at least 16 characters").optional(),
  active: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: urlSchema.optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  secret: z.union([z.string().min(16), z.literal(""), z.null()]).optional(),
  active: z.boolean().optional(),
});

// ============================================================================
// Billing Route Schemas
// ============================================================================

export const createSubscriptionSchema = z.object({
  planId: z.enum(["starter", "team", "business"]),
  extraAgents: z.number().int().min(0).max(100).default(0),
});

export const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, "Payment method ID is required"),
});

// ============================================================================
// Team Route Schemas
// ============================================================================

export const inviteTeamMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

// ============================================================================
// Knowledge Route Schemas
// ============================================================================

export const addKnowledgeSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000),
  agent_id: z.string().min(1, "agent_id is required"),
});

export const updateKnowledgeSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000),
});

// ============================================================================
// Goal Route Schemas
// ============================================================================

export const createGoalSchema = z.object({
  metric: z.string().min(1, "Metric is required"),
  target: z.number().int().min(1, "Target must be at least 1"),
  label: z.string().max(200).optional(),
});

// ============================================================================
// SMS Route Schemas
// ============================================================================

export const sendSmsSchema = z.object({
  to: phoneSchema,
  body: z.string().min(1, "Message body is required").max(1600),
  agentId: z.string().optional(),
});

/** Inbox thread reply body — used by POST /api/sms/threads/:id/reply. */
export const smsReplySchema = z.object({
  body: z.string().min(1, "body is required").max(1600),
});

// ============================================================================
// Agent Config Schemas (apply-role, manual entry)
// ============================================================================

export const applyRoleSchema = z.object({
  role: z.string().min(1, "Role is required"),
});

export const agentManualEntrySchema = z.object({
  type: z.enum(["personality", "directive", "knowledge"]),
  content: z.string().min(1, "Content is required").max(50000),
  overrideId: z.string().optional(),
});

// ============================================================================
// Spend Budget Schema
// ============================================================================

export const spendBudgetSchema = z.object({
  monthly_limit_usd: z.number().min(0).default(0),
  warn_threshold_pct: z.number().int().min(1).max(99).default(80),
  hard_cap: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

// ============================================================================
// Cadence Route Schemas
// ============================================================================

export const createCadenceSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).optional().nullable(),
  agentId: z.string().optional().nullable(),
  steps: z.array(z.record(z.string(), z.unknown())).min(1, "At least one step is required"),
  active: z.boolean().default(true),
});

export const updateCadenceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  agentId: z.string().optional().nullable(),
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  active: z.boolean().optional(),
});

// ============================================================================
// Intake Route Schemas
// ============================================================================

export const createIntakeKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  default_agent_id: z.string().optional().nullable(),
  auto_dial: z.boolean().default(false),
});

export const updateIntakeKeySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  active: z.boolean().optional(),
  default_agent_id: z.string().optional().nullable(),
  auto_dial: z.boolean().optional(),
});

// ============================================================================
// Assistants Task Schemas
// ============================================================================

export const updateFollowUpTaskSchema = z.object({
  status: z.enum(["pending", "open", "in_progress", "completed", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  due_date: z.string().optional().nullable(),
  agent_id: z.string().optional().nullable(),
  resolution_notes: z.string().max(5000).optional(),
  description: z.string().max(5000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Tier-2 route schemas (carrier, email, director, workspace)
// ============================================================================

export const phoneNumberCreateSchema = z.object({
  phone_number: z.string().min(3).max(32),
  vapi_number_id: z.string().max(120).optional(),
});

export const phoneNumberPatchSchema = z
  .object({
    agent_id: z.string().max(120).optional().nullable(),
    campaign_label: z.string().max(200).optional().nullable(),
  })
  .refine((data) => data.agent_id !== undefined || data.campaign_label !== undefined, {
    message: "Nothing to update — pass agent_id or campaign_label.",
  });

/** POST /api/phone-numbers/provision — buy or assign a tenant line (onboarding + self-serve). */
export const phoneNumberProvisionSchema = z.object({
  agent_id: z.string().min(1).max(120).optional(),
  area_code: z
    .string()
    .regex(/^\d{3}$/, "area_code must be a 3-digit US code")
    .optional(),
  phone_number: z
    .string()
    .regex(/^\+1\d{10}$/, "phone_number must be a US E.164 number")
    .optional(),
});

export const emailThreadsReadStateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  read: z.boolean(),
});

export const emailInboxSyncSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  sinceIso: z.string().datetime().optional(),
});

/** iCloud Mail — app-specific password connect (no Apple OAuth). */
export const icloudMailConnectSchema = z.object({
  email_address: z.string().email().max(320),
  app_password: z.string().min(4).max(128),
});

export const pdfUploadSchema = z.object({
  pdfBase64: z
    .string()
    .min(1)
    .max(40 * 1024 * 1024),
  fileName: z.string().max(255).optional(),
});

export const designProfilePatchSchema = z.object({
  companyBlurb: z.string().max(8000).optional(),
  styleNotes: z.string().max(8000).optional(),
});

export const designProfileAssetUploadSchema = z.object({
  fileBase64: z
    .string()
    .min(1)
    .max(3 * 1024 * 1024),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(128).optional(),
  role: z.enum(["logo", "font", "css", "reference"]).optional(),
});

export const designExportPreviewSchema = z
  .object({
    title: z.string().min(1).max(200),
    deviceType: z.enum(["DESKTOP", "MOBILE", "TABLET", "AGNOSTIC"]).optional(),
    htmlArtifactId: z.string().min(1).max(32).optional(),
    imageArtifactId: z.string().min(1).max(32).optional(),
    renderId: z.string().max(64).optional(),
    conceptId: z.string().max(64).optional(),
    promptSummary: z.string().max(2000).optional(),
  })
  .refine((data) => Boolean(data.htmlArtifactId || data.imageArtifactId), {
    message: "At least one artifact id (htmlArtifactId or imageArtifactId) is required",
  });

export const designImportFigmaSchema = z.object({
  fileKeyOrUrl: z.string().min(8).max(512),
});

export const designImportWebsiteSchema = z.object({
  url: z.string().min(4).max(512),
});

export const designGithubPrSchema = designExportPreviewSchema.extend({
  repoFullName: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  baseBranch: z.string().min(1).max(120).optional(),
  prTitle: z.string().min(1).max(200).optional(),
});

export const designShopifyStorefrontExportSchema = designExportPreviewSchema.extend({
  target: z.enum(["react-starter", "hydrogen-ready"]).default("react-starter"),
});

export const workspaceMessageSchema = z.object({
  content: z.string().min(1, "Message content required").max(4000),
});

export const directorChatModelPatchSchema = z.object({
  selection: z.record(z.string(), z.unknown()),
});

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .trim();
}

/**
 * Validate and sanitize an object of string values
 */
export function sanitizeStrings<T extends Record<string, unknown>>(
  obj: T,
  keys: Array<keyof T>,
): T {
  const result = { ...obj };
  for (const key of keys) {
    const value = result[key];
    if (typeof value === "string") {
      (result as Record<string, unknown>)[key as string] = sanitizeString(value);
    }
  }
  return result;
}
