import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { customerSafeSmsFailureReason } from "../src/lib/sms-customer-errors";
import {
  evaluateSmsThreadReplyGate,
  isRecentInboundSmsArtifact,
  SMS_LIVE_FOLLOW_UP_WINDOW_MS,
} from "../src/lib/sms-reply-compliance";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("sms inbox error honesty", () => {
  it("does not mask thread/message failures as empty success", () => {
    const source = read("src/routes/sms-routes.ts");
    expect(source).toContain("rethrowIfAppError");
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS threads")');
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS messages")');
    expect(source).toContain(
      'throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read")',
    );
    expect(source).toContain("evaluateSmsThreadReplyGate");
    expect(source).not.toContain("res.json({ threads: [] })");
    expect(source).not.toContain("res.json({ messages: [] })");
    expect(source).not.toContain("res.json({ ok: false })");
    expect(source).not.toContain("migration may be pending");
  });

  it.each([
    ["an outbound-only thread", null],
    ["a stale inbound message", { createdAt: new Date(Date.parse("2026-08-26T10:59:59.999Z")) }],
    ["a future inbound timestamp", { createdAt: new Date("2026-08-26T12:00:00.001Z") }],
    ["an invalid inbound timestamp", { createdAt: new Date(Number.NaN) }],
  ])("fails %s closed through the untrusted marketing gate", async (_label, artifact) => {
    const nowMs = Date.parse("2026-08-26T12:00:00.000Z");
    const loadLatestInboundArtifact = vi.fn(async () => artifact);
    const evaluateGate = vi.fn(async () => ({
      allowed: false as const,
      status: "AutoDialFailed",
      reason: "blocked_tcpa" as const,
    }));

    await evaluateSmsThreadReplyGate(
      { userId: "tenant-1", threadId: "thread-1", phone: "+14155550123" },
      { loadLatestInboundArtifact, evaluateGate, now: () => nowMs },
    );

    expect(loadLatestInboundArtifact).toHaveBeenCalledWith({
      userId: "tenant-1",
      threadId: "thread-1",
      direction: "in",
    });
    expect(evaluateGate).toHaveBeenCalledWith({
      userId: "tenant-1",
      phone: "+14155550123",
      isMarketingCall: true,
      isLiveSessionFollowUp: false,
      requireFederalDncScreening: true,
      hasExpressWrittenConsent: false,
    });
  });

  it("allows the exact 60-minute boundary only as a live inbound follow-up", async () => {
    const nowMs = Date.parse("2026-08-26T12:00:00.000Z");
    const createdAt = new Date(nowMs - SMS_LIVE_FOLLOW_UP_WINDOW_MS);
    const loadLatestInboundArtifact = vi.fn(async () => ({ createdAt }));
    const evaluateGate = vi.fn(async () => ({
      allowed: false as const,
      status: "AutoDialFailed",
      reason: "blocked_internal_dnc" as const,
    }));

    expect(SMS_LIVE_FOLLOW_UP_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(isRecentInboundSmsArtifact(createdAt, nowMs)).toBe(true);
    await evaluateSmsThreadReplyGate(
      { userId: "tenant-1", threadId: "thread-1", phone: "+14155550123" },
      { loadLatestInboundArtifact, evaluateGate, now: () => nowMs },
    );

    expect(evaluateGate).toHaveBeenCalledWith({
      userId: "tenant-1",
      phone: "+14155550123",
      isMarketingCall: false,
      isLiveSessionFollowUp: true,
    });
  });

  it("keeps provider internals server-side while preserving customer recovery", () => {
    expect(
      customerSafeSmsFailureReason({
        reason: "Twilio credentials are not configured on this deployment.",
      }),
    ).not.toMatch(/Twilio|credential|deployment/i);
    expect(
      customerSafeSmsFailureReason({ reason: "Configure a Twilio sender before sending." }),
    ).not.toMatch(/Twilio|sender/i);
    expect(
      customerSafeSmsFailureReason({ reason: "This contact has opted out of messaging." }),
    ).toBe("This contact has opted out of messaging.");
    expect(
      customerSafeSmsFailureReason({
        reason: "Add Runtime Balance before sending.",
        code: "INSUFFICIENT_RUNTIME_BALANCE",
      }),
    ).toBe("Add Runtime Balance before sending.");
  });

  it("does not claim carrier acceptance is final delivery or clear unread state on failure", () => {
    const component = read("src/components/SmsThreads.tsx");
    expect(component).toContain('success("SMS queued"');
    expect(component).not.toContain("Message delivered to customer");
    expect(component).toContain("if (markReadResponse.ok)");
    expect(component).not.toMatch(/mark-read[^]*?\.catch\(\s*\(\) => \{\}/);
  });

  it("clears the prior transcript before loading a newly selected thread", () => {
    const component = read("src/components/SmsThreads.tsx");
    const selectionEffect = component.slice(
      component.indexOf("activeThreadFetchRef.current?.abort()"),
      component.indexOf("}, [activeId, fetchMessages]);"),
    );
    const clearAt = selectionEffect.indexOf(
      "setMessages([])",
      selectionEffect.indexOf("if (!activeId)"),
    );
    const fetchAt = selectionEffect.indexOf("fetchMessages(activeId");

    expect(clearAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(clearAt);
    expect(selectionEffect.slice(clearAt, fetchAt)).toContain("setThreadErr(null)");
  });

  it("turns ambiguous carrier outcomes into an explicit non-resend state", () => {
    const route = read("src/routes/sms-routes.ts");
    const component = read("src/components/SmsThreads.tsx");
    const ambiguousStart = component.indexOf('result.code === "SMS_PROVIDER_OUTCOME_AMBIGUOUS"');
    const ordinaryFailure = component.indexOf("if (!response.ok || !result.ok)", ambiguousStart);
    const ambiguousBranch = component.slice(ambiguousStart, ordinaryFailure);

    expect(route).toContain("provider_outcome_ambiguous: result.providerOutcomeAmbiguous");
    expect(route).toContain("do_not_resend: result.doNotResend");
    expect(ambiguousStart).toBeGreaterThan(-1);
    expect(ordinaryFailure).toBeGreaterThan(ambiguousStart);
    expect(ambiguousBranch).toContain("Do not resend");
    expect(ambiguousBranch).toContain("message.id !== optimistic.id");
    expect(ambiguousBranch).not.toContain("setReply(body)");
    expect(component.indexOf("setReply(body)")).toBeGreaterThan(ordinaryFailure);
  });
});
