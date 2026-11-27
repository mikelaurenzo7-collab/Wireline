import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A text an owner approved or asked for has been read by the owner. A text
 * the Bot sends on its own has been read by nobody. So it goes only to the
 * person who just called, only while the call is recent, never as a sales
 * message, and only after the same review a live text and an email pass. Any
 * refusal sends nothing and reports "nothing was sent", which is what lets
 * the same text wait for the owner instead of being lost.
 */
const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  send: vi.fn(),
  insert: vi.fn(),
  gate: vi.fn(),
  screen: vi.fn(),
  environment: vi.fn(),
  rows: [] as unknown[][],
  other: vi.fn(),
  playbook: null as unknown,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => {
        const chain = { where: () => ({ limit: async () => h.rows.shift() ?? [] }) };
        return { ...chain, leftJoin: () => chain };
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        h.insert(value);
        return { returning: async () => [{ id: "draft" }] };
      },
    }),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/action-execution-idempotency", () => ({
  hasOtherAutonomousExecution: h.other,
  runIdempotentActionExecution: ({ execute }: { execute: () => Promise<unknown> }) => execute(),
}));
vi.mock("../src/lib/ai-supervisor", () => ({
  ClientCommunicationBlockedError: class extends Error {},
  superviseClientCommunication: h.supervise,
}));
vi.mock("../src/lib/integrations", () => ({ IntegrationService: class {} }));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  externalEntityActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/client-sender-identity", () => ({
  resolveClientSenderIdentity: async () => ({ botName: "Riley", businessName: "Main St Plumbing" }),
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: vi.fn() }));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: h.gate }));
vi.mock("../src/lib/outbound-manual-screening", () => ({ screenManualOutbound: h.screen }));
vi.mock("../src/lib/slack-service", () => ({
  postAgentNotification: vi.fn(),
  getDefaultChannel: vi.fn(),
}));
vi.mock("../src/lib/webhook-helpers", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("../src/lib/background-work", () => ({ runInBackground: vi.fn() }));
vi.mock("../src/lib/tenant-integration-connections", () => ({
  loadTenantIntegrationConnections: async () => ({}),
  filterToolsByTenantConnections: (tools: string[]) => tools,
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: async () => ({ channels: ["voice", "sms", "email"] }),
}));
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: h.send }));

import {
  executeAction,
  recordOwnerNote,
  UNATTENDED_TEXT_WINDOW_MS,
} from "../src/lib/action-engine";
import { ClientCommunicationBlockedError } from "../src/lib/ai-supervisor";
import type { ActionItem } from "../src/lib/action-types";
import { postCallFollowUpHandBack } from "../src/lib/post-call-follow-up";

const CALLER = "+17735550100";
const action: ActionItem = {
  type: "send_text_message",
  priority: "medium",
  agentId: "bot-1",
  reasoning: "Caller asked for the address by text.",
  payload: { to: CALLER, body: "We are at 12 Main St." },
};
const context = { sourceId: "call-1", sourceType: "phone_call" };

const botRow = (autonomyLevel: string, tenantAutonomyLevel: string | null, tools: string[]) => ({
  enabledTools: tools,
  timeZone: "America/Chicago",
  autonomyLevel,
  tenantAutonomyLevel,
  playbook: h.playbook,
  aiTier: "pro",
  twilioMessagingEnabled: true,
  twilioLookupEnabled: false,
});

/** The Bot's row, the call that names the caller, then no saved lead. */
function botWorking(
  autonomyLevel: string,
  tenantAutonomyLevel: string | null = "auto",
  call: { customerNumber?: string; endedMsAgo?: number } = {},
) {
  const lengthSeconds = 120;
  const endedMsAgo = call.endedMsAgo ?? 60_000;
  h.rows = [
    [botRow(autonomyLevel, tenantAutonomyLevel, ["send_text_message"])],
    [
      {
        customerNumber: call.customerNumber ?? CALLER,
        // The record is written when the call starts.
        createdAt: new Date(Date.now() - endedMsAgo - lengthSeconds * 1000),
        durationSeconds: lengthSeconds,
      },
    ],
    [],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.environment.mockResolvedValue({ allowed: true });
  h.screen.mockResolvedValue({
    ok: true,
    screening: { isMarketingCall: false, requireFederalDncScreening: false },
    contentWarning: null,
    audit: {},
  });
  h.gate.mockResolvedValue({ allowed: true });
  h.supervise.mockResolvedValue({ body: "We're at 12 Main St. See you soon." });
  h.send.mockResolvedValue({ ok: true });
  h.other.mockResolvedValue(false);
  h.playbook = null;
});

/**
 * Auto is where a Bot starts: it sends on its own, and the review also
 * decides whether the owner would want a say.
 */
