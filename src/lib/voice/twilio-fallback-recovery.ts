import { createHash } from "node:crypto";
import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import type { JobRow } from "../job-queue";
import { drizzle, tenantStore } from "../server-context";
import { getTwilioClient } from "../twilio-service";
import { settleTwilioFallbackReceipt } from "./twilio-fallback";
import { twilioFallbackStore } from "./twilio-fallback-store";
import type { TwilioFallbackStore } from "./twilio-fallback-receipt";
import { openAIProjectSipUri } from "./openai-sip-config";

const TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);
const SID = /^CA[a-f0-9]{32}$/i;
type Dependencies = {
  store: TwilioFallbackStore;
  client: typeof getTwilioClient;
  settle: typeof settleTwilioFallbackReceipt;
};
const defaults: Dependencies = {
  store: twilioFallbackStore,
  client: getTwilioClient,
  settle: settleTwilioFallbackReceipt,
};

/** Keep the scheduled deadline safeguard; create at most one extra early recovery. */
export async function expediteTwilioFallbackRecovery(
  userId: string,
  parentCallSid: string,
): Promise<void> {
  if (!SID.test(parentCallSid)) throw AppError.badRequest("Invalid fallback identity.");
  const hash = createHash("sha256")
    .update(`fallback-early:${userId}:${parentCallSid}`)
    .digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  await tenantStore.run(userId, () =>
    drizzle
      .insert(schema.jobs)
      .values({
        id,
        userId,
        type: "twilio_fallback_reconcile",
        payload: { parentCallSid },
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
        runAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.jobs.id }),
  );
}

/** Settle original admission, even after line reassignment or account reclassification. */
export async function reconcileTwilioFallbackJob(
  job: Pick<JobRow, "payload"> & { userId?: string; user_id?: string },
  deps: Dependencies = defaults,
): Promise<void> {
  const parentCallSid = job.payload?.parentCallSid;
  const userId = job.userId ?? job.user_id;
  if (
    !userId ||
    (job.userId && job.user_id && job.userId !== job.user_id) ||
    typeof parentCallSid !== "string" ||
    !SID.test(parentCallSid)
  )
    throw new Error("Invalid fallback recovery identity.");
  await tenantStore.run(userId, async () => {
    const receipt = await deps.store.find(parentCallSid);
    if (!receipt || receipt.userId !== userId || receipt.parentCallSid !== parentCallSid)
      throw new Error("Fallback recovery has no matching tenant admission.");
    if (receipt.completion) {
      await deps.settle(receipt, receipt.completion);
      return;
    }
    const client = deps.client();
    if (!client) throw AppError.serviceUnavailable("Carrier recovery is unavailable.");
    const resource = client.calls(parentCallSid);
    let parent = await resource.fetch();
    const validParent = () =>
      parent.sid === parentCallSid &&
      parent.accountSid === client.accountSid &&
      parent.from === receipt.callerNumber &&
      parent.to === receipt.calledNumber &&
      parent.direction === "inbound";
    if (!validParent()) throw new Error("Carrier parent conflicts with the admitted fallback.");
    const deadline = receipt.deadlineAtMs ?? Date.parse(receipt.leaseExpiresAt) - 15 * 60_000;
    if (!TERMINAL.has(parent.status)) {
      if (Date.now() < deadline)
        throw AppError.serviceUnavailable("The admitted fallback may still be active.");
      await resource.update({ status: "completed" });
      parent = await resource.fetch();
      if (!validParent() || !TERMINAL.has(parent.status))
        throw AppError.serviceUnavailable("Fallback termination is not yet confirmed.");
    }
    // Query a bounded page. Multiple children require explicit reconciliation,
    // never an arbitrary child's duration or a guessed zero-cost outcome.
    const children = await client.calls.list({ parentCallSid, limit: 3, pageSize: 3 });
    if (children.length >= 3)
      throw AppError.serviceUnavailable(
        "Fallback carrier history exceeds its bounded recovery window.",
      );
    const fallbackChildren = children.filter(
      (candidate) => candidate.to === receipt.fallbackNumber,
    );
    if (fallbackChildren.length > 1)
      throw AppError.serviceUnavailable(
        "Fallback has multiple carrier attempts requiring reconciliation.",
      );
    for (const prior of children.filter((candidate) => candidate.to !== receipt.fallbackNumber)) {
      // A failed <Dial><Sip> can precede the human leg under this same parent.
      // Exclude only that exact configured SIP destination with verified source,
      // terminal failure and zero connected duration; never an arbitrary child.
      const priorTarget = prior.to?.split("?")[0].replace(/;transport=tls$/, "");
      const configuredTarget = openAIProjectSipUri().replace(/;transport=tls$/, "");
      if (
        !SID.test(prior.sid) ||
        prior.sid === parentCallSid ||
        prior.parentCallSid !== parentCallSid ||
        prior.accountSid !== parent.accountSid ||
        ![receipt.callerNumber, receipt.calledNumber].includes(prior.from) ||
        priorTarget !== configuredTarget ||
        !TERMINAL.has(prior.status) ||
        prior.status === "completed" ||
        !["0", "", null].includes(prior.duration)
      )
        throw AppError.serviceUnavailable(
          "The earlier carrier leg could not be verified as an unanswered SIP attempt.",
        );
    }
    const child = fallbackChildren[0];
    if (!child) {
      const endedAt = parent.endTime instanceof Date ? parent.endTime.getTime() : NaN;
      if (!Number.isFinite(endedAt) || Date.now() - endedAt < 30_000)
        throw AppError.serviceUnavailable("Waiting for terminal carrier history to settle.");
      await deps.settle(receipt, { childCallSid: null, status: "canceled", durationSeconds: 0 });
      return;
    }
    if (
      !SID.test(child.sid) ||
      child.sid === parentCallSid ||
      child.parentCallSid !== parentCallSid ||
      child.accountSid !== parent.accountSid ||
      child.to !== receipt.fallbackNumber ||
      child.from !== receipt.calledNumber ||
      !TERMINAL.has(child.status)
    )
      throw AppError.serviceUnavailable(
        "Fallback child identity or terminal state could not be verified.",
      );
    const duration =
      child.status !== "completed" && (child.duration === "" || child.duration == null)
        ? 0
        : /^\d+$/.test(child.duration)
          ? Number(child.duration)
          : NaN;
    if (
      !Number.isSafeInteger(duration) ||
      duration < 0 ||
      duration > 2_147_483_647 ||
      (child.status !== "completed" && duration !== 0)
    )
      throw AppError.serviceUnavailable("Fallback duration could not be verified.");
    await deps.settle(receipt, {
      childCallSid: child.sid,
      status: child.status,
      durationSeconds: duration,
    });
  });
}
