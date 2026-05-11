import { describe, it, expect } from "vitest";
import { evaluateOperatorSloHealth } from "./operator-slos";

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
