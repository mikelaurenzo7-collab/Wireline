import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPausableProviderSpendJobType,
  isProviderSpendPausedError,
  ProviderSpendPausedError,
  providerSpendPauseSchedule,
  runtimeReservationReferenceForJob,
} from "../src/lib/provider-spend-job-pause";
import { settleClaimedJobError } from "../src/lib/job-queue";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function expectMiddlewareBeforeHandler(source: string, route: string, handlerMarker: string) {
  const start = source.indexOf(route);
  expect(start).toBeGreaterThan(-1);
  const handler = source.indexOf(handlerMarker, start);
  expect(handler).toBeGreaterThan(start);
  const block = source.slice(start, handler);
  expect(block).toContain("enforceLaunchHardGate");
}

describe("provider spend launch kill switch", () => {
  it("guards account voice sessions and retires public voice before provider work", () => {
    const openai = read("src/routes/openai-realtime-routes.ts");
    const publicDemo = read("src/routes/marketing-runtime-routes.ts");

    expectMiddlewareBeforeHandler(
      openai,
      '"/api/voice/openai/session"',
      "async (req: AuthenticatedRequest, res: Response)",
    );
    expect(publicDemo).toContain(
      'router.post("/api/public/demo-session", publicVoicePreviewRetired)',
    );
    expect(publicDemo).toContain('router.post("/api/public/demo-call", publicVoicePreviewRetired)');
    expect(publicDemo).toContain("res.status(410).json");
    expect(publicDemo).not.toMatch(
      /createServerManagedOpenAIRealtimeCall|createPublicOpenAILiveDemoCall|reserveRealtimeSessionSpend/,
    );
    expect(openai).not.toMatch(/Vapi|xAI|Grok/);
    const registry = read("src/server/register-api-routes.ts");
    expect(registry).not.toContain("voices-routes");
    expect(registry).not.toContain("voicesRouter");
  });

  it("guards manual SMS and queue-only artifact spend", () => {
    const sms = read("src/routes/sms-routes.ts");
    const twilio = read("src/lib/twilio-service.ts");
    const worker = read("src/lib/job-worker.ts");

    expectMiddlewareBeforeHandler(
      sms,
      '"/api/sms/threads/:id/reply"',
      "async (req: AuthenticatedRequest, res: Response)",
    );
    expect(twilio).toContain("if (isLaunchHardBlocked())");
    expect(twilio.indexOf("if (isLaunchHardBlocked())")).toBeLessThan(
      twilio.indexOf("await reserveSmsUsage(userId"),
    );
    const chatgpt = read("src/routes/chatgpt-mcp-account-routes.ts");
    expect(chatgpt).toContain("if (isLaunchHardBlocked())");
    expect(chatgpt.indexOf("if (isLaunchHardBlocked())")).toBeLessThan(
      chatgpt.indexOf("createOpenAIRealtimeSimulationCall({"),
    );
    expect(worker).toContain("isLaunchHardBlocked()");
    expect(worker.indexOf("isLaunchHardBlocked()")).toBeLessThan(
      worker.indexOf("const reservation = await reserveRuntimeUsage"),
    );
  });

  it("covers provider-spending base jobs while allowing settlement and cost relief", () => {
    for (const type of [
      "post_call_artifact",
      "scheduled_report",
      "post_call_enrichment",
      "v2a_action_extraction",
      "execute_action",
      "adaptive_optimization",
      "proactive_lead_enrichment",
      "autonomous_prospecting",
      "knowledge_from_url",
      "paid_bot_identity_reconcile",
      "campaign_dial",
      "cadence_tick",
      "callback_tick",
      "auto_qa_score",
      "trial_ending_soon_email",
      "margin_at_risk_alert",
    ]) {
      expect(isPausableProviderSpendJobType(type), type).toBe(true);
    }
    for (const type of [
      "twilio_message_reconciliation",
      "purge_old_data",
      "purge_deleted_account",
      "sweep_orphan_supervisor_subs",
      "reclaim_canceled_numbers",
      "vapi_webhook",
    ]) {
      expect(isPausableProviderSpendJobType(type), type).toBe(false);
    }

    const worker = read("src/lib/job-worker.ts");
    const dispatcher = worker.slice(worker.indexOf("async function dispatchJob"));
    const baseDispatch = dispatcher.lastIndexOf("await handleBaseJob(job as never)");
    const gate = dispatcher.lastIndexOf("assertLaunchProviderSpendAllowed(job)", baseDispatch);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(baseDispatch);
  });

  it("reschedules a gate pause without burning the claim-added attempt", async () => {
    const pausedAt = new Date("2026-08-15T12:00:00.000Z");
    expect(providerSpendPauseSchedule(4, pausedAt)).toEqual({
      attempts: 3,
      runAt: new Date("2026-08-15T12:05:00.000Z"),
    });
    expect(providerSpendPauseSchedule(0, pausedAt).attempts).toBe(0);

    const pause = new ProviderSpendPausedError("auto_qa_score");
    expect(isProviderSpendPausedError(pause)).toBe(true);
    expect(isProviderSpendPausedError({ code: pause.code })).toBe(true);
    expect(isProviderSpendPausedError(new Error("provider failed"))).toBe(false);

    let appliedPatch: Record<string, unknown> | undefined;
    const fakeDb = {
      transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          update: () => ({
            set: (patch: Record<string, unknown>) => {
              appliedPatch = patch;
              return {
                where: () => ({ returning: async () => [{ id: "job-1" }] }),
              };
            },
          }),
        }),
    };
    await expect(
      settleClaimedJobError(fakeDb as never, { id: "job-1", attempts: 4, maxAttempts: 4 }, pause),
    ).resolves.toBe("deferred");
    expect(appliedPatch).toMatchObject({
      status: "pending",
      attempts: 3,
      startedAt: null,
      finishedAt: null,
    });

    const queue = read("src/lib/job-queue.ts");
    const defer = queue.slice(
      queue.indexOf("export async function deferPausedProviderSpendJob"),
      queue.indexOf("export type ClaimedJobErrorSettlement"),
    );
    expect(defer).toContain('status: "pending"');
    expect(defer).toContain("attempts: schedule.attempts");
    expect(defer).toContain("startedAt: null");
    expect(defer).toContain('eq(schema.jobs.status, "running")');
    expect(defer).toContain("eq(schema.jobs.attempts, claimedAttempts)");
    expect(defer).not.toContain("reportError(");
    expect(defer).not.toContain('status: "dead"');
    expect(queue).toContain("await settleClaimedJobError(db, job, error)");

    const routes = read("src/routes/job-routes.ts");
    expect(routes).toContain("await settleClaimedJobError(drizzle, claimed, runErr)");
    expect(routes).toContain("await settle(drizzle, job, sweepErr)");
    expect(routes).toContain("PROVIDER_SPEND_PAUSED_CODE");
  });

  it("retains a claimable identity follow-up when number selection overlaps the final attempt", async () => {
    // Selection's enqueue can see this job as running and reuse it. Completing
    // it here would lose that follow-up, even though the number now exists.
    const job = { id: "identity-job", attempts: 4, maxAttempts: 4 };
    const pause = new ProviderSpendPausedError(
      "paid_bot_identity_reconcile",
      "Choose a number in Phone setup before managed email setup can continue.",
    );
    let appliedPatch: Record<string, unknown> | undefined;
    const db = {
      transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run({
          update: () => ({
            set: (patch: Record<string, unknown>) => {
              appliedPatch = patch;
              return { where: () => ({ returning: async () => [{ id: job.id }] }) };
            },
          }),
        }),
    };
    await expect(settleClaimedJobError(db as never, job, pause)).resolves.toBe("deferred");
    expect(appliedPatch).toMatchObject({
      status: "pending",
      attempts: 3,
      finishedAt: null,
      error: pause.message,
    });
    expect((appliedPatch?.runAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(pause.message).not.toContain("Launch hard gate");
  });

  it("uses one Runtime Balance reservation identity for every job retry", () => {
    const first = runtimeReservationReferenceForJob({
      id: "artifact-job-1",
      type: "post_call_artifact",
    });
    const retry = runtimeReservationReferenceForJob({
      id: "artifact-job-1",
      type: "post_call_artifact",
    });
    expect(first).toBe("post_call_artifact:artifact-job-1");
    expect(retry).toBe(first);
    expect(first).not.toContain("attempt");

    const worker = read("src/lib/job-worker.ts");
    expect(worker).toContain("runtimeReservationReferenceForJob(job)");
    expect(worker).not.toContain(":attempt:${attemptNumber(job)}");
    expect(worker).toContain("attemptNumber(job) >= maxAttemptNumber(job)");
  });
});
