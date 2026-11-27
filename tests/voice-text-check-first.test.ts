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
  waiting: vi.fn(),
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
      from: () => ({
        // The Bot's permission is read with its workspace's.
        leftJoin: () => ({ where: () => ({ limit: h.permission }) }),
        // What already waits for the owner from this call.
        where: () => ({ limit: h.waiting }),
      }),
    }),
  },
  log: { warn: vi.fn(), error: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  h.waiting.mockResolvedValue([]);
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

  it("leaves the owner a note, and claims nothing, when saving the held text throws", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "draft", tenantLevel: "auto" }]);
    h.queue.mockRejectedValue(new Error("Database unavailable."));
    h.note.mockResolvedValue(undefined);
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    // The failure reaches the tool's own fallback instead of escaping it.
    expect(h.note).toHaveBeenCalledOnce();
    expect(h.note.mock.calls[0][0]).toMatchObject({
      taskType: "send_text_message",
      status: "pending",
      payload: { to: CALLER, body: "We are at 12 Main St." },
    });
    expect(result?.result).toContain("The message was not confirmed.");
    expect(result?.result).not.toContain("DRAFT_SAVED");
  });

  it("knows the caller's own number however it was said", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "auto", tenantLevel: "auto" }]);
    // The carrier reports +17735550100. A caller says it, or the Bot writes it,
    // in other forms.
    for (const spoken of ["(773) 555-0100", "773-555-0100", "17735550100", "7735550100"]) {
      h.gate.mockClear();
      h.sendMessage.mockClear();
      await handleCoreToolCall("send_text_message", { ...args, to_number: spoken }, context);
      // The person on the call, not a cold message to a stranger.
      expect(h.gate, spoken).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          phone: CALLER,
          isMarketingCall: false,
          isLiveSessionFollowUp: true,
          hasExpressWrittenConsent: true,
        }),
      );
      // Sent in the form the carrier reported.
      expect(h.sendMessage.mock.calls[0][1].to, spoken).toBe(CALLER);
    }

    // Another number is still another person, with the full rules.
    for (const other of ["+17735550199", "+447735550100", "555-0100"]) {
      h.gate.mockClear();
      await handleCoreToolCall("send_text_message", { ...args, to_number: other }, context);
      expect(h.gate, other).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          phone: other,
          isMarketingCall: true,
          isLiveSessionFollowUp: false,
          hasExpressWrittenConsent: false,
        }),
      );
    }
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

/**
 * Auto is where a Bot starts. It sends on its own, and the review that reads
 * every message also decides whether the owner would want a say.
 */
