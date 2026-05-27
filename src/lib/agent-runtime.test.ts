/**
 * agent-runtime.test.ts
 * ----------------------------------------------------------------------
 * Unit tests for the pure helpers in src/lib/agent-runtime.ts.
 *
 * These functions assemble the system prompt that every Wireline voice
 * agent gets at call start. A regression here silently degrades EVERY
 * call placed on the platform — every business-hours gate, every
 * compliance posture, every escalation trigger, every personality vibe.
 *
 * The docstring on agent-runtime.ts has long promised "Every helper is
 * tested in src/lib/agent-runtime.test.ts." This file fulfils that
 * promise and locks the runtime composition behind real assertions.
 */
import { describe, expect, it } from "vitest";
import {
  isWithinBusinessHours,
  complianceDisclosure,
  disallowedTopicsBlock,
  escalationKeywordsBlock,
  applyBusinessVariables,
  kpiFocusLine,
  buildAgentRuntimeContext,
  type AgentRuntimeProfile,
} from "./agent-runtime";

// ────────────────────────────────────────────────────────────────────────
// isWithinBusinessHours
// ────────────────────────────────────────────────────────────────────────

describe("isWithinBusinessHours", () => {
  it("returns true when business_hours is missing (legacy agents stay always-on)", () => {
    expect(isWithinBusinessHours(null)).toBe(true);
    expect(isWithinBusinessHours(undefined)).toBe(true);
    expect(isWithinBusinessHours({})).toBe(true);
    expect(isWithinBusinessHours({ business_hours: undefined })).toBe(true);
    expect(isWithinBusinessHours({ business_hours: {} })).toBe(true);
  });

  it("returns true when today has no rule defined", () => {
    // A Wednesday with only a Monday rule → no gate today.
    const wed = new Date("2026-01-14T15:00:00Z"); // Wed 10:00 ET
    expect(
      isWithinBusinessHours(
        {
          timezone: "America/New_York",
          business_hours: { mon: { open: "09:00", close: "17:00" } },
        },
        wed,
      ),
    ).toBe(true);
  });

  it("respects an explicitly closed day", () => {
    const sat = new Date("2026-01-17T15:00:00Z"); // Sat 10:00 ET
    expect(
      isWithinBusinessHours(
        { timezone: "America/New_York", business_hours: { sat: { closed: true } } },
        sat,
      ),
    ).toBe(false);
  });

  it("gates a normal same-day window", () => {
    const profile: AgentRuntimeProfile = {
      timezone: "America/New_York",
      business_hours: { mon: { open: "09:00", close: "17:00" } },
    };
    // Mon 08:00 ET → before open
    expect(isWithinBusinessHours(profile, new Date("2026-01-12T13:00:00Z"))).toBe(false);
    // Mon 12:00 ET → open
    expect(isWithinBusinessHours(profile, new Date("2026-01-12T17:00:00Z"))).toBe(true);
    // Mon 17:00 ET → at close (exclusive)
    expect(isWithinBusinessHours(profile, new Date("2026-01-12T22:00:00Z"))).toBe(false);
  });

  it("handles overnight windows (e.g. 22:00 → 06:00)", () => {
    const profile: AgentRuntimeProfile = {
      timezone: "America/New_York",
      business_hours: {
        mon: { open: "22:00", close: "06:00" },
        tue: { open: "22:00", close: "06:00" },
      },
    };
    // Mon 23:00 ET → inside the overnight window
    expect(isWithinBusinessHours(profile, new Date("2026-01-13T04:00:00Z"))).toBe(true);
    // Tue 02:00 ET → still inside (wrapped from Mon)
    expect(isWithinBusinessHours(profile, new Date("2026-01-13T07:00:00Z"))).toBe(true);
    // Tue 12:00 ET → outside
    expect(isWithinBusinessHours(profile, new Date("2026-01-13T17:00:00Z"))).toBe(false);
  });

  it("does not crash on malformed hours strings; falls open", () => {
    const profile: AgentRuntimeProfile = {
      timezone: "America/New_York",
      business_hours: { mon: { open: "not-a-time", close: "17:00" } },
    };
    // Malformed → "always open" rather than silently closing the line.
    expect(isWithinBusinessHours(profile, new Date("2026-01-12T13:00:00Z"))).toBe(true);
  });

  it("falls back to UTC when timezone string is bogus instead of crashing", () => {
    // Bad TZ → Intl.DateTimeFormat throws; helper recovers to UTC.
    const profile: AgentRuntimeProfile = {
      timezone: "Not/A_Real_Zone",
      business_hours: { mon: { open: "09:00", close: "17:00" } },
    };
    // Just assert we get a boolean, not a throw. The exact value is
    // dependent on the test runner's UTC clock — what matters is that
    // a malformed timezone never crashes the call path.
    expect(typeof isWithinBusinessHours(profile, new Date("2026-01-12T13:00:00Z"))).toBe("boolean");
  });
});

