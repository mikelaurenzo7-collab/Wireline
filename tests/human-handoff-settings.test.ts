import { describe, expect, it } from "vitest";
import { AgentBusinessProfileSchema } from "../src/lib/form-validators";
import {
  handoffKeywords,
  humanHandoffProblem,
  normalizeHandoffPhone,
  readHumanHandoffProfile,
} from "../src/lib/human-handoff-settings";
import { createStudioSetupDrafts } from "../src/lib/studio-setup-drafts";

const values = { phone: "+13125550123", email: "owner@example.com", transfer: false, keywords: "" };

describe("human handoff settings", () => {
  it("normalizes complete destinations without silently discarding extensions or extra numbers", () => {
    expect(normalizeHandoffPhone("(312) 555-0123")).toBe("+13125550123");
    expect(normalizeHandoffPhone("1-312-555-0123")).toBe("+13125550123");
    expect(normalizeHandoffPhone("+44 20 7946 0123")).toBe("+442079460123");
    for (const phone of [
      "Call +13125550123",
      "+13125550123 ext 45",
      "+13125550123 +13125550124",
      "sip:test@example.com",
      "5550123",
    ])
      expect(normalizeHandoffPhone(phone)).toBeNull();
  });

  it("requires a destination for live transfer and rejects a loop after normalization", () => {
    expect(humanHandoffProblem({ ...values, phone: "", transfer: true })).toMatch(
      /Add a phone number/,
    );
    expect(humanHandoffProblem({ ...values, transfer: true }, ["(312) 555-0123"])).toMatch(
      /own line/,
    );
    expect(humanHandoffProblem({ ...values, phone: "", email: "", transfer: false })).toBeNull();
    expect(humanHandoffProblem({ ...values, transfer: true }, ["+13125550124"])).toBeNull();
  });

  it("supports explicit clearing without treating omitted routing as a reset", () => {
    expect(
      AgentBusinessProfileSchema.parse({
        escalation_phone: null,
        escalation_email: null,
        escalation_handoff_enabled: false,
      }),
    ).toEqual({
      escalation_phone: null,
      escalation_email: null,
      escalation_handoff_enabled: false,
    });
    expect(AgentBusinessProfileSchema.parse({ timezone: "America/Chicago" })).not.toHaveProperty(
      "escalation_handoff_enabled",
    );
    expect(AgentBusinessProfileSchema.safeParse({ escalation_email: "bad-email" }).success).toBe(
      false,
    );
  });

  it("requires a full server receipt and presents an existing legacy transfer destination", () => {
    const profile = {
      escalation_phone: null,
      transfer_phone: "+13125550123",
      escalation_email: null,
      escalation_handoff_enabled: true,
      escalation_keywords: ["manager"],
    };
    expect(readHumanHandoffProfile(profile)).toEqual({
      phone: "+13125550123",
      email: "",
      transfer: true,
      keywords: "manager",
    });
    expect(readHumanHandoffProfile({})).toBeNull();
    expect(readHumanHandoffProfile({ ...profile, escalation_keywords: "manager" })).toBeNull();
    expect(readHumanHandoffProfile({ ...profile, escalation_handoff_enabled: "false" })).toBeNull();
  });

  it("keeps drafts scoped to the authenticated Studio session and retains unsaved routing", () => {
    const owner = createStudioSetupDrafts("owner");
    owner.handoffDrafts.set("bot-1", {
      saved: values,
      values: { ...values, phone: "+13125550124" },
      saving: false,
    });
    expect(owner.isRetained("bot-1")).toBe(true);
    expect(createStudioSetupDrafts("other").handoffDrafts.size).toBe(0);
    owner.forget("bot-1");
    expect(owner.handoffDrafts.size).toBe(0);
  });

  it("bounds and deduplicates escalation triggers", () => {
    expect(handoffKeywords("manager, urgent\nmanager\n")).toEqual(["manager", "urgent"]);
    expect(humanHandoffProblem({ ...values, keywords: "a".repeat(121) })).toMatch(/120/);
    expect(
      humanHandoffProblem({
        ...values,
        keywords: Array.from({ length: 25 }, (_, i) => `trigger-${i}`).join(","),
      }),
    ).toMatch(/24/);
  });
});
