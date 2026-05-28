import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendPaymentFailedEmail,
  sendTrialEndingSoonEmail,
  sendPasswordResetEmail,
  sendEmail,
} from "./email-service";

vi.mock("./server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeResendFetch(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// ─── No-transport path (RESEND_API_KEY absent) ──────────────────────────────

describe("when RESEND_API_KEY is not configured", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("sendPaymentFailedEmail returns ok:false with no-transport provider", async () => {
    const result = await sendPaymentFailedEmail({
      to: "user@example.com",
      amountDisplay: "$49.00",
      updateCardUrl: "https://app.example.com/billing",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("no-transport");
  });

  it("sendTrialEndingSoonEmail returns ok:false with no-transport provider", async () => {
    const result = await sendTrialEndingSoonEmail({
      to: "user@example.com",
      daysLeft: 3,
      checkoutUrl: "https://app.example.com/pricing",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("no-transport");
  });

  it("sendEmail returns ok:false with no-transport provider", async () => {
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("no-transport");
  });
});

// ─── Subject-line logic ──────────────────────────────────────────────────────

describe("sendTrialEndingSoonEmail subject line grammar", () => {
  // These tests use the log-warn fallback path (no RESEND_API_KEY)
  // but verify the subject is constructed correctly by switching to
  // a mocked Resend that captures the call arguments.

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });

  it("uses singular 'day' in the subject when daysLeft is 1", async () => {
    const fetchMock = makeResendFetch(200, { id: "msg_1" });
    vi.stubGlobal("fetch", fetchMock);

    await sendTrialEndingSoonEmail({
      to: "u@example.com",
      daysLeft: 1,
      checkoutUrl: "https://example.com",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Your Wireline trial ends in 1 day");
  });

  it("uses plural 'days' in the subject when daysLeft > 1", async () => {
    const fetchMock = makeResendFetch(200, { id: "msg_2" });
    vi.stubGlobal("fetch", fetchMock);

    await sendTrialEndingSoonEmail({
      to: "u@example.com",
      daysLeft: 3,
      checkoutUrl: "https://example.com",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Your Wireline trial ends in 3 days");
  });
});

// ─── Resend transport path ───────────────────────────────────────────────────

describe("when RESEND_API_KEY is set", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });

  it("sendPaymentFailedEmail returns ok:true on a successful Resend response", async () => {
    vi.stubGlobal("fetch", makeResendFetch(200, { id: "msg_abc" }));

    const result = await sendPaymentFailedEmail({
      to: "user@example.com",
      amountDisplay: "$49.00",
      updateCardUrl: "https://example.com/billing",
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("resend");
    expect(result.id).toBe("msg_abc");
  });

  it("sendPaymentFailedEmail returns ok:false when Resend responds with an error status", async () => {
    vi.stubGlobal("fetch", makeResendFetch(422, { message: "Invalid email" }));

    const result = await sendPaymentFailedEmail({
      to: "bad",
      amountDisplay: "$49.00",
      updateCardUrl: "https://example.com/billing",
    });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("resend");
    expect(result.error).toContain("422");
  });

  it("sendPaymentFailedEmail includes the invoiceUrl in the outbound call when provided", async () => {
    const fetchMock = makeResendFetch(200, { id: "msg_inv" });
    vi.stubGlobal("fetch", fetchMock);

    await sendPaymentFailedEmail({
      to: "user@example.com",
      amountDisplay: "$49.00",
      invoiceUrl: "https://invoice.stripe.com/abc",
      updateCardUrl: "https://example.com/billing",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).toContain("invoice.stripe.com/abc");
    expect(body.text).toContain("invoice.stripe.com/abc");
  });

  it("sendPaymentFailedEmail subject is 'Your Wireline payment failed'", async () => {
    const fetchMock = makeResendFetch(200, { id: "msg_s" });
    vi.stubGlobal("fetch", fetchMock);

    await sendPaymentFailedEmail({
      to: "u@example.com",
      amountDisplay: "$9.99",
      updateCardUrl: "https://example.com/billing",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Your Wireline payment failed");
  });

  it("sendTrialEndingSoonEmail returns ok:true on success", async () => {
    vi.stubGlobal("fetch", makeResendFetch(200, { id: "msg_trial" }));

    const result = await sendTrialEndingSoonEmail({
      to: "user@example.com",
      daysLeft: 2,
      checkoutUrl: "https://example.com/pricing",
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe("msg_trial");
  });

  it("sendPasswordResetEmail uses the correct fixed subject", async () => {
    const fetchMock = makeResendFetch(200, { id: "msg_pw" });
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail({
      to: "u@example.com",
      resetUrl: "https://example.com/reset?token=abc",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Reset your Wireline password");
  });

  it("sendPaymentFailedEmail returns ok:false and captures the error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

    const result = await sendPaymentFailedEmail({
      to: "user@example.com",
      amountDisplay: "$49.00",
      updateCardUrl: "https://example.com/billing",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network timeout");
  });
});