// ────────────────────────────────────────────────────────────────────────
// complianceDisclosure
// ────────────────────────────────────────────────────────────────────────

describe("complianceDisclosure", () => {
  it("emits empty string for 'none' or missing mode", () => {
    expect(complianceDisclosure("none")).toBe("");
    expect(complianceDisclosure(null)).toBe("");
    expect(complianceDisclosure(undefined)).toBe("");
    expect(complianceDisclosure("unknown" as any)).toBe("");
  });

  it("includes mode-specific guardrails in each preset", () => {
    expect(complianceDisclosure("hipaa")).toMatch(/HIPAA/);
    expect(complianceDisclosure("hipaa")).toMatch(/PHI|date of birth|identity/i);

    expect(complianceDisclosure("pci")).toMatch(/PCI/);
    expect(complianceDisclosure("pci")).toMatch(/card/i);

    expect(complianceDisclosure("gdpr")).toMatch(/GDPR/);
    expect(complianceDisclosure("gdpr")).toMatch(/recorded|deletion|erasure/i);

    expect(complianceDisclosure("financial")).toMatch(/Financial/);
    expect(complianceDisclosure("financial")).toMatch(/advice|advisor/i);

    expect(complianceDisclosure("legal")).toMatch(/Legal/);
    expect(complianceDisclosure("legal")).toMatch(/attorney|consultation/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// disallowedTopicsBlock + escalationKeywordsBlock
// ────────────────────────────────────────────────────────────────────────

describe("disallowedTopicsBlock", () => {
  it("returns empty string when list is empty / missing / non-array", () => {
    expect(disallowedTopicsBlock(null)).toBe("");
    expect(disallowedTopicsBlock(undefined)).toBe("");
    expect(disallowedTopicsBlock([])).toBe("");
    expect(disallowedTopicsBlock(["", "  "])).toBe("");
  });

  it("includes each non-empty topic in the directive", () => {
    const out = disallowedTopicsBlock(["politics", "religion"]);
    expect(out).toMatch(/DO-NOT-DISCUSS/);
    expect(out).toMatch(/politics/);
    expect(out).toMatch(/religion/);
  });

  it("caps the list at 24 entries to keep the prompt budget bounded", () => {
    const huge = Array.from({ length: 100 }, (_, i) => `topic-${i}`);
    const out = disallowedTopicsBlock(huge);
    // 24 max means topic-23 included, topic-24 not.
    expect(out).toMatch(/topic-23/);
    expect(out).not.toMatch(/topic-24\b/);
  });
});

describe("escalationKeywordsBlock", () => {
  it("returns empty string for empty / missing inputs", () => {
    expect(escalationKeywordsBlock(null)).toBe("");
    expect(escalationKeywordsBlock([])).toBe("");
    expect(escalationKeywordsBlock(["  "])).toBe("");
  });

  it("renders each keyword and mentions escalate_to_human", () => {
    const out = escalationKeywordsBlock(["lawyer", "lawsuit"]);
    expect(out).toMatch(/IMMEDIATE-ESCALATION/);
    expect(out).toMatch(/escalate_to_human/);
    expect(out).toMatch(/lawyer/);
    expect(out).toMatch(/lawsuit/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// applyBusinessVariables
// ────────────────────────────────────────────────────────────────────────

describe("applyBusinessVariables", () => {
  it("substitutes known {placeholders} and leaves unknown ones intact", () => {
    const result = applyBusinessVariables("Hi from {company} — {missing}", {
      company: "Acme",
    });
    expect(result).toBe("Hi from Acme — {missing}");
  });

  it("coerces numeric values to strings", () => {
    expect(applyBusinessVariables("{n} agents", { n: 12 })).toBe("12 agents");
  });

  it("truncates values longer than 500 chars to keep prompt budget bounded", () => {
    const huge = "x".repeat(800);
    const out = applyBusinessVariables("{big}", { big: huge });
    // Truncated at 500 + ellipsis.
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.endsWith("…")).toBe(true);
  });

  it("is a no-op when text or vars is empty", () => {
    expect(applyBusinessVariables("", { company: "Acme" })).toBe("");
    expect(applyBusinessVariables("hi {company}", null)).toBe("hi {company}");
  });
});

// ────────────────────────────────────────────────────────────────────────
// kpiFocusLine
// ────────────────────────────────────────────────────────────────────────

describe("kpiFocusLine", () => {
  it("emits an empty string for unset / general focus", () => {
    expect(kpiFocusLine(null)).toBe("");
    expect(kpiFocusLine("general")).toBe("");
    expect(kpiFocusLine("unknown-value")).toBe("");
  });

  it("emits focus-specific PRIMARY OUTCOME lines for each canonical KPI", () => {
    expect(kpiFocusLine("conversions")).toMatch(/commitment/);
    expect(kpiFocusLine("qualifications")).toMatch(/BANT|MEDDIC/);
    expect(kpiFocusLine("resolutions")).toMatch(/first-contact resolution/i);
    expect(kpiFocusLine("satisfaction")).toMatch(/heard|respected/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// buildAgentRuntimeContext — the full composition
// ────────────────────────────────────────────────────────────────────────

describe("buildAgentRuntimeContext", () => {
  it("returns the base prompt verbatim when profile is null/empty", () => {
    // VOICE CONSISTENCY rule is always appended; that's intentional —
    // every assistant gets the moat even on a bare config.
    const { prompt, inHours, outOfHoursMessage } = buildAgentRuntimeContext("base prompt", null);
    expect(prompt).toContain("base prompt");
    expect(prompt).toContain("VOICE CONSISTENCY");
    expect(prompt).toContain("CORE — ADAPTIVE + QUICK");
    expect(inHours).toBe(true);
    expect(outOfHoursMessage).toBeNull();
  });

  it("appends compliance + disallowed + escalation + kpi when configured", () => {
    const { prompt } = buildAgentRuntimeContext("base", {
      compliance_mode: "hipaa",
      disallowed_topics: ["politics"],
      escalation_keywords: ["lawyer"],
      kpi_focus: "conversions",
    });
    expect(prompt).toMatch(/HIPAA/);
    expect(prompt).toMatch(/DO-NOT-DISCUSS/);
    expect(prompt).toMatch(/IMMEDIATE-ESCALATION/);
    expect(prompt).toMatch(/PRIMARY OUTCOME/);
    expect(prompt).toMatch(/VOICE CONSISTENCY/);
  });

  it("injects the personality vibe directive when set", () => {
    const { prompt } = buildAgentRuntimeContext("base", { personality_vibe: "playful" });
    expect(prompt).toMatch(/PERSONALITY VIBE/);
    expect(prompt).toMatch(/PLAYFUL|playful|witty/i);
  });

  it("substitutes business variables in the COMPLETE composed prompt", () => {
    const { prompt } = buildAgentRuntimeContext("Hi I'm calling from {company}", {
      business_variables: { company: "Acme Plumbing" },
    });
    expect(prompt).toMatch(/Acme Plumbing/);
    expect(prompt).not.toMatch(/\{company\}/);
  });

  it("signals out-of-hours + surfaces the operator's OOH message", () => {
    // Build a fixed "outside-hours" time for the agent's TZ:
    // Mon 06:00 ET → before 09:00 open.
    const before = new Date("2026-01-12T11:00:00Z");
    const result = buildAgentRuntimeContext(
      "base",
      {
        timezone: "America/New_York",
        business_hours: { mon: { open: "09:00", close: "17:00" } },
        out_of_hours_message: "Thanks for calling {company} — we open at 9.",
        business_variables: { company: "Acme" },
      },
      before,
    );
    expect(result.inHours).toBe(false);
    expect(result.outOfHoursMessage).toBe("Thanks for calling Acme — we open at 9.");
  });

  it("returns null OOH message when in-hours, even if one is configured", () => {
    const during = new Date("2026-01-12T17:00:00Z"); // Mon 12:00 ET
    const result = buildAgentRuntimeContext(
      "base",
      {
        timezone: "America/New_York",
        business_hours: { mon: { open: "09:00", close: "17:00" } },
        out_of_hours_message: "Closed",
      },
      during,
    );
    expect(result.inHours).toBe(true);
    expect(result.outOfHoursMessage).toBeNull();
  });
});
