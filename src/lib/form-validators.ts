import { z } from "zod";

// Auth form — sign in and sign up validation
export const SignInFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInForm = z.infer<typeof SignInFormSchema>;

export const SignUpFormSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type SignUpForm = z.infer<typeof SignUpFormSchema>;

export const ResetPasswordFormSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type ResetPasswordForm = z.infer<typeof ResetPasswordFormSchema>;

// Agent creation/update form
export const AgentFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  role: z.string().max(500, "Role must be 500 characters or less").optional(),
  personality: z.string().max(2000, "Personality must be 2000 characters or less").optional(),
});

export type AgentForm = z.infer<typeof AgentFormSchema>;

// ── Agent business-profile (hours / compliance / guardrails) ──────────
// Applied at runtime by buildAgentRuntimeContext to layer business
// rules on top of the agent's role-derived system prompt. Each field
// is optional so partial PATCH-style updates work.

// Accepts 24-hour HH:MM with an optional leading zero on the hour (e.g. "9:00"
// or "09:00"). Rejects out-of-range values such as "24:00", "25:30" or "9:70".
const HHMM = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour)");

export const DayHoursSchema = z
  .object({
    open: HHMM.optional(),
    close: HHMM.optional(),
    closed: z.boolean().optional(),
  })
  .strict();

export const BusinessHoursSchema = z
  .object({
    mon: DayHoursSchema.optional(),
    tue: DayHoursSchema.optional(),
    wed: DayHoursSchema.optional(),
    thu: DayHoursSchema.optional(),
    fri: DayHoursSchema.optional(),
    sat: DayHoursSchema.optional(),
    sun: DayHoursSchema.optional(),
  })
  .strict();

export const ComplianceModeSchema = z.enum([
  "none",
  "hipaa",
  "pci",
  "gdpr",
  "financial",
  "legal",
  "tcpa",
]);
export const KpiFocusSchema = z.enum([
  "general",
  "conversions",
  "qualifications",
  "resolutions",
  "satisfaction",
]);

// Variables: keys are simple identifiers, values are short strings/numbers.
// Bounded so the prompt budget can't be blown by a single jumbo placeholder.
export const BusinessVariablesSchema = z
  .record(
    z
      .string()
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/,
        "Variable key must be alphanumeric/underscore (max 41 chars)",
      ),
    z.union([z.string().max(500, "Variable value must be 500 characters or less"), z.number()]),
  )
  .refine((obj) => Object.keys(obj).length <= 32, {
    message: "At most 32 variables allowed",
  });

export const AgentBusinessProfileSchema = z
  .object({
    business_hours: BusinessHoursSchema.optional(),
    // IANA tz strings can be long-ish (e.g. "America/Argentina/Buenos_Aires").
    timezone: z.string().min(1).max(64).optional(),
    compliance_mode: ComplianceModeSchema.optional(),
    disallowed_topics: z
      .array(z.string().max(120))
      .max(24, "At most 24 disallowed topics")
      .optional(),
    escalation_keywords: z
      .array(z.string().max(120))
      .max(24, "At most 24 escalation keywords")
      .optional(),
    /**
     * Per-agent escalation routing — overrides the tenant-wide
     * Manager Alert Number. Both optional. Empty string normalised to
     * undefined upstream so the handler's fallback logic fires cleanly.
     * Strict E.164 enforcement happens at the dial site; here we just
     * keep formats permissive enough for paste-from-CRM friendliness.
     */
    escalation_phone: z
      .string()
      .trim()
      .min(7, "Phone too short")
      .max(32, "Phone too long")
      .optional(),
    escalation_email: z.string().trim().email("Enter a valid email").max(254).optional(),
    escalation_handoff_enabled: z.boolean().optional(),
    business_variables: BusinessVariablesSchema.optional(),
    out_of_hours_message: z
      .string()
      .max(500, "Out-of-hours message must be 500 characters or less")
      .optional()
      .nullable(),
    kpi_focus: KpiFocusSchema.optional(),
    is_business_agent: z.boolean().optional(),
  })
  .strict();

export type AgentBusinessProfile = z.infer<typeof AgentBusinessProfileSchema>;

const AgentChannelEnum = z.enum(["voice", "email", "sms"]);

