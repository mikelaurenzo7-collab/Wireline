import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  sendEmail: vi.fn(),
  saveTask: vi.fn(),
  environment: vi.fn(),
  entity: vi.fn(),
}));
vi.mock("../src/lib/ai-supervisor", () => ({ superviseClientCommunication: h.supervise }));
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    sendEmail = h.sendEmail;
  },
}));
vi.mock("../src/lib/server-context", () => ({
  auditLogger: {},
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  externalEntityActionPolicyForUser: h.entity,
}));
vi.mock("../src/lib/twilio-service", () => ({
  lookupTenantPhoneNumber: vi.fn(),
  sendTenantMessage: vi.fn(),
}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({
  PRESERVED_LEAD_STATUSES: [],
  sanitizePhone: vi.fn(),
}));
vi.mock("../src/lib/agent-link-tool-handlers", () => ({
  handleSendPaymentLink: vi.fn(),
  handleSendSignupLink: vi.fn(),
}));

import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import { isManualOperatorTask } from "../src/lib/operator-work-status";
import { enforceAgentToolResultTruth } from "../src/lib/agent-tool-result-truth";
import { RUNTIME_ACTION_SAFETY_BLOCK } from "../src/lib/agent-runtime";

const args = {
  to_email: "confirmed@example.test",
  subject: "Requested pricing",
  body: "Original requested details.",
  email_confirmed: true,
};
const context = {
  toolCallId: "tool-email",
  payload: {},
  message: { call: { id: "call-owned" } },
  agent: { id: "agent-owned", user_id: "tenant-owned" },
  webhookAgentId: "agent-owned",
  drizzle: { insert: () => ({ values: h.saveTask }) },
  log: { warn: vi.fn(), error: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  h.environment.mockResolvedValue({ allowed: true });
  h.entity.mockResolvedValue({ allowed: true });
  h.supervise.mockResolvedValue({ subject: "Reviewed pricing", body: "Reviewed details." });
  h.sendEmail.mockResolvedValue(false);
  h.saveTask.mockResolvedValue(undefined);
});

describe("live email delivery and manual handoff", () => {
  it.each([undefined, false, "true"])(
    "requires explicit confirmed-address evidence rather than %s before sending or saving",
    async (emailConfirmed) => {
      const result = await handleCoreToolCall(
        "send_email",
        { ...args, email_confirmed: emailConfirmed },
        context,
      );
      expect(result?.result).toContain("EMAIL_CONFIRMATION_REQUIRED");
      expect(result?.result).toContain("Read back the exact email address");
      expect(h.supervise).not.toHaveBeenCalled();
      expect(h.sendEmail).not.toHaveBeenCalled();
      expect(h.saveTask).not.toHaveBeenCalled();
    },
  );

  it("saves an unconfirmed send as completable manual work with the exact reviewed recipient and message", async () => {
    const result = await handleCoreToolCall("send_email", args, context);
    expect(h.sendEmail).toHaveBeenCalledExactlyOnceWith({
      to: args.to_email,
      subject: "Reviewed pricing",
      body: "Reviewed details.",
    });
    expect(h.saveTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        userId: "tenant-owned",
        agentId: "agent-owned",
        taskType: "follow_up",
        targetChannel: "manual",
        status: "pending",
        payload: {
          to: args.to_email,
          subject: "Reviewed pricing",
          body: "Reviewed details.",
          channel: "email",
          delivery_status: "unconfirmed",
        },
      }),
    );
    const task = h.saveTask.mock.calls[0][0];
    expect(isManualOperatorTask(task.taskType)).toBe(true);
    expect(task.description).toContain("check sent mail before sending to avoid duplicates");
    expect(result?.result).toContain("send was not confirmed");
    expect(result?.result).toContain("request was saved for manual review");
    expect(result?.result).toContain("Do not promise delivery or retry automatically");
    expect(enforceAgentToolResultTruth("send_email", result!)).toEqual(result);
  });

  it("does not claim a saved request if task persistence fails", async () => {
    h.saveTask.mockRejectedValue(new Error("database unavailable"));
    const result = await handleCoreToolCall("send_email", args, context);
    expect(h.saveTask).toHaveBeenCalledTimes(1);
    expect(result?.result).toContain("follow-up request could not be saved");
    expect(result?.result).not.toContain("request was saved");
    expect(result?.result).not.toContain("No email was sent");
    expect(result?.result).toContain("Do not retry automatically");
  });

  it("records a definite pre-send block without claiming an attempted delivery", async () => {
    h.supervise.mockRejectedValue(new Error("review required"));
    const result = await handleCoreToolCall("send_email", args, context);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.saveTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        taskType: "follow_up",
        payload: expect.objectContaining({
          to: args.to_email,
          subject: args.subject,
          body: args.body,
          delivery_status: "not_sent",
        }),
      }),
    );
    expect(result?.result).toContain("No email was sent");
    expect(result?.result).toContain("request was saved for manual review");
  });

  it("retains delivery uncertainty after a thrown transport result and never retries", async () => {
    h.sendEmail.mockRejectedValue(new Error("connection lost after provider acceptance"));
    const result = await handleCoreToolCall("send_email", args, context);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.saveTask).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        taskType: "follow_up",
        payload: expect.objectContaining({
          to: args.to_email,
          subject: "Reviewed pricing",
          body: "Reviewed details.",
          delivery_status: "unconfirmed",
        }),
      }),
    );
    expect(result?.result).toContain("send was not confirmed");
    expect(result?.result).toContain("check sent mail first to avoid duplicates");
    expect(result?.result).not.toContain("No email was sent");
  });

  it("reports a successful provider submission without creating manual work or claiming inbox receipt", async () => {
    h.sendEmail.mockResolvedValue(true);
    const result = await handleCoreToolCall("send_email", args, context);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.saveTask).not.toHaveBeenCalled();
    expect(result?.result).toBe(
      "Email submitted successfully. Inbox delivery has not been verified.",
    );
  });

  it.each(["environment", "entity"] as const)(
    "preserves the %s protection before supervision, sending or task creation",
    async (policy) => {
      h[policy].mockResolvedValue({ allowed: false, message: "Live action is blocked." });
      const result = await handleCoreToolCall("send_email", args, context);
      expect(result?.result).toBe("Live action is blocked.");
      expect(h.supervise).not.toHaveBeenCalled();
      expect(h.sendEmail).not.toHaveBeenCalled();
      expect(h.saveTask).not.toHaveBeenCalled();
    },
  );

  it("requires recipient readback and separates saved requests, submission and delivery in the shared prompt", () => {
    expect(RUNTIME_ACTION_SAFETY_BLOCK).toContain(
      "read back the exact email address and wait for the caller to confirm it",
    );
    expect(RUNTIME_ACTION_SAFETY_BLOCK).toContain("A saved follow-up request is not a sent email");
    expect(RUNTIME_ACTION_SAFETY_BLOCK).toContain(
      "Never tell a caller to look out for an email or check their inbox when sending is unconfirmed",
    );
    expect(RUNTIME_ACTION_SAFETY_BLOCK).toContain("do not retry automatically");
  });
});
