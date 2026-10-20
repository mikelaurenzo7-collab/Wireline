import { z } from "zod";
import { OUTBOUND_REQUEST_ID_PATTERN } from "./outbound-dial-recovery";

export const callRequestKeySchema = z
  .string()
  .regex(OUTBOUND_REQUEST_ID_PATTERN, "Use a UUIDv4 call request key.")
  .transform((value) => value.toLowerCase());

export const prepareCallSchema = z
  .object({
    request_key: callRequestKeySchema,
    agent_id: z.string().min(1).max(200),
    phone: z.string().regex(/^\+1\d{10}$/, "Use a US phone number in E.164 format."),
    instruction: z.string().trim().min(1).max(2000),
    call_purpose: z.enum(["service_or_requested", "callback"]),
  })
  .strict();

export type PrepareCallInput = z.infer<typeof prepareCallSchema>;

export const preparedCallSchema = prepareCallSchema.extend({
  expires_at: z.string().datetime(),
});

export type PreparedCall = z.infer<typeof preparedCallSchema>;
