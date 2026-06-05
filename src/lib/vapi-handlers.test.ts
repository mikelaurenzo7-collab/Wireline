import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trackVoiceMinutes: vi.fn().mockResolvedValue(undefined),
  runPostCallDigest: vi.fn().mockResolvedValue(undefined),
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
  persistClaudeAuditRecords: vi.fn().mockResolvedValue(undefined),
  insertOutcome: "fresh" as "fresh" | "duplicate",
}));

vi.mock("./server-context", () => ({
  drizzle: {
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (mocks.insertOutcome === "duplicate") {
            const err = new Error("duplicate key") as Error & { code: string };
            err.code = "23505";
            throw err;
          }
          return [{ id: BigInt(42) }];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ name: "Test Agent", archetype: "Receptionist", role: "sales" }],
        }),
      }),
    }),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./voice-usage", () => ({ trackVoiceMinutes: mocks.trackVoiceMinutes }));
vi.mock("./post-call-digest", () => ({ runPostCallDigest: mocks.runPostCallDigest }));
vi.mock("./webhook-helpers", () => ({
  buildCallCompletedOutcome: vi.fn(() => ({})),
  dispatchWebhook: mocks.dispatchWebhook,
}));
vi.mock("../middleware/audit-middleware", () => ({
  persistClaudeAuditRecords: mocks.persistClaudeAuditRecords,
}));
vi.mock("./claude-brain", () => ({
  isClaudeAvailable: () => false,
  withAuditCapture: vi.fn(),
  postCallAnalysis: vi.fn(),
}));
vi.mock("./gemini-brain", () => ({ postCallAnalysis: vi.fn() }));
vi.mock("./tcpa-consent", () => ({
  getConsentRuleForPhone: () => ({ rule: "default", state: "CA" }),
  buildConsentLedgerRow: vi.fn(() => ({})),
  detectOptOut: () => false,
  detectRecordingDisclosure: () => ({ found: false }),
  CONSENT_RULE_VERSION: "v1",
}));
vi.mock("./sentry-events", () => ({ SentryEvents: { callCompleted: vi.fn() } }));
vi.mock("./slack-service", () => ({
  getDefaultChannel: vi.fn(),
  postMessage: vi.fn(),
}));
vi.mock("./dashboard-cache", () => ({ invalidateDashboard: vi.fn() }));

import { handleEndOfCallReport } from "./vapi-handlers";

const basePayload = {
  message: {
    call: {
      id: "call_test_123",
      type: "inboundPhoneCall",
      startedAt: "2026-06-05T10:00:00.000Z",
      endedAt: "2026-06-05T10:05:00.000Z",
      customer: { number: "+15551234567" },
      cost: 0.42,
    },
    analysis: { summary: "Test call" },
    transcript: "Hello",
  },
  agent: { id: "agent-1", user_id: "user-1" },
};

describe("handleEndOfCallReport", () => {
  beforeEach(() => {
    mocks.insertOutcome = "fresh";
    mocks.trackVoiceMinutes.mockClear();
    mocks.runPostCallDigest.mockClear();
    mocks.dispatchWebhook.mockClear();
  });

  it("tracks voice minutes and enqueues digest on a fresh insert", async () => {
    await handleEndOfCallReport(basePayload);

    expect(mocks.trackVoiceMinutes).toHaveBeenCalledTimes(1);
    expect(mocks.trackVoiceMinutes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        durationSeconds: 300,
        vapiCallId: "call_test_123",
      }),
    );
    expect(mocks.runPostCallDigest).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchWebhook).toHaveBeenCalled();
  });

  it("skips billing side-effects on duplicate Vapi retries", async () => {
    mocks.insertOutcome = "duplicate";
    await handleEndOfCallReport(basePayload);

    expect(mocks.trackVoiceMinutes).not.toHaveBeenCalled();
    expect(mocks.runPostCallDigest).not.toHaveBeenCalled();
    expect(mocks.dispatchWebhook).toHaveBeenCalled();
  });
});
