// Schema validation tests — every endpoint that accepts user input flows
// through these schemas, so a regression here is a security regression.

import { describe, it, expect } from "vitest";
import {
  SignInFormSchema,
  SignUpFormSchema,
  ResetPasswordFormSchema,
  AgentFormSchema,
  DirectiveSchema,
  KnowledgeSchema,
  CampaignCreateSchema,
  CampaignUpdateSchema,
  EmailReplySchema,
  EmailDraftSchema,
  OutboundLeadSchema,
  OutboundBulkSchema,
  AppointmentSchema,
  AgentBusinessProfileSchema,
  BusinessHoursSchema,
  GeminiLeadScoreSchema,
  GeminiLessonSchema,
  GeminiFollowupTaskSchema,
  GeminiEmailScoreSchema,
  GeminiAgentExtractionSchema,
  FleetTaskCreateSchema,
  BusinessVariablesSchema,
  parseFormData,
} from "./form-validators";

describe("SignInFormSchema", () => {
  it("accepts a valid email + password", () => {
    const r = SignInFormSchema.safeParse({ email: "user@example.com", password: "abc123" });
    expect(r.success).toBe(true);
  });

  it("rejects malformed emails", () => {
    const r = SignInFormSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects missing password", () => {
    const r = SignInFormSchema.safeParse({ email: "u@example.com", password: "" });
    expect(r.success).toBe(false);
  });
});

