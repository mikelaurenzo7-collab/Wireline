import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeOpenAIPhoneNumber } from "./openai-sip-config";

const TOKEN_VERSION = "2" as const;
const TOKEN_TTL_SECONDS = 5 * 60;
const MAX_TOKEN_LENGTH = 220;
const MAX_FUTURE_SKEW_SECONDS = 60;
const TWILIO_CALL_SID_PATTERN = /^CA[a-fA-F0-9]{32}$/;
const SIGNING_LABEL = "botbound/openai-inbound-sip/v2";

export type OpenAIInboundTokenClaims = {
  v: typeof TOKEN_VERSION;
  twilioCallSid: string;
  calledNumber: string;
  callerNumber: string | null;
  /**
   * The Bot owner's recording choice as decided when the carrier TwiML was
   * created. The token is the call-scoped, tamper-evident snapshot of that
   * decision: the same value gates carrier capture on the <Dial> and the
   * spoken recording notice at SIP admission, so toggling the Bot flag in
   * between cannot make capture and disclosure disagree.
   */
  callRecordingEnabled: boolean;
  iat: number;
  exp: number;
};

export type OpenAIInboundTokenVerification =
  | { ok: true; claims: OpenAIInboundTokenClaims }
  | { ok: false; reason: "unavailable" | "malformed" | "invalid_signature" | "expired" };

function signingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = String(env.INTERNAL_JWT_SECRET || "").trim();
  return secret.length >= 32 ? secret : null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(SIGNING_LABEL, "utf8")
    .update("\0", "utf8")
    .update(payload, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encodeClaims(claims: OpenAIInboundTokenClaims): string {
  return Buffer.from(
    [
      claims.v,
      claims.twilioCallSid,
      claims.calledNumber,
      claims.callerNumber || "",
      claims.callRecordingEnabled ? "1" : "0",
      String(claims.iat),
      String(claims.exp),
    ].join("|"),
    "utf8",
  ).toString("base64url");
}

function parseClaims(payload: string): OpenAIInboundTokenClaims | null {
  try {
    const fields = Buffer.from(payload, "base64url").toString("utf8").split("|");
    if (fields.length !== 7) return null;
    const [v, twilioCallSid, calledRaw, callerRaw, recordingRaw, iatRaw, expRaw] = fields;
    const calledNumber = normalizeOpenAIPhoneNumber(calledRaw);
    const callerNumber = callerRaw ? normalizeOpenAIPhoneNumber(callerRaw) : null;
    const iat = Number(iatRaw);
    const exp = Number(expRaw);
    if (
      v !== TOKEN_VERSION ||
      !TWILIO_CALL_SID_PATTERN.test(twilioCallSid || "") ||
      !calledNumber ||
      (Boolean(callerRaw) && !callerNumber) ||
      (recordingRaw !== "0" && recordingRaw !== "1") ||
      !Number.isSafeInteger(iat) ||
      !Number.isSafeInteger(exp) ||
      exp <= iat ||
      exp - iat > TOKEN_TTL_SECONDS
    ) {
      return null;
    }
    return {
      v,
      twilioCallSid,
      calledNumber,
      callerNumber,
      callRecordingEnabled: recordingRaw === "1",
      iat,
      exp,
    };
  } catch {
    return null;
  }
}

/** Minted only after BotBound verifies Twilio's webhook signature. */
export function issueOpenAIInboundToken(input: {
  twilioCallSid: string;
  calledNumber: string;
  callerNumber?: string | null;
  /** The recording decision captured in the same response that builds the TwiML. */
  callRecordingEnabled?: boolean;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): { token: string; claims: OpenAIInboundTokenClaims } {
  const secret = signingSecret(input.env);
  if (!secret) throw new Error("Native inbound token signing is not configured.");
  const twilioCallSid = String(input.twilioCallSid || "").trim();
  const calledNumber = normalizeOpenAIPhoneNumber(input.calledNumber);
  const callerNumber = input.callerNumber ? normalizeOpenAIPhoneNumber(input.callerNumber) : null;
  if (!TWILIO_CALL_SID_PATTERN.test(twilioCallSid)) {
    throw new Error("Native inbound token requires a valid Twilio CallSid.");
  }
  if (!calledNumber) throw new Error("Native inbound token requires a valid called number.");
  if (input.callerNumber && !callerNumber) {
    throw new Error("Native inbound token caller number is invalid.");
  }
  const iat = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const claims: OpenAIInboundTokenClaims = {
    v: TOKEN_VERSION,
    twilioCallSid,
    calledNumber,
    callerNumber,
    callRecordingEnabled: input.callRecordingEnabled === true,
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
  };
  const payload = encodeClaims(claims);
  const token = `${payload}.${signature(payload, secret)}`;
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Native inbound token exceeds the SIP header budget.");
  }
  return { token, claims };
}

export function verifyOpenAIInboundToken(
  token: string,
  input: { nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): OpenAIInboundTokenVerification {
  const secret = signingSecret(input.env);
  if (!secret) return { ok: false, reason: "unavailable" };
  const candidate = String(token || "").trim();
  if (!candidate || candidate.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = candidate.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [payload, suppliedSignature] = parts;
  if (!safeEqual(signature(payload, secret), suppliedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  const claims = parseClaims(payload);
  if (!claims) return { ok: false, reason: "malformed" };
  const now = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  if (claims.exp < now || claims.iat > now + MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims };
}
