// Telemetry tests — verify each business event reaches Sentry with the
// correct level, tags, and measurements. Wrong tags = wrong dashboards.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));

vi.mock("@sentry/node", () => ({
  captureMessage,
}));

import { SentryEvents, reportBatchEvent } from "./sentry-events";

beforeEach(() => {
  captureMessage.mockReset();
});

describe("SentryEvents.callCompleted", () => {
  it("emits an info-level event with duration measurement", () => {
    SentryEvents.callCompleted({
      duration_ms: 4200,
      agent_id: "agent-1",
      direction: "outbound",
    });
    expect(captureMessage).toHaveBeenCalledWith("Call completed", expect.objectContaining({
      level: "info",
      tags: expect.objectContaining({ event: "call_completed", direction: "outbound" }),
      measurements: expect.objectContaining({
        duration_ms: { value: 4200, unit: "milliseconds" },
      }),
    }));
  });
});

describe("SentryEvents.callFailed", () => {
  it("emits a warning with the failure reason in the message", () => {
    SentryEvents.callFailed({ error: "no answer", agent_id: "a", reason: "timeout" });
    expect(captureMessage).toHaveBeenCalledWith(
      "Call failed: timeout",
      expect.objectContaining({ level: "warning" }),
    );
  });
});

describe("SentryEvents.emailSent", () => {
  it("includes recipient_count as a measurement", () => {
    SentryEvents.emailSent({ thread_id: "t-1", recipient_count: 3 });
    expect(captureMessage).toHaveBeenCalledWith("Email sent", expect.objectContaining({
      measurements: expect.objectContaining({
        recipient_count: { value: 3, unit: "none" },
      }),
    }));
  });
});

describe("SentryEvents.emailFailed", () => {
  it("emits warning level with reason", () => {
    SentryEvents.emailFailed({ reason: "smtp_refused" });
    const args = captureMessage.mock.calls[0];
    expect(args[0]).toContain("smtp_refused");
    expect(args[1].level).toBe("warning");
  });
});

describe("SentryEvents.outboundDialStarted", () => {
  it("includes lead_count measurement", () => {
    SentryEvents.outboundDialStarted({ lead_count: 50, agent_id: "a" });
    expect(captureMessage).toHaveBeenCalledWith(
      "Outbound dial campaign started",
      expect.objectContaining({
        measurements: { lead_count: { value: 50, unit: "none" } },
      }),
    );
  });
});

describe("SentryEvents.leadConnected", () => {
  it("emits info level", () => {
    SentryEvents.leadConnected({ agent_id: "a" });
    expect(captureMessage.mock.calls[0][1].level).toBe("info");
  });
});

describe("SentryEvents.apiError", () => {
  it("includes status code as a string tag (Sentry tags must be strings)", () => {
    SentryEvents.apiError({ endpoint: "/api/x", status: 500, error_type: "DBError" });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.status).toBe("500");
    expect(typeof args[1].tags.status).toBe("string");
  });

  it("forwards optional message and context to extra", () => {
    SentryEvents.apiError({
      endpoint: "/api/x",
      status: 500,
      error_type: "DB",
      message: "constraint violation",
      context: { user_id: "u-1" },
    });
    const args = captureMessage.mock.calls[0];
    expect(args[1].extra.message).toBe("constraint violation");
    expect(args[1].extra.context).toEqual({ user_id: "u-1" });
  });
});

describe("SentryEvents.aiApiFailure", () => {
  it("tags model and attempt as strings", () => {
    SentryEvents.aiApiFailure({
      endpoint: "/api/claude/recipes",
      error_message: "rate limited upstream",
      model: "claude-opus-4-7",
      input_tokens: 1024,
      attempt: 2,
    });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.model).toBe("claude-opus-4-7");
    expect(args[1].tags.attempt).toBe("2");
    expect(args[1].extra.input_tokens).toBe(1024);
  });

  it("defaults model and attempt when not provided", () => {
    SentryEvents.aiApiFailure({
      endpoint: "/api/x",
      error_message: "boom",
    });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.model).toBe("unknown");
    expect(args[1].tags.attempt).toBe("1");
  });
});

describe("SentryEvents.databaseError", () => {
  it("includes operation and table tags for filtering", () => {
    SentryEvents.databaseError({
      operation: "INSERT",
      table: "wireline_agents",
      error_message: "unique constraint",
    });
    const args = captureMessage.mock.calls[0];
    expect(args[0]).toContain("INSERT");
    expect(args[0]).toContain("wireline_agents");
    expect(args[1].tags.operation).toBe("INSERT");
    expect(args[1].tags.table).toBe("wireline_agents");
  });
});

