import { and, desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { classifyUntrustedDirectDial } from "./outbound-call-purpose";
import { evaluateOutboundDialGate, type OutboundDialGateResult } from "./outbound-dial-gate";
import { drizzle } from "./server-context";

/**
 * A consumer's inbound text is evidence for only the immediately active
 * conversation. After this window, an account-holder reply returns to the
 * ordinary untrusted outbound classification and all marketing controls.
 */
export const SMS_LIVE_FOLLOW_UP_WINDOW_MS = 60 * 60 * 1000;

type SmsReplyGateInput = {
  userId: string;
  threadId: string;
  phone: string;
};

type InboundArtifactScope = Pick<SmsReplyGateInput, "userId" | "threadId"> & {
  direction: "in";
};

type InboundArtifact = { createdAt: unknown } | null;

type SmsReplyComplianceDeps = {
  loadLatestInboundArtifact?: (scope: InboundArtifactScope) => Promise<InboundArtifact>;
  evaluateGate?: typeof evaluateOutboundDialGate;
  now?: () => number;
};

async function loadLatestInboundArtifact(scope: InboundArtifactScope): Promise<InboundArtifact> {
  const [artifact] = await drizzle
    .select({ createdAt: schema.smsMessages.createdAt })
    .from(schema.smsMessages)
    .where(
      and(
        eq(schema.smsMessages.userId, scope.userId),
        eq(schema.smsMessages.threadId, scope.threadId),
        eq(schema.smsMessages.direction, scope.direction),
      ),
    )
    .orderBy(desc(schema.smsMessages.createdAt))
    .limit(1);
  return artifact || null;
}

export function isRecentInboundSmsArtifact(
  createdAt: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (!(createdAt instanceof Date)) return false;
  const createdAtMs = createdAt.getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return false;

  const ageMs = nowMs - createdAtMs;
  return ageMs >= 0 && ageMs <= SMS_LIVE_FOLLOW_UP_WINDOW_MS;
}

/**
 * Only a recent, tenant-and-thread-scoped inbound row may mint the live SMS
 * follow-up class. Missing, stale, future, and malformed evidence fails closed
 * as an untrusted marketing send with mandatory Federal DNC screening and no
 * verified express-written-consent claim.
 */
export async function evaluateSmsThreadReplyGate(
  input: SmsReplyGateInput,
  deps: SmsReplyComplianceDeps = {},
): Promise<OutboundDialGateResult> {
  const loadArtifact = deps.loadLatestInboundArtifact || loadLatestInboundArtifact;
  const evaluateGate = deps.evaluateGate || evaluateOutboundDialGate;
  const artifact = await loadArtifact({
    userId: input.userId,
    threadId: input.threadId,
    direction: "in",
  });
  const isLiveFollowUp = isRecentInboundSmsArtifact(artifact?.createdAt, (deps.now || Date.now)());

  if (isLiveFollowUp) {
    return evaluateGate({
      userId: input.userId,
      phone: input.phone,
      isMarketingCall: false,
      isLiveSessionFollowUp: true,
    });
  }

  const classification = classifyUntrustedDirectDial({
    callPurpose: "service_or_requested",
  });
  return evaluateGate({
    userId: input.userId,
    phone: input.phone,
    isMarketingCall: classification.isMarketingCall,
    isLiveSessionFollowUp: false,
    requireFederalDncScreening: true,
    hasExpressWrittenConsent: false,
  });
}
