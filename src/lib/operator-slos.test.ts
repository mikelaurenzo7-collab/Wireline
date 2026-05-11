import { describe, it, expect } from "vitest";
import { evaluateOperatorSloHealth, getSloWebhookEvents } from "./operator-slos";

describe("operator-slos · evaluateOperatorSloHealth", () => {
  it("returns ok when all signals are quiet", () => {
    const h = evaluateOperatorSloHealth({
      pendingJobs: 5,
      deadEnrichmentWindow: 0,
      webhookAttemptsWindow: 2,
      webhookSuccessRate: 1,
      auditErrorsWindow: 0,
    });
    expect(h.jobs_queue).toBe("ok");
    expect(h.enrichment_failures).toBe("ok");
    expect(h.webhooks).toBe("ok");
    expect(h.ai_errors).toBe("ok");
    expect(h.notes).toHaveLength(0);
  });

  it("elevates job backlog severity", () => {
    expect(
      evaluateOperatorSloHealth({
        pendingJobs: 60,
        deadEnrichmentWindow: 0,
        webhookAttemptsWindow: 0,
        webhookSuccessRate: null,
        auditErrorsWindow: 0,
      }).jobs_queue,
    ).toBe("warn");

    expect(
      evaluateOperatorSloHealth({
        pendingJobs: 250,
        deadEnrichmentWindow: 0,
        webhookAttemptsWindow: 0,
        webhookSuccessRate: null,
        auditErrorsWindow: 0,
      }).jobs_queue,
    ).toBe("critical");
  });

  it("flags dead-letter enrichment rows in-window", () => {
    expect(
      evaluateOperatorSloHealth({
        pendingJobs: 0,
        deadEnrichmentWindow: 3,
        webhookAttemptsWindow: 0,
        webhookSuccessRate: null,
        auditErrorsWindow: 0,
      }).enrichment_failures,
    ).toBe("warn");
  });

  it("combines webhook volume with success-rate when enough samples exist", () => {
    expect(
      evaluateOperatorSloHealth({
        pendingJobs: 0,
        deadEnrichmentWindow: 0,
        webhookAttemptsWindow: 50,
        webhookSuccessRate: 0.7,
        auditErrorsWindow: 0,
      }).webhooks,
    ).toBe("critical");

    expect(
      evaluateOperatorSloHealth({
        pendingJobs: 0,
        deadEnrichmentWindow: 0,
        webhookAttemptsWindow: 50,
        webhookSuccessRate: 0.9,
        auditErrorsWindow: 0,
      }).webhooks,
    ).toBe("warn");
  });
});

describe("operator-slos · getSloWebhookEvents", () => {
  const ts = "2026-05-11T12:00:00.000Z";

  it("returns empty array when all dimensions are ok", () => {
    const events = getSloWebhookEvents(
      { jobs_queue: "ok", enrichment_failures: "ok", webhooks: "ok", ai_errors: "ok" },
      24, ts,
    );
    expect(events).toHaveLength(0);
  });

  it("fires slo.jobs.critical only at critical (not warn)", () => {
    const warn = getSloWebhookEvents(
      { jobs_queue: "warn", enrichment_failures: "ok", webhooks: "ok", ai_errors: "ok" },
      24, ts,
    );
    expect(warn).toHaveLength(0);

    const critical = getSloWebhookEvents(
      { jobs_queue: "critical", enrichment_failures: "ok", webhooks: "ok", ai_errors: "ok" },
      24, ts,
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].event).toBe("slo.jobs.critical");
    expect(critical[0].health).toBe("critical");
  });

  it("fires slo.webhooks.degraded at both warn and critical", () => {
    const warn = getSloWebhookEvents(
      { jobs_queue: "ok", enrichment_failures: "ok", webhooks: "warn", ai_errors: "ok" },
      24, ts,
    );
    expect(warn).toHaveLength(1);
    expect(warn[0].event).toBe("slo.webhooks.degraded");
    expect(warn[0].health).toBe("warn");

    const critical = getSloWebhookEvents(
      { jobs_queue: "ok", enrichment_failures: "ok", webhooks: "critical", ai_errors: "ok" },
      24, ts,
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].health).toBe("critical");
  });

  it("fires slo.enrichment.dead only at critical", () => {
    const warn = getSloWebhookEvents(
      { jobs_queue: "ok", enrichment_failures: "warn", webhooks: "ok", ai_errors: "ok" },
      24, ts,
    );
    expect(warn).toHaveLength(0);

    const critical = getSloWebhookEvents(
      { jobs_queue: "ok", enrichment_failures: "critical", webhooks: "ok", ai_errors: "ok" },
      24, ts,
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].event).toBe("slo.enrichment.dead");
  });

  it("fires multiple events when several dimensions are degraded", () => {
    const events = getSloWebhookEvents(
      { jobs_queue: "critical", enrichment_failures: "critical", webhooks: "warn", ai_errors: "ok" },
      12, ts,
    );
    expect(events).toHaveLength(3);
    const names = events.map(e => e.event).sort();
    expect(names).toEqual(["slo.enrichment.dead", "slo.jobs.critical", "slo.webhooks.degraded"]);
    expect(events.every(e => e.window_hours === 12)).toBe(true);
    expect(events.every(e => e.evaluated_at === ts)).toBe(true);
  });
});
