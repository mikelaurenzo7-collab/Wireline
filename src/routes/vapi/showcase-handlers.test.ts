/**
 * showcase-handlers.test.ts
 * ----------------------------------------------------------------------
 * Defensive backstop for the demo-vs-employee escalation boundary.
 *
 * Even if a demo assistant's Vapi config drifts and somehow fires an
 * owner-routing tool (escalate_to_human / schedule_callback), the
 * webhook handler must refuse to queue a task in the founder's triage
 * inbox. Real Wireline employee lines ("cs") must still queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let insertCalls: Array<Record<string, any>> = [];

vi.mock("../../lib/server-context", () => {
  const mockDrizzle = {
    // resolveShowcaseOwnerUserId() selects a user id; always return one.
    select: vi.fn().mockImplementation(() => {
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: "owner-1" }]),
      };
      return chain;
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: Record<string, any>) => {
        insertCalls.push(row);
        return Promise.resolve({});
      }),
    })),
  };
  return {
    drizzle: mockDrizzle,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { handleShowcaseToolCalls } from "./showcase-handlers";

function toolCallMessage(name: string, args: Record<string, any> = {}) {
  return {
    type: "tool-calls",
    toolCalls: [{ id: "tc-1", function: { name, arguments: args } }],
    call: { id: "call-1", customer: { name: "Pat", number: "+15551234567" } },
  };
}

describe("handleShowcaseToolCalls — demo escalation boundary", () => {
  beforeEach(() => {
    insertCalls = [];
  });

  it("does NOT queue an owner task when a demo line tries to escalate_to_human", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("escalate_to_human", { reason: "wants a manager" }),
      showcaseAgentName: "Marcus",
      showcaseKind: "demo",
    });

    expect(insertCalls).toHaveLength(0);
    expect(results[0].result).toMatch(/demo/i);
  });

  it("does NOT queue an owner task when a demo line tries to schedule_callback", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("schedule_callback", {
        callback_datetime: "2026-01-01T10:00:00Z",
        notes: "call me",
      }),
      showcaseAgentName: "Marcus",
      showcaseKind: "demo",
    });

    expect(insertCalls).toHaveLength(0);
    expect(results[0].result).toMatch(/demo/i);
  });

  it("does NOT queue an owner task when a demo line tries create_fleet_task", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("create_fleet_task", { description: "follow up please" }),
      showcaseAgentName: "Marcus",
      showcaseKind: "demo",
    });

    expect(insertCalls).toHaveLength(0);
    expect(results[0].result).toMatch(/demo/i);
  });

  it("does NOT queue an owner task when a demo line tries capture_customer_profile", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("capture_customer_profile", { name: "John", email: "j@test.com" }),
      showcaseAgentName: "Marcus",
      showcaseKind: "demo",
    });

    expect(insertCalls).toHaveLength(0);
    expect(results[0].result).toMatch(/demo/i);
  });

  it("DOES queue an owner task when a real Wireline employee line escalates", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("escalate_to_human", { reason: "angry billing dispute" }),
      showcaseAgentName: "Sarah",
      showcaseKind: "cs",
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].taskType).toBe("human_escalation");
    expect(results[0].result).toMatch(/team/i);
  });

  it("DOES queue a fleet task when a real Wireline employee line uses create_fleet_task", async () => {
    const results = await handleShowcaseToolCalls({
      payload: {},
      message: toolCallMessage("create_fleet_task", { description: "customer needs follow-up" }),
      showcaseAgentName: "Sarah",
      showcaseKind: "cs",
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].taskType).toBe("showcase_follow_up");
    expect(results[0].result).toMatch(/team|along/i);
  });
});
