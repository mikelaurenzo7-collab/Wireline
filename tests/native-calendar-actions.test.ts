import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionItem } from "../src/lib/action-types";

const h = vi.hoisted(() => ({
  configuration: vi.fn(),
  book: vi.fn(),
  externalBook: vi.fn(),
  insert: vi.fn(),
  connections: vi.fn(),
  allowedTools: vi.fn(),
  environment: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => {
        const chain = {
          where: () => ({
            limit: async () => [
              {
                enabledTools: ["book_appointment"],
                autonomyLevel: "draft",
                tenantAutonomyLevel: "draft",
                timeZone: "America/Chicago",
              },
            ],
          }),
        };
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
vi.mock("../src/lib/agent-tool-authorization", () => ({
  NO_TENANT_INTEGRATIONS: {},
  sanitizePersistedAgentToolSelection: (value: unknown) => value,
  resolveAuthorizedAgentTools: h.allowedTools,
}));
vi.mock("../src/lib/tenant-integration-connections", () => ({
  loadTenantIntegrationConnections: h.connections,
}));
vi.mock("../src/lib/native-calendar", () => ({
  getNativeCalendarConfiguration: h.configuration,
  bookNativeAppointment: h.book,
}));
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    bookAppointment = h.externalBook;
  },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  externalEntityActionPolicyForUser: vi.fn(),
}));
vi.mock("../src/lib/ai-supervisor", () => ({
  ClientCommunicationBlockedError: class extends Error {},
  superviseClientCommunication: vi.fn(),
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
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: vi.fn() }));

import { executeAction } from "../src/lib/action-engine";
const action: ActionItem = {
  type: "schedule_calendar",
  priority: "medium",
  agentId: "bot",
  payload: {
    event_name: "Consultation",
    customer_name: "Avery",
    date: "2026-10-02",
    time: "10:00",
    timezone: "America/Chicago",
  },
};
const context = { sourceId: "call-1", sourceType: "phone_call" };

beforeEach(() => {
  vi.clearAllMocks();
  h.configuration.mockResolvedValue({
    configured: true,
    settings: { enabled: true, duration_minutes: 30, booking_mode: "automatic" },
  });
  h.connections.mockResolvedValue({ native_calendar_configured: true, native_calendar: true });
  h.allowedTools.mockReturnValue(["book_appointment", "send_text_message"]);
  h.environment.mockResolvedValue({ allowed: true });
  h.book.mockResolvedValue({ id: "appointment-1", status: "Scheduled" });
});

describe("native Calendar action approval policy", () => {
  it("uses Calendar automatic mode instead of adding a generic draft approval", async () => {
    await expect(executeAction("tenant", action, context)).resolves.toEqual({
      success: true,
      actionId: "appointment-1",
    });
    expect(h.book).toHaveBeenCalledWith(
      "tenant",
      expect.objectContaining({
        customerName: "Avery",
        callId: "call-1",
        requestKey: expect.stringMatching(/^native-calendar:action:[a-f0-9]{64}$/),
      }),
    );
    const key = h.book.mock.calls[0][1].requestKey;
    await executeAction("tenant", action, context);
    expect(h.book.mock.calls[1][1].requestKey).toBe(key);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.externalBook).not.toHaveBeenCalled();
  });

  it("keeps owner-selected approval in Calendar without creating a second Inbox approval", async () => {
    h.configuration.mockResolvedValue({
      configured: true,
      settings: { enabled: true, duration_minutes: 30, booking_mode: "approval" },
    });
    h.book.mockResolvedValue({ id: "appointment-1", status: "Requested" });
    await expect(executeAction("tenant", action, context)).resolves.toEqual({
      success: true,
      queued: true,
      actionId: "appointment-1",
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.externalBook).not.toHaveBeenCalled();
  });

  it("follows Ask for approval when calendar confirmation is inherited", async () => {
    h.configuration.mockResolvedValue({
      configured: true,
      settings: { enabled: true, duration_minutes: 30, booking_mode: "inherit" },
    });
    expect(await executeAction("tenant", action, context)).toEqual({ success: true, queued: true });
    expect(h.book).not.toHaveBeenCalled();
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "schedule_calendar" }),
    );
  });

  it("retains the agent tool authorization and live account gates", async () => {
    h.allowedTools.mockReturnValueOnce([]);
    expect(await executeAction("tenant", action, context)).toMatchObject({ success: false });
    expect(h.book).not.toHaveBeenCalled();
    h.environment.mockResolvedValueOnce({ allowed: false, message: "Live actions are disabled." });
    expect(await executeAction("tenant", action, context)).toMatchObject({
      success: false,
      error: "Live actions are disabled.",
    });
    expect(h.book).not.toHaveBeenCalled();
  });

  it("retains ordinary draft policy for external calendars and unrelated actions", async () => {
    h.connections.mockResolvedValue({ google_calendar: true });
    expect(await executeAction("tenant", action, context)).toEqual({ success: true, queued: true });
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "schedule_calendar" }),
    );
    h.connections.mockResolvedValue({ native_calendar_configured: true, native_calendar: true });
    expect(
      await executeAction(
        "tenant",
        { ...action, type: "send_text_message", payload: { to: "+13125550100", body: "Hello" } },
        context,
      ),
    ).toEqual({ success: true, queued: true });
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "send_text_message" }),
    );
    expect(h.book).not.toHaveBeenCalled();
    expect(h.externalBook).not.toHaveBeenCalled();
  });

  it("does not report a cancelled replay as successfully booked", async () => {
    h.book.mockResolvedValue({ id: "appointment-1", status: "Cancelled" });
    expect(await executeAction("tenant", action, context)).toMatchObject({
      success: false,
      error: expect.stringContaining("no longer scheduled"),
    });
  });

  it.each(["Confirmed", "Rescheduled"])(
    "retains success for an existing %s booking",
    async (status) => {
      h.book.mockResolvedValue({ id: "appointment-1", status, created: false });
      expect(await executeAction("tenant", action, context)).toEqual({
        success: true,
        actionId: "appointment-1",
      });
      expect(h.insert).not.toHaveBeenCalled();
      expect(h.externalBook).not.toHaveBeenCalled();
    },
  );
});
