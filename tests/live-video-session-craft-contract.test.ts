import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  claimLiveVideoSettlementOnce,
  liveVideoChargeableSeconds,
  liveVideoRefundMinutes,
  resetLiveVideoSettlementClaimsForTests,
  settleLiveVideoSession,
  signLiveVideoSettlementReceipt,
  verifyLiveVideoSettlementReceipt,
} from "../src/lib/video-presenter/live-video-settlement";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Live Video is a metered paid add-on whose allowance is drawn in full before
 * the browser has proven it can play a frame. These contracts pin the three
 * things that made that safe-on-paper design unsafe in practice: minutes that
 * never came back, a completed session presented as a failure, and a stage that
 * said nothing to anyone who could not see it.
 */

describe("unused reserved minutes come back", () => {
  it("refunds whole minutes the session did not occupy", () => {
    // 5 reserved, nothing watched (blocked network) -> all 5 back.
    expect(liveVideoRefundMinutes(5, 0)).toBe(5);
    // 90 seconds watched rounds UP to 2 charged minutes -> 3 back.
    expect(liveVideoRefundMinutes(5, 90)).toBe(3);
    // A full session refunds nothing.
    expect(liveVideoRefundMinutes(5, 300)).toBe(0);
    // Over-reporting can never mint allowance.
    expect(liveVideoRefundMinutes(5, 100_000)).toBe(0);
  });

  it("scales the refund by the engine credit rate exactly as the reservation did", () => {
    // A FULL engine reserves 10 for a 5-minute session and burns 2 per minute.
    expect(liveVideoRefundMinutes(10, 0, 2)).toBe(10);
    expect(liveVideoRefundMinutes(10, 60, 2)).toBe(8);
    expect(liveVideoRefundMinutes(10, 300, 2)).toBe(0);
  });

  it("never refunds more than was reserved, whatever the input", () => {
    for (const watched of [-50, 0, 1, 299, Number.NaN]) {
      const refund = liveVideoRefundMinutes(5, watched);
      expect(refund).toBeGreaterThanOrEqual(0);
      expect(refund).toBeLessThanOrEqual(5);
    }
  });
});

describe("the charged duration cannot be talked down by the client", () => {
  const issuedAtMs = 1_000_000_000_000;

  it("bills wall-clock time since the mint when the client under-reports", () => {
    // The attack: settle immediately with 0 watched while the provider session
    // keeps running, take the whole reservation back, repeat per receipt.
    // Four minutes have really elapsed, so four minutes are charged.
    const charged = liveVideoChargeableSeconds({
      clientWatchedSeconds: 0,
      issuedAtMs,
      maxSessionSeconds: 300,
      nowMs: issuedAtMs + 240_000,
    });
    expect(charged).toBe(240);
    expect(liveVideoRefundMinutes(5, charged)).toBe(1);
  });

  it("still refunds a session that genuinely never connected", () => {
    // Settled promptly after a blocked connection: almost no time has passed,
    // so the honest full refund survives the server-side floor.
    const charged = liveVideoChargeableSeconds({
      clientWatchedSeconds: 0,
      issuedAtMs,
      maxSessionSeconds: 300,
      nowMs: issuedAtMs + 1_500,
    });
    expect(liveVideoRefundMinutes(5, charged)).toBe(4);
  });

  it("takes the client's figure when it is the larger one", () => {
    expect(
      liveVideoChargeableSeconds({
        clientWatchedSeconds: 200,
        issuedAtMs,
        maxSessionSeconds: 300,
        nowMs: issuedAtMs + 10_000,
      }),
    ).toBe(200);
  });

  it("never charges past the provider cap, however late the settle arrives", () => {
    expect(
      liveVideoChargeableSeconds({
        clientWatchedSeconds: 0,
        issuedAtMs,
        maxSessionSeconds: 300,
        nowMs: issuedAtMs + 86_400_000,
      }),
    ).toBe(300);
  });
});

