import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("PR 729 hardening contract", () => {
  it("returns retryable durable jobs to the claimable pending state", () => {
    const queue = read("src/lib/job-queue.ts");
    expect(queue).toContain('status: "pending"');
    expect(queue).toContain('row?.type === "post_call_artifact"');
    expect(queue).toContain('row?.type === "scheduled_report"');
    expect(queue).toContain("longRunning ? 5 * 60 : 0");
  });

  it("does not reserve Runtime Balance for a stale scheduled report", () => {
    const worker = read("src/lib/job-worker.ts");
    const staleCheck = worker.indexOf("currentScheduledReportPreferences");
    const reportReservation = worker.indexOf("withRuntimeReservation(", staleCheck);
    expect(staleCheck).toBeGreaterThan(-1);
    expect(reportReservation).toBeGreaterThan(staleCheck);
    expect(worker).toContain('persistJobResult(job.id, { skipped: true, reason: "schedule_changed" })');
  });

  it("requires the durable job owner to match the report payload tenant", () => {
    const worker = read("src/lib/job-worker.ts");
    expect(worker).toContain("userId !== ownerId");
    expect(worker).toContain("Artifact job is missing a valid tenant owner.");
    expect(worker).toContain("Scheduled report job is missing a valid tenant owner.");
  });

  it("reserves Twilio spend before submitting to the carrier", () => {
    const twilio = read("src/lib/twilio-service.ts");
    expect(twilio.indexOf("reserveRuntimeUsage({")).toBeLessThan(
      twilio.indexOf("client.messages.create(payload)"),
    );
    expect(twilio).toContain('provider: "twilio"');
    expect(twilio).not.toContain("getCreditBalanceUsd");
    expect(twilio).not.toContain("billSmsMessage");
  });

  it("uses either an explicit sender or a Messaging Service, never both", () => {
    const twilio = read("src/lib/twilio-service.ts");
    expect(twilio).toContain('} else if (settings.messagingServiceSid) {');
    expect(twilio).toContain('payload.messagingServiceSid = settings.messagingServiceSid;');
  });

  it("limits START to reversing only Twilio-created SMS opt-outs", () => {
    const webhook = read("src/routes/twilio-webhook.ts");
    expect(webhook).toContain('eq(schema.dncList.source, "twilio_advanced_opt_out")');
    expect(webhook).toContain('eq(schema.dncList.reason, "opt-out")');
  });

  it("fails closed when subscription state is absent", () => {
    const gate = read("src/lib/trial-gate.ts");
    const noRow = gate.slice(gate.indexOf("if (!row)"), gate.indexOf("const now = Date.now()"));
    expect(noRow).toContain('status: "pending_activation"');
    expect(noRow).not.toContain('status: "active"');
  });

  it("records presenter consent at the disclosed action rather than the fetch transport", () => {
    const preview = read("src/components/AgentPresenceLivePreview.tsx");
    const api = read("src/lib/api.ts");
    expect(preview).toContain("JSON.stringify({ consentAcknowledged: true })");
    expect(api.trim()).toBe('export * from "./api-base";');
  });
});
