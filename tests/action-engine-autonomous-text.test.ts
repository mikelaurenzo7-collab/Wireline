import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A text the owner approved has been read by the owner. A text the Bot sends
 * on its own has been read by nobody, so it passes the same review a live text
 * and an email pass. A refusal sends nothing and reports "nothing was sent",
 * which is what lets the follow-up wait for the owner instead of being lost.
 */
const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  send: vi.fn(),
  insert: vi.fn(),
  gate: vi.fn(),
  screen: vi.fn(),
  environment: vi.fn(),
  rows: [] as unknown[][],
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
  getTenantChannelEntitlements: async () => ({ channels: ["voice", "sms"] }),
}));
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: h.send }));

import { executeAction } from "../src/lib/action-engine";
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

/** The Bot's row, the call that names the caller, then no saved lead. */
function botWorking(autonomyLevel: string, tenantAutonomyLevel: string | null = "auto") {
  h.rows = [
    [
      {
        enabledTools: ["send_text_message"],
        timeZone: "America/Chicago",
        autonomyLevel,
        tenantAutonomyLevel,
        aiTier: "pro",
        twilioMessagingEnabled: true,
        twilioLookupEnabled: false,
      },
    ],
    [{ customerNumber: CALLER }],
    [],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.environment.mockResolvedValue({ allowed: true });
  h.screen.mockResolvedValue({
    ok: true,
    screening: { isMarketingCall: false, requireFederalDncScreening: false },
    audit: {},
  });
  h.gate.mockResolvedValue({ allowed: true });
  h.supervise.mockResolvedValue({ body: "We're at 12 Main St. See you soon." });
  h.send.mockResolvedValue({ ok: true });
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
    expect(postCallFollowUpHandBack(action, result)).toEqual({
      autonomy: "draft",
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
    expect(postCallFollowUpHandBack(action, result)?.autonomy).toBe("draft");
  });

  it("leaves a text the owner already read as the owner wrote it", async () => {
    botWorking("draft");
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