describe("settlement receipts are signed, bound, and single-use", () => {
  beforeEach(() => {
    resetLiveVideoSettlementClaimsForTests();
  });

  const claim = {
    userId: "11111111-1111-4111-8111-111111111111",
    periodKey: "2026-08",
    reservedMinutes: 5,
    creditsPerMinute: 1,
    maxSessionSeconds: 300,
    nonce: "nonce-a",
  };

  it("round-trips a receipt it signed", () => {
    const verified = verifyLiveVideoSettlementReceipt(signLiveVideoSettlementReceipt(claim));
    expect(verified?.userId).toBe(claim.userId);
    expect(verified?.periodKey).toBe("2026-08");
    expect(verified?.reservedMinutes).toBe(5);
  });

  it("rejects a tampered payload", () => {
    const receipt = signLiveVideoSettlementReceipt(claim);
    const [payload, signature] = receipt.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...claim,
        reservedMinutes: 500,
        issuedAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
      }),
      "utf8",
    ).toString("base64url");
    expect(verifyLiveVideoSettlementReceipt(`${forged}.${signature}`)).toBeNull();
    expect(verifyLiveVideoSettlementReceipt(`${payload}.deadbeef`)).toBeNull();
    expect(verifyLiveVideoSettlementReceipt("not-a-receipt")).toBeNull();
    expect(verifyLiveVideoSettlementReceipt(null)).toBeNull();
  });

  it("rejects an expired receipt", () => {
    const receipt = signLiveVideoSettlementReceipt(claim, Date.now() - 48 * 60 * 60 * 1000);
    expect(verifyLiveVideoSettlementReceipt(receipt)).toBeNull();
  });

  it("refunds a session's nonce exactly once", async () => {
    expect(await claimLiveVideoSettlementOnce("session-a")).toBe("claimed");
    expect(await claimLiveVideoSettlementOnce("session-a")).toBe("duplicate");
    expect(await claimLiveVideoSettlementOnce("session-b")).toBe("claimed");
  });

  it("short-circuits a fully-consumed session before it reaches the claim store", async () => {
    const verified = verifyLiveVideoSettlementReceipt(signLiveVideoSettlementReceipt(claim));
    expect(verified).not.toBeNull();
    // Nothing to refund means no ledger write and no nonce spent, so a client
    // that retries a complete session is inert rather than "already settled".
    const consumed = await settleLiveVideoSession({ claim: verified!, watchedSeconds: 300 });
    expect(consumed).toEqual({ settled: true, refundedMinutes: 0, reason: "nothing_to_refund" });
    expect(await claimLiveVideoSettlementOnce(claim.nonce)).toBe("claimed");
  });

  it("claims before it writes to the allowance ledger", () => {
    const source = read("src/lib/video-presenter/live-video-settlement.ts");
    const settle = source.slice(source.indexOf("export async function settleLiveVideoSession"));
    expect(settle.indexOf("claimLiveVideoSettlementOnce")).toBeLessThan(
      settle.indexOf("releaseLiveVideoSessionReservation"),
    );
    // An unavailable claim store declines the refund rather than risking a
    // double credit — the conservative direction.
    expect(settle).toContain('reason: "claim_unavailable"');
  });

  it("hands the claim back when the ledger write it guarded did not land", () => {
    const source = read("src/lib/video-presenter/live-video-settlement.ts");
    const settle = source.slice(source.indexOf("export async function settleLiveVideoSession"));
    // Redis and Postgres cannot share a transaction. Without this the nonce
    // stays burned for a day and every retry answers "already settled", so the
    // tenant can never recover minutes they did not use.
    expect(settle).toContain("await releaseLiveVideoSettlementClaim(input.claim.nonce)");
    expect(settle).toContain("throw error;");
  });

  it("refuses to sign with the development key in production", () => {
    const source = read("src/lib/video-presenter/live-video-settlement.ts");
    const key = source.slice(
      source.indexOf("function receiptKey()"),
      source.indexOf("export type LiveVideoSettlementClaim"),
    );
    // A publicly known signing constant would let any authenticated tenant
    // forge receipts and refund itself without minting reservations.
    expect(key).toContain("isProductionRuntime()");
    expect(key).toContain("WIRELINE_DATA_KEY is required");
  });
});

