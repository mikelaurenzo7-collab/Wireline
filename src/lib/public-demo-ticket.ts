import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PUBLIC_DEMO_TICKET_TTL_SECONDS = 75;

type PublicDemoTicketClaims = {
  v: 1;
  jti: string;
  iat: number;
  exp: number;
  ip: string;
  host: string;
  agent: string;
};

export type PublicDemoTicketVerification =
  | { ok: true; claims: PublicDemoTicketClaims }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "malformed"
        | "invalid_signature"
        | "expired"
        | "context_mismatch";
    };

function signingSecret(): string | null {
  const secret =
    process.env.WIRELINE_PUBLIC_DEMO_SIGNING_SECRET ||
    process.env.INTERNAL_JWT_SECRET ||
    process.env.VAPI_WEBHOOK_SECRET ||
    "";
  return secret.trim().length >= 32 ? secret.trim() : null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export function publicDemoTicketingReady(): boolean {
  return Boolean(signingSecret());
}

export function publicDemoIpFingerprint(ip: string): string {
  const secret = signingSecret();
  if (!secret) throw new Error("Public demo ticket signing is not configured.");
  return createHmac("sha256", secret)
    .update(`wireline-public-demo-ip:${ip.trim() || "unknown"}`)
    .digest("base64url")
    .slice(0, 24);
}

export function issuePublicDemoTicket(input: {
  ip: string;
  host: string;
  agentName: string;
  nowMs?: number;
}): { token: string; claims: PublicDemoTicketClaims } {
  const secret = signingSecret();
  if (!secret) throw new Error("Public demo ticket signing is not configured.");

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const claims: PublicDemoTicketClaims = {
    v: 1,
    jti: randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + PUBLIC_DEMO_TICKET_TTL_SECONDS,
    ip: publicDemoIpFingerprint(input.ip),
    host: normalizeHost(input.host),
    agent: input.agentName,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payload}.${signPayload(payload, secret)}`, claims };
}

export function verifyPublicDemoTicket(input: {
  token: string;
  ip: string;
  host: string;
  nowMs?: number;
}): PublicDemoTicketVerification {
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "unavailable" };

  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [payload, signature] = parts;
  if (!safeEqual(signature, signPayload(payload, secret))) {
    return { ok: false, reason: "invalid_signature" };
  }

  let claims: PublicDemoTicketClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PublicDemoTicketClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    claims.v !== 1 ||
    typeof claims.jti !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    typeof claims.ip !== "string" ||
    typeof claims.host !== "string" ||
    typeof claims.agent !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (claims.exp <= nowSeconds || claims.iat > nowSeconds + 30) {
    return { ok: false, reason: "expired" };
  }

  if (
    claims.host !== normalizeHost(input.host) ||
    claims.ip !== publicDemoIpFingerprint(input.ip)
  ) {
    return { ok: false, reason: "context_mismatch" };
  }

  return { ok: true, claims };
}