describe("SentryEvents.externalServiceError", () => {
  it("uses 'unknown' for missing status code", () => {
    SentryEvents.externalServiceError({
      service: "twilio",
      endpoint: "/v2/calls",
      error_message: "ECONNRESET",
    });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.status).toBe("unknown");
  });

  it("stringifies a present status code", () => {
    SentryEvents.externalServiceError({
      service: "gmail",
      endpoint: "/messages.send",
      error_message: "quota exceeded",
      status_code: 429,
    });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.status).toBe("429");
  });
});

describe("SentryEvents.rateLimited", () => {
  it("tags the affected endpoint", () => {
    SentryEvents.rateLimited({ endpoint: "/api/claude" });
    const args = captureMessage.mock.calls[0];
    expect(args[1].tags.endpoint).toBe("/api/claude");
    expect(args[1].level).toBe("warning");
  });
});

describe("SentryEvents.webhookDeliveryFailed", () => {
  it("includes attempt count in the message and tag", () => {
    SentryEvents.webhookDeliveryFailed({ webhook_id: "wh-1", attempt: 3 });
    const args = captureMessage.mock.calls[0];
    expect(args[0]).toContain("attempt 3");
    expect(args[1].tags.attempt).toBe("3");
  });
});

describe("SentryEvents.slowOperation", () => {
  it("computes over_threshold_by_pct correctly", () => {
    SentryEvents.slowOperation({
      operation: "GET /api/agents",
      duration_ms: 3000,
      threshold_ms: 1000,
    });
    const args = captureMessage.mock.calls[0];
    const overage = args[1].measurements.over_threshold_by_pct.value;
    // 3000ms vs 1000ms threshold = 200% over
    expect(overage).toBeCloseTo(200, 1);
  });
});

describe("SentryEvents.cacheOperation", () => {
  it("tags hit/miss status", () => {
    SentryEvents.cacheOperation({ key: "agent:1", hit: true });
    expect(captureMessage.mock.calls[0][1].tags.status).toBe("hit");

    captureMessage.mockReset();
    SentryEvents.cacheOperation({ key: "agent:2", hit: false });
    expect(captureMessage.mock.calls[0][1].tags.status).toBe("miss");
  });

  it("omits measurements when duration not provided", () => {
    SentryEvents.cacheOperation({ key: "x", hit: true });
    const args = captureMessage.mock.calls[0];
    expect(args[1].measurements).toBeUndefined();
  });

  it("includes lookup_duration_ms when provided", () => {
    SentryEvents.cacheOperation({ key: "x", hit: false, duration_ms: 42 });
    const args = captureMessage.mock.calls[0];
    expect(args[1].measurements.lookup_duration_ms.value).toBe(42);
  });
});

describe("SentryEvents.budgetWarning", () => {
  it("computes spent_percent correctly", () => {
    SentryEvents.budgetWarning({ user_id: "u-1", spent: 75, budget: 100 });
    const args = captureMessage.mock.calls[0];
    expect(args[1].measurements.spent_percent.value).toBeCloseTo(75, 5);
    expect(args[1].measurements.spent_percent.unit).toBe("percent");
  });

  it("guards against division by zero on a zero budget", () => {
    SentryEvents.budgetWarning({ user_id: "u-1", spent: 10, budget: 0 });
    const args = captureMessage.mock.calls[0];
    expect(args[1].measurements.spent_percent.value).toBe(0);
  });

  it("emits at warning level", () => {
    SentryEvents.budgetWarning({ user_id: "u-1", spent: 1, budget: 10 });
    expect(captureMessage.mock.calls[0][1].level).toBe("warning");
  });
});

describe("SentryEvents.budgetExceeded", () => {
  it("emits at error level for the budget cap breach", () => {
    SentryEvents.budgetExceeded({ user_id: "u-1", spent: 110, budget: 100 });
    expect(captureMessage.mock.calls[0][1].level).toBe("error");
  });
});

describe("SentryEvents.agentOptimized", () => {
  it("includes the metric improved in the message", () => {
    SentryEvents.agentOptimized({ agent_id: "a-1", metric_improved: "lead_score" });
    expect(captureMessage.mock.calls[0][0]).toContain("lead_score");
  });
});

describe("reportBatchEvent", () => {
  it("formats the message with the count suffix", () => {
    reportBatchEvent("call_completed", 12);
    expect(captureMessage.mock.calls[0][0]).toBe("call_completed (×12)");
  });

  it("merges custom attributes into the tag set without overriding required tags", () => {
    reportBatchEvent("event_x", 5, { region: "us-west" });
    const tags = captureMessage.mock.calls[0][1].tags;
    expect(tags.event).toBe("event_x");
    expect(tags.batch).toBe("true");
    expect(tags.count).toBe("5");
    expect(tags.region).toBe("us-west");
  });
});