describe("live text on Auto: the Bot decides when its owner would want a say", () => {
  const refund = { ...args, message_body: "No problem, we will refund the full $240 today." };
  const decision = "This promises a $240 refund. Confirm you want to give it.";
  const playbook = { checkFirst: ["A customer asks for a refund"] };

  it("asks the review to decide, with the owner's own rules", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "inherit", tenantLevel: "auto", playbook }]);
    await handleCoreToolCall("send_text_message", args, context);
    expect(h.supervise).toHaveBeenCalledOnce();
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
    });
    // A routine text still just goes.
    expect(h.sendMessage).toHaveBeenCalledOnce();
    expect(h.queue).not.toHaveBeenCalled();

    // A Bot nobody gave rules to still decides, from the review's own criteria.
    h.supervise.mockClear();
    h.permission.mockResolvedValue([{ agentLevel: null, tenantLevel: null, playbook: null }]);
    await handleCoreToolCall("send_text_message", args, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({ rules: [] });
  });

  it("uses no judgement of its own on a Bot set to never ask, only the owner's rules", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "full", tenantLevel: "auto", playbook: null }]);
    await handleCoreToolCall("send_text_message", refund, context);
    expect(h.supervise).toHaveBeenCalledOnce();
    expect(h.supervise.mock.calls[0][0].ownerDecision).toBeUndefined();
    expect(h.sendMessage).toHaveBeenCalledOnce();
    expect(h.queue).not.toHaveBeenCalled();

    // A case the owner named is still the owner's to decide.
    h.supervise.mockClear();
    h.permission.mockResolvedValue([{ agentLevel: "full", tenantLevel: "auto", playbook }]);
    await handleCoreToolCall("send_text_message", refund, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
      rulesOnly: true,
    });
  });

  it("holds the text as the Bot wrote it, with what the owner has to decide", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "inherit", tenantLevel: "auto", playbook }]);
    h.supervise.mockResolvedValue({
      approved: false,
      body: refund.message_body,
      ownerDecision: decision,
    });
    const result = await handleCoreToolCall("send_text_message", refund, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.queue).toHaveBeenCalledExactlyOnceWith(
      "tenant-owned",
      {
        type: "send_text_message",
        agentId: "agent-owned",
        priority: "medium",
        payload: { to: CALLER, body: refund.message_body, reasoning: decision },
      },
      { sourceType: "phone_call", sourceId: "call-owned" },
      "draft",
    );
    // The Bot tells the caller it is checking, and promises nothing.
    expect(result?.result).toContain(`DRAFT_SAVED: ${CALLER}`);
    expect(result?.result).toContain("checking one thing with the team before it goes out");
    expect(result?.result).toContain("do not promise what the answer will be");
    expect(result?.result).not.toMatch(/approv/i);
    // The after-call pass reads that receipt as a text already waiting.
    expect(liveTextOutcome(CALLER, [{ status: "completed", result: result!.result }])).toBe("held");
  });

  it("keeps a WhatsApp message the Bot held on WhatsApp, with the reason", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "auto", tenantLevel: "auto", playbook }]);
    h.supervise.mockResolvedValue({
      approved: false,
      body: refund.message_body,
      ownerDecision: decision,
    });
    h.note.mockResolvedValue(undefined);
    const result = await handleCoreToolCall(
      "send_text_message",
      { ...refund, channel: "whatsapp" },
      context,
    );
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.note).toHaveBeenCalledOnce();
    expect(h.note.mock.calls[0][0]).toMatchObject({
      taskType: "follow_up",
      status: "pending",
      payload: { to: CALLER, body: refund.message_body, reasoning: decision, channel: "whatsapp" },
    });
    expect(result?.result).toContain("The WhatsApp message is written and the owner needs to");
  });

  it("sends nothing and says so when a held text could not be saved", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "auto", tenantLevel: "auto", playbook }]);
    h.supervise.mockResolvedValue({
      approved: false,
      body: refund.message_body,
      ownerDecision: decision,
    });
    h.queue.mockResolvedValue({ success: false, error: "Database unavailable." });
    const result = await handleCoreToolCall("send_text_message", refund, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(result?.result).toContain("The message was not confirmed.");
    expect(result?.result).not.toContain("DRAFT_SAVED");

    // A save that throws is the same to the caller: nothing sent, nothing claimed.
    h.queue.mockRejectedValue(new Error("Database unavailable."));
    const thrown = await handleCoreToolCall("send_text_message", refund, context);
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(thrown?.result).toContain("The message was not confirmed.");
    expect(thrown?.result).not.toContain("DRAFT_SAVED");
  });

  it("shows the review what already waits from this call, and never files the same text twice", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "inherit", tenantLevel: "auto", playbook }]);
    // The caller heard "I'm checking with the team" and said "just send it".
    h.waiting.mockResolvedValue([
      { payload: { to: CALLER, body: "No problem,  we will refund the full $240 TODAY. " } },
      { payload: { to: CALLER } },
      { payload: null },
    ]);
    h.supervise.mockResolvedValue({
      approved: false,
      body: refund.message_body,
      ownerDecision: decision,
    });
    const result = await handleCoreToolCall("send_text_message", refund, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
      alreadyWaiting: ["No problem,  we will refund the full $240 TODAY. "],
    });
    // The same words are already with the owner: no second copy, nothing sent.
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(result?.result).toContain(`DRAFT_SAVED: ${CALLER}`);
    expect(result?.result).toContain("checking one thing with the team before it goes out");
    expect(liveTextOutcome(CALLER, [{ status: "completed", result: result!.result }])).toBe("held");

    // Different words the review also holds are a new item for the owner.
    const reworded = { ...refund, message_body: "We will take $240 off your next visit." };
    h.supervise.mockResolvedValue({
      approved: false,
      body: reworded.message_body,
      ownerDecision: decision,
    });
    await handleCoreToolCall("send_text_message", reworded, context);
    expect(h.queue).toHaveBeenCalledOnce();
    expect(h.queue.mock.calls[0][1].payload).toEqual({
      to: CALLER,
      body: reworded.message_body,
      reasoning: decision,
    });
  });

  it("still reviews on its own criteria when what waits cannot be read", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "inherit", tenantLevel: "auto", playbook }]);
    h.waiting.mockRejectedValue(new Error("Database unavailable."));
    await handleCoreToolCall("send_text_message", args, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
    });
    expect(h.sendMessage).toHaveBeenCalledOnce();
  });

  it("does not look up what waits for a Bot that is never asked to decide", async () => {
    h.permission.mockResolvedValue([{ agentLevel: "full", tenantLevel: "auto", playbook: null }]);
    await handleCoreToolCall("send_text_message", args, context);
    expect(h.waiting).not.toHaveBeenCalled();
    expect(h.sendMessage).toHaveBeenCalledOnce();
  });
});
