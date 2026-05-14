import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  voice_id: z.string().optional(),
  archetype: z.string().default("Receptionist"),
  channel: z.enum(["voice", "email", "omnichannel"]).default("voice"),
});

export const SettingsSchema = z.object({
  vapi_phone_number_id: z.string().optional(),
  vapi_phone_inbound_agent_id: z.string().optional(),
  subscription_status: z.enum(["active", "past_due"]).default("active"),
  max_agents: z.number().default(3),
  voice_llm_provider: z.string().default("google"),
  voice_llm_model: z.string().default("gemini-1.5-flash"),
  brand_name: z.string().optional(),
  brand_logo_url: z.string().optional(),
  primary_color: z.string().default("#0AC8D4"),
});

export const PhoneNumberSchema = z.object({
  id: z.union([z.string(), z.number()]),
  phone_number: z.string(),
  vapi_number_id: z.string().optional(),
  agent_id: z.string().optional().nullable(),
});

export const TeamMemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]),
  user_id: z.string().nullable(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type PhoneNumber = z.infer<typeof PhoneNumberSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
