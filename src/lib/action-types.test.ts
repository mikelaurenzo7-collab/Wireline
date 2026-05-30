/**
 * action-types — locks the canonical set of `ActionType` strings and
 * the `ActionItem` shape consumed by action-engine and the supervisor
 * surfaces. Adding/removing actions is a deliberate cross-cutting
 * change; this test makes that explicit instead of silently widening.
 */
import { describe, it, expect } from "vitest";
import { ActionTypeSchema, ActionItemSchema } from "./action-types.js";

describe("ActionTypeSchema", () => {
  it("enumerates exactly the supported action verbs", () => {
    expect(ActionTypeSchema.options).toEqual([
      "send_email",
      "send_text_message",
      "schedule_calendar",
      "update_crm_lead",
      "create_internal_task",
      "send_contract",
      "prospect_leads",
      "notify_slack",
    ]);
  });

  it("rejects unknown verbs", () => {
    expect(ActionTypeSchema.safeParse("send_smoke_signal").success).toBe(false);
  });
});

describe("ActionItemSchema", () => {
  it("accepts a minimal action item", () => {
    const ok = ActionItemSchema.safeParse({
      type: "send_email",
      priority: "high",
      payload: { to: "lead@example.com", subject: "Hi" },
    });
    expect(ok.success).toBe(true);
  });

  it("accepts optional reasoning + agentId", () => {
    const out = ActionItemSchema.safeParse({
      type: "schedule_calendar",
      priority: "medium",
      payload: { when: "2026-06-01" },
      reasoning: "Lead requested a 1:1.",
      agentId: "agent_123",
    });
    expect(out.success).toBe(true);
  });

  it("rejects invalid priority strings", () => {
    const bad = ActionItemSchema.safeParse({
      type: "send_email",
      priority: "urgent",
      payload: {},
    });
    expect(bad.success).toBe(false);
  });

  it("requires a payload object", () => {
    const bad = ActionItemSchema.safeParse({
      type: "send_email",
      priority: "low",
    });
    expect(bad.success).toBe(false);
  });
});
