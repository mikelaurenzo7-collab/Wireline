import { randomUUID, timingSafeEqual } from "node:crypto";

import { isOutboundCallPurpose, type OutboundCallPurpose } from "../outbound-call-purpose";
import { voicePermissionHash } from "../recipient-voice-permission";

/** Long enough to ring and connect. It is not a recipient signature. */
export const OUTBOUND_SCREENING_TTL_MS = 30 * 60_000;

export type OutboundScreeningReceipt = {
  admissionKind: "platform_screen";
  artifactId: string;
  grantHash: string;
  expiresAt: string;
  receiptId: string;
  receiptHash: string;
  effectiveCallPurpose: OutboundCallPurpose;
};

type ScreeningBody = {
  version: 1;
  kind: "platform_screen";
  userId: string;
  agentId: string;
  phone: string;
  callPurpose: OutboundCallPurpose;
  attemptId: string;
  leadId: string;
  artifactId: string;
  expiresAt: string;
};

function screeningBody(input: Omit<ScreeningBody, "version" | "kind">): ScreeningBody {
  return { version: 1, kind: "platform_screen", ...input };
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Server-issued proof that this call was admitted after screening.
 * The hash is an audit id. It is not express written consent.
 */
export function issueOutboundScreeningReceipt(input: {
  userId: string;
  agentId: string;
  phone: string;
  callPurpose: OutboundCallPurpose;
  attemptId: string;
  leadId: string;
  now?: number;
}): OutboundScreeningReceipt {
  const artifactId = randomUUID();
  const receiptId = randomUUID();
  const expiresAt = new Date((input.now ?? Date.now()) + OUTBOUND_SCREENING_TTL_MS).toISOString();
  const body = screeningBody({
    userId: input.userId,
    agentId: input.agentId,
    phone: input.phone,
    callPurpose: input.callPurpose,
    attemptId: input.attemptId,
    leadId: input.leadId,
    artifactId,
    expiresAt,
  });
  return {
    admissionKind: "platform_screen",
    artifactId,
    grantHash: voicePermissionHash(body),
    expiresAt,
    receiptId,
    receiptHash: voicePermissionHash({ ...body, receiptId }),
    effectiveCallPurpose: input.callPurpose,
  };
}

/** Recompute the screening hash. A mismatch or expiry refuses dispatch and the bridge. */
export function outboundScreeningMatches(input: {
  userId: string;
  agentId: string;
  phone: string;
  callPurpose: string;
  attemptId: string;
  leadId: string;
  artifactId: string;
  expiresAt: string;
  receiptId: string;
  grantHash: string;
  receiptHash: string;
  now?: number;
}): boolean {
  if (!isOutboundCallPurpose(input.callPurpose)) return false;
  const expiresAtMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= (input.now ?? Date.now())) return false;
  const body = screeningBody({
    userId: input.userId,
    agentId: input.agentId,
    phone: input.phone,
    callPurpose: input.callPurpose,
    attemptId: input.attemptId,
    leadId: input.leadId,
    artifactId: input.artifactId,
    expiresAt: input.expiresAt,
  });
  return (
    sameHash(voicePermissionHash(body), input.grantHash) &&
    sameHash(voicePermissionHash({ ...body, receiptId: input.receiptId }), input.receiptHash)
  );
}
