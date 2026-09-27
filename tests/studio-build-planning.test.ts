import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/ai-structured", () => ({ runStructuredWithThinking: vi.fn() }));
import { buildWorkspaceStreamContext, normalizePlan } from "../src/lib/workspace-planner";

describe("reviewable Studio Build plans", () => {
  it("includes the actual greeting, saved personality, rules, and allowed fields", () => {
    const context = buildWorkspaceStreamContext({
      userMessage: "Ask for a callback number before ending.",
      history: [],
      agent: {
        name: "Jordan",
        firstMessage: "Welcome to Acme.",
        personality: "Be discreet.",
        directives: [{ content: "Never promise availability." }],
      },
      recentCalls: [],
    });
    expect(context.system).toContain("first_message: Welcome to Acme.");
    expect(context.system).toContain("Be discreet.");
    expect(context.system).toContain("Never promise availability.");
    expect(context.system).toContain("operating_rule");
    expect(context.system).toContain("Never claim a proposal has been saved");
    expect(context.tool.input_schema).toMatchObject({
      properties: {
        config_changes: {
          items: { properties: { field: { enum: expect.arrayContaining(["operating_rule"]) } } },
        },
      },
    });
  });

  it("normalizes a bounded rule for the existing explicit apply endpoint", () => {
    const plan = normalizePlan({
      reply: "Review this rule.",
      config_changes: [
        {
          field: "operating_rule",
          value: "Ask for a callback number.",
          summary: "Capture callbacks",
        },
        { field: "operating_rule", value: "Duplicate field" },
        { field: "unknown_field", value: "Ignored" },
        { field: "constructor", value: "Ignored" },
      ],
    });
    expect(plan.changes).toEqual([
      {
        field: "operating_rule",
        label: "Operating rule",
        value: "Ask for a callback number.",
        summary: "Capture callbacks",
      },
    ]);
    expect(
      normalizePlan({ config_changes: [{ field: "operating_rule", value: "x".repeat(2500) }] })
        .changes[0]?.value,
    ).toHaveLength(2000);
  });

  it("drops malformed capabilities and settings rather than showing unusable proposals", () => {
    expect(
      normalizePlan({
        config_changes: [
          { field: "personality_vibe", value: "invented tone" },
          { field: "email_auto_respond", value: "sometimes" },
          { field: "website_url", value: "javascript:alert(1)" },
        ],
        tool_toggles: [{ tool: "send_text_message", enable: "yes" }],
        actions: [{ kind: "unknown" }],
      }),
    ).toMatchObject({ changes: [], toolToggles: [], actions: [] });
  });

  it("canonicalizes boolean proposals to match the confirmed save receipt", () => {
    expect(
      normalizePlan({
        config_changes: [
          { field: "email_auto_respond", value: " TRUE " },
          { field: "auto_zoom_link", value: "False" },
        ],
      }).changes.map(({ field, value }) => ({ field, value })),
    ).toEqual([
      { field: "email_auto_respond", value: "true" },
      { field: "auto_zoom_link", value: "false" },
    ]);
  });
});
