import { and, desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  canonicalizeOutboundPurpose,
  resolveEffectiveOutboundPurpose,
  type OutboundCallPurpose,
} from "./outbound-call-purpose";
import { evaluateOutboundDialGate, type OutboundDialGateResult } from "./outbound-dial-gate";
import { screenManualOutbound } from "./outbound-manual-screening";
import { deriveRelationship, isWithinRelationshipWindow } from "./outbound-relationship";
import { drizzle } from "./server-context";

/**
 * Quiet-hours bypass for a text the contact just sent. The 90-day relationship
 * window is separate and only skips Do Not Call screening.
 */
export const SMS_LIVE_FOLLOW_UP_WINDOW_MS = 60 * 60 * 1000;

type SmsReplyGateInput = {
  userId: string;
  threadId: string;
  phone: string;
  requestedPurpose?: OutboundCallPurpose;
  permissionConfirmed?: boolean;
  nonsalesConfirmed?: boolean;
  customerSince?: string | null;
  content?: string | null;
  salesAttestationConfirmed?: boolean;
  enforceContactConfirmation?: boolean;
  actorIp?: string | null;
  userAgent?: string | null;
};

type InboundArtifactScope = Pick<SmsReplyGateInput, "userId" | "threadId"> & {
  direction: "in";
};

type InboundArtifact = { createdAt: unknown } | null;

type SmsReplyComplianceDeps = {
  loadLatestInboundArtifact?: (scope: InboundArtifactScope) => Promise<InboundArtifact>;
  evaluateGate?: typeof evaluateOutboundDialGate;
  deriveRelationship?: typeof deriveRelationship;
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

function denied(message: string): OutboundDialGateResult {
  return {
    allowed: false,
    status: "AutoDialFailed",
    reason: "contact_confirmation_required",
    customerMessage: message,
    federalDncMessage: message,
  };
}

/**
 * A text in a conversation the contact started (inbound within 90 days) is not
 * sales screening. An inbound text inside the last hour also skips quiet hours.
 * Missing, future, and malformed evidence fails closed as sales.
 */
export async function evaluateSmsThreadReplyGate(
  input: SmsReplyGateInput,
  deps: SmsReplyComplianceDeps = {},
): Promise<OutboundDialGateResult> {
  const loadArtifact = deps.loadLatestInboundArtifact || loadLatestInboundArtifact;
  const evaluateGate = deps.evaluateGate || evaluateOutboundDialGate;
  const nowMs = (deps.now || Date.now)();
  const artifact = await loadArtifact({
    userId: input.userId,
    threadId: input.threadId,
    direction: "in",
  });
  const isLiveFollowUp = isRecentInboundSmsArtifact(artifact?.createdAt, nowMs);
  const threadReturning = isWithinRelationshipWindow(artifact?.createdAt, nowMs);
  const relationship = threadReturning
    ? {
        kind: "returning_contact" as const,
        source: "sms" as const,
        sourceId: input.threadId,
        at:
          artifact?.createdAt instanceof Date
            ? artifact.createdAt.toISOString()
            : new Date(nowMs).toISOString(),
      }
    : await (deps.deriveRelationship ?? deriveRelationship)(input.userId, input.phone);

  const requested = input.requestedPurpose
    ? canonicalizeOutboundPurpose(input.requestedPurpose)
    : relationship
      ? "returning_contact"
      : "sales";
  const resolved = resolveEffectiveOutboundPurpose({
    requested,
    relationshipReturning: Boolean(relationship),
    customerSince: input.customerSince ? new Date(input.customerSince) : null,
  });

  if (isLiveFollowUp && !input.enforceContactConfirmation) {
    return evaluateGate({
      userId: input.userId,
      phone: input.phone,
      isMarketingCall: false,
      isLiveSessionFollowUp: true,
    });
  }

  if (input.enforceContactConfirmation) {
    const manual = await screenManualOutbound({
      userId: input.userId,
      phone: input.phone,
      channel: "sms",
      requestedPurpose: requested,
      permissionConfirmed: input.permissionConfirmed,
      nonsalesConfirmed: input.nonsalesConfirmed,
      customerSince: input.customerSince,
      content: input.content,
      salesAttestationConfirmed: input.salesAttestationConfirmed,
      actorIp: input.actorIp,
      userAgent: input.userAgent,
      relationship,
    });
    if (!manual.ok) return denied(manual.error);
    const sales = manual.screening.requireFederalDncScreening;
    const gate = await evaluateGate({
      userId: input.userId,
      phone: input.phone,
      isMarketingCall: sales,
      isLiveSessionFollowUp: isLiveFollowUp,
      requireFederalDncScreening: sales,
      salesScreening: sales ? "one_off" : "bulk",
      hasExpressWrittenConsent: false,
      isRequestedCallback: false,
      audit: manual.audit,
    });
    return gate.allowed ? { ...gate, contentWarning: manual.contentWarning } : gate;
  }

  const sales = resolved.effective === "sales";
  return evaluateGate({
    userId: input.userId,
    phone: input.phone,
    isMarketingCall: sales,
    isLiveSessionFollowUp: false,
    requireFederalDncScreening: sales,
    salesScreening: sales ? "one_off" : "bulk",
    hasExpressWrittenConsent: false,
  });
}