/** Optional PATCH fields for per-agent capability overrides (mirrors agent-routes validation). */
export const AgentCapabilityFieldsSchema = z
  .object({
    autonomy_level: z.enum(["inherit", "auto", "draft", "supervised"]).optional(),
    channels: z.array(AgentChannelEnum).min(1).max(3).optional(),
    slack_channel_id: z.string().max(128).optional().nullable(),
    auto_zoom_link: z.boolean().optional(),
  })
  .strict();

export type AgentCapabilityFields = z.infer<typeof AgentCapabilityFieldsSchema>;

// Directive input validation
export const DirectiveSchema = z.object({
  id: z.string().optional(),
  content: z
    .string()
    .min(1, "Directive cannot be empty")
    .max(1000, "Directive must be 1000 characters or less"),
});

export type Directive = z.infer<typeof DirectiveSchema>;

// Training source entry
export const KnowledgeSchema = z.object({
  id: z.string().optional(),
  content: z
    .string()
    .min(1, "Training entry cannot be empty")
    .max(2000, "Entry must be 2000 characters or less"),
});

export type Knowledge = z.infer<typeof KnowledgeSchema>;

// Campaign creation validation
export const CampaignCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Campaign name is required")
    .max(200, "Name must be 200 characters or less"),
  goal: z.string().max(1000, "Goal must be 1000 characters or less").optional().nullable(),
  agent_id: z.string().uuid("Invalid agent ID").optional().nullable(),
  call_window_start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:MM in 24-hour format")
    .optional(),
  call_window_end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must be HH:MM in 24-hour format")
    .optional(),
  max_attempts: z
    .number()
    .int("Max attempts must be an integer")
    .positive("Max attempts must be greater than 0")
    .optional(),
});

export type Campaign = z.infer<typeof CampaignCreateSchema>;

// Campaign update validation (all fields optional)
export const CampaignUpdateSchema = z
  .object({
    name: z
      .string()
      .min(1, "Campaign name is required")
      .max(200, "Name must be 200 characters or less")
      .optional(),
    goal: z.string().max(1000, "Goal must be 1000 characters or less").optional().nullable(),
    agent_id: z.string().uuid("Invalid agent ID").optional().nullable(),
    status: z.enum(["draft", "active", "paused", "completed", "failed"]).optional(),
    call_window_start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:MM in 24-hour format")
      .optional(),
    call_window_end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must be HH:MM in 24-hour format")
      .optional(),
    max_attempts: z
      .number()
      .int("Max attempts must be an integer")
      .positive("Max attempts must be greater than 0")
      .optional(),
  })
  .strict();

export type CampaignUpdate = z.infer<typeof CampaignUpdateSchema>;

// Email reply validation
export const EmailReplySchema = z.object({
  body: z
    .string()
    .min(1, "Email body cannot be empty")
    .max(5000, "Email body must be 5000 characters or less"),
});

export type EmailReply = z.infer<typeof EmailReplySchema>;