describe("the session mint hands out a settlement receipt", () => {
  const routes = read("src/routes/video-presenter-routes-base.ts");

  it("signs a receipt bound to the reservation it just took", () => {
    expect(routes).toContain("signLiveVideoSettlementReceipt({");
    expect(routes).toContain("reservedMinutes: reservation.reservedMinutes");
    expect(routes).toContain("creditsPerMinute: engineResolution.creditsPerMinute");
    expect(routes).toContain("nonce: randomUUID()");
  });

  it("exposes a settle route that refuses another tenant's receipt", () => {
    expect(routes).toContain('"/api/agents/:id/video-presenter/session/settle"');
    expect(routes).toContain("claim.userId !== req.user.id");
    // An unsettleable receipt is a no-op, never an error thrown at a customer
    // whose session has already finished.
    expect(routes).toContain('reason: "receipt_not_settleable"');
  });

  it("stops telling eligible Starter customers to buy the team plan", () => {
    expect(routes).not.toContain("upgrade to Starter Plus to stream photoreal presenters");
    expect(routes).toContain("Available on Starter and above.");
  });
});

describe("the stage tells the truth about how a session ended", () => {
  const presenter = read("src/components/LiveVideoPresenter.tsx");

  it("separates the session cap from a fault", () => {
    expect(presenter).toContain("EXPIRY_MARGIN_SECONDS");
    expect(presenter).toContain("setExpired(true)");
    expect(presenter).toContain('reportSessionEnd("expired")');
    expect(presenter).toContain('"Session complete"');
    // "Fallback" as the entire explanation of a finished session is gone.
    expect(presenter).not.toContain("          Fallback\n");
  });

  it("offers a retry only for a real failure, and names the cost of another session", () => {
    expect(presenter).toContain(
      'const actionLabel = expired ? "Start another session" : "Try again"',
    );
  });

  it("holds the connecting overlay until a frame has actually painted", () => {
    expect(presenter).toContain("const markFirstFrame");
    expect(presenter).toContain('element.addEventListener("playing", markFirstFrame)');
    expect(presenter).toContain('element.addEventListener("loadeddata", markFirstFrame)');
    expect(presenter).toContain("{firstFrame ? (");
  });

  it("gives up on a connection that never arrives instead of spinning forever", () => {
    expect(presenter).toContain("CONNECT_DEADLINE_MS");
    expect(presenter).toContain('setFailure("connect_timeout")');
    expect(presenter).toContain("Could not reach the presenter");
  });

  it("bounds the lip-sync buffer so a stall cannot dump stale audio", () => {
    expect(presenter).toContain("MAX_BUFFERED_PCM_BYTES");
    expect(presenter).toContain("pcmAccumRef.current.slice(-MAX_BUFFERED_PCM_BYTES)");
  });

  it("reports the outcome exactly once, including on unmount", () => {
    expect(presenter).toContain("if (endReportedRef.current) return;");
    expect(presenter).toContain('reportSessionEnd("stopped")');
  });

  it("announces connection and failure to assistive technology", () => {
    expect(presenter).toContain('role="status" aria-live="polite"');
    expect(presenter).toContain('role={expired ? "status" : "alert"}');
  });

  it("cleans up its first-frame listeners on the element it attached to", () => {
    expect(presenter).toContain('attachedElement?.removeEventListener("playing", markFirstFrame)');
    expect(presenter).toContain(
      'attachedElement?.removeEventListener("loadeddata", markFirstFrame)',
    );
  });
});

describe("the stage spends the allowance honestly", () => {
  const page = read("src/pages/LiveVideoStudioPage.tsx");

  it("asks for the microphone before any allowance is reserved, on every engine", () => {
    const start = page.slice(page.indexOf("async function startPreview"));
    const micAt = start.indexOf("navigator.mediaDevices.getUserMedia");
    const sessionAt = start.indexOf("/video-presenter/session`");
    expect(micAt).toBeGreaterThan(-1);
    expect(micAt).toBeLessThan(sessionAt);
    // The old gate skipped the default engine entirely.
    expect(start).not.toContain("if (voiceEngine !== DEFAULT_ENGINE) {");
    expect(page).toContain("no session minutes were used");
  });

  it("settles the reservation when the stage closes and when a session ends itself", () => {
    expect(page).toContain("async function settleSession(");
    expect(page).toContain("settledReceiptsRef");
    expect(page).toContain("await settleSession(closing.live, watched, activeAgentId)");
    expect(page).toContain("onSessionEnded={");
  });

  it("settles on every ending, including component cleanup", () => {
    const handler = page.slice(
      page.indexOf("onSessionEnded={"),
      page.indexOf("onSessionEnded={") + 900,
    );
    // `stopped` covers unmount — switching agents or navigating away — where no
    // explicit endPreview runs. Skipping it stopped the provider session while
    // still charging the tenant the whole reservation.
    expect(handler).not.toContain('reason !== "stopped"');
    expect(handler).toContain("void settleSession(session.live, watchedSeconds, activeAgentId)");
  });

  it("counts the session cap down in the open", () => {
    expect(page).toContain('role="timer"');
    expect(page).toContain("left in this\n                            session");
    // Anchored to a start timestamp, not decremented per tick.
    expect(page).toContain("const remaining = capSeconds - (Date.now() - startedAt) / 1000");
  });
});