describe("SignUpFormSchema", () => {
  it("requires uppercase letter, number, and 8+ chars", () => {
    const ok = SignUpFormSchema.safeParse({
      email: "u@example.com",
      password: "Abcd1234",
      confirmPassword: "Abcd1234",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects passwords without an uppercase letter", () => {
    const r = SignUpFormSchema.safeParse({
      email: "u@example.com",
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects passwords without a digit", () => {
    const r = SignUpFormSchema.safeParse({
      email: "u@example.com",
      password: "Abcdefgh",
      confirmPassword: "Abcdefgh",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when confirmPassword doesn't match", () => {
    const r = SignUpFormSchema.safeParse({
      email: "u@example.com",
      password: "Abcd1234",
      confirmPassword: "Wxyz9999",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes("confirmPassword"));
      expect(issue).toBeDefined();
    }
  });

  it("rejects passwords shorter than 8 characters", () => {
    const r = SignUpFormSchema.safeParse({
      email: "u@example.com",
      password: "Ab1",
      confirmPassword: "Ab1",
    });
    expect(r.success).toBe(false);
  });
});

describe("ResetPasswordFormSchema", () => {
  it("accepts valid email", () => {
    expect(ResetPasswordFormSchema.safeParse({ email: "u@example.com" }).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(ResetPasswordFormSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("AgentFormSchema", () => {
  it("accepts a minimal valid agent", () => {
    expect(AgentFormSchema.safeParse({ name: "Sales Bot" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(AgentFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects names exceeding 100 chars", () => {
    expect(AgentFormSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects role exceeding 500 chars", () => {
    const r = AgentFormSchema.safeParse({ name: "ok", role: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("rejects personality exceeding 2000 chars", () => {
    const r = AgentFormSchema.safeParse({ name: "ok", personality: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });
});

describe("DirectiveSchema", () => {
  it("accepts content within bounds", () => {
    expect(DirectiveSchema.safeParse({ content: "Always be polite." }).success).toBe(true);
  });

  it("rejects empty content", () => {
    expect(DirectiveSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("rejects content over 1000 chars", () => {
    expect(DirectiveSchema.safeParse({ content: "x".repeat(1001) }).success).toBe(false);
  });

  it("accepts optional id", () => {
    expect(DirectiveSchema.safeParse({ id: "abc", content: "ok" }).success).toBe(true);
  });
});

describe("KnowledgeSchema", () => {
  it("accepts content within 2000 chars", () => {
    expect(KnowledgeSchema.safeParse({ content: "Pricing is $99/mo" }).success).toBe(true);
  });

  it("rejects empty content", () => {
    expect(KnowledgeSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("rejects content over 2000 chars", () => {
    expect(KnowledgeSchema.safeParse({ content: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("CampaignCreateSchema", () => {
  it("accepts minimal valid campaign", () => {
    expect(CampaignCreateSchema.safeParse({ name: "Q1 Outbound" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CampaignCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects malformed UUID for agent_id", () => {
    expect(
      CampaignCreateSchema.safeParse({ name: "ok", agent_id: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("accepts a valid UUID for agent_id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(CampaignCreateSchema.safeParse({ name: "ok", agent_id: id }).success).toBe(true);
  });

  it("requires HH:MM time format for call window", () => {
    expect(
      CampaignCreateSchema.safeParse({ name: "ok", call_window_start: "9am" }).success,
    ).toBe(false);
    expect(
      CampaignCreateSchema.safeParse({ name: "ok", call_window_start: "09:00" }).success,
    ).toBe(true);
  });

  it("rejects negative max_attempts", () => {
    expect(CampaignCreateSchema.safeParse({ name: "ok", max_attempts: -1 }).success).toBe(false);
  });

  it("rejects non-integer max_attempts", () => {
    expect(CampaignCreateSchema.safeParse({ name: "ok", max_attempts: 1.5 }).success).toBe(false);
  });
});

describe("CampaignUpdateSchema", () => {
  it("accepts a valid status transition", () => {
    expect(CampaignUpdateSchema.safeParse({ status: "active" }).success).toBe(true);
  });

  it("rejects unknown status values", () => {
    expect(CampaignUpdateSchema.safeParse({ status: "blasting" }).success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(CampaignUpdateSchema.safeParse({ malicious_field: "drop tables" }).success).toBe(false);
  });

  it("allows partial updates with only one field", () => {
    expect(CampaignUpdateSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });
});

describe("EmailReplySchema", () => {
  it("accepts valid body", () => {
    expect(EmailReplySchema.safeParse({ body: "Thanks!" }).success).toBe(true);
  });

  it("rejects empty body", () => {
    expect(EmailReplySchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects body over 5000 chars", () => {
    expect(EmailReplySchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("EmailDraftSchema", () => {
  it("accepts valid draft input", () => {
    const r = EmailDraftSchema.safeParse({
      subject: "Demo follow-up",
      messages: [{ role: "user", content: "Looking forward to it" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty subject", () => {
    const r = EmailDraftSchema.safeParse({
      subject: "",
      messages: [{ role: "user", content: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty messages array", () => {
    const r = EmailDraftSchema.safeParse({ subject: "x", messages: [] });
    expect(r.success).toBe(false);
  });

  it("rejects unknown message role", () => {
    const r = EmailDraftSchema.safeParse({
      subject: "x",
      messages: [{ role: "system", content: "x" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("OutboundLeadSchema", () => {
  it("accepts a minimal lead with just a phone number", () => {
    expect(OutboundLeadSchema.safeParse({ phone_number: "+15551234567" }).success).toBe(true);
  });

  it("rejects empty phone number", () => {
    expect(OutboundLeadSchema.safeParse({ phone_number: "" }).success).toBe(false);
  });

  it("rejects phone numbers with letters or invalid characters", () => {
    expect(OutboundLeadSchema.safeParse({ phone_number: "555-CALL-ME" }).success).toBe(false);
  });

  it("accepts E.164 with formatting punctuation", () => {
    expect(OutboundLeadSchema.safeParse({ phone_number: "+1 (555) 123-4567" }).success).toBe(true);
  });

  it("rejects malformed email when present", () => {
    expect(
      OutboundLeadSchema.safeParse({ phone_number: "555-1212", email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("passes through extra CRM fields (passthrough mode)", () => {
    const r = OutboundLeadSchema.safeParse({
      phone_number: "+15551212",
      crm_external_id: "abc-123",
      lifetime_value_usd: 4500,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).crm_external_id).toBe("abc-123");
    }
  });

  it("caps notes at 2000 chars", () => {
    expect(
      OutboundLeadSchema.safeParse({ phone_number: "+15551212", notes: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("OutboundBulkSchema", () => {
  const lead = { phone_number: "+15551212" };

  it("accepts a small batch", () => {
    expect(OutboundBulkSchema.safeParse({ leads: [lead, lead] }).success).toBe(true);
  });

  it("rejects an empty batch", () => {
    expect(OutboundBulkSchema.safeParse({ leads: [] }).success).toBe(false);
  });

  it("caps batch size at 5000 leads to prevent megabatch DOS", () => {
    const big = Array(5001).fill(lead);
    expect(OutboundBulkSchema.safeParse({ leads: big }).success).toBe(false);
  });

  it("accepts exactly 5000 leads (boundary)", () => {
    const max = Array(5000).fill(lead);
    expect(OutboundBulkSchema.safeParse({ leads: max }).success).toBe(true);
  });

  it("validates campaign_id as UUID when provided", () => {
    expect(
      OutboundBulkSchema.safeParse({ leads: [lead], campaign_id: "not-uuid" }).success,
    ).toBe(false);
    expect(
      OutboundBulkSchema.safeParse({
        leads: [lead],
        campaign_id: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
  });

  it("rejects when any lead in the batch is malformed", () => {
    const r = OutboundBulkSchema.safeParse({
      leads: [lead, { phone_number: "" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("AppointmentSchema", () => {
  it("accepts minimal valid appointment", () => {
    expect(
      AppointmentSchema.safeParse({
        customer_name: "Acme Corp",
        date: "2026-05-10",
        time: "14:00",
      }).success,
    ).toBe(true);
  });

  it("rejects missing customer_name", () => {
    expect(
      AppointmentSchema.safeParse({ customer_name: "", date: "2026-05-10", time: "14:00" }).success,
    ).toBe(false);
  });

  it("rejects missing date", () => {
    expect(
      AppointmentSchema.safeParse({ customer_name: "x", date: "", time: "14:00" }).success,
    ).toBe(false);
  });

  it("rejects missing time", () => {
    expect(
      AppointmentSchema.safeParse({ customer_name: "x", date: "2026-05-10", time: "" }).success,
    ).toBe(false);
  });

  it("validates agent_id as UUID when provided", () => {
    expect(
      AppointmentSchema.safeParse({
        customer_name: "x",
        date: "d",
        time: "t",
        agent_id: "not-uuid",
      }).success,
    ).toBe(false);
  });
});

describe("parseFormData helper", () => {
  it("returns success: true with parsed data on valid input", () => {
    const r = parseFormData(AgentFormSchema, { name: "ok" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("ok");
  });

  it("flattens validation errors into a path-keyed map", () => {
    const r = parseFormData(SignUpFormSchema, {
      email: "not-email",
      password: "short",
      confirmPassword: "different",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors).toHaveProperty("email");
      expect(r.errors).toHaveProperty("password");
    }
  });

  it("returns generic 'form' error key for non-Zod errors", () => {
    // Schema with custom transform that throws
    const brokenSchema = {
      parse: () => {
        throw new Error("Boom");
      },
    } as any;
    const r = parseFormData(brokenSchema, {});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.form).toBeDefined();
  });

  it("nested path errors get joined with '.'", () => {
    const r = parseFormData(EmailDraftSchema, {
      subject: "ok",
      messages: [{ role: "invalid_role", content: "x" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const keys = Object.keys(r.errors);
      // Path includes index + field — e.g. "messages.0.role"
      expect(keys.some((k) => k.includes("messages") && k.includes("role"))).toBe(true);
    }
  });
});

describe("BusinessHoursSchema", () => {
  it("accepts a typical M-F 9-5 schedule", () => {
    expect(BusinessHoursSchema.safeParse({
      mon: { open: "09:00", close: "17:00" },
      tue: { open: "09:00", close: "17:00" },
      wed: { open: "09:00", close: "17:00" },
      thu: { open: "09:00", close: "17:00" },
      fri: { open: "09:00", close: "17:00" },
      sat: { closed: true },
      sun: { closed: true },
    }).success).toBe(true);
  });

  it("accepts partial schedules (only the days that matter)", () => {
    expect(BusinessHoursSchema.safeParse({ thu: { open: "10:00", close: "14:00" } }).success).toBe(true);
  });

  it("accepts an overnight window (close < open)", () => {
    expect(BusinessHoursSchema.safeParse({ fri: { open: "22:00", close: "06:00" } }).success).toBe(true);
  });

  it("rejects a non-HH:MM time string", () => {
    expect(BusinessHoursSchema.safeParse({ mon: { open: "9am", close: "5pm" } }).success).toBe(false);
  });

  it("rejects unknown day keys (strict)", () => {
    expect(BusinessHoursSchema.safeParse({ funday: { open: "09:00", close: "17:00" } } as any).success).toBe(false);
  });
});

describe("BusinessVariablesSchema", () => {
  it("accepts simple identifier keys + string/number values", () => {
    expect(BusinessVariablesSchema.safeParse({
      business_name: "Acme",
      max_seats: 50,
      website: "https://acme.test",
    }).success).toBe(true);
  });

  it("rejects keys starting with a digit", () => {
    expect(BusinessVariablesSchema.safeParse({ "1bad": "x" }).success).toBe(false);
  });

  it("rejects values longer than 500 chars", () => {
    expect(BusinessVariablesSchema.safeParse({ blob: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects more than 32 variables", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 33; i++) big[`v${i}`] = "x";
    expect(BusinessVariablesSchema.safeParse(big).success).toBe(false);
  });

  it("accepts up to 32 variables (boundary)", () => {
    const ok: Record<string, string> = {};
    for (let i = 0; i < 32; i++) ok[`v${i}`] = "x";
    expect(BusinessVariablesSchema.safeParse(ok).success).toBe(true);
  });
});

describe("AgentBusinessProfileSchema", () => {
  it("accepts a fully-populated profile", () => {
    const r = AgentBusinessProfileSchema.safeParse({
      business_hours: { mon: { open: "09:00", close: "17:00" }, sat: { closed: true } },
      timezone: "America/New_York",
      compliance_mode: "hipaa",
      disallowed_topics: ["medical advice", "legal opinions"],
      escalation_keywords: ["lawsuit", "speak to a manager"],
      business_variables: { business_name: "Acme Pharmacy" },
      out_of_hours_message: "Thanks for calling — we'll be back at 9am.",
      kpi_focus: "satisfaction",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty profile (all fields optional)", () => {
    expect(AgentBusinessProfileSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown compliance modes", () => {
    expect(AgentBusinessProfileSchema.safeParse({ compliance_mode: "sox" }).success).toBe(false);
  });

  it("rejects unknown kpi focus values", () => {
    expect(AgentBusinessProfileSchema.safeParse({ kpi_focus: "vibes" }).success).toBe(false);
  });

  it("caps disallowed_topics at 24", () => {
    const big = Array(25).fill("topic");
    expect(AgentBusinessProfileSchema.safeParse({ disallowed_topics: big }).success).toBe(false);
  });

  it("caps escalation_keywords at 24", () => {
    const big = Array(25).fill("trigger");
    expect(AgentBusinessProfileSchema.safeParse({ escalation_keywords: big }).success).toBe(false);
  });

  it("caps out_of_hours_message at 500 chars", () => {
    expect(AgentBusinessProfileSchema.safeParse({ out_of_hours_message: "x".repeat(501) }).success).toBe(false);
  });

  it("strict mode rejects unknown top-level keys", () => {
    expect(AgentBusinessProfileSchema.safeParse({ some_random_key: "x" } as any).success).toBe(false);
  });

  it("allows out_of_hours_message to be explicitly null (clearing the value)", () => {
    expect(AgentBusinessProfileSchema.safeParse({ out_of_hours_message: null }).success).toBe(true);
  });
});

// ─── LLM Response Schemas ────────────────────────────────────────────────────

describe("GeminiLeadScoreSchema", () => {
  it("accepts a valid score and label", () => {
    const r = GeminiLeadScoreSchema.safeParse({ score: 75, label: "high" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.score).toBe(75); expect(r.data.label).toBe("high"); }
  });

  it("clamps missing fields to defaults (score=0, label='none')", () => {
    const r = GeminiLeadScoreSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.score).toBe(0); expect(r.data.label).toBe("none"); }
  });

  it("rejects score above 100", () => {
    expect(GeminiLeadScoreSchema.safeParse({ score: 150 }).success).toBe(false);
  });

  it("rejects score below 0", () => {
    expect(GeminiLeadScoreSchema.safeParse({ score: -1 }).success).toBe(false);
  });

  it("rejects non-numeric score", () => {
    expect(GeminiLeadScoreSchema.safeParse({ score: "high", label: "high" }).success).toBe(false);
  });

  it("rejects label exceeding 100 chars", () => {
    expect(GeminiLeadScoreSchema.safeParse({ score: 50, label: "x".repeat(101) }).success).toBe(false);
  });
});

describe("GeminiLessonSchema", () => {
  it("accepts a valid lesson string", () => {
    const r = GeminiLessonSchema.safeParse({ lesson: "Always confirm the customer's name." });
    expect(r.success).toBe(true);
  });

  it("rejects missing lesson", () => {
    expect(GeminiLessonSchema.safeParse({}).success).toBe(false);
  });

  it("rejects lesson exceeding 2000 chars", () => {
    expect(GeminiLessonSchema.safeParse({ lesson: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("GeminiFollowupTaskSchema", () => {
  it("accepts a valid follow-up task", () => {
    const r = GeminiFollowupTaskSchema.safeParse({
      has_task: true,
      task_description: "Send price quote via email",
      priority: "high",
      target_channel: "email",
    });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.has_task).toBe(true); }
  });

  it("defaults priority to 'medium' when missing", () => {
    const r = GeminiFollowupTaskSchema.safeParse({ has_task: false, task_description: "n/a" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.priority).toBe("medium"); }
  });

  it("defaults target_channel to 'manual' when missing", () => {
    const r = GeminiFollowupTaskSchema.safeParse({ has_task: false, task_description: "n/a" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.target_channel).toBe("manual"); }
  });

  it("rejects invalid priority value", () => {
    expect(GeminiFollowupTaskSchema.safeParse({ has_task: false, task_description: "x", priority: "urgent" }).success).toBe(false);
  });

  it("rejects invalid target_channel value", () => {
    expect(GeminiFollowupTaskSchema.safeParse({ has_task: false, task_description: "x", target_channel: "fax" }).success).toBe(false);
  });

  it("rejects task_description exceeding 2000 chars", () => {
    expect(GeminiFollowupTaskSchema.safeParse({ has_task: true, task_description: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("GeminiAgentExtractionSchema", () => {
  it("accepts a full valid extraction response", () => {
    const r = GeminiAgentExtractionSchema.safeParse({
      directives: [{ content: "Always greet the customer", priority: 5 }],
      knowledge: [{ content: "Office hours: 9am-5pm" }],
      personality: "Professional and friendly",
    });
    expect(r.success).toBe(true);
  });

  it("defaults all arrays and string when fields are missing", () => {
    const r = GeminiAgentExtractionSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.directives).toEqual([]);
      expect(r.data.knowledge).toEqual([]);
      expect(r.data.personality).toBe("");
    }
  });

  it("rejects directive content exceeding 2000 chars", () => {
    expect(GeminiAgentExtractionSchema.safeParse({ directives: [{ content: "x".repeat(2001) }] }).success).toBe(false);
  });

  it("rejects knowledge content exceeding 4000 chars", () => {
    expect(GeminiAgentExtractionSchema.safeParse({ knowledge: [{ content: "x".repeat(4001) }] }).success).toBe(false);
  });
});

describe("GeminiEmailScoreSchema (alias of GeminiLeadScoreSchema)", () => {
  it("accepts valid email score shape", () => {
    const r = GeminiEmailScoreSchema.safeParse({ score: 42, label: "medium" });
    expect(r.success).toBe(true);
  });

  it("defaults missing fields", () => {
    const r = GeminiEmailScoreSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.score).toBe(0); expect(r.data.label).toBe("none"); }
  });
});

// ─── FleetTaskCreateSchema ────────────────────────────────────────────────────

describe("FleetTaskCreateSchema", () => {
  it("accepts a minimal valid task", () => {
    const r = FleetTaskCreateSchema.safeParse({ description: "Follow up with customer" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.priority).toBe("medium"); }
  });

  it("accepts a full valid task", () => {
    const r = FleetTaskCreateSchema.safeParse({
      description: "Send price quote",
      task_type: "action_required",
      priority: "high",
      target_channel: "email",
      agent_id: "12345678-1234-4234-a234-123456789012",
      source_type: "phone_call",
      source_id: "call-123",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing description", () => {
    expect(FleetTaskCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty description", () => {
    expect(FleetTaskCreateSchema.safeParse({ description: "" }).success).toBe(false);
  });

  it("rejects description exceeding 2000 chars", () => {
    expect(FleetTaskCreateSchema.safeParse({ description: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects invalid priority", () => {
    expect(FleetTaskCreateSchema.safeParse({ description: "task", priority: "critical" }).success).toBe(false);
  });

  it("rejects invalid target_channel", () => {
    expect(FleetTaskCreateSchema.safeParse({ description: "task", target_channel: "fax" }).success).toBe(false);
  });

  it("rejects malformed agent_id UUID", () => {
    expect(FleetTaskCreateSchema.safeParse({ description: "task", agent_id: "not-a-uuid" }).success).toBe(false);
  });

  it("allows nullable optional fields", () => {
    const r = FleetTaskCreateSchema.safeParse({ description: "task", agent_id: null, source_id: null });
    expect(r.success).toBe(true);
  });
});
