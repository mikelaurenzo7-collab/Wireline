import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An audit of what an owner is asked to manage found settings that changed
 * nothing, actions a new Bot had no use for, and two tool results that told
 * the Bot something untrue.
 */
vi.mock("../src/lib/notifications", () => ({ NotificationService: class {} }));
vi.mock("../src/lib/zoom-service", () => ({ createMeeting: vi.fn() }));
vi.mock("../src/lib/agent-runtime-helpers", () => ({
  sanitizePhone: (value: unknown) => (typeof value === "string" ? value : ""),
}));
vi.mock("../src/lib/call-reliability-capture", () => ({ recordEscalationOutcome: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getDefaultAgentTools } from "../src/lib/agent-capabilities";
import { resolveCreateEnabledTools } from "../src/lib/agent-create-defaults";
import { handleWorkflowToolCall } from "../src/lib/bot-tools/workflow";
import { WORKSPACE_FIELD_KEYS, WORKSPACE_FIELDS } from "../src/lib/workspace-planner";

const saved = vi.fn();
const context = {
  toolCallId: "tool-1",
  payload: {},
  message: { call: { id: "call-1" } },
  agent: { id: "bot-1", user_id: "tenant-1" },
  webhookAgentId: "bot-1",
  drizzle: { insert: () => ({ values: saved }) },
  log: { warn: vi.fn(), error: vi.fn() },
};
const call = (name: string, args: Record<string, unknown>) =>
  handleWorkflowToolCall(name, args, context as never);

beforeEach(() => {
  saved.mockReset();
  saved.mockResolvedValue(undefined);
});

describe("a new Bot's actions", () => {
  it("does not start with a collections action or one whose output nothing reads", () => {
    for (const business of [true, false]) {
      const tools = resolveCreateEnabledTools(business);
      expect(tools).not.toContain("log_payment_promise");
      expect(tools).not.toContain("capture_customer_profile");
    }
    // What a Bot needs on its first call is still there.
    expect(resolveCreateEnabledTools(true)).toEqual(
      expect.arrayContaining([
        "search_knowledge_base",
        "create_followup_task",
        "escalate_to_human",
        "check_calendar_availability",
        "book_appointment",
        "send_email",
        "send_text_message",
      ]),
    );
    // Both stay in the catalogue for a Bot that has them.
    expect(getDefaultAgentTools()).toEqual(
      expect.arrayContaining(["log_payment_promise", "capture_customer_profile"]),
    );
  });
});

describe("tool results a Bot may repeat to a caller", () => {
  it("does not call a note for the owner a legal record", async () => {
    const noted = await call("log_payment_promise", { amount_promised: 120 });
    expect(noted?.result).toBe("The payment commitment was noted for the team.");
    saved.mockRejectedValue(new Error("Database unavailable."));
    const failed = await call("log_payment_promise", { amount_promised: 120 });
    expect(failed?.result).toContain("was not recorded");
    expect(failed?.result).toContain("do not promise that anyone will follow up");
  });

  it("does not say details were noted when they were not saved", async () => {
    saved.mockRejectedValue(new Error("Database unavailable."));
    const failed = await call("capture_customer_profile", { name: "Dana" });
    expect(failed?.result).toContain("The details were not saved.");
    expect(failed?.result).not.toMatch(/I've noted/i);
  });
});

describe("what the chat can change", () => {
  it("is only settings that change something a Bot does", () => {
    for (const gone of [
      "email_agent_tone",
      "email_auto_respond",
      "slack_channel_id",
      "archetype",
    ]) {
      expect(WORKSPACE_FIELD_KEYS, gone).not.toContain(gone);
    }
    // Every remaining one names a Bot, never an "agent".
    const labels = Object.values(WORKSPACE_FIELDS).map((field) => field.label);
    expect(labels).toContain("Bot name");
    expect(labels.join(" ")).not.toMatch(/\bagent\b/i);
  });
});