describe("the presenter catalog does not bill the vendor per page load", () => {
  it("caches the global avatar list and de-duplicates concurrent fetches", () => {
    const service = read("src/lib/video-presenter/liveavatar-service.ts");
    expect(service).toContain("PUBLIC_AVATAR_CACHE_TTL_MS");
    expect(service).toContain("publicAvatarInFlight");
    expect(service).toContain("if (publicAvatarCache && publicAvatarCache.expiresAt > now)");
  });
});

describe("presenter state is legible", () => {
  it("raises the live/ended chip off the 9px floor and stops flying green when offline", () => {
    const css = read("src/styles/agent-presence.css");
    const chip = css.slice(css.indexOf(".wl-presence__live {"), css.indexOf(".wl-presence__strip"));
    expect(chip).not.toContain("font-size: 9px");
    expect(chip).toContain("font-size: var(--wireline-typography-overline-size)");
    expect(css).toContain(".wl-presence-live--offline .wl-presence__live-dot");
    expect(css).toContain(".wl-presence-live--ended .wl-presence__live-dot");
  });

  it("keeps the end-of-session action at the 44px target with a visible focus ring", () => {
    const css = read("src/styles/agent-presence.css");
    const action = css.slice(css.indexOf(".wl-presence-live__action {"));
    expect(action).toContain("min-height: 44px");
    expect(css).toContain(".wl-presence-live__action:focus-visible");
  });
});

describe("review-hardening: the fixes Codex found in the first pass", () => {
  it("stops a session that connects after the stage gave up on it", () => {
    const presenter = read("src/components/LiveVideoPresenter.tsx");
    // stop() no-ops while CONNECTING, so a late connection would stay open and
    // metered behind the failure card after being settled as zero watched time.
    expect(presenter).toContain("abandonedAfterDeadline = true");
    expect(presenter).toContain("if (cancelled || abandonedAfterDeadline) await session.stop()");
  });

  it("binds the SMS post-send refresh to the thread that was replied to", () => {
    const sms = read("src/components/SmsThreads.tsx");
    // Reading the ref AFTER the await hands this refresh whichever thread the
    // reader has since opened — a live signal belonging to another conversation.
    expect(sms).toContain("const sentThreadController = activeThreadFetchRef.current;");
    expect(sms).toContain("fetchMessages(threadId, sentThreadController?.signal)");
    expect(sms).not.toContain("fetchMessages(threadId, activeThreadFetchRef.current?.signal)");
  });

  it("never re-dials an outbound call whose provider outcome is ambiguous", () => {
    const engine = read("src/lib/cadence-engine.ts");
    const step = engine.slice(
      engine.indexOf("async function executeStep"),
      engine.indexOf("const CADENCE_STEP_LEASE_MS"),
    );
    // Vapi call creation has no idempotency key, so a failed response may still
    // have produced a dial. Retrying it is a second marketing call.
    expect(step).not.toContain("retryable: !res.ok");
    // Only failures that provably precede any provider contact stay retryable.
    expect(step).toContain('result: "compliance gate failed (fail-closed)", retryable: true');
    expect(step).toContain("voice control rejected");
  });

  it("persists tool usage that lands after the wrapper timeout", () => {
    const route = read("src/routes/vapi-v2.ts");
    const arm = route.slice(
      route.indexOf('if (message?.type === "tool-calls")'),
      route.indexOf('if (message?.type === "speech-update")'),
    );
    expect(arm).toContain("anyToolTimedOut");
    expect(arm).toContain("LATE_TOOL_AUDIT_GRACE_MS");
    // The snapshot must be taken after the grace window, not before it.
    expect(arm.indexOf("LATE_TOOL_AUDIT_GRACE_MS")).toBeLessThan(
      arm.indexOf("toolAuditContext.records.slice()"),
    );
  });
});