// Email draft validation
export const EmailDraftSchema = z.object({
  subject: z
    .string()
    .min(1, "Subject cannot be empty")
    .max(200, "Subject must be 200 characters or less"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  context: z.string().max(1000, "Context must be 1000 characters or less").optional(),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

// Outbound lead — single contact submitted to /api/outbound/dial.
// Phone number format kept liberal (E.164 with optional formatting)
// because Vapi handles normalization downstream.
export const OutboundLeadSchema = z
  .object({
    phone_number: z
      .string()
      .min(7, "Phone number is required")
      .max(32, "Phone number must be 32 characters or less")
      .regex(/^[+\-()\s\d]+$/, "Phone number contains invalid characters"),
    name: z.string().max(200, "Name must be 200 characters or less").optional().nullable(),
    email: z.string().email("Invalid email address").optional().nullable(),
    notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
    status: z.string().max(50, "Status must be 50 characters or less").optional(),
  })
  .passthrough(); // Allow extra fields (custom CRM data) to flow through

export type OutboundLead = z.infer<typeof OutboundLeadSchema>;

// Bulk outbound — capped at 5000 leads/request so a single accidental
// upload can't lock a database transaction or starve the dial queue.
export const OutboundBulkSchema = z.object({
  leads: z
    .array(OutboundLeadSchema)
    .min(1, "At least one lead is required")
    .max(5000, "Cannot submit more than 5000 leads per request"),
  campaign_id: z.string().uuid("Invalid campaign ID").optional().nullable(),
  has_express_written_consent: z.boolean().optional().default(false),
});

export type OutboundBulk = z.infer<typeof OutboundBulkSchema>;

// Appointment — created from voice/email triage flows.
export const AppointmentSchema = z.object({
  customer_name: z
    .string()
    .min(1, "Customer name is required")
    .max(200, "Customer name must be 200 characters or less"),
  date: z.string().min(1, "Date is required").max(40, "Date string is too long"),
  time: z.string().min(1, "Time is required").max(40, "Time string is too long"),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
  agent_id: z.string().uuid("Invalid agent ID").optional().nullable(),
});

export type Appointment = z.infer<typeof AppointmentSchema>;

// Result shape for `parseFormData`. Both `data` and `errors` are optional
// so that call sites can do `if (!result.success) { use result.errors }`
// without relying on discriminated-union narrowing — the project's tsconfig
// does not enable `strict`, and TS's narrowing of `!validation.success`
// is unreliable without it. With both fields optional, accessing either
// on the broader type just yields `undefined`-or-T, which works at every
// call site.
export interface FormParseResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
}

export function parseFormData<T>(schema: z.ZodSchema<T>, data: unknown): FormParseResult<T> {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      err.issues.forEach((issue) => {
        const path = issue.path.join(".");
        errors[path] = issue.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { form: "An unexpected error occurred" } };
  }
}

// ─── LLM Response Schemas ────────────────────────────────────────────────────
// Zod schemas for structured JSON returned by Gemini / Claude calls.
// Use safeParse() on raw LLM output — the model may return an unexpected shape
// and we must not operate on arbitrary data or crash silently.

/** Gemini post-call lead scoring: { score, label } */
export const GeminiLeadScoreSchema = z.object({
  score: z.number().min(0).max(100).default(0),
  label: z.string().max(100).default("none"),
});
export type GeminiLeadScore = z.infer<typeof GeminiLeadScoreSchema>;

/** Gemini post-call lesson extraction: { lesson } */
export const GeminiLessonSchema = z.object({
  lesson: z.string().max(2000),
});
export type GeminiLesson = z.infer<typeof GeminiLessonSchema>;

/** Gemini post-call follow-up task detection: { has_task, task_description, priority, target_channel } */
export const GeminiFollowupTaskSchema = z.object({
  has_task: z.boolean(),
  task_description: z.string().max(2000),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  target_channel: z.enum(["email", "manual", "sms"]).default("manual"),
});
export type GeminiFollowupTask = z.infer<typeof GeminiFollowupTaskSchema>;

/** Gemini email lead scoring: { score, label } — same shape as lead scoring */
export const GeminiEmailScoreSchema = GeminiLeadScoreSchema;
export type GeminiEmailScore = GeminiLeadScore;

/** Gemini agent extraction (from training text): { directives, knowledge, personality } */
export const GeminiAgentExtractionSchema = z.object({
  directives: z
    .array(
      z.object({ content: z.string().max(2000), priority: z.number().min(0).max(10).optional() }),
    )
    .default([]),
  knowledge: z.array(z.object({ content: z.string().max(4000) })).default([]),
  personality: z.string().max(2000).default(""),
});
export type GeminiAgentExtraction = z.infer<typeof GeminiAgentExtractionSchema>;

// ─── Assistants Task Schema ───────────────────────────────────────────────────────

const FLEET_TASK_PRIORITIES_VALUES = ["low", "medium", "high"] as const;
const FLEET_TASK_TARGET_CHANNELS = ["email", "manual", "phone", "sms"] as const;

/** POST /api/Assistants/tasks — validated body for creating a Assistants task. */
export const FollowUpTaskCreateSchema = z.object({
  description: z
    .string()
    .min(1, "description is required")
    .max(2000, "description must be 2000 characters or less"),
  task_type: z.string().max(80).optional().nullable(),
  priority: z.enum(FLEET_TASK_PRIORITIES_VALUES).default("medium"),
  source_type: z.string().max(80).optional().nullable(),
  source_id: z.string().max(200).optional().nullable(),
  target_channel: z.enum(FLEET_TASK_TARGET_CHANNELS).optional().nullable(),
  customer_info: z.string().max(500).optional().nullable(),
  agent_id: z.string().uuid("Invalid agent ID").optional().nullable(),
  due_date: z.string().max(40).optional().nullable(),
});
export type FollowUpTaskCreate = z.infer<typeof FollowUpTaskCreateSchema>;