describe("a text after a call, on Auto", () => {
  const refund: ActionItem = {
    ...action,
    reasoning: "Caller asked for a refund confirmation by text.",
    payload: { to: CALLER, body: "We will refund the full $240 today." },
  };
  const decision = "This promises a $240 refund. Confirm you want to give it.";

  it("asks the review to decide, with the owner's own rules", async () => {
    h.playbook = { checkFirst: ["A customer asks for a refund"] };
    botWorking("inherit", "auto");
    expect(await executeAction("tenant", action, context)).toEqual({ success: true });
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
    });
    expect(h.send).toHaveBeenCalledOnce();
  });

  it("sends nothing when the Bot decides its owner should see it, and says what to decide", async () => {
    botWorking("auto");
    h.supervise.mockResolvedValue({
      approved: false,
      body: refund.payload.body,
      ownerDecision: decision,
    });
    const result = await executeAction("tenant", refund, context);
    expect(result).toEqual({
      success: false,
      retryable: true,
      errorCode: "OWNER_DECISION_NEEDED",
      error: decision,
    });
    expect(h.send).not.toHaveBeenCalled();
    // The same text waits for the owner, with the Bot's question as the reason.
    expect(postCallFollowUpHandBack(refund, result, "auto")).toEqual({
      kind: "draft",
      action: { ...refund, payload: { ...refund.payload, reasoning: decision } },
    });
  });

  it("uses no judgement of its own on a Bot set to never ask, only the owner's rules", async () => {
    // With no rules from the owner there is nothing to ask the review.
    botWorking("full");
    expect(await executeAction("tenant", refund, context)).toEqual({ success: true });
    expect(h.supervise).toHaveBeenCalledOnce();
    expect(h.supervise.mock.calls[0][0].ownerDecision).toBeUndefined();
    expect(h.send).toHaveBeenCalledOnce();

    // "Never asks" is about the Bot's own judgement. A case the owner named
    // is still the owner's, so the review is asked about the rules alone.
    h.supervise.mockClear();
    h.playbook = { checkFirst: ["A customer asks for a refund"] };
    botWorking("full");
    await executeAction("tenant", refund, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
      rulesOnly: true,
    });

    // A workspace on Full covers a Bot that follows it.
    h.supervise.mockClear();
    botWorking("inherit", "full");
    await executeAction("tenant", refund, context);
    expect(h.supervise.mock.calls[0][0].ownerDecision).toEqual({
      rules: ["A customer asks for a refund"],
      rulesOnly: true,
    });
  });

  it("does not second-guess an owner who already decided", async () => {
    // The owner's own send goes as they approved it, with no review at all.
    botWorking("auto");
    expect(
      await executeAction("tenant", refund, { ...context, approvalTaskId: "task-1" }, "auto"),
    ).toEqual({ success: true });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledOnce();
  });
});

