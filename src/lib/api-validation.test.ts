import { describe, expect, it } from "vitest";
import {
  createCampaignSchema,
  directorMessageSchema,
  directorStreamMessageSchema,
  resetPasswordSchema,
} from "./api-validation";

describe("api validation", () => {
  it("accepts reset password with password", () => {
    const parsed = resetPasswordSchema.safeParse({ token: "tok", password: "Password1" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ token: "tok", password: "Password1" });
    }
  });

  it("accepts reset password with new_password alias", () => {
    const parsed = resetPasswordSchema.safeParse({ token: "tok", new_password: "Password1" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ token: "tok", password: "Password1" });
    }
  });
});

describe("director message schemas", () => {
  it("preserves modelSelection on stream requests", () => {
    const parsed = directorStreamMessageSchema.safeParse({
      content: "Design a one-page website for my HVAC company.",
      modelSelection: { provider: "wireline", tier: "sonnet" },
      skipOperatorPersist: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.modelSelection).toEqual({ provider: "wireline", tier: "sonnet" });
      expect(parsed.data.skipOperatorPersist).toBe(true);
    }
  });

  it("preserves modelSelection on non-stream director POST", () => {
    const parsed = directorMessageSchema.safeParse({
      content: "Hello",
      modelSelection: { provider: "openrouter", modelId: "openai/gpt-4o" },
      forceDeep: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.modelSelection).toEqual({
        provider: "openrouter",
        modelId: "openai/gpt-4o",
      });
      expect(parsed.data.forceDeep).toBe(true);
    }
  });
});

describe("createCampaignSchema call window validation", () => {
  it("accepts valid 24-hour HH:MM call window times", () => {
    const parsed = createCampaignSchema.safeParse({
      name: "Campaign",
      callWindowStart: "09:00",
      callWindowEnd: "17:30",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts boundary times 00:00 and 23:59", () => {
    const parsed = createCampaignSchema.safeParse({
      name: "Campaign",
      callWindowStart: "00:00",
      callWindowEnd: "23:59",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range HH:MM times that match the loose format", () => {
    for (const time of ["99:99", "24:00", "12:60", "45:67"]) {
      const parsed = createCampaignSchema.safeParse({ name: "Campaign", callWindowStart: time });
      expect(parsed.success, `expected ${time} to be rejected`).toBe(false);
    }
  });
});
