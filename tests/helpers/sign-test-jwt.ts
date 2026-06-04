import { createHmac } from "node:crypto";

/** Mirrors auth-service.generateToken for Playwright / local E2E only. */
export function signTestJwt(
  user: { id: string; email: string },
  secret: string,
  ttlSec = 60 * 60 * 2,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + ttlSec,
    aud: "authenticated",
    role: "authenticated",
    iss: "wireline-internal",
  };
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");
  return `${base64Header}.${base64Payload}.${signature}`;
}
