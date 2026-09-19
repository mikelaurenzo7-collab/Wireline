import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/voice/openai-sip-session.ts"), "utf8");

describe("OpenAI SIP durable ownership fencing", () => {
  it("reclaims expired calls under a row lock using database time", () => {
    const claim = source.slice(
      source.indexOf("async function claimCall"),
      source.indexOf("export function markOpenAISipCallRunning"),
    );

    expect(claim).toContain('.for("update")');
    expect(claim).toContain("leaseExpired: sql<boolean>");
    expect(claim).toContain("leaseExpired === true");
    expect(claim).toContain("openaiSipOwnerToken, existing.ownerToken!");
    expect(claim).toContain("openaiSipLeaseExpiresAt} <= now()");
    expect(claim).not.toContain("openaiSipLeaseExpiresAt, existing.leaseExpiresAt");
  });

  it("serializes lease renewals and derives expiry from PostgreSQL time", () => {
    const session = source.slice(source.indexOf("export async function runOpenAISipCallSession"));
    const renewal = source.slice(
      source.indexOf("async function renewOpenAISipCallLease"),
      source.indexOf("export function releaseOpenAISipClaimForRetry"),
    );

    expect(session).toContain("const scheduleLeaseRenewal = () =>");
    expect(session).toContain("leaseHeartbeat = setTimeout(async () =>");
    expect(session).toContain("let leaseRenewalStopped = false");
    expect(session).toContain("if (leaseRenewalStopped || ownerFence.signal.aborted) return");
    expect(session).toContain("renewed && !leaseRenewalStopped && !ownerFence.signal.aborted");
    expect(session).not.toContain("leaseHeartbeat = setInterval(");
    expect(session).toContain("const armLeaseSafetyFence = (renewalStartedAt: number)");
    expect(session).toContain("renewalStartedAt + RUNNING_CLAIM_LOCAL_FENCE_MS - Date.now()");
    expect(session).toContain("const renewed = await renewLeaseAndFence()");
    expect(session).toContain("RUNNING_CLAIM_LOCAL_FENCE_MS");
    expect(session).toContain("ownerFence.abort()");
    expect(renewal).toContain("now() + (");
    expect(renewal).toContain("interval '1 millisecond'");

    const cleanup = session.slice(session.indexOf("    } finally {"));
    expect(cleanup.indexOf("leaseRenewalStopped = true")).toBeGreaterThan(-1);
    expect(cleanup.indexOf("leaseRenewalStopped = true")).toBeLessThan(
      cleanup.indexOf("if (leaseHeartbeat) clearTimeout(leaseHeartbeat)"),
    );
  });

  it("aborts stale sessions and fences terminal side effects to the owner", () => {
    expect(source).toContain("ownerFence.abort()");
    expect(source).toContain("ownershipSignal?.addEventListener");
    expect(source).toContain("if (!ownsSession()) break");
    expect(source).toContain("if (liveSipSessions.get(input.callId) === sessionHandle)");
    expect(source).toContain("eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken)");
    expect(source).toMatch(
      /if\s*\(\s*ownerFence\.signal\.aborted\s*&&\s*terminalPersistedByOwner\s*&&\s*outcome\.endedReason !== "transferred"\s*\)\s*\{\s*await hangupOpenAISipCall\(input\.callId\)/,
    );
  });

  it("settles pre-session recovery jobs with the queue's canonical terminal state", () => {
    const settlement = source.slice(
      source.indexOf("export function settleOpenAISipPreSessionFailure"),
      source.indexOf("async function updatePresence"),
    );

    expect(settlement).toContain('status: "done"');
    expect(settlement).not.toContain('status: "completed"');
  });
});
