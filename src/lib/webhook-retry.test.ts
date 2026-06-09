import { describe, expect, it, vi, beforeEach } from "vitest";
import { attemptWebhookDelivery } from "./webhook-helpers";
import { drizzle, fetchWithTimeout } from "./server-context";
import { SentryEvents } from "./sentry-events";

vi.mock("./server-context", () => {
  const mockDrizzle = {
    query: {
      webhookDeliveries: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  };
  return {
    drizzle: mockDrizzle,
    fetchWithTimeout: vi.fn(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("./sentry-events", () => ({
  SentryEvents: {
    webhookDeliveryFailed: vi.fn(),
  },
}));

vi.mock("./webhook-validators", () => ({
  resolveWebhookDeliveryHostname: vi.fn().mockResolvedValue({ status: "public" }),
}));

describe("Webhook Delivery & Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully delivers webhook and marks success", async () => {
    const mockDelivery = {
      id: 123n,
      webhookId: "hook_1",
      attempts: 0,
      payload: { event: "lead.hot", data: { score: 95 } },
      webhook: {
        url: "https://my-crm.com/webhook",
        secret: "super-secret-vault-key",
      },
    };

    vi.mocked(drizzle.query.webhookDeliveries.findFirst).mockResolvedValue(mockDelivery as any);
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 200,
      ok: true,
    } as any);

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(Promise.resolve()),
    });
    vi.mocked(drizzle.update).mockReturnValue({
      set: updateMock,
    } as any);

    await attemptWebhookDelivery(123);

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "https://my-crm.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-wireline-signature": expect.any(String),
        }),
        body: JSON.stringify(mockDelivery.payload),
      }),
      10_000,
    );

    expect(drizzle.update).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        lastStatusCode: 200,
        attempts: 1,
        nextAttemptAt: null,
      }),
    );
  });

  it("handles transient failure, schedules next attempt using exponential backoff", async () => {
    const mockDelivery = {
      id: 123n,
      webhookId: "hook_1",
      attempts: 1, // Second attempt
      payload: { event: "lead.hot", data: { score: 95 } },
      webhook: {
        url: "https://my-crm.com/webhook",
        secret: "super-secret-vault-key",
      },
    };

    vi.mocked(drizzle.query.webhookDeliveries.findFirst).mockResolvedValue(mockDelivery as any);
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 503,
      ok: false,
    } as any);

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(Promise.resolve()),
    });
    vi.mocked(drizzle.update).mockReturnValue({
      set: updateMock,
    } as any);

    const beforeCall = Date.now();
    await attemptWebhookDelivery(123);
    const afterCall = Date.now();

    expect(drizzle.update).toHaveBeenCalled();
    const mockArgs = updateMock.mock.calls[0][0];

    expect(mockArgs.status).toBe("pending");
    expect(mockArgs.lastStatusCode).toBe(503);
    expect(mockArgs.attempts).toBe(2);

    // Exponential backoff for attempts=2: Math.pow(2, 2) * 60_000 = 4 minutes = 240,000 ms
    const nextAttempt = mockArgs.nextAttemptAt.getTime();
    const expectedTimeMin = beforeCall + 240_000;
    const expectedTimeMax = afterCall + 240_000;
    expect(nextAttempt).toBeGreaterThanOrEqual(expectedTimeMin);
    expect(nextAttempt).toBeLessThanOrEqual(expectedTimeMax);
  });

  it("exhausts max attempts and triggers sentry error event", async () => {
    const mockDelivery = {
      id: 123n,
      webhookId: "hook_1",
      attempts: 4, // 5th attempt is about to fail
      payload: { event: "lead.hot", data: { score: 95 } },
      webhook: {
        url: "https://my-crm.com/webhook",
        secret: "super-secret-vault-key",
      },
    };

    vi.mocked(drizzle.query.webhookDeliveries.findFirst).mockResolvedValue(mockDelivery as any);
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      status: 500,
      ok: false,
    } as any);

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(Promise.resolve()),
    });
    vi.mocked(drizzle.update).mockReturnValue({
      set: updateMock,
    } as any);

    await attemptWebhookDelivery(123);

    expect(drizzle.update).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        lastStatusCode: 500,
        attempts: 5,
        nextAttemptAt: null,
      }),
    );

    expect(SentryEvents.webhookDeliveryFailed).toHaveBeenCalledWith({
      webhook_id: "hook_1",
      attempt: 5,
      status_code: 500,
    });
  });
});
