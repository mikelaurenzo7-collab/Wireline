import { existsSync, readFileSync } from "node:fs";
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
 * Live Video is retired from the active product. These historical settlement
 * contracts remain because old reservations, reversals, and webhook records
 * still need safe reconciliation; they must not imply that a presenter UI or
 * new-session surface is available.
 */

describe("unused historical reservations come back", () => {
  it("refunds whole minutes the historical session did not occupy", () => {
    expect(liveVideoRefundMinutes(5, 0)).toBe(5);
    expect(liveVideoRefundMinutes(5, 90)).toBe(3);
    expect(liveVideoRefundMinutes(5, 300)).toBe(0);
    expect(liveVideoRefundMinutes(5, 100_000)).toBe(0);
  });

  it("scales the refund by the engine credit rate exactly as the reservation did", () => {
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

describe("the historical charged duration cannot be talked down by the client", () => {
  const issuedAtMs = 1_000_000_000_000;

  it("bills wall-clock time since the mint when the client under-reports", () => {
    const charged = liveVideoChargeableSeconds({
      clientWatchedSeconds: 0,
      issuedAtMs,
      maxSessionSeconds: 300,
      nowMs: issuedAtMs + 240_000,
    });
    expect(charged).toBe(240);
    expect(liveVideoRefundMinutes(5, charged)).toBe(1);
  });

  it("still refunds a historical session that genuinely never connected", () => {
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

describe("historical settlement receipts are signed, bound, and single-use", () => {
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
    expect(settle).toContain('reason: "claim_unavailable"');
  });

  it("hands the claim back when the ledger write it guarded did not land", () => {
    const source = read("src/lib/video-presenter/live-video-settlement.ts");
    const settle = source.slice(source.indexOf("export async function settleLiveVideoSession"));
    expect(settle).toContain("await releaseLiveVideoSettlementClaim(input.claim.nonce)");
    expect(settle).toContain("throw error;");
  });

  it("refuses to sign with the development key in production", () => {
    const source = read("src/lib/video-presenter/live-video-settlement.ts");
    const key = source.slice(
      source.indexOf("function receiptKey()"),
      source.indexOf("export type LiveVideoSettlementClaim"),
    );
    expect(key).toContain("isProductionRuntime()");
    expect(key).toContain("WIRELINE_DATA_KEY is required");
  });
});

describe("retired talking-head routes do not mint sessions", () => {
  const routes = read("src/routes/video-presenter-routes-base.ts");
  const presenter = read("src/components/LiveVideoPresenter.tsx");
  const page = read("src/pages/LiveVideoStudioPage.tsx");
  const service = read("src/lib/video-presenter/liveavatar-service.ts");

  it("returns 410 instead of signing a settlement receipt", () => {
    expect(routes).toContain("throwLiveVideoRetired");
    expect(routes).toContain('"/api/agents/:id/video-presenter/session/settle"');
    expect(routes).toContain('reason: "live_video_retired"');
    expect(routes).not.toContain("signLiveVideoSettlementReceipt({");
    expect(routes).not.toContain("upgrade to Starter Plus to stream photoreal presenters");
  });

  it("renders only the universal Bot Mark in the compatibility shell", () => {
    expect(presenter).toContain('import BotMark from "./BotMark"');
    expect(presenter).toContain("<BotMark");
    expect(presenter).toContain('data-retired-live-video="true"');
    expect(presenter).not.toContain("AgentFace");
    expect(presenter).not.toContain("wl-presence-live");
    expect(presenter).not.toContain("@heygen/liveavatar-web-sdk");
    expect(presenter).not.toContain("abandonedAfterDeadline");
    expect(page).not.toContain("Draft clip script");
    expect(page).not.toContain("/video-presenter/session");
    expect(service).toContain("retired: true");
    expect(service).not.toContain("PUBLIC_AVATAR_CACHE_TTL_MS");
  });
});

describe("retired presenter CSS stays out of the launch cascade", () => {
  it("deletes face/video sheets and keeps only compact Bot presence", () => {
    const barrel = read("src/styles/wireline-marketing-surfaces.css");
    const presence = read("src/styles/agent-presence.css");

    expect(existsSync(resolve(process.cwd(), "src/styles/agent-face.css"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/styles/video-receptionist.css"))).toBe(false);
    expect(barrel).not.toContain("agent-face.css");
    expect(barrel).not.toContain("video-receptionist.css");
    expect(barrel).toContain('import "./agent-presence.css"');

    expect(presence).toContain("Wireline Bot presence");
    expect(presence).toContain(".wl-presence__frame");
    expect(presence).toContain(".wl-presence__strip");
    expect(presence).toContain(".wl-presence__chip");
    expect(presence).not.toContain(".wl-presence-live");
    expect(presence).not.toContain(".wl-agent-face");
    expect(presence).not.toContain("catalog-thumb");
    expect(presence).not.toContain("__video");
  });
});

describe("review-hardening: the fixes Codex found in the first pass", () => {
  it("binds the SMS post-send refresh to the thread that was replied to", () => {
    const sms = read("src/components/SmsThreads.tsx");
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
    expect(step).not.toContain("retryable: !res.ok");
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
    expect(arm.indexOf("LATE_TOOL_AUDIT_GRACE_MS")).toBeLessThan(
      arm.indexOf("toolAuditContext.records.slice()"),
    );
  });
});
