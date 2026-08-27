import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchBlocked: vi.fn(),
  accountEnvironment: "production" as string | null,
  subscriptionStatus: "active",
  settingsLookupError: null as Error | null,
  endOfCall: vi.fn(),
  geminiSentiment: vi.fn(),
  urgentAlert: vi.fn(),
}));

vi.mock("../src/lib/launch-readiness", () => ({
  isLaunchHardBlocked: mocks.launchBlocked,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (mocks.settingsLookupError) throw mocks.settingsLookupError;
            return [
              {
                accountEnvironment: mocks.accountEnvironment,
                subscriptionStatus: mocks.subscriptionStatus,
              },
            ];
          },
        }),
      }),
    }),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  tenantStore: {
    run: async (_userId: string, operation: () => Promise<unknown>) => operation(),
  },
}));
vi.mock("../src/lib/vapi-handlers", () => ({
  handleEndOfCallReport: mocks.endOfCall,
}));
vi.mock("../src/lib/gemini-brain", () => ({
  analyzeLiveSentiment: mocks.geminiSentiment,
}));
vi.mock("../src/lib/notifications", () => ({
  NotificationService: class {
    sendUrgentAlert = mocks.urgentAlert;
  },
}));

import { runVapiExternalEffectsIfAllowed } from "../src/lib/vapi-external-effect-policy";
import {
  isVapiTenantEvidenceMessage,
  vapiTenantWebhookPolicy,
} from "../src/lib/vapi-tenant-webhook-policy";
import { processVapiWebhookJob } from "../src/lib/vapi-webhook-queue";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Vapi account-environment evidence boundary", () => {
  beforeEach(() => {
    mocks.launchBlocked.mockReset();
    mocks.launchBlocked.mockReturnValue(false);
    mocks.accountEnvironment = "production";
    mocks.subscriptionStatus = "active";
    mocks.settingsLookupError = null;
    mocks.endOfCall.mockReset();
    mocks.endOfCall.mockResolvedValue(undefined);
    mocks.geminiSentiment.mockReset();
    mocks.geminiSentiment.mockResolvedValue({
      escalate: true,
      reason: "frustrated",
      urgency: "high",
    });
    mocks.urgentAlert.mockReset();
    mocks.urgentAlert.mockResolvedValue(undefined);
  });

  it("accepts evidence but denies new work for demo, test, missing, and unknown accounts", () => {
    for (const environment of ["demo", "test", null, "unknown"]) {
      for (const type of [
        "status-update",
        "speech-update",
        "transcript",
        "conversation-update",
        "end-of-call-report",
      ]) {
        expect(vapiTenantWebhookPolicy(environment, type), `${environment}:${type}`).toEqual({
          allowed: true,
          evidenceOnly: true,
          externalEffectsAllowed: false,
        });
      }
      for (const type of ["assistant-request", "tool-calls", "future-new-work"]) {
        const decision = vapiTenantWebhookPolicy(environment, type);
        expect(decision.allowed, `${environment}:${type}`).toBe(false);
        expect(decision.externalEffectsAllowed, `${environment}:${type}`).toBe(false);
      }
    }

    expect(vapiTenantWebhookPolicy("production", "assistant-request")).toEqual({
      allowed: true,
      evidenceOnly: false,
      externalEffectsAllowed: true,
    });
    expect(isVapiTenantEvidenceMessage("end-of-call-report")).toBe(true);
    expect(isVapiTenantEvidenceMessage("tool-calls")).toBe(false);
  });

  it("runs a demo end-of-call through the evidence handler instead of a whole-job gate", async () => {
    await expect(
      processVapiWebhookJob({
        id: "job-1",
        type: "vapi_webhook",
        payload: {
          webhookType: "end-of-call-report",
          payload: { message: { type: "end-of-call-report", call: { id: "call-1" } } },
          agentId: "agent-1",
          userId: "demo-user",
          webhookAgentId: "agent-1",
        },
      } as never),
    ).resolves.toEqual({ webhookType: "end-of-call-report", vapiCallId: "call-1" });

    expect(mocks.endOfCall).toHaveBeenCalledWith({
      message: { type: "end-of-call-report", call: { id: "call-1" } },
      agent: { id: "agent-1", user_id: "demo-user" },
    });
  });

  it("never invokes optional provider callbacks for demo, inactive, launch-held, or lookup-failed work", async () => {
    const provider = vi.fn(async () => "provider-called");

    mocks.accountEnvironment = "demo";
    await expect(
      runVapiExternalEffectsIfAllowed({
        userId: "demo-user",
        action: "vapi_end_of_call_external_effects",
        perform: provider,
      }),
    ).resolves.toEqual({ performed: false, reason: "account_environment" });

    mocks.accountEnvironment = "production";
    mocks.subscriptionStatus = "past_due";
    await expect(
      runVapiExternalEffectsIfAllowed({
        userId: "suspended-user",
        action: "vapi_post_call_digest",
        perform: provider,
      }),
    ).resolves.toEqual({ performed: false, reason: "subscription_inactive" });

    mocks.subscriptionStatus = "active";
    mocks.launchBlocked.mockReturnValueOnce(true);
    await expect(
      runVapiExternalEffectsIfAllowed({
        userId: "production-user",
        action: "vapi_conversation_update_external_effects",
        perform: provider,
      }),
    ).resolves.toEqual({ performed: false, reason: "launch_hold" });

    const lookupError = new Error("account environment lookup unavailable");
    mocks.settingsLookupError = lookupError;
    await expect(
      runVapiExternalEffectsIfAllowed({
        userId: "unknown-user",
        action: "vapi_end_of_call_external_effects",
        perform: provider,
      }),
    ).rejects.toBe(lookupError);

    expect(provider).not.toHaveBeenCalled();
  });

  it("gates conversation-update Gemini and notifications before either provider boundary", async () => {
    mocks.accountEnvironment = "demo";

    await expect(
      processVapiWebhookJob({
        id: "job-2",
        type: "vapi_webhook",
        payload: {
          webhookType: "conversation-update",
          payload: {
            message: {
              type: "conversation-update",
              conversation: [{ role: "user", content: "I am angry and frustrated" }],
              call: { id: "call-2" },
            },
          },
          agentId: "agent-2",
          userId: "demo-user",
          webhookAgentId: "agent-2",
        },
      } as never),
    ).resolves.toMatchObject({ webhookType: "conversation-update" });

    expect(mocks.geminiSentiment).not.toHaveBeenCalled();
    expect(mocks.urgentAlert).not.toHaveBeenCalled();
  });

  it("orders mandatory end-of-call evidence before digest and provider-effect admission", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    const endOfCall = handlers.slice(
      handlers.indexOf("export async function handleEndOfCallReport"),
    );
    const metering = endOfCall.indexOf("await trackVoiceMinutes({");
    const digestGate = endOfCall.indexOf('action: "vapi_post_call_digest"');
    const effectGate = endOfCall.indexOf('action: "vapi_end_of_call_external_effects"');

    expect(metering).toBeGreaterThanOrEqual(0);
    expect(metering).toBeLessThan(digestGate);
    expect(digestGate).toBeLessThan(endOfCall.indexOf("enqueuePostCallDigest({", digestGate));
    expect(effectGate).toBeLessThan(endOfCall.indexOf("claudeBrain.withAuditCapture", effectGate));
    expect(effectGate).toBeLessThan(endOfCall.indexOf("dispatchWebhook(userId", effectGate));
    expect(effectGate).toBeLessThan(endOfCall.indexOf("NotificationService", effectGate));
    expect(effectGate).toBeLessThan(endOfCall.indexOf("slackPostMessage", effectGate));
    expect(effectGate).toBeLessThan(endOfCall.indexOf("geminiPostCallAnalysis", effectGate));

    const pausePolicy = read("src/lib/provider-spend-job-pause.ts");
    expect(pausePolicy).not.toContain('"vapi_webhook"');
  });

  it("classifies only after tenant resolution and keeps the explicit showcase canary ahead of it", () => {
    const route = read("src/routes/vapi-v2.ts");
    const showcase = route.indexOf('showcaseRoute && message?.type === "assistant-request"');
    const tenant = route.indexOf("resolveVapiWebhookAgent({ payload, queryAgentId })");
    const policy = route.indexOf("vapiTenantWebhookPolicy(", tenant);

    expect(showcase).toBeGreaterThanOrEqual(0);
    expect(showcase).toBeLessThan(tenant);
    expect(policy).toBeGreaterThan(tenant);
    expect(route).toContain("externalEffectsAllowed &&");
    expect(route).toContain("isVapiTenantEvidenceMessage");
  });
});
