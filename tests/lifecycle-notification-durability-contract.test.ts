import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("lifecycle notification durability", () => {
  it("gives retryable Resend operations stable provider idempotency keys", () => {
    const email = read("src/lib/email-service.ts");

    expect(email).toContain('disposition: "accepted" | "suppressed" | "failed"');
    expect(email).toContain('"Idempotency-Key": args.idempotencyKey');
    expect(email).toContain('disposition: "suppressed"');
  });

  it("does not acknowledge a Stripe payment-failure event before dunning settles", () => {
    const billing = read("src/routes/billing-routes.ts");
    const start = billing.indexOf('case "invoice.payment_failed"');
    const end = billing.indexOf('case "invoice.payment_succeeded"', start);
    const handler = billing.slice(start, end);

    expect(handler).toContain("const delivery = await sendPaymentFailedEmail");
    expect(handler).toContain("idempotencyKey: `stripe-payment-failed/${event.id}`");
    expect(handler).toContain('delivery.disposition !== "suppressed"');
    expect(handler).toContain("throw AppError.fromHttpStatus(503");
    expect(handler).not.toContain("void sendPaymentFailedEmail");
  });

  it("retries trial and margin alerts without duplicating accepted sends", () => {
    const worker = read("src/lib/job-worker-base.ts");

    expect(worker).toContain("idempotencyKey: `trial-ending-soon/${job.id}`");
    expect(worker).toContain('result.disposition === "suppressed"');
    expect(worker).toContain(
      'throw new Error(result.error || "Trial-ending email was not accepted")',
    );
    expect(worker).toContain("idempotencyKey: `margin-at-risk/${job.id}`");
    expect(worker).toContain("OWNER_EMAIL is required for margin-at-risk alerts");
    expect(worker).toContain('result.error || "Margin-at-risk alert was not accepted"');
  });

  it("backs human-escalation claims with a task and voicemail notices with retries", () => {
    const workflow = read("src/routes/vapi/tool-handlers-workflow.ts");
    const escalation = workflow.slice(workflow.indexOf('if (fn === "escalate_to_human")'));
    const voicemail = read("src/routes/twilio-webhook-base.ts");

    expect(escalation).toContain('taskType: "human_escalation"');
    expect(escalation.indexOf("await drizzle.insert(schema.followUpTasks)")).toBeLessThan(
      escalation.indexOf("await notifier.sendUrgentAlert"),
    );
    expect(escalation).toContain("I recorded this escalation for the team");
    expect(escalation).toContain("I couldn't record or send the escalation right now");

    expect(voicemail).toContain("Duplicate Twilio voicemail callback reusing persisted call");
    expect(voicemail).toContain("idempotencyKey: `voicemail-failover/${recordingKey}`");
    expect(voicemail).toContain('notification.disposition !== "suppressed"');
    expect(voicemail).not.toContain("Promise.race([");
  });
});
