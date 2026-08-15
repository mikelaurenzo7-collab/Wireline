import { z } from "zod";

import {
  createSubscriptionSchema as baseCreateSubscriptionSchema,
  passwordSchema as basePasswordSchema,
  signupSchema as baseSignupSchema,
} from "./api-validation-base";
import { MAX_PASSWORD_BYTES, passwordFitsByteLimit } from "./password-limits";

export * from "./api-validation-base";

const boundedPasswordSchema = basePasswordSchema.refine(passwordFitsByteLimit, {
  message: `Password must be ${MAX_PASSWORD_BYTES} UTF-8 bytes or fewer`,
});
const boundedSigninPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .refine(passwordFitsByteLimit, {
    message: `Password must be ${MAX_PASSWORD_BYTES} UTF-8 bytes or fewer`,
  });

// Old signup bundles and campaign links may still submit the retired $159
// identifier. Keep account creation forward-compatible by translating that
// acquisition intent to Pro; the legacy entitlement resolver remains separate
// in plan-catalog and checkout still returns its explicit 410 retirement body.
const publicSignupPlanIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    return ["enterprise", "scale", "custom"].includes(normalized) ? "business" : normalized;
  },
  z.enum(["personal", "starter", "team", "business"]),
);

export const signinSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .transform((value) => value.toLowerCase().trim()),
  password: boundedSigninPasswordSchema,
});

/** Founder catalog extension plus a hard byte bound before any scrypt work. */
export const signupSchema = baseSignupSchema.extend({
  password: boundedPasswordSchema,
  preferredPlanId: publicSignupPlanIdSchema.optional(),
  preferredBillingInterval: z.enum(["month", "year"]).optional(),
});

export const signupIntentSchema = signupSchema
  .pick({
    preferredPlanId: true,
    preferredBillingInterval: true,
    signupWedge: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
  })
  .refine(
    (value) =>
      Boolean(
        value.preferredPlanId ||
        value.preferredBillingInterval ||
        value.signupWedge ||
        value.utmSource ||
        value.utmMedium ||
        value.utmCampaign,
      ),
    "At least one signup-intent field is required",
  );

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: boundedPasswordSchema.optional(),
    new_password: boundedPasswordSchema.optional(),
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

export const createSubscriptionSchema = baseCreateSubscriptionSchema.extend({
  planId: z.enum(["starter", "team", "business"]),
});
