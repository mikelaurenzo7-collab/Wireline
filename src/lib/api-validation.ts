import { z, ZodError, type ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";

function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodError(result.error);
      res.status(400).json({
        error: errors[0]?.message || "Invalid request body",
        code: "VALIDATION_ERROR",
        details: errors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Invalid query parameters",
        code: "VALIDATION_ERROR",
        details: formatZodError(result.error),
      });
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}

export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: "Invalid URL parameters",
        code: "VALIDATION_ERROR",
        details: formatZodError(result.error),
      });
      return;
    }
    req.params = result.data as typeof req.params;
    next();
  };
}

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .transform((value) => value.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const uuidSchema = z
  .string()
  .uuid("Invalid ID format")
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +14155551234)");

export const urlSchema = z
  .string()
  .url("Invalid URL format")
  .regex(/^https?:\/\//, "URL must start with http:// or https://");

export const nonEmptyString = z.string().min(1, "This field is required").trim();

const canonicalPlanSchema = z.enum(["personal", "starter", "team", "business", "enterprise"]);

export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(100).optional(),
  preferredPlanId: canonicalPlanSchema.optional(),
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
    (value) =>
      !!(
        value.preferredPlanId ||
        value.signupWedge ||
        value.utmSource ||
        value.utmMedium ||
        value.utmCampaign
      ),
    "At least one signup-intent field is required",
  );

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema.optional(),
    new_password: passwordSchema.optional(),
  })
  .transform((value, ctx) => {
    const password = value.password || value.new_password;
    if (!password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required",
      });
      return z.NEVER;
    }
    return { token: value.token, password };
  });

export const createAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required").max(100),
  role: z.string().min(1, "Role is required").max(200),
  vibe: z.enum(["warm", "playful", "authoritative"]).default("warm"),
  firstMessage: z.string().max(500).optional(),
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
  systemPromptOverride: z.string().max(8000).nullable().optional(),
  knowledgeBase: z.array(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

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

export const createWebhookSchema = z.object({
  url: urlSchema,
  events: z.array(z.string().min(1)).min(1, "At least one event is required"),
  secret: z.string().min(16, "Secret must be at least 16 characters").optional(),
  isActive: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: urlSchema.optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  secret: z.union([z.string().min(16), z.literal(""), z.null()]).optional(),
  active: z.boolean().optional(),
});

export const createSubscriptionSchema = z.object({
  planId: z.enum(["starter", "team", "business", "enterprise"]),
  extraAgents: z.number().int().min(0).max(100).default(0),
});

export const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, "Payment method ID is required"),
});

export const inviteTeamMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const addKnowledgeSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000),
  agent_id: z.string().min(1, "agent_id is required"),
});

export const updateKnowledgeSchema = z.object({
  content: z.string().min(1, "Content is required").max(10000),
});

export const createGoalSchema = z.object({
  metric: z.string().min(1, "Metric is required"),
  target: z.number().int().min(1, "Target must be at least 1"),
  label: z.string().max(200).optional(),
});

export const sendSmsSchema = z.object({
  to: phoneSchema,
  body: z.string().min(1, "Message body is required").max(1600),
  agentId: z.string().optional(),
});

export const smsReplySchema = z.object({
  body: z.string().min(1, "body is required").max(1600),
});

export const applyRoleSchema = z.object({ role: z.string().min(1, "Role is required") });

export const agentManualEntrySchema = z.object({
  type: z.enum(["personality", "directive", "knowledge"]),
  content: z.string().min(1, "Content is required").max(50000),
  overrideId: z.string().optional(),
});

export const spendBudgetSchema = z.object({
  monthly_limit_usd: z.number().min(0).default(0),
  warn_threshold_pct: z.number().int().min(1).max(99).default(80),
  hard_cap: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

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

export const pronunciationEntrySchema = z.object({
  word: z.string().min(1, "Word is required").max(100),
  pronunciation: z.string().min(1, "Pronunciation is required").max(200),
  agentId: z.string().optional(),
});

export const updateFollowUpTaskSchema = z.object({
  status: z.enum(["pending", "open", "in_progress", "completed", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  due_date: z.string().optional().nullable(),
  agent_id: z.string().optional().nullable(),
  resolution_notes: z.string().max(5000).optional(),
  description: z.string().max(5000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const phoneNumberCreateSchema = z.object({
  phone_number: z.string().min(3).max(32),
  vapi_number_id: z.string().max(120).optional(),
});

export const phoneNumberPatchSchema = z
  .object({
    agent_id: z.string().max(120).optional().nullable(),
    campaign_label: z.string().max(200).optional().nullable(),
  })
  .refine((value) => value.agent_id !== undefined || value.campaign_label !== undefined, {
    message: "Nothing to update — pass agent_id or campaign_label.",
  });

export const phoneNumberProvisionSchema = z.object({
  agent_id: z.string().min(1).max(120).optional(),
  area_code: z
    .string()
    .regex(/^\d{3}$/, "area_code must be a 3-digit US code")
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

export const icloudMailConnectSchema = z.object({
  email_address: z.string().email().max(320),
  app_password: z.string().min(4).max(128),
});

export const directorChatModelSelectionSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("wireline"), tier: z.enum(["auto", "sonnet", "opus"]) }),
  z.object({ provider: z.literal("openrouter"), modelId: z.string().min(1).max(128) }),
]);

export const directorStitchOptionsSchema = z.object({
  designMode: z.boolean().optional(),
  useAccountBranding: z.boolean().optional(),
});

export const directorThreadKeySchema = z.enum(["director", "painter"]);

export const directorMessageSchema = z
  .object({
    content: z.string().max(4000).optional(),
    focusAgentId: z.string().max(120).optional(),
    skipAccountHolderPersist: z.boolean().optional(),
    forceDeep: z.boolean().optional(),
    modelSelection: directorChatModelSelectionSchema.optional(),
    stitchOptions: directorStitchOptionsSchema.optional(),
    threadKey: directorThreadKeySchema.optional(),
    approval: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.content?.trim()) || value.approval, {
    message: "Message content required",
  });

export const directorStreamMessageSchema = z.object({
  content: z.string().min(1, "Message content required").max(4000),
  focusAgentId: z.string().max(120).optional(),
  skipAccountHolderPersist: z.boolean().optional(),
  forceDeep: z.boolean().optional(),
  modelSelection: directorChatModelSelectionSchema.optional(),
  stitchOptions: directorStitchOptionsSchema.optional(),
  threadKey: directorThreadKeySchema.optional(),
});

export const directorExecuteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("comms"),
    action: z.object({ kind: z.string().min(1) }).passthrough(),
    hasExpressWrittenConsent: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("integration"),
    job: z.object({ tool: z.string().min(1) }).passthrough(),
  }),
]);

export const directorProposalResolveSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(40)
    .regex(/^(change|toggle|action|integration):\d+$/),
  state: z.enum(["done", "dismissed"]),
});

export const pdfUploadSchema = z.object({
  pdfBase64: z.string().min(1).max(40 * 1024 * 1024),
  fileName: z.string().max(255).optional(),
});

export const designProfilePatchSchema = z.object({
  companyBlurb: z.string().max(8000).optional(),
  styleNotes: z.string().max(8000).optional(),
});

export const designProfileAssetUploadSchema = z.object({
  fileBase64: z.string().min(1).max(3 * 1024 * 1024),
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
  .refine((value) => Boolean(value.htmlArtifactId || value.imageArtifactId), {
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

export function sanitizeString(input: string): string {
  return input.replace(/[<>]/g, "").trim();
}

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
