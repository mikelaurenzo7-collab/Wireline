import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Bot acts on its own unless its owner asked to see customer messages first.
 * The live email tool honoured that choice and the live text tool did not: an
 * owner who chose to check first still had texts leave during the call.
 */
const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  sendMessage: vi.fn(),
  permission: vi.fn(),
  queue: vi.fn(),
  environment: vi.fn(),
  entity: vi.fn(),
  gate: vi.fn(),
  note: vi.fn(),
}));
vi.mock("../src/lib/action-engine", () => ({ executeAction: h.queue }));
vi.mock("../src/lib/ai-supervisor", () => ({ superviseClientCommunication: h.supervise }));
vi.mock("../src/lib/integrations", () => ({ IntegrationService: class {} }));
vi.mock("../src/lib/server-context", () => ({
  auditLogger: {},
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  externalEntityActionPolicyForUser: h.entity,
}));
vi.mock("../src/lib/twilio-service", () => ({
  lookupTenantPhoneNumber: vi.fn(),
  sendTenantMessage: h.sendMessage,
}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({
  PRESERVED_LEAD_STATUSES: [],
  sanitizePhone: (value: unknown) => (typeof value === "string" ? value : ""),
}));
vi.mock("../src/lib/agent-link-tool-handlers", () => ({
  handleSendPaymentLink: vi.fn(),
  handleSendSignupLink: vi.fn(),
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: h.gate }));

import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import { liveTextOutcome } from "../src/lib/post-call-follow-up";

const CALLER = "+17735550100";
const args = { to_number: CALLER, channel: "sms", message_body: "We are at 12 Main St." };
const context = {
  toolCallId: "tool-text",
  payload: {},
  message: { call: { id: "call-owned", customer: { number: CALLER } } },
  agent: { id: "agent-owned", user_id: "tenant-owned" },
  webhookAgentId: "agent-owned",
  drizzle: {
    insert: () => ({ values: h.note }),
    select: () => ({
      from: () => ({ leftJoin: () => ({ where: () => ({ limit: h.permission }) }) }),
    }),
  },
  log: { warn: vi.fn(), error: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  h.environment.mockResolvedValue({ allowed: true });
  h.entity.mockResolvedValue({ allowed: true });
  h.gate.mockResolvedValue({ allowed: true });
  h.supervise.mockResolvedValue({ body: "We are at 12 Main St." });
  // A refused send keeps the test off the consent ledger; the point is that it was attempted.
  h.sendMessage.mockResolvedValue({ ok: false, channel: "sms", reason: "Carrier refused." });
  h.queue.mockResolvedValue({ success: true, queued: true });
});

describe("live text and the owner's choice to check first", () => {
  it.each([
    ["a Bot working on its own", { agentLevel: "auto", tenantLevel: "draft" }],
    ["a Bot following a workspace nobody changed", { agentLevel: "inherit", tenantLevel: null }],
    [
      "a Bot following a workspace set to work on its own",
      { agentLevel: "inherit", tenantLevel: "auto" },
    ],
  ])("sends during the call for %s", async (_name, permissions) => {
    h.permission.mockResolvedValue([permissions]);
    await handleCoreToolCall("send_text_message", args, context);
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.sendMessage).toHaveBeenCalledExactlyOnceWith("tenant-owned", {
      to: CALLER,
      body: "We are at 12 Main St.",
      channel: "sms",
      agentId: "agent-owned",
    });
  });

  it.each([
    ["before customer messages", { agentLevel: "supervised", tenantLevel: "auto" }],
    ["before everything", { agentLevel: "draft", tenantLevel: "auto" }],
    ["on the workspace", { agentLevel: "inherit", tenantLevel: "draft" }],
  ])("holds the text for an owner who chose to check %s", async (_name, permissions) => {
    h.permission.mockResolvedValue([permissions]);
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.queue).toHaveBeenCalledExactlyOnceWith(
      "tenant-owned",
      {
        type: "send_text_message",
        agentId: "agent-owned",
        priority: "medium",
        payload: { to: CALLER, body: "We are at 12 Main St." },
      },
      { sourceType: "phone_call", sourceId: "call-owned" },
      "draft",
    );
    expect(result?.result).toContain(`DRAFT_SAVED: ${CALLER}`);
    expect(result?.result).toContain("Do not say it was sent.");
    // The after-call pass reads that receipt as a text already waiting, so the
    // Bot does not write the same one again on its own.
    expect(liveTextOutcome(CALLER, [{ status: "completed", result: result!.result }])).toBe("held");
  });

  it("keeps a held WhatsApp request on WhatsApp instead of turning it into a text", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "supervised", tenantLevel: "auto" }]);
    h.note.mockResolvedValue(undefined);
    const result = await handleCoreToolCall(
      "send_text_message",
      { ...args, channel: "whatsapp" },
      context,
    );
    expect(h.sendMessage).not.toHaveBeenCalled();
    // The owner's send button for a held text sends SMS, so this is a note.
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.note).toHaveBeenCalledOnce();
    expect(h.note.mock.calls[0][0]).toMatchObject({
      taskType: "follow_up",
      targetChannel: "manual",
      status: "pending",
    });
    expect(h.note.mock.calls[0][0].description).toContain("Use WhatsApp, not SMS.");
    expect(result?.result).toContain(`DRAFT_SAVED: ${CALLER}`);
    expect(result?.result).toContain("Do not say it was sent.");

    h.note.mockRejectedValue(new Error("Task storage unavailable"));
    const unsaved = await handleCoreToolCall(
      "send_text_message",
      { ...args, channel: "whatsapp" },
      context,
    );
    expect(unsaved?.result).toContain("The message was not confirmed.");
    expect(unsaved?.result).not.toContain("DRAFT_SAVED");
  });

  it("tells the caller the truth when the held text could not be saved", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "draft", tenantLevel: "auto" }]);
    h.queue.mockResolvedValue({ success: false, error: "Database unavailable." });
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(result?.result).toContain("The message was not confirmed.");
    expect(result?.result).not.toContain("DRAFT_SAVED");
  });

  it("sends nothing when the Bot's permission cannot be read", async () => {
    h.permission.mockResolvedValue([]);
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.queue).not.toHaveBeenCalled();
    expect(result?.result).toContain("Text permission could not be verified.");
  });

  it("still refuses a blocked number before it looks at the owner's choice", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "auto", tenantLevel: "auto" }]);
    h.gate.mockResolvedValue({ allowed: false, reason: "blocked_internal_dnc" });
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.permission).not.toHaveBeenCalled();
    expect(result?.result).toContain("do-not-contact list");
  });
});
