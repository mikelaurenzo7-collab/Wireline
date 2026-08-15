import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
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
  it("awaits a per-call queue insert on fresh and replayed Vapi reports", () => {
    const source = read("src/lib/vapi-handlers.ts");
    const metering = source.indexOf("await trackVoiceMinutes");
    const durableEnqueue = source.indexOf("await enqueuePostCallDigest", metering);
    const duplicateReturn = source.indexOf("if (!insertedFresh)", durableEnqueue);

    expect(metering).toBeGreaterThan(-1);
    expect(durableEnqueue).toBeGreaterThan(metering);
    expect(duplicateReturn).toBeGreaterThan(durableEnqueue);
    expect(source).not.toContain("void runPostCallDigest");
    expect(source).not.toContain("void notifyCallRecap");
    expect(source).toContain("insertedCallLogId = existing?.id ?? null");
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
    expect(digest.match(/\{ retrySafe: true \}/g)).toHaveLength(2);
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
