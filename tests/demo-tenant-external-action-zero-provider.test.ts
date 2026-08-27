import { afterEach, describe, expect, it, vi } from "vitest";

const blockedPolicy = {
  allowed: false as const,
  environment: "demo" as const,
  status: 403 as const,
  code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED" as const,
  message: "Live external actions are disabled in this demo or test workspace.",
};

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("demo tenant external actions stop before providers", () => {
  it("does not hydrate Apollo credentials or call Apollo for tenant search/enrichment", async () => {
    const fetchSpy = vi.fn();
    const fetchWithTimeout = vi.fn();
    const select = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue(blockedPolicy),
    }));
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: quietLog,
      fetchWithTimeout,
    }));

    const { enrichLead, searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Founder"] }, "demo-user")).resolves.toEqual([]);
    await expect(enrichLead("+14155552671", "demo-user")).resolves.toBeNull();

    expect(select).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("does not call tenant signup/payment email or communication supervision", async () => {
    const signupSend = vi.fn();
    const paymentSend = vi.fn();
    const supervise = vi.fn();
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue(blockedPolicy),
      externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("../src/lib/ai-supervisor", () => ({
      superviseClientCommunication: supervise,
    }));
    vi.doMock("../src/lib/email-service", () => ({
      sendSignupLinkEmail: signupSend,
      sendPaymentLinkEmail: paymentSend,
    }));

    const { handleCoreToolCall } = await import("../src/routes/vapi/tool-handlers-core");
    const context = {
      toolCallId: "tool-1",
      payload: {},
      message: {},
      agent: { id: "agent-1", user_id: "demo-user" },
      webhookAgentId: "agent-1",
      drizzle: {},
      log: quietLog,
    };

    const signup = await handleCoreToolCall(
      "send_signup_link",
      { to_email: "person@customer.co", email_confirmed: true },
      context,
    );
    const payment = await handleCoreToolCall(
      "send_payment_link",
      { to_email: "person@customer.co", email_confirmed: true },
      context,
    );
    const email = await handleCoreToolCall(
      "send_email",
      { to_email: "person@customer.co", subject: "Hello", body: "Hi" },
      context,
    );

    expect(signup?.result).toContain("DELIVERY_FAILED");
    expect(payment?.result).toContain("DELIVERY_FAILED");
    expect(email?.result).toContain("disabled");
    expect(signupSend).not.toHaveBeenCalled();
    expect(paymentSend).not.toHaveBeenCalled();
    expect(supervise).not.toHaveBeenCalled();
  });

  it("does not call Slack or Zoom when the workspace is demo-classified", async () => {
    const fetchSpy = vi.fn();
    const fetchWithTimeout = vi.fn();
    const select = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue(blockedPolicy),
    }));
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: quietLog,
      fetchWithTimeout,
    }));

    const { postAgentNotification } = await import("../src/lib/slack-service");
    const { createMeeting } = await import("../src/lib/zoom-service");
    await expect(postAgentNotification("demo-user", "A customer needs help")).resolves.toBe(false);
    await expect(
      createMeeting("demo-user", { topic: "Demo", startTime: new Date().toISOString() }),
    ).resolves.toBeNull();

    expect(select).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("keeps fixture email and SMS targets inert in a production-classified tenant", async () => {
    const supervise = vi.fn();
    const tenantMessage = vi.fn();
    const signupSend = vi.fn();
    const paymentSend = vi.fn();
    const entityPolicy = vi.fn().mockResolvedValue({
      allowed: false,
      status: 403,
      code: "DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED",
      message: "Live outreach to showcase data is disabled.",
      reason: "demo_lead",
    });
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi
        .fn()
        .mockResolvedValue({ allowed: true, environment: "production" }),
      externalEntityActionPolicyForUser: entityPolicy,
    }));
    vi.doMock("../src/lib/ai-supervisor", () => ({
      superviseClientCommunication: supervise,
    }));
    vi.doMock("../src/lib/twilio-service", () => ({
      lookupTenantPhoneNumber: vi.fn(),
      sendTenantMessage: tenantMessage,
    }));
    vi.doMock("../src/lib/email-service", () => ({
      sendSignupLinkEmail: signupSend,
      sendPaymentLinkEmail: paymentSend,
    }));

    const { handleCoreToolCall } = await import("../src/routes/vapi/tool-handlers-core");
    const context = {
      toolCallId: "tool-1",
      payload: {},
      message: {},
      agent: { id: "agent-1", user_id: "production-user" },
      webhookAgentId: "agent-1",
      drizzle: {},
      log: quietLog,
    };

    const email = await handleCoreToolCall(
      "send_email",
      { to_email: "seed@example.com", subject: "Hello", body: "Hi" },
      context,
    );
    const sms = await handleCoreToolCall(
      "send_text_message",
      { to_number: "+12125550100", message_body: "Hello" },
      context,
    );
    const signup = await handleCoreToolCall(
      "send_signup_link",
      { to_email: "seed@example.com", email_confirmed: true },
      context,
    );
    const payment = await handleCoreToolCall(
      "send_payment_link",
      { to_email: "seed@example.com", email_confirmed: true },
      context,
    );

    expect(email?.result).toContain("showcase data");
    expect(sms?.result).toContain("showcase data");
    expect(signup?.result).toContain("DELIVERY_FAILED");
    expect(payment?.result).toContain("DELIVERY_FAILED");
    expect(supervise).not.toHaveBeenCalled();
    expect(tenantMessage).not.toHaveBeenCalled();
    expect(signupSend).not.toHaveBeenCalled();
    expect(paymentSend).not.toHaveBeenCalled();
  });

  it("rejects a fixture outbound voice target before acquiring a lease or calling Twilio", async () => {
    const deletionFence = vi.fn();
    const getTwilioClient = vi.fn();
    const fixtureError = new Error("Live outreach to showcase data is disabled.");
    vi.doMock("../src/lib/account-environment-policy", () => ({
      assertLiveExternalActionAllowed: vi.fn().mockResolvedValue(undefined),
      assertExternalEntityActionAllowed: vi.fn().mockRejectedValue(fixtureError),
    }));
    vi.doMock("../src/lib/tenant-provider-deletion-fence", () => ({
      runTenantProviderWorkWithDeletionFence: deletionFence,
    }));
    vi.doMock("../src/lib/twilio-service", () => ({ getTwilioClient }));

    const { placeOutboundCall } = await import("../src/lib/voice/outbound-call-service");
    await expect(
      placeOutboundCall({
        userId: "production-user",
        agentId: "agent-1",
        customerNumber: "+12125550100",
        callPurpose: "service_or_requested",
      }),
    ).rejects.toBe(fixtureError);

    expect(deletionFence).not.toHaveBeenCalled();
    expect(getTwilioClient).not.toHaveBeenCalled();
  });

  it("returns no Vapi transfer destination when production flips to demo during notification", async () => {
    let accountEnvironment: "production" | "demo" = "production";
    const livePolicy = vi.fn(async () =>
      accountEnvironment === "production"
        ? ({ allowed: true, environment: "production" } as const)
        : blockedPolicy,
    );
    const entityPolicy = vi.fn().mockResolvedValue({ allowed: true });
    const sendUrgentAlert = vi.fn(async () => {
      accountEnvironment = "demo";
    });
    const recordEscalationOutcome = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: livePolicy,
      externalEntityActionPolicyForUser: entityPolicy,
    }));
    vi.doMock("../src/lib/notifications", () => ({
      NotificationService: class {
        sendUrgentAlert = sendUrgentAlert;
      },
    }));
    vi.doMock("../src/lib/call-reliability-capture", () => ({
      recordEscalationOutcome,
    }));

    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ phone: "+14155551234", transferPhone: null, enabled: true }])
      .mockResolvedValueOnce([]);
    const drizzle = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    };

    const { handleWorkflowToolCall } = await import("../src/routes/vapi/tool-handlers-workflow");
    const result = await handleWorkflowToolCall(
      "escalate_to_human",
      { reason: "Customer asked for the owner" },
      {
        toolCallId: "tool-transfer",
        payload: { call: { id: "call-1" } },
        message: {},
        agent: { id: "agent-1", user_id: "tenant-1" },
        webhookAgentId: "agent-1",
        agentVoiceName: "Front Desk",
        drizzle,
        log: quietLog,
      },
    );

    expect(sendUrgentAlert).toHaveBeenCalledTimes(1);
    expect(livePolicy).toHaveBeenCalledTimes(2);
    expect(entityPolicy).toHaveBeenCalledTimes(1);
    expect(recordEscalationOutcome).toHaveBeenCalledWith({
      vapiCallId: "call-1",
      userId: "tenant-1",
      succeeded: false,
    });
    expect(result).not.toHaveProperty("destination");
    expect(result?.result).toContain("disabled");
  });
});
