import { describe, it, expect, vi, beforeEach } from "vitest";

// planWorkspace() calls runStructured under the hood. We mock that single
// boundary so the test exercises our prompt assembly + normalization
// without hitting Anthropic. vi.hoisted keeps the mock available to the
// vi.mock factory (which is hoisted above imports).
const { runStructuredMock } = vi.hoisted(() => ({ runStructuredMock: vi.fn() }));

vi.mock("./claude-structured", () => ({
  runStructured: runStructuredMock,
  runStructuredWithThinking: runStructuredMock,
}));

import { normalizePlan, planWorkspace, type PlanWorkspaceInput } from "./workspace-planner";

beforeEach(() => {
  runStructuredMock.mockReset();
});

describe("normalizePlan — config changes", () => {
  it("keeps allowlisted fields and drops unknown ones", () => {
    const plan = normalizePlan({
      reply: "Done.",
      config_changes: [
        { field: "first_message", value: "Hi there!", summary: "Warmer greeting" },
        { field: "not_a_real_field", value: "x", summary: "nope" },
      ],
    });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].field).toBe("first_message");
    expect(plan.changes[0].value).toBe("Hi there!");
  });

  it("normalizes personality_vibe to a lowercase enum and rejects invalid vibes", () => {
    const ok = normalizePlan({
      config_changes: [{ field: "personality_vibe", value: "Warm", summary: "set vibe" }],
    });
    expect(ok.changes[0].value).toBe("warm");

    const bad = normalizePlan({
      config_changes: [{ field: "personality_vibe", value: "grumpy", summary: "set vibe" }],
    });
    expect(bad.changes).toHaveLength(0);
  });

  it("validates email + phone fields", () => {
    const goodEmail = normalizePlan({
      config_changes: [{ field: "escalation_email", value: "ops@acme.com", summary: "set email" }],
    });
    expect(goodEmail.changes).toHaveLength(1);

    const badEmail = normalizePlan({
      config_changes: [{ field: "escalation_email", value: "not-an-email", summary: "set" }],
    });
    expect(badEmail.changes).toHaveLength(0);

    const goodPhone = normalizePlan({
      config_changes: [
        { field: "escalation_phone", value: "+1 (555) 123-4567", summary: "set phone" },
      ],
    });
    expect(goodPhone.changes).toHaveLength(1);

    const badPhone = normalizePlan({
      config_changes: [{ field: "escalation_phone", value: "call me!", summary: "set" }],
    });
    expect(badPhone.changes).toHaveLength(0);
  });

  it("dedupes repeated fields, keeping the first", () => {
    const plan = normalizePlan({
      config_changes: [
        { field: "first_message", value: "First", summary: "a" },
        { field: "first_message", value: "Second", summary: "b" },
      ],
    });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].value).toBe("First");
  });
});

describe("normalizePlan — tool toggles", () => {
  it("keeps valid tools with boolean enable and drops bad entries", () => {
    const plan = normalizePlan({
      tool_toggles: [
        { tool: "send_text_message", enable: true, reason: "operator asked for SMS" },
        { tool: "send_text_message", enable: false, reason: "dupe — ignored" },
        { tool: "make_believe_tool", enable: true, reason: "nope" },
        { tool: "send_email", enable: "yes", reason: "non-boolean — ignored" },
      ],
    });
    expect(plan.toolToggles).toHaveLength(1);
    expect(plan.toolToggles[0].tool).toBe("send_text_message");
    expect(plan.toolToggles[0].enable).toBe(true);
    expect(plan.toolToggles[0].label).toBeTruthy();
  });
});

describe("normalizePlan — actions", () => {
  it("keeps allowlisted action kinds and maps customer_name → customerName", () => {
    const plan = normalizePlan({
      actions: [
        {
          kind: "send_email",
          label: "Email Jane",
          to: "jane@acme.com",
          customer_name: "Jane",
          subject: "Hi",
          body: "Following up.",
        },
        { kind: "delete_everything", label: "nope" },
      ],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].kind).toBe("send_email");
    expect(plan.actions[0].customerName).toBe("Jane");
  });
});

describe("normalizePlan — reply fallback", () => {
  it("falls back to a default reply when none is provided", () => {
    const plan = normalizePlan({});
    expect(plan.reply).toBeTruthy();
    expect(plan.changes).toHaveLength(0);
    expect(plan.toolToggles).toHaveLength(0);
    expect(plan.actions).toHaveLength(0);
  });

  it("allows long replies in Director coach mode", () => {
    const longReply = "x".repeat(2500);
    const plan = normalizePlan({ reply: longReply }, { coachAsDirector: true });
    expect(plan.reply).toHaveLength(2500);
  });

  it("clamps agent workspace replies at 2000 characters", () => {
    const longReply = "y".repeat(2500);
    const plan = normalizePlan({ reply: longReply });
    expect(plan.reply).toHaveLength(2000);
  });
});

describe("planWorkspace", () => {
  const input: PlanWorkspaceInput = {
    operatorMessage: "Make your greeting warmer",
    history: [{ role: "operator", content: "hello" }],
    agent: { name: "Ava", role: "customer_service", enabledTools: [] },
    recentCalls: [],
  };

  it("forwards the structured output through normalizePlan", async () => {
    runStructuredMock.mockResolvedValue({
      result: {
        reply: "I've drafted a warmer greeting.",
        config_changes: [
          { field: "first_message", value: "Hey, so glad you called!", summary: "Warmer greeting" },
        ],
      },
      thinking: "Analyzed operator request for warmth.",
      thinkingDurationMs: 1200,
    });
    const plan = await planWorkspace(input);
    expect(runStructuredMock).toHaveBeenCalledTimes(1);
    expect(plan.reply).toContain("warmer greeting");
    expect(plan.changes[0].field).toBe("first_message");
    expect(plan.reasoning).toBe("Analyzed operator request for warmth.");
    expect(plan.thinkingDurationMs).toBe(1200);
  });

  it("passes a forced tool and a Sonnet model to the model layer", async () => {
    runStructuredMock.mockResolvedValue({ result: { reply: "ok" } });
    await planWorkspace(input);
    const args = runStructuredMock.mock.calls[0][0];
    expect(args.tool?.name).toBe("direct_agent");
    expect(typeof args.model).toBe("string");
    expect(args.system).toContain("Ava");
  });
});
