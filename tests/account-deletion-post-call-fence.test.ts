import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  accountDeletionFenceKey,
  runTenantJobAfterDeletionCheck,
  runTenantProviderWorkAfterDeletionFence,
  runTerminalDeletionSequence,
  withAccountDeletionFence,
} from "../src/lib/account-deletion-fence";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("account deletion versus post-call provider work", () => {
  it("does not enter protected provider work until the database barrier is acquired", async () => {
    let releaseLock!: () => void;
    const lock = new Promise<void>((resolveLock) => {
      releaseLock = resolveLock;
    });
    const execute = vi.fn(async () => lock);
    const work = vi.fn(async () => "provider-complete");

    const pending = withAccountDeletionFence({ execute }, "user-1", work);
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();

    releaseLock();
    await expect(pending).resolves.toBe("provider-complete");
    expect(work).toHaveBeenCalledTimes(1);
    expect(accountDeletionFenceKey("user-1")).toBe("account-deletion:user-1");
  });

  it("never runs provider work when acquiring the deletion barrier fails", async () => {
    const work = vi.fn(async () => undefined);
    await expect(
      withAccountDeletionFence(
        {
          execute: vi.fn(async () => {
            throw new Error("database unavailable");
          }),
        },
        "user-1",
        work,
      ),
    ).rejects.toThrow("database unavailable");
    expect(work).not.toHaveBeenCalled();
  });

  it("commits the terminal marker before external release and purges only after release", async () => {
    let commitTerminalState!: (row: { id: string }) => void;
    const terminalState = new Promise<{ id: string }>((resolveState) => {
      commitTerminalState = resolveState;
    });
    let finishRelease!: (result: { subscriptionsCanceled: number }) => void;
    const releaseResult = new Promise<{ subscriptionsCanceled: number }>((resolveRelease) => {
      finishRelease = resolveRelease;
    });
    const events: string[] = [];
    const releaseExternalResources = vi.fn(async () => {
      events.push("release_started");
      return releaseResult;
    });
    const purgeLocalAccount = vi.fn(async () => {
      events.push("local_purge");
      return { ok: true };
    });

    const sequence = runTerminalDeletionSequence({
      establishTerminalState: async () => {
        events.push("marker_waiting");
        const row = await terminalState;
        events.push("marker_committed");
        return row;
      },
      releaseExternalResources,
      purgeLocalAccount,
    });
    await Promise.resolve();
    expect(events).toEqual(["marker_waiting"]);
    expect(releaseExternalResources).not.toHaveBeenCalled();

    commitTerminalState({ id: "queue-1" });
    await vi.waitFor(() => expect(releaseExternalResources).toHaveBeenCalledTimes(1));
    expect(events).toEqual(["marker_waiting", "marker_committed", "release_started"]);
    expect(purgeLocalAccount).not.toHaveBeenCalled();

    finishRelease({ subscriptionsCanceled: 1 });
    await expect(sequence).resolves.toMatchObject({ started: true, purge: { ok: true } });
    expect(events).toEqual([
      "marker_waiting",
      "marker_committed",
      "release_started",
      "local_purge",
    ]);
  });

  it("terminally skips tenant jobs after purging while allowing live jobs to run once", async () => {
    const blockedWork = vi.fn(async () => "must-not-run");
    await expect(
      runTenantJobAfterDeletionCheck({
        terminalDeletionExists: vi.fn(async () => true),
        perform: blockedWork,
      }),
    ).resolves.toEqual({ performed: false });
    expect(blockedWork).not.toHaveBeenCalled();

    const liveWork = vi.fn(async () => "completed");
    await expect(
      runTenantJobAfterDeletionCheck({
        terminalDeletionExists: vi.fn(async () => false),
        perform: liveWork,
      }),
    ).resolves.toEqual({ performed: true, result: "completed" });
    expect(liveWork).toHaveBeenCalledTimes(1);
  });

  it("system fan-out waits for the account lock and rechecks eligibility before provider work", async () => {
    let releaseLock!: () => void;
    const lock = new Promise<void>((resolveLock) => {
      releaseLock = resolveLock;
    });
    const providerWorkAllowed = vi.fn(async () => false);
    const perform = vi.fn(async () => "must-not-run");
    const pending = runTenantProviderWorkAfterDeletionFence({
      executor: { execute: vi.fn(async () => lock) },
      userId: "tenant-1",
      providerWorkAllowed,
      perform,
    });

    await Promise.resolve();
    expect(providerWorkAllowed).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
    releaseLock();

    await expect(pending).resolves.toEqual({ performed: false });
    expect(providerWorkAllowed).toHaveBeenCalledTimes(1);
    expect(perform).not.toHaveBeenCalled();

    const liveWork = vi.fn(async () => "sent-once");
    await expect(
      runTenantProviderWorkAfterDeletionFence({
        executor: { execute: vi.fn(async () => undefined) },
        userId: "tenant-1",
        providerWorkAllowed: vi.fn(async () => true),
        perform: liveWork,
      }),
    ).resolves.toEqual({ performed: true, result: "sent-once" });
    expect(liveWork).toHaveBeenCalledTimes(1);
  });

  it("uses the same lock before purge and checks live ownership before every post-call boundary", () => {
    const purge = read("src/lib/account-deletion.ts");
    const worker = read("src/lib/job-worker-base.ts");
    const dispatcher = read("src/lib/job-worker.ts");
    const digest = read("src/lib/post-call-digest.ts");
    const tenantFence = read("src/lib/tenant-provider-deletion-fence.ts");
    const cadence = read("src/lib/cadence-engine.ts");
    const callback = read("src/lib/callback-engine.ts");
    const terminalLock = purge.indexOf("await acquireAccountDeletionFence(tx, input.userId)");
    const terminalMarker = purge.indexOf('.set({ status: "purging" })', terminalLock);
    const externalRelease = worker.indexOf("await releaseExternalResourcesForPurge");
    const externalFence = digest.indexOf("withAccountDeletionFence(tx, ctx.userId");
    const eligibility = digest.indexOf("account_or_call_erased_or_purge_due", externalFence);
    const provider = digest.indexOf("return perform()", externalFence);

    expect(terminalLock).toBeGreaterThan(-1);
    expect(terminalMarker).toBeGreaterThan(terminalLock);
    expect(externalRelease).toBeGreaterThan(-1);
    expect(worker).toContain("runTerminalDeletionSequence");
    expect(worker).toContain("claimTerminalAccountPurge");
    expect(dispatcher).toContain("withAccountDeletionFence(tx, userId");
    expect(dispatcher).toContain("runTenantJobAfterDeletionCheck");
    expect(dispatcher).toContain("tenant job skipped — terminal account deletion has begun");
    expect(dispatcher).toContain('"twilio_message_reconciliation"');
    expect(tenantFence).toContain("runTenantProviderWorkAfterDeletionFence");
    expect(tenantFence).toContain("deletionQueue.status} = 'purging'");
    expect(tenantFence).toContain("deletionQueue.scheduledPurgeAt} IS NULL");
    expect(tenantFence).toContain("deletionQueue.scheduledPurgeAt} <= now()");
    expect(cadence).toContain("runTenantProviderWorkWithDeletionFence");
    expect(cadence.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(
      cadence.indexOf(
        "executeStep(step",
        cadence.indexOf("runTenantProviderWorkWithDeletionFence"),
      ),
    );
    expect(callback).toContain("runTenantProviderWorkWithDeletionFence");
    expect(callback.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(
      callback.indexOf("evaluateOutboundDialGate", callback.indexOf("fencedCallback")),
    );
    expect(
      callback.indexOf("evaluateOutboundDialGate", callback.indexOf("fencedCallback")),
    ).toBeLessThan(callback.indexOf("placeOutboundCall", callback.indexOf("fencedCallback")));
    expect(externalFence).toBeGreaterThan(-1);
    expect(eligibility).toBeGreaterThan(externalFence);
    expect(provider).toBeGreaterThan(eligibility);
    expect(digest).toContain("call_erased_before_core_checkpoint");
    expect(digest).toContain("scheduledPurgeAt} IS NULL");
    expect(digest).toContain("scheduledPurgeAt} <= now()");
    expect(digest).toContain("deletionQueue.status} = 'purging'");
    // One generic boundary protects all seven optional effects; owner email and
    // CSAT each carry their own provider fence.
    expect(digest.match(/withPostCallExternalFence\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(digest).toContain("error instanceof PostCallTerminalStop");
  });
});
