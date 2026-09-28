import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  supervise: vi.fn(),
  sendEmail: vi.fn(),
  insert: vi.fn(),
  entitlements: vi.fn(),
  agentRows: [] as Array<Record<string, unknown>>,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => {
        const chain = { where: () => ({ limit: async () => h.agentRows }) };
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
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    sendEmail = h.sendEmail;
  },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  externalEntityActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/crm-service", () => ({ CRMService: class {} }));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: vi.fn() }));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: vi.fn() }));
vi.mock("../src/lib/apollo-service", () => ({ searchLeads: vi.fn() }));
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
  getTenantChannelEntitlements: h.entitlements,
}));
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: vi.fn() }));

import { executeAction } from "../src/lib/action-engine";
import { ClientCommunicationBlockedError } from "../src/lib/ai-supervisor";
import type { ActionItem } from "../src/lib/action-types";

const action: ActionItem = {
  type: "send_email",
  priority: "medium",
  payload: { to: "customer@example.test", subject: "Follow Up", body: "Please reply." },
};
const context = { sourceId: "call-1", sourceType: "manual_approval" };
beforeEach(() => {
  vi.clearAllMocks();
  h.agentRows = [];
  h.entitlements.mockResolvedValue({ channels: ["email"] });
  h.sendEmail.mockResolvedValue(true);
  h.supervise.mockRejectedValue(new ClientCommunicationBlockedError("The message needs revision."));
});

describe("email approval supervision", () => {
  it.each(["auto", "draft"] as const)(
    "preserves eligible Email agent %s actions with fresh channel authority",
    async (autonomy) => {
      h.agentRows = [{ enabledTools: ["send_email"], autonomyLevel: "draft" }];
      h.supervise.mockResolvedValue({ subject: "Reviewed Subject", body: "Reviewed body." });
      const result = await executeAction(
        "tenant",
        { ...action, agentId: "email-bot" },
        context,
        autonomy,
      );
      expect(h.entitlements).toHaveBeenCalledWith("tenant");
      expect(result).toEqual(
        autonomy === "auto" ? { success: true } : { success: true, queued: true },
      );
      expect(h.sendEmail).toHaveBeenCalledTimes(autonomy === "auto" ? 1 : 0);
      expect(h.insert).toHaveBeenCalledTimes(autonomy === "draft" ? 1 : 0);
    },
  );

  it.each(["auto", "draft"] as const)(
    "blocks Calls-only agent %s email actions before supervision or task creation",
    async (autonomy) => {
      h.agentRows = [{ enabledTools: ["send_email"], autonomyLevel: "draft" }];
      h.entitlements.mockResolvedValue({ channels: ["voice"] });
      expect(
        await executeAction("tenant", { ...action, agentId: "calls-bot" }, context, autonomy),
      ).toMatchObject({ success: false });
      expect(h.sendEmail).not.toHaveBeenCalled();
      expect(h.supervise).not.toHaveBeenCalled();
      expect(h.insert).not.toHaveBeenCalled();
    },
  );

  it("keeps manual agent tasks available when channel lookup fails", async () => {
    h.agentRows = [{ enabledTools: ["create_followup_task"], autonomyLevel: "draft" }];
    h.entitlements.mockRejectedValue(new Error("Channel lookup unavailable"));
    expect(
      await executeAction(
        "tenant",
        { ...action, agentId: "calls-bot", type: "create_internal_task" },
        context,
        "draft",
      ),
    ).toEqual({ success: true });
    expect(h.insert).toHaveBeenCalledOnce();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("keeps a blocked approval editable without claiming execution or creating another draft", async () => {
    const result = await executeAction(
      "tenant",
      action,
      { ...context, approvalTaskId: "task-1" },
      "auto",
    );
    expect(result).toMatchObject({ success: false, errorCode: "COMMUNICATION_BLOCKED" });
    expect(result.error).toContain("The message needs revision.");
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("retains the draft fallback for blocked autonomous email", async () => {
    const result = await executeAction("tenant", action, context, "auto");
    expect(result).toEqual({ success: true, queued: true });
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "send_email", status: "pending" }),
    );
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("sends only the reviewed content when approval passes", async () => {
    h.supervise.mockResolvedValue({ subject: "Reviewed Subject", body: "Reviewed body." });
    await expect(
      executeAction("tenant", action, { ...context, approvalTaskId: "task-1" }, "auto"),
    ).resolves.toEqual({ success: true });
    expect(h.sendEmail).toHaveBeenCalledWith({
      to: action.payload.to,
      subject: "Reviewed Subject",
      body: "Reviewed body.",
    });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("does not turn unexpected supervisor failures into another task", async () => {
    h.supervise.mockRejectedValue(new Error("Supervisor unavailable"));
    await expect(
      executeAction("tenant", action, { ...context, approvalTaskId: "task-1" }, "auto"),
    ).rejects.toThrow("Supervisor unavailable");
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
