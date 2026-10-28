import { assertJobPayloadOwner } from "./job-owner";
import type { SendResult } from "./email-service";

type TrialReminderSnapshot = {
  email: string | null;
  status: string | null;
  trialEndsAt: Date | string | null;
};

/** Recheck the queued owner's current trial before preparing any provider send. */
export async function sendCurrentTrialReminder(
  job: { id: string; user_id: string; payload: unknown },
  deps: {
    load: (userId: string) => Promise<TrialReminderSnapshot | undefined>;
    send: (input: {
      userId: string;
      to: string;
      daysLeft: number;
      idempotencyKey: string;
    }) => Promise<SendResult>;
    now?: () => number;
  },
): Promise<{ status: "skipped" | "suppressed" | "sent"; userId: string }> {
  const userId = assertJobPayloadOwner(job, job.payload);
  // A database error must propagate so the durable job can retry. A missing
  // account/settings row cannot establish a current eligible recipient.
  const current = await deps.load(userId);
  const now = deps.now?.() ?? Date.now();
  const endsAt = current?.trialEndsAt ? new Date(current.trialEndsAt).getTime() : NaN;
  const remainingMs = endsAt - now;
  if (
    !current?.email ||
    current.status !== "trialing" ||
    !Number.isFinite(remainingMs) ||
    remainingMs <= 0 ||
    remainingMs > 3 * 24 * 60 * 60 * 1000
  ) {
    return { status: "skipped", userId };
  }

  const result = await deps.send({
    userId,
    to: current.email,
    daysLeft: Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
    idempotencyKey: `trial-ending-soon/${job.id}`,
  });
  if (result.ok) return { status: "sent", userId };
  if (result.disposition === "suppressed") return { status: "suppressed", userId };
  throw new Error(result.error || "Trial-ending email was not accepted");
}
