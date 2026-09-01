import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signupSchema } from "../src/lib/api-validation";
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
  hasCurrentAccountLegalConsentState,
} from "../src/lib/legal-consent";
import { verifyOAuthState } from "../src/lib/oauth-helpers";
import {
  createBoundOAuthSignInState,
  isBoundOAuthSignInState,
} from "../src/routes/auth-oauth-browser-binding";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const originalStateSecret = process.env.OAUTH_STATE_SECRET;

beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = "botbound-account-consent-state-secret-at-least-32-bytes";
});

afterAll(() => {
  if (originalStateSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = originalStateSecret;
});

describe("account legal-consent evidence contract", () => {
  const validSignup = {
    email: "founder@example.com",
    password: "ValidPass1",
    termsAccepted: true,
    termsVersion: ACCOUNT_TERMS_VERSION,
    privacyVersion: ACCOUNT_PRIVACY_VERSION,
  } as const;

  it("fails closed unless email signup accepts the exact current legal versions", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
    expect(
      signupSchema.safeParse({ email: validSignup.email, password: validSignup.password }).success,
    ).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, termsAccepted: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, termsVersion: "stale-terms" }).success).toBe(
      false,
    );
    expect(
      signupSchema.safeParse({ ...validSignup, privacyVersion: "stale-privacy" }).success,
    ).toBe(false);
  });

  it("transmits current consent evidence for both password and provider signup", () => {
    const accessPanel = read("src/components/auth/AuthAccessPanel.tsx");

    expect(accessPanel).toContain("ACCOUNT_TERMS_VERSION");
    expect(accessPanel).toContain("ACCOUNT_PRIVACY_VERSION");
    expect(accessPanel).toMatch(/termsAccepted:\s*true/);
    expect(accessPanel).toMatch(/termsVersion:\s*ACCOUNT_TERMS_VERSION/);
    expect(accessPanel).toMatch(/privacyVersion:\s*ACCOUNT_PRIVACY_VERSION/);
    expect(accessPanel).toMatch(/\[ACCOUNT_TERMS_VERSION_HEADER\]:\s*ACCOUNT_TERMS_VERSION/);
    expect(accessPanel).toMatch(/\[ACCOUNT_PRIVACY_VERSION_HEADER\]:\s*ACCOUNT_PRIVACY_VERSION/);
  });

  it("writes password-signup acceptance through the same transaction as the user", () => {
    const authService = read("src/lib/auth-service.ts");
    const authRoutes = read("src/routes/auth-routes.ts");
    const signUpStart = authService.indexOf("async signUp(");
    const signUpEnd = authService.indexOf("async createEmailVerificationToken", signUpStart);
    const signUp = authService.slice(signUpStart, signUpEnd);

    expect(signUpStart).toBeGreaterThan(-1);
    expect(signUpEnd).toBeGreaterThan(signUpStart);
    expect(signUp).toContain("drizzle.transaction(async (tx) =>");
    expect(signUp).toContain("legalConsentEvidence: AccountLegalConsentEvidence");
    expect(signUp).toContain("!legalConsentEvidence ||");
    expect(signUp).toContain('throw new Error("CURRENT_ACCOUNT_LEGAL_CONSENT_REQUIRED")');
    expect(signUp).not.toContain("if (legalConsentEvidence)");
    expect(signUp).toMatch(/tx\s*\.insert\(schema\.users\)/);
    expect(signUp).toContain("tx.insert(schema.auditLog)");
    expect(signUp).toContain('eventType: "auth.terms_accepted"');
    expect(signUp).toContain('action: "terms_accepted"');
    expect(signUp).toContain("source: legalConsentEvidence.source");
    expect(signUp).toContain("terms_version:");
    expect(signUp).toContain("privacy_version:");
    expect(signUp).toContain("accepted_at: acceptedAt.toISOString()");
    expect(signUp).toContain("createdAt: acceptedAt");
    expect(signUp.indexOf("tx.insert(schema.auditLog)")).toBeGreaterThan(
      signUp.search(/tx\s*\.insert\(schema\.users\)/),
    );

    expect(authRoutes).toContain('source: "email_password"');
    expect(authRoutes).toContain("termsVersion,");
    expect(authRoutes).toContain("privacyVersion,");
    expect(authRoutes).toContain('userAgent: req.get("user-agent") || undefined');
  });

  it("keeps voice conversion on the consent-bearing signup page", () => {
    const showcaseAssistant = read("src/lib/showcase-assistant.ts");
    const toolHandlers = read("src/lib/agent-tool-dispatch.ts");
    const coreRoute = read("src/lib/bot-tools/core.ts");
    const voiceAccountCreationSurface = [showcaseAssistant, toolHandlers, coreRoute].join("\n");

    expect(showcaseAssistant).toContain('"send_signup_link"');
    expect(showcaseAssistant).toContain("send the signup link");
    expect(voiceAccountCreationSurface).not.toContain("create_account");
    expect(voiceAccountCreationSurface).not.toContain("authService.signUp");
  });

  it("carries current signup consent inside signed, browser-bound OAuth state", () => {
    const bridgeState = "account-consent-browser-binding";
    const state = createBoundOAuthSignInState("google", bridgeState, undefined, true);
    const verified = verifyOAuthState(state);

    expect(verified.ok).toBe(true);
    expect(hasCurrentAccountLegalConsentState(verified.userId)).toBe(true);
    expect(isBoundOAuthSignInState("google", state, bridgeState)).toBe(true);

    const returningState = createBoundOAuthSignInState("google", bridgeState);
    const returningVerified = verifyOAuthState(returningState);
    expect(returningVerified.ok).toBe(true);
    expect(hasCurrentAccountLegalConsentState(returningVerified.userId)).toBe(false);
    expect(isBoundOAuthSignInState("google", returningState, bridgeState)).toBe(true);
  });

  it("rejects unconsented OAuth account creation and records the provider-specific evidence", () => {
    const oauthRoutes = read("src/routes/auth-oauth-routes.ts");
    const resolverStart = oauthRoutes.indexOf("async function findOrCreateUserByEmail(");
    const resolverEnd = oauthRoutes.indexOf("const PENDING_CODE_TTL_MS", resolverStart);
    const resolver = oauthRoutes.slice(resolverStart, resolverEnd);

    expect(resolverStart).toBeGreaterThan(-1);
    expect(resolverEnd).toBeGreaterThan(resolverStart);
    expect(resolver).toContain("drizzle.transaction(async (tx) =>");
    expect(resolver).toMatch(/tx\s*\.insert\(schema\.users\)/);
    expect(resolver).toContain("tx.insert(schema.auditLog)");
    expect(resolver).toContain('eventType: "auth.terms_accepted"');
    expect(resolver).toContain('action: "terms_accepted"');
    expect(resolver).toContain("terms_version:");
    expect(resolver).toContain("privacy_version:");
    expect(resolver).toMatch(/if \(created\)[\s\S]*legalConsent[\s\S]*throw new Error/);
    expect(resolver.indexOf("tx.insert(schema.auditLog)")).toBeGreaterThan(
      resolver.search(/tx\s*\.insert\(schema\.users\)/),
    );

    expect(oauthRoutes).toContain("source: `oauth_${provider}`");
    for (const provider of ["google", "microsoft", "yahoo"]) {
      expect(oauthRoutes).toContain(`legalConsentEvidenceFromState("${provider}", vs.userId, req)`);
    }
    expect(oauthRoutes).toContain("hasCurrentAccountLegalConsentState(stateUserId)");
  });
});
