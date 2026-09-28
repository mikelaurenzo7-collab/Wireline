import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  send: vi.fn(),
  save: vi.fn(),
  gate: vi.fn(),
  environment: vi.fn(),
  entity: vi.fn(),
}));
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
  sendTenantMessage: h.send,
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: h.gate }));
vi.mock("../src/lib/agent-runtime-helpers", () => ({
  PRESERVED_LEAD_STATUSES: [],
  sanitizePhone: (value: string) => value,
}));
vi.mock("../src/lib/agent-link-tool-handlers", () => ({
  handleSendPaymentLink: vi.fn(),
  handleSendSignupLink: vi.fn(),
}));

import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import { isToolCallFailureResult } from "../src/lib/call-reliability-capture";
import { enforceAgentToolResultTruth } from "../src/lib/agent-tool-result-truth";
import { isManualOperatorTask } from "../src/lib/operator-work-status";

const args = { to_number: "+13125550102", message_body: "Requested appointment details." };
const context = {
  toolCallId: "tool-text",
  payload: {},
  message: { call: { id: "call-owned", customer: { number: "+13125550101" } } },
  agent: { id: "agent-owned", user_id: "tenant-owned" },
  webhookAgentId: "agent-owned",
  drizzle: { insert: () => ({ values: h.save }) },
  log: { warn: vi.fn(), error: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.supervise.mockResolvedValue({ body: "Reviewed appointment details." });
  h.gate.mockResolvedValue({ allowed: true });
  h.environment.mockResolvedValue({ allowed: true });
  h.entity.mockResolvedValue({ allowed: true });
  h.save.mockResolvedValue(undefined);
});

