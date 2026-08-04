import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("OAuth exchange session integrity", () => {
  const oauth = read("src/routes/auth-oauth-routes.ts");

  it("loads database-owned session generation before minting the cookie", () => {
    expect(oauth).toContain('import { sessionUsers } from "../db/security-schema"');

    const exchange = oauth.slice(oauth.indexOf('router.post("/api/auth/oauth/exchange"'));
    const sessionLookup = exchange.indexOf("schema: sessionUsers.sessionVersion");
    const accountBootstrap = exchange.indexOf("ensureDefaultAccount(entry.user.id");
    const tokenMint = exchange.indexOf("const sessionToken = generateToken({");
    const cookieWrite = exchange.indexOf("setSessionCookie(res, sessionToken)");

    expect(sessionLookup).toBeGreaterThan(-1);
    expect(accountBootstrap).toBeGreaterThan(sessionLookup);
    expect(tokenMint).toBeGreaterThan(accountBootstrap);
    expect(cookieWrite).toBeGreaterThan(tokenMint);
    expect(exchange).toContain("sessionVersion: session.sessionVersion");
  });

  it("fails closed when session state is unavailable", () => {
    const exchange = oauth.slice(oauth.indexOf('router.post("/api/auth/oauth/exchange"'));
    expect(exchange).toContain("OAuth user session state is unavailable");
    expect(exchange).not.toContain(
      "generateToken({ id: entry.user.id, email: entry.user.email })",
    );
  });
});
