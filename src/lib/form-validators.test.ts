import { describe, expect, it } from "vitest";
import {
  SignInFormSchema,
  SignUpFormSchema,
  parseFormData,
  GeminiLeadScoreSchema,
  GeminiLessonSchema,
  GeminiFollowupTaskSchema,
  GeminiAgentExtractionSchema,
  BusinessHoursSchema,
  CampaignCreateSchema,
  CampaignUpdateSchema,
} from "./form-validators";

describe("SignInFormSchema", () => {
  it("accepts a valid email + password", () => {
    const r = SignInFormSchema.safeParse({ email: "user@example.com", password: "pw" });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = SignInFormSchema.safeParse({ email: "not-an-email", password: "pw" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const r = SignInFormSchema.safeParse({ email: "user@example.com", password: "" });
    expect(r.success).toBe(false);
  });
});

describe("SignUpFormSchema", () => {
  const good = {
    email: "user@example.com",
    password: "GoodPass1",
    confirmPassword: "GoodPass1",
  };

  it("accepts a strong matching password", () => {
    const r = SignUpFormSchema.safeParse(good);
    expect(r.success).toBe(true);
  });

  it("requires ≥8 chars", () => {
    const r = SignUpFormSchema.safeParse({ ...good, password: "Aa1", confirmPassword: "Aa1" });
    expect(r.success).toBe(false);
  });

  it("requires an uppercase letter", () => {
    const r = SignUpFormSchema.safeParse({
      ...good,
      password: "lowercase1",
      confirmPassword: "lowercase1",
    });
    expect(r.success).toBe(false);
  });

  it("requires a digit", () => {
    const r = SignUpFormSchema.safeParse({
      ...good,
      password: "NoDigitsHere",
      confirmPassword: "NoDigitsHere",
    });
    expect(r.success).toBe(false);
  });

  it("rejects mismatched confirmPassword", () => {
    const r = SignUpFormSchema.safeParse({ ...good, confirmPassword: "Different1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      // The mismatch error must be attached to the confirmPassword path so
      // the form surfaces it under the right field.
      expect(r.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
});

describe("parseFormData", () => {
  it("returns success + data on a valid payload", () => {
    const r = parseFormData(SignInFormSchema, {
      email: "user@example.com",
      password: "pw",
    });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("user@example.com");
  });

  it("returns success: false with field-keyed errors on invalid input", () => {
    const r = parseFormData(SignInFormSchema, { email: "bad", password: "" });
    expect(r.success).toBe(false);
    expect(r.errors).toBeDefined();
    expect(r.errors?.email).toBeTypeOf("string");
    expect(r.errors?.password).toBeTypeOf("string");
  });

  it("falls back to a generic 'form' error key when something non-Zod throws", () => {
    const throwingSchema = {
      parse: () => {
        throw new Error("boom");
      },
      // The narrowing in parseFormData only checks `instanceof z.ZodError`,
      // so any other Error path lands in the generic branch.
    } as unknown as Parameters<typeof parseFormData>[0];

    const r = parseFormData(throwingSchema, {});
    expect(r.success).toBe(false);
    expect(r.errors?.form).toBeTypeOf("string");
  });
});

describe("Gemini LLM response schemas", () => {
  it("GeminiLeadScoreSchema fills in defaults for empty objects", () => {
    const r = GeminiLeadScoreSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.score).toBe(0);
      expect(r.data.label).toBe("none");
    }
  });

  it("GeminiLeadScoreSchema clamps reject scores outside 0..100", () => {
    expect(GeminiLeadScoreSchema.safeParse({ score: -1, label: "a" }).success).toBe(false);
    expect(GeminiLeadScoreSchema.safeParse({ score: 101, label: "a" }).success).toBe(false);
    expect(GeminiLeadScoreSchema.safeParse({ score: 50, label: "a" }).success).toBe(true);
  });

  it("GeminiLessonSchema rejects non-string and over-length lessons", () => {
    expect(GeminiLessonSchema.safeParse({ lesson: 123 }).success).toBe(false);
    expect(GeminiLessonSchema.safeParse({ lesson: "x".repeat(2001) }).success).toBe(false);
    expect(GeminiLessonSchema.safeParse({ lesson: "ok" }).success).toBe(true);
  });

  it("GeminiFollowupTaskSchema enforces enum values and supplies defaults", () => {
    const r = GeminiFollowupTaskSchema.safeParse({
      has_task: true,
      task_description: "Call back tomorrow",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe("medium");
      expect(r.data.target_channel).toBe("manual");
    }

    const bad = GeminiFollowupTaskSchema.safeParse({
      has_task: true,
      task_description: "x",
      priority: "urgent", // not in enum
    });
    expect(bad.success).toBe(false);
  });

  it("GeminiAgentExtractionSchema accepts a fully empty payload via defaults", () => {
    const r = GeminiAgentExtractionSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.directives).toEqual([]);
      expect(r.data.knowledge).toEqual([]);
      expect(r.data.personality).toBe("");
    }
  });

  it("GeminiAgentExtractionSchema rejects malformed directive entries", () => {
    const r = GeminiAgentExtractionSchema.safeParse({
      directives: [{ priority: 5 }], // missing required `content`
    });
    expect(r.success).toBe(false);
  });
});

describe("HH:MM time validation", () => {
  // Business hours accept an optional leading zero on the hour ("9:00").
  it("BusinessHoursSchema accepts valid 24-hour times", () => {
    for (const t of ["00:00", "9:00", "09:30", "13:45", "23:59"]) {
      const r = BusinessHoursSchema.safeParse({ mon: { open: t, close: "17:00" } });
      expect(r.success, `expected ${t} to be valid`).toBe(true);
    }
  });

  it("BusinessHoursSchema rejects out-of-range times", () => {
    for (const t of ["24:00", "25:30", "9:70", "12:99", "99:99", "1:5", "abc"]) {
      const r = BusinessHoursSchema.safeParse({ mon: { open: t, close: "17:00" } });
      expect(r.success, `expected ${t} to be rejected`).toBe(false);
    }
  });

  // Campaign call windows require a zero-padded two-digit hour.
  it("CampaignCreateSchema accepts valid call window times", () => {
    const r = CampaignCreateSchema.safeParse({
      name: "Q3 push",
      call_window_start: "09:00",
      call_window_end: "17:30",
    });
    expect(r.success).toBe(true);
  });

  it("CampaignCreateSchema rejects invalid call window times", () => {
    for (const t of ["25:70", "24:00", "9:00", "08:60", "1234"]) {
      const r = CampaignCreateSchema.safeParse({ name: "x", call_window_start: t });
      expect(r.success, `expected ${t} to be rejected`).toBe(false);
    }
  });

  it("CampaignUpdateSchema rejects invalid call window times", () => {
    const r = CampaignUpdateSchema.safeParse({ call_window_end: "29:99" });
    expect(r.success).toBe(false);
  });
});
