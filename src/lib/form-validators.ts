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

// Helper to validate and provide user-friendly error messages
export function parseFormData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
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
