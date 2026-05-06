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
