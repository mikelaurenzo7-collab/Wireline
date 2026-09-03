import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/lib/api-error";
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
} from "../src/lib/account-environment-policy";

const environmentMocks = vi.hoisted(() => ({
  assertAllowed: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/account-environment-policy")>();
  return {
    ...actual,
    assertLiveExternalActionAllowed: environmentMocks.assertAllowed,
  };
});

import { assertProviderSpendJobEnvironmentAllowed } from "../src/lib/provider-spend-job-environment";
import { enforceSpendCap } from "../src/lib/spend-guards";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("account-environment AI and provider-spend admission", () => {
  beforeEach(() => {
    environmentMocks.assertAllowed.mockReset();
    environmentMocks.assertAllowed.mockResolvedValue(undefined);
  });

  it.each([
    [
      "demo",
      new AppError(
        403,
        NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
        "Live external actions are disabled in this demo or test workspace.",
      ),
    ],
    [
      "test",
      new AppError(
        403,
        NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
        "Live external actions are disabled in this demo or test workspace.",
      ),
    ],
    [
      "missing",
      new AppError(
        503,
        ACCOUNT_ENVIRONMENT_UNAVAILABLE,
        "Live external actions are unavailable until this workspace is fully configured.",
      ),
    ],
    [
      "unknown",
      new AppError(
        503,
        ACCOUNT_ENVIRONMENT_UNAVAILABLE,
        "Live external actions are unavailable until this workspace is fully configured.",
      ),
    ],
    ["lookup outage", new Error("account environment lookup unavailable")],
  ])("blocks %s work in enforceSpendCap before next/provider admission", async (_label, error) => {
    environmentMocks.assertAllowed.mockRejectedValueOnce(error);
    const next = vi.fn();

    await expect(
      enforceSpendCap({ user: { id: "workspace-1" } } as never, { status: vi.fn() } as never, next),
    ).rejects.toBe(error);

    expect(environmentMocks.assertAllowed).toHaveBeenCalledWith(
      "workspace-1",
      "provider_spend_admission",
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks tenant provider-spend jobs but preserves system and cost-relief work", async () => {
    const provider = vi.fn(async () => "provider-called");
    environmentMocks.assertAllowed.mockRejectedValueOnce(
      new AppError(
        403,
        NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
        "Live external actions are disabled in this demo or test workspace.",
      ),
    );

    await expect(
      (async () => {
        await assertProviderSpendJobEnvironmentAllowed({
          type: "post_call_artifact",
          userId: "demo-user",
        });
        return provider();
      })(),
    ).rejects.toMatchObject({ code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED });
    expect(provider).not.toHaveBeenCalled();

    environmentMocks.assertAllowed.mockClear();
    for (const type of [
      "twilio_message_reconciliation",
      "purge_deleted_account",
      "account_deletion_billing_reconciliation",
      "openai_realtime_hangup",
      "vapi_webhook",
    ]) {
      await expect(
        assertProviderSpendJobEnvironmentAllowed({ type, userId: "demo-user" }),
      ).resolves.toBeUndefined();
    }
    await expect(
      assertProviderSpendJobEnvironmentAllowed({
        type: "margin_at_risk_alert",
        userId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeUndefined();
    expect(environmentMocks.assertAllowed).not.toHaveBeenCalled();
  });

  it("fails closed when a provider-spend job has no tenant owner", async () => {
    await expect(
      assertProviderSpendJobEnvironmentAllowed({ type: "auto_qa_score", userId: "" }),
    ).rejects.toMatchObject({ status: 503, code: ACCOUNT_ENVIRONMENT_UNAVAILABLE });
    expect(environmentMocks.assertAllowed).not.toHaveBeenCalled();
  });

  it("mounts the common environment-and-cap guard before the paid OpenAI voice route", () => {
    const openai = read("src/routes/openai-realtime-routes.ts");
    const sessionStart = openai.indexOf('"/api/voice/openai/session"');
    const sessionHandler = openai.indexOf("async (req: AuthenticatedRequest", sessionStart);
    expect(sessionStart).toBeGreaterThan(-1);
    expect(sessionHandler).toBeGreaterThan(sessionStart);
    const session = openai.slice(sessionStart, sessionHandler);
    expect(session).toContain("enforceSpendCap");
    expect(session).toContain("enforceLaunchHardGate");

    const registry = read("src/server/register-api-routes.ts");
    expect(registry).not.toContain("voices-routes");
    expect(registry).not.toContain("voicesRouter");
  });

  it("admits Studio Preview Voice as private simulation while live Twilio, SMS, email, and number provision stay fenced", () => {
    const liveVoice = read("src/routes/live-voice-routes.ts");
    const sessionStart = liveVoice.indexOf('"/api/voice/live/session"');
    const sessionHandler = liveVoice.indexOf("async (req: AuthenticatedRequest", sessionStart);
    const session = liveVoice.slice(sessionStart, sessionHandler);
    expect(session).toContain("enforcePrivateVoiceSimulationSpendCap");
    expect(session).not.toMatch(/\benforceSpendCap\b/);

    const callControl = read("src/lib/voice/openai-realtime-call-control.ts");
    const create = callControl.slice(
      callControl.indexOf("export async function createServerManagedOpenAIRealtimeCall"),
      callControl.indexOf("async function createServerManagedOpenAIRealtimeCallUnfenced"),
    );
    expect(create).toContain('admission === "private_simulation"');
    expect(create).toContain("assertPrivateVoiceSimulationAllowed");
    expect(create).toContain("assertLiveExternalActionAllowed");
    expect(create.indexOf("assertPrivateVoiceSimulationAllowed")).toBeLessThan(
      create.indexOf("assertLiveExternalActionAllowed"),
    );
    expect(create.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      create.indexOf("runTenantProviderWorkWithDeletionFence"),
    );

    const liveAgent = read("src/lib/voice/openai-live-agent-service.ts");
    expect(liveAgent).toContain('admission: "private_simulation"');

    const chatgptSimulation = read("src/lib/voice/openai-realtime-service.ts");
    const simulationCreate = chatgptSimulation.slice(
      chatgptSimulation.indexOf("export async function createOpenAIRealtimeSimulationCall"),
    );
    expect(simulationCreate).not.toContain('admission: "private_simulation"');

    const outbound = read("src/lib/voice/outbound-call-service.ts");
    expect(outbound).toContain(
      'await assertLiveExternalActionAllowed(input.userId, "twilio_openai_outbound_call_create")',
    );
    const sms = read("src/routes/sms-routes.ts");
    expect(sms).toContain('await assertLiveExternalActionAllowed(userId, "sms_thread_reply")');
    const email = read("src/lib/daily-brief.ts");
    expect(email).toContain('assertLiveExternalActionAllowed(userId, "daily_brief_email")');
    const provision = read("src/lib/voice/native-phone-provisioning.ts");
    expect(provision).toContain("liveExternalActionPolicyForUser(input.userId)");
    const search = read("src/lib/voice/native-phone-carrier.ts");
    expect(search).toContain("liveExternalActionPolicyForUser(userId)");
  });

  it("places durable environment admission before every tenant job handler", () => {
    const worker = read("src/lib/job-worker.ts");
    const dispatch = worker.slice(
      worker.indexOf("async function dispatchJob(job"),
      worker.indexOf("export async function handleJob(job"),
    );
    expect(dispatch).toContain(
      "assertProviderSpendJobEnvironmentAllowed({ type: job.type, userId })",
    );
    expect(dispatch.indexOf("assertProviderSpendJobEnvironmentAllowed")).toBeLessThan(
      dispatch.indexOf("dispatchJobInProviderContext(job)"),
    );

    const policy = read("src/lib/provider-spend-job-environment.ts");
    expect(policy).toContain("isPausableProviderSpendJobType(job.type)");
    expect(policy).toContain("if (userId === SYSTEM_USER_ID) return");
    expect(policy).toContain("assertLiveExternalActionAllowed");
  });

  it("blocks account-bound ChatGPT voice simulation before limiter, quota, reserve, or OpenAI", () => {
    const route = read("src/routes/chatgpt-mcp-account-routes.ts");
    const start = route.indexOf('if (name === "start_private_voice_simulation")');
    const end = route.indexOf('if (name === "list_wireline_agents")', start);
    const simulation = route.slice(start, end);
    const environment = simulation.indexOf("assertLiveExternalActionAllowed(");

    expect(environment).toBeGreaterThan(simulation.indexOf("getAgentDraft("));
    for (const providerBoundary of [
      "rateLimit(`chatgpt-private-simulation",
      "quotaTracker.checkAndIncrement",
      "reservePlatformCostRecord({",
      "createOpenAIRealtimeSimulationCall({",
    ]) {
      expect(environment, providerBoundary).toBeLessThan(simulation.indexOf(providerBoundary));
    }
    expect(simulation).toContain('"chatgpt_private_voice_simulation"');
  });
});
