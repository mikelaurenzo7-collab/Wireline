import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildRecordedEscalationWebhookPayload,
  classifyPostCallCsatFailure,
  decidePostCallEffect,
  executePostCallEffectAttempt,
  renderDigestEmail,
  renderDigestEmailText,
  resolveAccountHolderEmail,
  runAfterPostCallCsatRetryGate,
} from "../src/lib/post-call-digest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("durable post-call customer follow-up", () => {
  it("atomically persists every terminal call with its durable finalization job", () => {
    const source = read("src/lib/voice/openai-sip-session.ts");
    const digest = read("src/lib/post-call-digest.ts");
    const claim = source.indexOf("async function claimCall");
    const claimTransaction = source.indexOf("return drizzle.transaction(async (tx)", claim);
    const recoveryEnqueue = source.indexOf("await enqueuePostCallDigest(", claimTransaction);
    const finalizer = source.indexOf("async function persistFinishedCall");
    const transaction = source.indexOf(
      "await withOpenAISipControlLock(input.call.userId, input.call.callId, async (tx)",
      finalizer,
    );
    const terminalUpdate = source.indexOf(".update(schema.callLogs)", transaction);
    const durableEnqueue = source.indexOf("await enqueuePostCallDigest(", terminalUpdate);
    const metering = source.indexOf('runFinalizerStep("voice_usage"', durableEnqueue);
    const awaitedFinalizer = source.indexOf("await persistFinishedCall({", metering);

    expect(claimTransaction).toBeGreaterThan(claim);
    expect(recoveryEnqueue).toBeGreaterThan(claimTransaction);
    expect(recoveryEnqueue).toBeLessThan(finalizer);
    expect(transaction).toBeGreaterThan(finalizer);
    // The transfer race tests exercise immediate sideband close and remote
    // control. This structural check also protects atomic queue persistence:
    // the helper must own one real transaction and pass that same tx through.
    const controlHelper = source.slice(
      source.indexOf("async function withOpenAISipControlLock"),
      source.indexOf("async function lockOpenAISipControl"),
    );
    expect(controlHelper).toMatch(
      /return await drizzle\.transaction\(async \(tx\) => \{\s*await lockOpenAISipControl\(tx, userId, callId\);\s*return operation\(tx\);/,
    );
    const terminalWork = source.slice(transaction, metering);
    expect(terminalWork).toMatch(/await tx\s*\.update\(schema\.callLogs\)/);
    expect(terminalWork).toContain("eq(schema.callLogs.userId, input.call.userId)");
    expect(terminalWork).toContain(
      "eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken)",
    );
    expect(terminalWork).toMatch(
      /await enqueuePostCallDigest\([\s\S]*?\},\s*tx,\s*\{ runAt: new Date\(\), refreshPending: true \}/,
    );
    expect(terminalUpdate).toBeGreaterThan(transaction);
    expect(durableEnqueue).toBeGreaterThan(terminalUpdate);
    expect(metering).toBeGreaterThan(durableEnqueue);
    expect(awaitedFinalizer).toBeGreaterThan(metering);
    expect(source).not.toContain('runFinalizerStep("post_call_digest"');
    expect(source).not.toContain("if (durationSeconds > 0 || input.transcript)");
    expect(source).toContain("replayOpenAISipPostCallFinalization");
    expect(source).toContain("recoverStaleOpenAISipCall");
    expect(source).toContain("terminalStateReady: false");
    expect(source).toContain("terminalStateReady: true");
    expect(source).toContain("refreshPending: true");
    expect(source).toContain("call could not establish durable recovery state");
    expect(source).toContain("await hangupOpenAISipCall(input.callId).catch");
    expect(digest).toContain("openAISipFinalizationFromJob(job)");
    expect(digest).toContain("withPostCallDeletionFence(ctx");
    expect(digest).toContain("if (!finalization.terminalStateReady)");
    expect(digest).toContain('finalization: { state: "completed" }');
    expect(source).not.toContain("void runPostCallDigest");
    expect(source).not.toContain("void notifyCallRecap");
    expect(source).toContain("await enqueuePostCallDigest(");
  });

  it("keeps finalization replay local, stale-safe, and correlated to the owning lead call", () => {
    const source = read("src/lib/voice/openai-sip-session.ts");
    const digest = read("src/lib/post-call-digest.ts");
    const helperStart = digest.indexOf("async function runCriticalPostCallFinalization");
    const helperEnd = digest.indexOf("async function handleActivePostCallDigestJob", helperStart);
    const critical = digest.slice(helperStart, helperEnd);
    const replay = digest.indexOf("if (finalization && progress.finalization?.state");
    const sharedCall = digest.indexOf(
      "await runCriticalPostCallFinalization(job, ctx, finalization)",
      replay,
    );
    const checkpoint = digest.indexOf('finalization: { state: "completed" }', sharedCall);

    expect(helperStart).toBeGreaterThan(0);
    expect(critical).toContain("await withPostCallDeletionFence(ctx");
    expect(critical).toContain("await replayOpenAISipPostCallFinalization({");
    expect(critical).not.toContain("withPostCallExternalFence");
    expect(sharedCall).toBeGreaterThan(replay);
    expect(checkpoint).toBeGreaterThan(sharedCall);
    expect(source).toContain("eq(schema.callLogs.vapiCallId, providerId)");
    expect(source).toContain('endedReason: "finalization-recovery"');
    expect(source).toContain("if (currentCallId !== providerId)");
    expect(source).toContain('String(nativeVoice.state || "")');
  });

  it("uses Postgres as the concurrency boundary and routes the job through retries", () => {
    const migration = read("drizzle/migrations/0150_post_call_digest_job_idempotency.sql");
    const digest = read("src/lib/post-call-digest.ts");
    const worker = read("src/lib/job-worker-base.ts");
    const pausePolicy = read("src/lib/provider-spend-job-pause.ts");

    expect(migration).toContain('CREATE UNIQUE INDEX "uq_jobs_post_call_digest_call"');
    expect(migration).toContain('("user_id", ("payload"->>\'callLogId\'))');
    expect(migration).toContain('WHERE "wireline_jobs"."type" = \'post_call_digest\'');
    expect(migration).toContain('CREATE UNIQUE INDEX "uq_jobs_post_call_child_per_digest"');
    expect(migration).toContain("postCallDigestJobId");
    expect(digest).toContain(".onConflictDoNothing()");
    expect(worker).toContain('if (job.type === "post_call_digest")');
    expect(worker).toContain("await handlePostCallDigestJob(job)");
    expect(pausePolicy).not.toContain('"post_call_digest"');
    expect(digest).toContain(
      'throw new ProviderSpendPausedError("post_call_digest_notifications")',
    );
  });

  it("runs local core during a launch hold and narrows crash ambiguity to one optional effect", () => {
    const digest = read("src/lib/post-call-digest.ts");
    const coreCheckpoint = digest.indexOf('core: { state: "completed", result: core }');
    const launchGuard = digest.indexOf("if (isLaunchHardBlocked())", coreCheckpoint);
    const firstEffect = digest.indexOf('"googleSheets"', launchGuard);

    expect(coreCheckpoint).toBeGreaterThan(-1);
    expect(launchGuard).toBeGreaterThan(coreCheckpoint);
    expect(firstEffect).toBeGreaterThan(launchGuard);
    expect(decidePostCallEffect(undefined)).toBe("claim");
    expect(decidePostCallEffect({ state: "attempting" })).toBe("reconcile_without_replay");
    expect(decidePostCallEffect({ state: "attempting" }, { retrySafe: true })).toBe("retry");
    expect(decidePostCallEffect({ state: "completed" })).toBe("reuse");
    expect(digest).toContain('reason: "worker_interrupted_after_claim"');
    expect(digest).toContain('"artifact",');
    expect(digest).toContain('"autoQa",');
    expect(digest).toContain('"escalationWebhook",');
    // Enrichment's enqueue adopts the child it already queued, so replay is safe.
    expect(digest).toContain('"enrichment",');
    expect(digest.match(/\{ retrySafe: true \}/g)).toHaveLength(4);
  });

  it("retries a failed local escalation enqueue without creating duplicate deliveries", async () => {
    const payload = buildRecordedEscalationWebhookPayload({
      callLogId: 42n,
      agentId: "agent-1",
      customerNumber: "+13125550123",
      direction: "outbound",
      intentLabel: "high",
      vapiCallId: "openai:call-1",
      escalationAttempted: true,
      escalationSucceeded: false,
    });
    expect(payload).toEqual({
      vapi_call_id: "openai:call-1",
      call_log_id: "42",
      agent_id: "agent-1",
      customer_number: "+13125550123",
      direction: "outbound",
      intent_label: "high",
      escalation_succeeded: false,
    });
    expect(
      buildRecordedEscalationWebhookPayload({
        callLogId: 43n,
        escalationAttempted: false,
      }),
    ).toBeNull();

    let durableState: { state: "attempting" } | { state: "completed" } | undefined;
    const deliveries = new Set<string>();
    let failBeforeInsert = true;
    const enqueueDelivery = vi.fn(async () => {
      if (failBeforeInsert) {
        failBeforeInsert = false;
        throw new Error("database unavailable before insert");
      }
      deliveries.add("tenant-1/call.escalated/42/hook-1");
      return { queued: deliveries.size };
    });
    await expect(
      executePostCallEffectAttempt({
        checkpointAttempting: async () => {
          durableState = { state: "attempting" };
        },
        perform: enqueueDelivery,
        checkpointCompleted: async () => undefined,
      }),
    ).rejects.toThrow("database unavailable before insert");
    expect(decidePostCallEffect(durableState, { retrySafe: true })).toBe("retry");

    await executePostCallEffectAttempt({
      checkpointAttempting: async () => {
        durableState = { state: "attempting" };
      },
      perform: enqueueDelivery,
      checkpointCompleted: async () => {
        durableState = { state: "completed" };
      },
    });
    expect(decidePostCallEffect(durableState, { retrySafe: true })).toBe("reuse");
    expect(enqueueDelivery).toHaveBeenCalledTimes(2);
    expect(deliveries.size).toBe(1);

    const digest = read("src/lib/post-call-digest.ts");
    const webhooks = read("src/lib/webhook-helpers.ts");
    const enqueueStart = webhooks.indexOf("export async function enqueueCallEscalatedWebhookOnce");
    const genericDispatchStart = webhooks.indexOf(
      "async function dispatchWebhookAfterDeletionFence",
      enqueueStart,
    );
    const enqueueSource = webhooks.slice(enqueueStart, genericDispatchStart);
    expect(digest).toContain("escalationAttempted: schema.callLogs.escalationAttempted");
    expect(digest).toContain('"escalationWebhook",');
    expect(digest).toContain("enqueueCallEscalatedWebhookOnce({");
    expect(enqueueSource).toContain("pg_advisory_xact_lock(hashtext(");
    expect(enqueueSource).toContain("payload}->'data'->>'call_log_id'");
    expect(enqueueSource).not.toContain("attemptWebhookDelivery");
  });

  it("retries transient and post-commit child enqueue failures without duplicating the child", async () => {
    const childRows = new Set<string>();
    let transient = true;
    const enqueueChild = vi.fn(async () => {
      if (transient) {
        transient = false;
        throw new Error("database unavailable before insert");
      }
      childRows.add("post-call-job-1/artifact");
      return { queued: true };
    });

    await expect(
      executePostCallEffectAttempt({
        checkpointAttempting: vi.fn(async () => undefined),
        perform: enqueueChild,
        checkpointCompleted: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("database unavailable before insert");

    const crashAfterInsert = vi.fn(async () => {
      throw new Error("parent progress checkpoint unavailable");
    });
    await expect(
      executePostCallEffectAttempt({
        checkpointAttempting: vi.fn(async () => undefined),
        perform: enqueueChild,
        checkpointCompleted: crashAfterInsert,
      }),
    ).rejects.toThrow("parent progress checkpoint unavailable");
    expect(childRows.size).toBe(1);

    await expect(
      executePostCallEffectAttempt({
        checkpointAttempting: vi.fn(async () => undefined),
        // The migration-backed enqueue adopts the same logical row here.
        perform: enqueueChild,
        checkpointCompleted: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ queued: true });
    expect(childRows.size).toBe(1);
    expect(enqueueChild).toHaveBeenCalledTimes(3);
  });

  it("keeps email retry-safe and CSAT at-most-once with stable billing identity", () => {
    const digest = read("src/lib/post-call-digest.ts");
    const twilio = read("src/lib/twilio-service.ts");
    const callback = twilio.indexOf("await params.beforeProviderAttempt?.()");
    const provider = twilio.indexOf("createTwilioMessageWithRateLimitRetry", callback);

    expect(digest).toContain("idempotencyKey: `post-call-digest/${job.id}`");
    expect(digest).toContain("const idempotencyKey = `post-call-csat/${job.id}`");
    expect(digest).toContain('state: "attempting", reservationAttempt');
    expect(digest).toContain('| "provider_rejected"');
    expect(digest).toContain('| "provider_ambiguous"');
    expect(digest).toContain("requires provider reconciliation after an at-most-once attempt");
    expect(digest).toContain("await csatService.reconcilePriorPostCallCsatReservations");
    expect(twilio).toContain("export function twilioMessageReservationReference");
    expect(twilio).toContain('reason: "Twilio provider attempt did not start"');
    expect(twilio).toContain("throw error");
    expect(callback).toBeGreaterThan(twilio.indexOf("await reserveRuntimeUsage"));
    expect(provider).toBeGreaterThan(callback);
    expect(classifyPostCallCsatFailure({})).toBe("provider_rejected");
    expect(
      classifyPostCallCsatFailure({
        code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
        providerOutcomeAmbiguous: true,
      }),
    ).toBe("provider_ambiguous");
  });

  it("retries only a refunded interrupted CSAT attempt after its result checkpoint recovers", async () => {
    const hasDurableRefund = vi.fn(async () => true);
    const performNewSend = vi.fn(async () => "new-provider-attempt");
    const failedCheckpoint = vi.fn(async () => {
      throw new Error("result checkpoint unavailable");
    });

    await expect(
      runAfterPostCallCsatRetryGate({
        progress: { state: "attempting", reason: "prior 429" },
        hasDurableRefund,
        checkpointRetryable: failedCheckpoint,
        perform: performNewSend,
      }),
    ).rejects.toThrow("result checkpoint unavailable");
    expect(performNewSend).not.toHaveBeenCalled();

    await expect(
      runAfterPostCallCsatRetryGate({
        progress: { state: "attempting", reason: "prior 429" },
        hasDurableRefund,
        checkpointRetryable: vi.fn(async () => undefined),
        perform: performNewSend,
      }),
    ).resolves.toBe("new-provider-attempt");
    expect(performNewSend).toHaveBeenCalledTimes(1);

    const ambiguousSend = vi.fn(async () => "must-not-send");
    await expect(
      runAfterPostCallCsatRetryGate({
        progress: { state: "attempting", reason: "prior 503" },
        hasDurableRefund: vi.fn(async () => false),
        checkpointRetryable: vi.fn(async () => undefined),
        perform: ambiguousSend,
      }),
    ).rejects.toThrow(/provider reconciliation/i);
    expect(ambiguousSend).not.toHaveBeenCalled();
  });

  it("renders trusted digest markup as HTML while escaping call content", () => {
    const view = {
      agentName: "Ava <script>",
      customerName: "Sam",
      direction: "inbound",
      durationSeconds: 125,
      summary: "Hello <img src=x onerror=alert(1)>\nSecond line",
      sentiment: "positive",
      outcomeTag: "qualified",
      campaignSource: null,
      crmLogged: false,
      recapUrl: "https://trywireline.com/r/test?a=1&b=2",
    };
    const html = renderDigestEmail(view);
    const text = renderDigestEmailText(view);

    expect(html).toContain('<div style="font-family:');
    expect(html).not.toContain("&lt;div style=");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;<br/>Second line");
    expect(html).toContain("Ava &lt;script&gt;");
    expect(html).toContain("a=1&amp;b=2");
    expect(text).toContain("Hello <img src=x onerror=alert(1)>");
    expect(text).not.toContain("<div");
  });

  it("tells the owner a booking request is waiting in Calendar", () => {
    const view = {
      agentName: "Ava",
      customerName: "Sam",
      direction: "inbound",
      durationSeconds: 125,
      summary: "Wants a quote.",
      sentiment: "positive",
      outcomeTag: "followup",
      campaignSource: null,
      crmLogged: false,
      bookingRequest: {
        date: "2026-10-12",
        time: "09:00",
        timeZone: "America/Chicago",
        serviceType: "Water heater <quote>",
      },
    };
    const html = renderDigestEmail(view);
    const text = renderDigestEmailText(view);
    expect(html).toContain(
      "Water heater &lt;quote&gt; on 2026-10-12 at 09:00 (America/Chicago) is waiting for you.",
    );
    expect(html).toContain("/calendar");
    expect(html).toContain("Confirm or cancel the booking request in Calendar");
    expect(text).toContain(
      "Booking request: Water heater <quote> on 2026-10-12 at 09:00 (America/Chicago) is waiting for you.",
    );
    // Without a request, the digest is unchanged.
    expect(renderDigestEmailText({ ...view, bookingRequest: null })).not.toContain(
      "Booking request",
    );
    const digest = read("src/lib/post-call-digest.ts");
    expect(digest).toContain('eq(schema.appointments.status, "Requested")');
    expect(digest).toContain('bookingRequest ? "BOOKING REQUEST" : core.outcomeTag.toUpperCase()');
  });

  it("prefers a connected mailbox and falls back to the login email", async () => {
    const connected = vi.fn(async () => "  owner@company.test ");
    const login = vi.fn(async () => "login@wireline.test");
    await expect(resolveAccountHolderEmail(connected, login)).resolves.toBe("owner@company.test");
    expect(login).not.toHaveBeenCalled();

    await expect(
      resolveAccountHolderEmail(
        async () => null,
        async () => " login@wireline.test ",
      ),
    ).resolves.toBe("login@wireline.test");
  });

  it("never sends the owner's digest to a Bot's managed mailbox", () => {
    const digest = read("src/lib/post-call-digest.ts");
    const start = digest.indexOf("export async function pickAccountHolderEmail");
    const body = digest.slice(start, digest.indexOf("\n}\n", start));
    expect(body).toContain('ne(schema.emailAccounts.provider, "agentmail")');
    expect(body).toContain(".orderBy(asc(schema.emailAccounts.createdAt))");
  });

  it("surfaces recipient lookup failures for durable retry", async () => {
    await expect(
      resolveAccountHolderEmail(
        async () => {
          throw new Error("mailbox lookup unavailable");
        },
        async () => "login@wireline.test",
      ),
    ).rejects.toThrow("mailbox lookup unavailable");
  });
});
