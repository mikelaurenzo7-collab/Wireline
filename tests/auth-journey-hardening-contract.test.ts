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
    expect(isAllowedOAuthUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")).toBe(
      true,
    );
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
    const portal = read("src/components/AuthPortal.tsx");
    expect(portal).toContain('import { isAllowedOAuthUrl } from "../lib/oauth-url";');
    expect(portal).toContain("if (!isAllowedOAuthUrl(url))");
    expect(portal).toContain('`${name} · $${plan.price_usd_annual}/year`');
    expect(portal).toContain('`${name} · $${plan.price_usd_monthly}/month`');
    expect(portal).toContain('<StatusNotice tone="success" title={message} />');
    expect(portal).not.toContain("startsWith(\"http\")");
  });
});
