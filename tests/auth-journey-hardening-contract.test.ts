import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedOAuthUrl } from "../src/lib/oauth-url";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("auth journey hardening contract", () => {
  it("accepts supported secure provider URLs and local HTTP development URLs", () => {
    expect(isAllowedOAuthUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=test")).toBe(
      true,
    );
    expect(
      isAllowedOAuthUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"),
    ).toBe(true);
    expect(isAllowedOAuthUrl("https://api.login.yahoo.com/oauth2/request_auth")).toBe(true);
    expect(isAllowedOAuthUrl("http://localhost:5173/api/auth/callback")).toBe(true);
    expect(isAllowedOAuthUrl("http://127.0.0.1:5173/api/auth/callback")).toBe(true);
    expect(isAllowedOAuthUrl("http://[::1]:5173/api/auth/callback")).toBe(true);
  });

  it("rejects unknown hosts, insecure, malformed, relative, and credential-bearing URLs", () => {
    expect(isAllowedOAuthUrl("https://attacker.example/oauth")).toBe(false);
    expect(isAllowedOAuthUrl("https://accounts.google.com.attacker.example/oauth")).toBe(false);
    expect(isAllowedOAuthUrl("https://google.com/oauth")).toBe(false);
    expect(isAllowedOAuthUrl("http://example.com/oauth")).toBe(false);
    expect(isAllowedOAuthUrl("httpx://example.com/oauth")).toBe(false);
    expect(isAllowedOAuthUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedOAuthUrl("/api/auth/callback")).toBe(false);
    expect(isAllowedOAuthUrl("https://user:pass@accounts.google.com/oauth")).toBe(false);
    expect(isAllowedOAuthUrl(" https://accounts.google.com/oauth")).toBe(false);
  });

  it("keeps paid signup intent prices currency-qualified and uses shared notices", () => {
    const panel = read("src/components/auth/AuthAccessPanel.tsx");
    const portal = read("src/components/AuthPortal.tsx");

    expect(panel).toContain('import { isAllowedOAuthUrl } from "../../lib/oauth-url";');
    expect(panel).toContain("if (!isAllowedOAuthUrl(payload?.url))");
    expect(panel).toContain("`${name} · $${plan.price_usd_annual}/year`");
    expect(panel).toContain("`${name} · $${plan.price_usd_monthly}/month`");
    expect(panel).toContain('<StatusNotice tone="success" title={message} />');
    expect(panel).not.toContain('startsWith("http")');
    expect(portal).toContain("<AuthAccessPanel");
  });

  it("associates field errors, exposes required semantics, and focuses the first invalid field", () => {
    const panel = read("src/components/auth/AuthAccessPanel.tsx");

    expect(panel).toContain(
      '<form className="wl-access-panel__form" onSubmit={handleAuth} noValidate>',
    );
    expect(panel).toMatch(/ref=\{emailRef\}[\s\S]*?type="email"[\s\S]*?required/);
    expect(panel).toContain('aria-invalid={invalidField === "email"}');
    expect(panel).toContain(
      'aria-describedby={invalidField === "email" ? emailErrorId : undefined}',
    );
    expect(panel).toContain('showEmailError("Email is required.")');
    expect(panel).toContain('showEmailError("Enter a valid email address.")');
    expect(panel).toContain("emailRef.current?.focus()");

    expect(panel).toMatch(/ref=\{passwordRef\}[\s\S]*?type=\{showPassword[\s\S]*?required/);
    expect(panel).toContain('aria-invalid={invalidField === "password"}');
    expect(panel).toMatch(
      /aria-describedby=\{\s*\[\s*isSignUp && password \? passwordRulesId : null,\s*invalidField === "password" \? passwordErrorId : null,?\s*\]\s*\.filter\(Boolean\)\s*\.join\(" "\) \|\| undefined\s*\}/,
    );
    expect(panel).toContain("id={passwordRulesId}");
    expect(panel).toContain('showPasswordError("Password is required.")');
    expect(panel).toContain("showPasswordError(passwordPolicyError)");
    expect(panel).toContain("passwordRef.current?.focus()");
    expect(panel).toContain("id={errorId}");

    expect(panel).toContain('role="group"');
    expect(panel).toContain("aria-pressed={!isSignUp}");
    expect(panel).toContain("aria-pressed={isSignUp}");
    expect(panel).not.toContain('role="tab"');
    expect(panel).not.toContain("aria-selected");
    expect(panel).toContain('name="email"');
    expect(panel).toContain('name="password"');
    expect(panel).toContain('name="termsAccepted"');
    expect(panel).not.toContain("autoFocus");
  });
});
