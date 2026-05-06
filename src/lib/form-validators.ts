import { z } from 'zod';

// Auth form — sign in and sign up validation
export const SignInFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInForm = z.infer<typeof SignInFormSchema>;

export const SignUpFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type SignUpForm = z.infer<typeof SignUpFormSchema>;

export const ResetPasswordFormSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type ResetPasswordForm = z.infer<typeof ResetPasswordFormSchema>;

// Agent creation/update form
export const AgentFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  role: z.string().max(500, 'Role must be 500 characters or less').optional(),
  personality: z.string().max(2000, 'Personality must be 2000 characters or less').optional(),
});

export type AgentForm = z.infer<typeof AgentFormSchema>;

// Directive input validation
export const DirectiveSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, 'Directive cannot be empty').max(1000, 'Directive must be 1000 characters or less'),
});

export type Directive = z.infer<typeof DirectiveSchema>;

// Knowledge base entry
export const KnowledgeSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, 'Knowledge entry cannot be empty').max(2000, 'Entry must be 2000 characters or less'),
});

export type Knowledge = z.infer<typeof KnowledgeSchema>;

// Campaign creation validation
export const CampaignCreateSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200, 'Name must be 200 characters or less'),
  goal: z.string().max(1000, 'Goal must be 1000 characters or less').optional().nullable(),
  agent_id: z.string().uuid('Invalid agent ID').optional().nullable(),
  call_window_start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format').optional(),
  call_window_end: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format').optional(),
  max_attempts: z.number().int('Max attempts must be an integer').positive('Max attempts must be greater than 0').optional(),
});

export type Campaign = z.infer<typeof CampaignCreateSchema>;

// Campaign update validation (all fields optional)
export const CampaignUpdateSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200, 'Name must be 200 characters or less').optional(),
  goal: z.string().max(1000, 'Goal must be 1000 characters or less').optional().nullable(),
  agent_id: z.string().uuid('Invalid agent ID').optional().nullable(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'failed']).optional(),
  call_window_start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format').optional(),
  call_window_end: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format').optional(),
  max_attempts: z.number().int('Max attempts must be an integer').positive('Max attempts must be greater than 0').optional(),
}).strict();

export type CampaignUpdate = z.infer<typeof CampaignUpdateSchema>;

// Email reply validation
export const EmailReplySchema = z.object({
  body: z.string().min(1, 'Email body cannot be empty').max(5000, 'Email body must be 5000 characters or less'),
});

export type EmailReply = z.infer<typeof EmailReplySchema>;

// Email draft validation
export const EmailDraftSchema = z.object({
  subject: z.string().min(1, 'Subject cannot be empty').max(200, 'Subject must be 200 characters or less'),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).min(1, 'At least one message is required'),
  context: z.string().max(1000, 'Context must be 1000 characters or less').optional(),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

// Outbound lead — single contact submitted to /api/outbound/dial.
// Phone number format kept liberal (E.164 with optional formatting)
// because Vapi handles normalization downstream.
export const OutboundLeadSchema = z.object({
  phone_number: z
    .string()
    .min(7, 'Phone number is required')
    .max(32, 'Phone number must be 32 characters or less')
    .regex(/^[+\-()\s\d]+$/, 'Phone number contains invalid characters'),
  name: z.string().max(200, 'Name must be 200 characters or less').optional().nullable(),
  email: z.string().email('Invalid email address').optional().nullable(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  status: z.string().max(50, 'Status must be 50 characters or less').optional(),
}).passthrough(); // Allow extra fields (custom CRM data) to flow through

export type OutboundLead = z.infer<typeof OutboundLeadSchema>;

// Bulk outbound — capped at 5000 leads/request so a single accidental
// upload can't lock a database transaction or starve the dial queue.
export const OutboundBulkSchema = z.object({
  leads: z
    .array(OutboundLeadSchema)
    .min(1, 'At least one lead is required')
    .max(5000, 'Cannot submit more than 5000 leads per request'),
  campaign_id: z.string().uuid('Invalid campaign ID').optional().nullable(),
});

export type OutboundBulk = z.infer<typeof OutboundBulkSchema>;

// Appointment — created from voice/email triage flows.
export const AppointmentSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required').max(200, 'Customer name must be 200 characters or less'),
  date: z.string().min(1, 'Date is required').max(40, 'Date string is too long'),
  time: z.string().min(1, 'Time is required').max(40, 'Time string is too long'),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional().nullable(),
  agent_id: z.string().uuid('Invalid agent ID').optional().nullable(),
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
        const path = issue.path.join('.');
        errors[path] = issue.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { form: 'An unexpected error occurred' } };
  }
}
