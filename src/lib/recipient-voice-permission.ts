import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./api-error";
import { isOutboundCallPurpose, type OutboundCallPurpose } from "./outbound-call-purpose";

export const VOICE_PERMISSION_VERSION = "voice-permission-v1" as const;
export const VOICE_PERMISSION_EVENTS = {
  requested: "voice_permission_requested",
  granted: "voice_permission_granted",
  revoked: "voice_permission_revoked",
  claimed: "voice_permission_claimed",
} as const;
export const VOICE_PERMISSION_REQUEST_MS = 24 * 60 * 60_000;
export const VOICE_PERMISSION_TERM_MS = 30 * 24 * 60 * 60_000;
export const VOICE_PERMISSION_ASSURANCE = "bearer_link_and_typed_signature" as const;

export type VoicePermissionRequest = {
  kind: "request";
  version: typeof VOICE_PERMISSION_VERSION;
  artifactId: string;
  userId: string;
  requestKey: string;
  agentId: string;
  botName: string;
  phone: string;
  sellerName: string;
  sellerIdentityHash: string;
  purpose: OutboundCallPurpose;
  callerState: "IL";
  recipientState: "IL";
  timeZone: "America/Chicago";
  requestedAt: string;
  requestExpiresAt: string;
  expiresAt: string;
  disclosure: string;
  tokenHash: string;
};

export type VoicePermissionGrant = {
  kind: "grant";
  version: typeof VOICE_PERMISSION_VERSION;
  artifactId: string;
  userId: string;
  requestHash: string;
  signerName: string;
  acceptedAt: string;
  disclosureHash: string;
  identityAssurance: typeof VOICE_PERMISSION_ASSURANCE;
  ipHash: string;
  userAgentHash: string;
};

export type VoicePermissionRevocation = {
  kind: "revocation";
  version: typeof VOICE_PERMISSION_VERSION;
  artifactId: string;
  userId: string;
  revokedAt: string;
  actor: "owner" | "recipient";
};

export type VoicePermissionClaim = {
  kind: "claim";
  version: typeof VOICE_PERMISSION_VERSION;
  artifactId: string;
  userId: string;
  attemptId: string;
  receiptId: string;
  grantHash: string;
  phone: string;
  agentId: string;
  purpose: OutboundCallPurpose;
  claimedAt: string;
};

export type VoicePermissionRecord =
  VoicePermissionRequest | VoicePermissionGrant | VoicePermissionRevocation | VoicePermissionClaim;

export type SignedVoicePermissionRecord = { record: VoicePermissionRecord; signature: string };
export const VOICE_PERMISSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

export function voicePermissionHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function secret(env: NodeJS.ProcessEnv): string {
  const value = String(env.INTERNAL_JWT_SECRET || "").trim();
  if (value.length < 32)
    throw AppError.serviceUnavailable("Voice permission signing is unavailable.");
  return value;
}

export function signVoicePermissionRecord<T extends VoicePermissionRecord>(
  record: T,
  env: NodeJS.ProcessEnv = process.env,
): { record: T; signature: string } {
  return {
    record,
    signature: createHmac("sha256", secret(env))
      .update(`botbound:recipient-voice-permission:record:${record.kind}:`)
      .update(stable(record))
      .digest("base64url"),
  };
}

export function verifyVoicePermissionRecord(
  value: unknown,
  kind: VoicePermissionRecord["kind"],
  env: NodeJS.ProcessEnv = process.env,
): VoicePermissionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  const record = envelope.record as VoicePermissionRecord | undefined;
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    record.kind !== kind ||
    record.version !== VOICE_PERMISSION_VERSION ||
    !VOICE_PERMISSION_UUID.test(record.artifactId) ||
    typeof record.userId !== "string" ||
    typeof envelope.signature !== "string"
  )
    return null;
  const expected = Buffer.from(signVoicePermissionRecord(record, env).signature);
  const actual = Buffer.from(envelope.signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? record : null;
}