describe("a text the Bot sends on its own after a call", () => {
  it.each([
    ["set to work on its own", "auto", "draft"],
    ["following a workspace that works on its own", "inherit", "auto"],
    ["following a workspace nobody changed", "inherit", null],
  ])("is reviewed, then sent, for a Bot %s", async (_name, level, workspace) => {
    botWorking(level, workspace);
    expect(await executeAction("tenant", action, context)).toEqual({ success: true });
    expect(h.supervise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        channel: "sms",
        agentName: "Riley",
        businessName: "Main St Plumbing",
        recipient: CALLER,
        body: "We are at 12 Main St.",
      }),
    );
    // The reviewed wording is what leaves, to the caller's own number.
    expect(h.send).toHaveBeenCalledExactlyOnceWith("tenant", {
      to: CALLER,
      body: "We're at 12 Main St. See you soon.",
      agentId: "bot-1",
    });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["before customer messages", "supervised"],
    ["before everything", "draft"],
  ])("waits for an owner who chose to check %s", async (_name, level) => {
    botWorking(level);
    expect(await executeAction("tenant", action, context)).toEqual({ success: true, queued: true });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ taskType: "send_text_message", status: "pending" }),
    );
  });

  it("does not text long after the call, when the job ran late", async () => {
    // A call at 8:50pm must not become a text at 2am because a job was deferred.
    botWorking("auto", "auto", { endedMsAgo: UNATTENDED_TEXT_WINDOW_MS + 60_000 });
    const result = await executeAction("tenant", action, context);
    expect(result).toEqual({
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_TOO_LATE",
      error: "Too long had passed since the call for your Bot to text on its own.",
    });
    expect(h.screen).not.toHaveBeenCalled();
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    // The same text waits for the owner, who decides.
    expect(postCallFollowUpHandBack(action, result, "auto")?.kind).toBe("draft");

    botWorking("auto", "auto", { endedMsAgo: UNATTENDED_TEXT_WINDOW_MS - 60_000 });
    expect(await executeAction("tenant", action, context)).toEqual({ success: true });
  });

  it("sends one text of its own per call, however the request was worded", async () => {
    // The transcript read a second time comes back worded differently. The
    // ledger takes that for a new text; this does not.
    botWorking("auto");
    h.other.mockResolvedValue(true);
    const result = await executeAction("tenant", action, context);
    expect(h.other).toHaveBeenCalledExactlyOnceWith({
      userId: "tenant",
      action,
      sourceId: "call-1",
      sourceType: "phone_call",
    });
    expect(result).toEqual({
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_ALREADY_SENT",
      error: "Your Bot had already sent, or tried to send, a text for this call.",
    });
    expect(h.screen).not.toHaveBeenCalled();
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    // An owner's own send is not held to that: they can see what went.
    botWorking("draft");
    expect(
      await executeAction("tenant", action, { ...context, approvalTaskId: "task-1" }, "auto"),
    ).toEqual({ success: true });
    expect(h.other).toHaveBeenCalledOnce();
  });

  it("texts nobody but the person who called", async () => {
    botWorking("auto", "auto", { customerNumber: "+17735550199" });
    const result = await executeAction("tenant", action, context);
    expect(result).toMatchObject({
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_NOT_TO_CALLER",
    });
    expect(h.send).not.toHaveBeenCalled();

    // Outside a phone call there is no caller to answer.
    h.rows = [[botRow("auto", "auto", ["send_text_message"])], []];
    expect(
      await executeAction("tenant", action, { sourceId: "thread-1", sourceType: "sms_thread" }),
    ).toMatchObject({
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_NOT_TO_CALLER",
    });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("never sends what reads like a sales message on its own", async () => {
    botWorking("auto");
    h.screen.mockResolvedValue({
      ok: true,
      screening: { isMarketingCall: false, requireFederalDncScreening: false },
      contentWarning: "This reads like a promotion.",
      audit: {},
    });
    const result = await executeAction("tenant", action, context);
    expect(result).toMatchObject({
      success: false,
      retryable: true,
      errorCode: "UNATTENDED_TEXT_READS_AS_SALES",
    });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("sends nothing when the review holds the text, and the owner gets it with the reason", async () => {
    botWorking("auto");
    h.supervise.mockRejectedValue(new ClientCommunicationBlockedError("It quotes a price."));
    const result = await executeAction("tenant", action, context);
    expect(result).toEqual({
      success: false,
      retryable: true,
      errorCode: "COMMUNICATION_BLOCKED",
      error: "The message review held this text: It quotes a price.",
    });
    expect(h.send).not.toHaveBeenCalled();
    expect(postCallFollowUpHandBack(action, result, "auto")).toEqual({
      kind: "draft",
      action: {
        ...action,
        payload: {
          ...action.payload,
          reasoning: "Not sent by your Bot: The message review held this text: It quotes a price.",
        },
      },
    });
  });

  it("sends nothing when the review cannot run", async () => {
    botWorking("auto");
    h.supervise.mockRejectedValue(new Error("Model provider unavailable"));
    const result = await executeAction("tenant", action, context);
    expect(result).toMatchObject({
      success: false,
      retryable: true,
      errorCode: "COMMUNICATION_REVIEW_UNAVAILABLE",
    });
    expect(result.error).not.toContain("Model provider");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("does not spend a review on a text the law already stopped", async () => {
    botWorking("auto");
    h.screen.mockResolvedValue({
      ok: false,
      status: 403,
      code: "PERMISSION_REQUIRED",
      error: "Confirm you have permission to text this person.",
    });
    const result = await executeAction("tenant", action, context);
    expect(result).toMatchObject({ success: false, retryable: true });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    // The same message waits for the owner, who can tick the permission box.
    expect(postCallFollowUpHandBack(action, result, "auto")?.kind).toBe("draft");
  });

  it("reports nothing sent when a test workspace is not allowed to text", async () => {
    botWorking("auto");
    h.environment.mockResolvedValue({
      allowed: false,
      environment: "test",
      code: "TEST_WORKSPACE",
      message: "Live texts are off for this test workspace.",
    });
    const result = await executeAction("tenant", action, context);
    expect(result).toEqual({
      success: false,
      retryable: true,
      error: "Live texts are off for this test workspace.",
    });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.supervise).not.toHaveBeenCalled();
  });
});

describe("a text an owner chose to send", () => {
  it("leaves a text the owner approved as the owner wrote it, whenever they approve it", async () => {
    // Approved the next morning: the owner's decision is the new decision.
    botWorking("draft", "auto", { endedMsAgo: 12 * 60 * 60_000 });
    expect(
      await executeAction("tenant", action, { ...context, approvalTaskId: "task-1" }, "auto"),
    ).toEqual({ success: true });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledExactlyOnceWith("tenant", {
      to: CALLER,
      body: "We are at 12 Main St.",
      agentId: "bot-1",
    });
  });

  it("leaves a text the owner asked for in chat as written, to whoever they named", async () => {
    // No approval item exists for a chat request, and it is still the owner's send.
    h.rows = [[botRow("draft", "draft", ["send_text_message"])], []];
    expect(
      await executeAction(
        "tenant",
        { ...action, payload: { to: "+17735550199", body: "Running ten minutes late." } },
        { sourceId: "bot-1", sourceType: "workspace_chat" },
        "auto",
      ),
    ).toEqual({ success: true });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledExactlyOnceWith("tenant", {
      to: "+17735550199",
      body: "Running ten minutes late.",
      agentId: "bot-1",
    });
  });
});

describe("a note for the owner", () => {
  const note: ActionItem = {
    type: "create_internal_task",
    priority: "medium",
    agentId: "bot-1",
    payload: { description: "Call Dana back about the quote." },
  };

  it("is written whatever tools the Bot has selected, as it is during a live call", async () => {
    // A Bot made from a draft starts with no tools selected at all.
    for (const tools of [[], ["send_email"]]) {
      h.insert.mockClear();
      h.rows = [[botRow("auto", "auto", tools)]];
      expect(await executeAction("tenant", note, context)).toEqual({ success: true });
      expect(h.insert).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          taskType: "internal_task",
          description: "Call Dana back about the quote.",
        }),
      );
    }
    // A tool that reaches a customer still has to be selected.
    h.rows = [[botRow("auto", "auto", [])]];
    expect(await executeAction("tenant", action, context)).toMatchObject({ success: false });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("can be written directly as a last resort, once, and fails loudly so it is retried", async () => {
    // No such note yet, and the Bot it names still exists.
    h.rows = [[], [{ id: "bot-1" }]];
    await recordOwnerNote("tenant", {
      description: "  Your Bot could not confirm a text was sent.  ",
      priority: "high",
      agentId: "bot-1",
      sourceId: "call-1",
      sourceType: "phone_call",
    });
    expect(h.insert).toHaveBeenCalledExactlyOnceWith({
      userId: "tenant",
      agentId: "bot-1",
      taskType: "internal_task",
      description: "Your Bot could not confirm a text was sent.",
      priority: "high",
      status: "pending",
      sourceType: "phone_call",
      sourceId: "call-1",
      targetChannel: "manual",
    });

    // A retry finds the note it already wrote.
    h.insert.mockClear();
    h.rows = [[{ id: "existing-note" }]];
    await recordOwnerNote("tenant", {
      description: "Your Bot could not confirm a text was sent.",
      sourceId: "call-1",
      sourceType: "phone_call",
    });
    expect(h.insert).not.toHaveBeenCalled();

    // A Bot deleted since the call is left off the note. Naming it would fail
    // on every retry and the note would never reach the owner.
    h.insert.mockClear();
    h.rows = [[], []];
    await recordOwnerNote("tenant", {
      description: "Call Dana back.",
      agentId: "deleted-bot",
      sourceId: "call-1",
      sourceType: "phone_call",
    });
    expect(h.insert).toHaveBeenCalledOnce();
    expect(h.insert.mock.calls[0][0]).toMatchObject({ description: "Call Dana back." });
    expect(h.insert.mock.calls[0][0].agentId).toBeUndefined();

    // A write that fails is not swallowed: the queue has to try again.
    h.insert.mockClear();
    h.rows = [[]];
    h.insert.mockImplementationOnce(() => {
      throw new Error("Database unavailable");
    });
    await expect(
      recordOwnerNote("tenant", {
        description: "Call Dana back.",
        sourceId: "call-1",
        sourceType: "phone_call",
      }),
    ).rejects.toThrow("Database unavailable");
  });
});

describe("an email nobody chose to send", () => {
  it("waits for the owner even when the Bot works on its own", async () => {
    // The follow-up job already leaves every after-call email to the owner.
    // The engine holds the same line, so no later caller can send mail to an
    // address nobody confirmed just by forgetting to say "draft".
    h.rows = [[botRow("auto", "auto", ["send_email"])]];
    const result = await executeAction(
      "tenant",
      {
        type: "send_email",
        priority: "medium",
        agentId: "bot-1",
        payload: { to: "dana@example.com", subject: "Your quote", body: "Hi Dana" },
      },
      context,
    );
    expect(result).toEqual({ success: true, queued: true });
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        taskType: "send_email",
        status: "pending",
        targetChannel: "email",
      }),
    );
  });
});
