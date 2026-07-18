import { describe, expect, it } from "vitest";
import {
  MICROSOFT_CONSUMER_TENANT_ID,
  decodeJwtClaims,
  microsoftEmailIsVerified,
  resolveMicrosoftVerifiedEmail,
} from "../src/lib/oauth-email-trust";

function makeIdToken(claims: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

describe("decodeJwtClaims", () => {
  it("decodes a JWT payload", () => {
    const token = makeIdToken({ email: "a@b.com", tid: "x" });
    expect(decodeJwtClaims(token)).toMatchObject({ email: "a@b.com", tid: "x" });
  });

  it("returns null for malformed or missing tokens", () => {
    expect(decodeJwtClaims(null)).toBeNull();
    expect(decodeJwtClaims(undefined)).toBeNull();
    expect(decodeJwtClaims("not-a-jwt")).toBeNull();
    expect(decodeJwtClaims("only.two")).toBeNull();
  });
});

describe("microsoftEmailIsVerified", () => {
  it("trusts a personal Microsoft account (consumer tenant)", () => {
    expect(microsoftEmailIsVerified({ tid: MICROSOFT_CONSUMER_TENANT_ID })).toBe(true);
  });

  it("trusts a work/school account only when xms_edov proves domain ownership", () => {
    expect(microsoftEmailIsVerified({ tid: "corp-tenant", xms_edov: true })).toBe(true);
    expect(microsoftEmailIsVerified({ tid: "corp-tenant", xms_edov: "true" })).toBe(true);
    expect(microsoftEmailIsVerified({ tid: "corp-tenant" })).toBe(false);
    expect(microsoftEmailIsVerified({ tid: "corp-tenant", xms_edov: false })).toBe(false);
  });

  it("rejects null claims", () => {
    expect(microsoftEmailIsVerified(null)).toBe(false);
  });
});

describe("resolveMicrosoftVerifiedEmail (nOAuth guard)", () => {
  it("rejects a spoofed mail with no verification proof", () => {
    // The nOAuth attack: attacker sets Graph `mail` to a victim's address in
    // their own tenant. No xms_edov, not a consumer tenant → must be rejected.
    const claims = { tid: "attacker-tenant", email: "victim@corp.com" };
    expect(resolveMicrosoftVerifiedEmail(claims, { mail: "victim@corp.com" })).toBeNull();
  });

  it("accepts a verified work account and normalizes the email", () => {
    const claims = { tid: "corp-tenant", xms_edov: true, email: "Real.User@Corp.com" };
    expect(resolveMicrosoftVerifiedEmail(claims, { mail: "Real.User@Corp.com" })).toBe(
      "real.user@corp.com",
    );
  });

  it("accepts a personal account, preferring the id_token email claim", () => {
    const claims = { tid: MICROSOFT_CONSUMER_TENANT_ID, email: "Me@Outlook.com" };
    expect(resolveMicrosoftVerifiedEmail(claims, { userPrincipalName: "me@outlook.com" })).toBe(
      "me@outlook.com",
    );
  });

  it("falls back to Graph mail then UPN when the claim omits email", () => {
    const claims = { tid: MICROSOFT_CONSUMER_TENANT_ID };
    expect(resolveMicrosoftVerifiedEmail(claims, { mail: "m@x.com" })).toBe("m@x.com");
    expect(resolveMicrosoftVerifiedEmail(claims, { userPrincipalName: "u@x.com" })).toBe("u@x.com");
  });
});