export function voicePermissionToken(
  userId: string,
  artifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${artifactId}.${createHmac("sha256", secret(env))
    .update(`botbound:recipient-voice-permission:capture:${userId}:${artifactId}`)
    .digest("base64url")}`;
}

export function voicePermissionTokenId(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 100) return null;
  const [id, proof, extra] = token.split(".");
  return !extra && VOICE_PERMISSION_UUID.test(id || "") && /^[A-Za-z0-9_-]{43}$/.test(proof || "")
    ? id
    : null;
}

export function normalizeVoicePermissionPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 10 ? digits : digits.startsWith("1") ? digits.slice(1) : "";
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}

export function maskedVoicePermissionPhone(phone: string): string {
  return `••• ••• ${phone.slice(-4)}`;
}

export function buildVoicePermissionDisclosure(input: {
  sellerName: string;
  purpose: OutboundCallPurpose;
  phone: string;
  expiresAt: string;
}): string {
  const scope =
    input.purpose === "marketing_or_sales"
      ? "marketing and sales calls using an artificial or AI-generated voice"
      : input.purpose === "callback"
        ? "one non-marketing callback using an artificial or AI-generated voice"
        : "non-marketing service, appointment, and personal coordination calls using an artificial or AI-generated voice";
  return `I authorize ${input.sellerName} to call my number ending ${input.phone.slice(-4)} for ${scope}, until ${new Date(input.expiresAt).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })}. I may withdraw permission at any time. This permission is not a condition of buying anything. My typed name is my electronic signature. This link and signature record permission; they do not verify my identity or possession of the phone.`;
}

/** The initial reviewed dispatch scope is deliberately narrow, not fifty-state clearance. */
export function assertVoicePermissionJurisdiction(input: {
  callerState: unknown;
  recipientState: unknown;
  timeZone: unknown;
}): asserts input is { callerState: "IL"; recipientState: "IL"; timeZone: "America/Chicago" } {
  if (
    input.callerState !== "IL" ||
    input.recipientState !== "IL" ||
    input.timeZone !== "America/Chicago"
  )
    throw new AppError(
      403,
      "VOICE_PERMISSION_JURISDICTION_UNSUPPORTED",
      "Calling is not cleared for this jurisdiction. Illinois callers and recipients are the supported initial scope.",
    );
}

export function assertVoicePermissionScope(input: {
  request: VoicePermissionRequest;
  grant: VoicePermissionGrant;
  userId: string;
  agentId: string;
  phone: string;
  purpose: OutboundCallPurpose;
  sellerIdentityHash: string;
  revoked: boolean;
  nowMs?: number;
}): void {
  const { request, grant } = input;
  const now = input.nowMs ?? Date.now();
  if (input.revoked)
    throw new AppError(403, "VOICE_PERMISSION_REVOKED", "The recipient withdrew this permission.");
  if (
    request.userId !== input.userId ||
    grant.userId !== input.userId ||
    request.agentId !== input.agentId ||
    normalizeVoicePermissionPhone(input.phone) !== request.phone ||
    request.purpose !== input.purpose ||
    !isOutboundCallPurpose(request.purpose) ||
    grant.artifactId !== request.artifactId ||
    grant.requestHash !== voicePermissionHash(request) ||
    grant.disclosureHash !== voicePermissionHash(request.disclosure) ||
    request.sellerIdentityHash !== input.sellerIdentityHash ||
    grant.identityAssurance !== VOICE_PERMISSION_ASSURANCE
  )
    throw new AppError(
      403,
      "VOICE_PERMISSION_SCOPE_MISMATCH",
      "Recipient permission does not match this caller, Bot, number or purpose.",
    );
  const expires = Date.parse(request.expiresAt);
  const accepted = Date.parse(grant.acceptedAt);
  const requested = Date.parse(request.requestedAt);
  const requestExpires = Date.parse(request.requestExpiresAt);
  if (
    ![expires, accepted, requested, requestExpires].every(Number.isFinite) ||
    accepted < requested ||
    accepted > requestExpires ||
    accepted > now ||
    now >= expires ||
    expires <= requested ||
    expires - requested > VOICE_PERMISSION_TERM_MS ||
    (request.purpose === "callback" && expires - requested > VOICE_PERMISSION_REQUEST_MS) ||
    !grant.signerName.trim() ||
    grant.signerName.length > 120
  )
    throw new AppError(
      403,
      "VOICE_PERMISSION_EXPIRED",
      "Recipient permission has expired or cannot be evidenced. Request new permission.",
    );
  assertVoicePermissionJurisdiction(request);
}
