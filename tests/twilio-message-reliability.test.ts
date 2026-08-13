import { describe, expect, it, vi } from "vitest";

import {
  boundedTwilioMessageValidityPeriod,
  createTwilioMessageWithRateLimitRetry,
  twilioMessageStatusCallbackUrl,
  twilioRateLimitBackoffMs,
  withTwilioMessageReliability,
} from "../src/lib/twilio-message-reliability";

describe("Twilio message reliability", () => {
  it("attaches the canonical signed callback target and a bounded validity period", () => {
    expect(
      withTwilioMessageReliability(
        { to: "+15555550100", body: "Operational alert" },
        { appUrl: "https://trywireline.com/", validitySeconds: 42 },
      ),
    ).toEqual({
      to: "+15555550100",
      body: "Operational alert",
      statusCallback: "https://trywireline.com/api/twilio-webhook/message-status",
      validityPeriod: 60,
    });
    expect(twilioMessageStatusCallbackUrl("https://trywireline.com///")).toBe(
      "https://trywireline.com/api/twilio-webhook/message-status",
    );
    expect(twilioMessageStatusCallbackUrl("https://trywireline.com", "operational")).toBe(
      "https://trywireline.com/api/twilio-webhook/message-status?scope=operational",
    );
    expect(
      withTwilioMessageReliability(
        { to: "+15555550100", body: "Operational alert" },
        { appUrl: "https://trywireline.com", scope: "operational" },
      ).statusCallback,
    ).toBe("https://trywireline.com/api/twilio-webhook/message-status?scope=operational");
    expect(boundedTwilioMessageValidityPeriod(50_000)).toBe(36_000);
    expect(boundedTwilioMessageValidityPeriod("not-a-number")).toBe(3_600);
  });

  it("uses exponential backoff with bounded jitter", () => {
    expect(twilioRateLimitBackoffMs(0, () => 0)).toBe(90);
    expect(twilioRateLimitBackoffMs(0, () => 0.5)).toBe(100);
    expect(twilioRateLimitBackoffMs(2, () => 1)).toBe(440);
  });

  it("retries explicit 429 responses and preserves the same payload", async () => {
    const payload = { to: "+15555550100", body: "Operational alert" };
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValue({ sid: "SM-success" });
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();

    await expect(
      createTwilioMessageWithRateLimitRetry(() => create(payload), {
        random: () => 0.5,
        sleep,
        onRetry,
      }),
    ).resolves.toEqual({ sid: "SM-success" });

    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, payload);
    expect(create).toHaveBeenNthCalledWith(2, payload);
    expect(create).toHaveBeenNthCalledWith(3, payload);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("never retries ambiguous network or provider failures", async () => {
    const failure = Object.assign(new Error("provider unavailable"), { status: 503 });
    const create = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn(async () => {});

    await expect(
      createTwilioMessageWithRateLimitRetry(
        () => create({ to: "+15555550100", body: "Operational alert" }),
        { sleep },
      ),
    ).rejects.toBe(failure);
    expect(create).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops at the bounded 429 attempt budget", async () => {
    const failure = Object.assign(new Error("rate limited"), { status: 429 });
    const create = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn(async () => {});

    await expect(
      createTwilioMessageWithRateLimitRetry(
        () => create({ to: "+15555550100", body: "Operational alert" }),
        { maxAttempts: 3, random: () => 0.5, sleep },
      ),
    ).rejects.toBe(failure);
    expect(create).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