describe("voice SMS delivery outcome accounting", () => {
  it.each([true, false])(
    "counts a thrown send as unsuccessful when manual recovery is saved=%s",
    async (saved) => {
      h.send.mockRejectedValueOnce(new Error("Transport unavailable"));
      if (!saved) h.save.mockRejectedValueOnce(new Error("Task storage unavailable"));
      const result = await handleCoreToolCall("send_text_message", args, context);
      expect(result?.result).toContain("The message was not confirmed.");
      expect(result?.result).toContain(
        saved
          ? "The request was saved for manual review."
          : "The follow-up request could not be saved.",
      );
      expect(result?.result).toContain("Do not retry automatically or promise delivery.");
      expect(isToolCallFailureResult(result!.result)).toBe(true);
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.save).toHaveBeenCalledTimes(1);
      const task = h.save.mock.calls[0][0];
      expect(isManualOperatorTask(task.taskType)).toBe(true);
      expect(task).toMatchObject({
        taskType: "follow_up",
        targetChannel: "manual",
        payload: {
          to: args.to_number,
          body: "Reviewed appointment details.",
          channel: "sms",
          delivery_status: "unconfirmed",
        },
      });
    },
  );

  it("counts supervisor refusal without sending while retaining the saved task truth", async () => {
    h.supervise.mockRejectedValueOnce(new Error("Review required"));
    const result = await handleCoreToolCall("send_text_message", args, context);
    expect(isToolCallFailureResult(result!.result)).toBe(true);
    expect(result?.result).toContain("I've logged that text for our team to follow up on.");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.save.mock.calls[0][0]).toMatchObject({
      taskType: "send_text_message",
      targetChannel: "sms",
    });
  });

  it.each(["gate", "supervisor", "transport"])(
    "keeps WhatsApp %s recovery manual and never substitutes SMS",
    async (failure) => {
      if (failure === "gate")
        h.gate.mockResolvedValueOnce({ allowed: false, reason: "outside_permitted_calling_hours" });
      else if (failure === "supervisor")
        h.supervise.mockRejectedValueOnce(new Error("Review required"));
      else h.send.mockRejectedValueOnce(new Error("Outcome unknown"));

      const result = await handleCoreToolCall(
        "send_text_message",
        { ...args, channel: "whatsapp" },
        context,
      );
      expect(isToolCallFailureResult(result!.result)).toBe(true);
      expect(h.save).toHaveBeenCalledOnce();
      const task = h.save.mock.calls[0][0];
      expect(task).toMatchObject({
        taskType: "follow_up",
        targetChannel: "manual",
        payload: {
          to: args.to_number,
          body: failure === "transport" ? "Reviewed appointment details." : args.message_body,
          channel: "whatsapp",
          delivery_status: failure === "transport" ? "unconfirmed" : "not_sent",
        },
      });
      expect(task.description).toContain("WhatsApp follow-up");
      expect(task.description).toContain("Use WhatsApp, not SMS.");
      expect(isManualOperatorTask(task.taskType)).toBe(true);
      if (failure === "transport") {
        expect(h.send).toHaveBeenCalledExactlyOnceWith(
          "tenant-owned",
          expect.objectContaining({ channel: "whatsapp" }),
        );
        expect(result?.result).toContain("Do not retry automatically");
      } else expect(h.send).not.toHaveBeenCalled();
    },
  );

  it("does not promise saved WhatsApp recovery when its manual task cannot be persisted", async () => {
    h.supervise.mockRejectedValueOnce(new Error("Review required"));
    h.save.mockRejectedValueOnce(new Error("Task storage unavailable"));
    const result = await handleCoreToolCall(
      "send_text_message",
      { ...args, channel: "whatsapp" },
      context,
    );
    expect(result?.result).toContain("The message was not confirmed.");
    expect(result?.result).not.toMatch(/logged|was saved/);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledOnce();
  });

  it.each(["environment", "entity"] as const)(
    "counts the %s refusal without creating a future send",
    async (policy) => {
      h[policy].mockResolvedValueOnce({ allowed: false, message: "Live messages are blocked." });
      const result = await handleCoreToolCall("send_text_message", args, context);
      expect(result?.result).toBe("The message was not confirmed. Live messages are blocked.");
      expect(isToolCallFailureResult(result!.result)).toBe(true);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
    },
  );

  it.each(["blocked_internal_dnc", "outside_permitted_calling_hours"])(
    "counts outbound gate refusal %s and preserves its existing recovery policy",
    async (reason) => {
      h.gate.mockResolvedValueOnce({ allowed: false, reason });
      const result = await handleCoreToolCall("send_text_message", args, context);
      expect(isToolCallFailureResult(result!.result)).toBe(true);
      expect(h.send).not.toHaveBeenCalled();
      if (reason === "blocked_internal_dnc") {
        expect(result?.result).toContain("do-not-contact list");
        expect(h.save).not.toHaveBeenCalled();
      } else {
        expect(result?.result).toContain("I've logged the request for human follow-up.");
        expect(h.save).toHaveBeenCalledOnce();
      }
    },
  );

  it("counts missing recipient or account without entering the provider path", async () => {
    const noRecipient = await handleCoreToolCall(
      "send_text_message",
      {},
      { ...context, message: {} },
    );
    const noAccount = await handleCoreToolCall("send_text_message", args, {
      ...context,
      agent: { ...context.agent, user_id: "" },
    });
    expect(isToolCallFailureResult(noRecipient!.result)).toBe(true);
    expect(isToolCallFailureResult(noAccount!.result)).toBe(true);
    expect(h.supervise).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, reason: "Twilio rejected the message send request." },
    {
      ok: false,
      reason:
        "Delivery status is unknown because the carrier response was interrupted. The message may have been accepted. Do not resend it; contact support with the time and recipient.",
      providerOutcomeAmbiguous: true,
      doNotResend: true,
    },
    { ok: false },
  ])(
    "counts an unsuccessful transport result without losing its recovery guidance: %j",
    async (outcome) => {
      h.send.mockResolvedValueOnce(outcome);
      const result = await handleCoreToolCall("send_text_message", args, context);

      expect(result?.result).toBe(
        `The message was not confirmed. ${outcome.reason || "Message send failed."}`,
      );
      expect(enforceAgentToolResultTruth("send_text_message", result!)).toEqual(result);
      expect(isToolCallFailureResult(result!.result)).toBe(true);
      expect(h.send).toHaveBeenCalledExactlyOnceWith("tenant-owned", {
        to: args.to_number,
        body: "Reviewed appointment details.",
        channel: "sms",
        agentId: "agent-owned",
      });
      // Unknown delivery must not enqueue a later resend or claim a manual handoff.
      expect(h.save).not.toHaveBeenCalled();
      expect(h.gate).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: args.to_number,
          isLiveSessionFollowUp: false,
          hasExpressWrittenConsent: false,
        }),
      );
    },
  );

  it.each(["sms", "whatsapp"])(
    "keeps accepted %s sends successful without extra work",
    async (channel) => {
      h.send.mockResolvedValueOnce({ ok: true, channel });
      const result = await handleCoreToolCall("send_text_message", { ...args, channel }, context);
      expect(result?.result).toBe(
        `${channel === "sms" ? "SMS" : "WhatsApp"} sent to ${args.to_number}.`,
      );
      expect(isToolCallFailureResult(result!.result)).toBe(false);
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.save).not.toHaveBeenCalled();
    },
  );
});
