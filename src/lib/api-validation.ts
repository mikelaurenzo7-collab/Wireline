import { z } from "zod";

import {
  createSubscriptionSchema as baseCreateSubscriptionSchema,
  signupSchema as baseSignupSchema,
} from "./api-validation-base";

export * from "./api-validation-base";

/** Founder catalog extension: preserve the complete shared validator and add Starter only. */
export const signupSchema = baseSignupSchema.extend({
  preferredPlanId: z.enum(["personal", "starter", "team", "business", "enterprise"]).optional(),
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

export const createSubscriptionSchema = baseCreateSubscriptionSchema.extend({
  planId: z.enum(["starter", "team", "business", "enterprise"]),
});
