import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("monotonic session revocation", () => {
  it("increments a database-owned generation whenever the password changes", () => {
    const migration = read("drizzle/migrations/0127_monotonic_session_version.sql");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS session_version bigint");
    expect(migration).toContain("NEW.session_version := OLD.session_version + 1");
    expect(migration).toContain("NEW.session_revoked_before := clock_timestamp()");
  });

  it("embeds the generation in every active issuance path", () => {
    const auth = read("src/lib/auth-service.ts");
    const sessions = read("src/routes/auth-session-hardening-routes.ts");
    const oauth = read("src/routes/auth-oauth-exchange-atomic-routes.ts");
    const team = read("src/routes/team-routes.ts");

    expect(auth).toContain("session_version: user.sessionVersion");
    expect(auth).toContain("sessionVersion: session.sessionVersion");
    expect(auth).toContain("sessionVersion: reset.sessionVersion");
    expect(sessions).toContain("sessionVersion: user.sessionVersion");
    expect(oauth).toContain("sessionVersion: session.sessionVersion");
    expect(team).toContain("sessionVersion: requireSessionVersion(req)");
  });

  it("uses one exact generation fence and keeps timestamps only for legacy tokens", () => {
    const canonical = read("src/lib/session-generation.ts");
    const middleware = read("src/middleware/auth.ts");
    const sessions = read("src/routes/auth-session-hardening-routes.ts");
    const oauthHelpers = read("src/lib/oauth-helpers.ts");

    expect(canonical).toContain("validSessionVersion(payload.session_version)");
    expect(canonical).toContain("payload.session_version === state.sessionVersion");
    expect(canonical).toContain('hasClaim(payload, "session_version")');
    expect(canonical).toContain("issuedAtMs > state.sessionRevokedBefore.getTime()");

    for (const consumer of [middleware, sessions, oauthHelpers]) {
      expect(consumer).toContain("isSessionGenerationActive(payload, user)");
      expect(consumer).not.toContain("Number(payload.session_version)");
    }
    expect(sessions).toContain("sessionVersion: sql`${sessionUsers.sessionVersion} + 1`");
  });

  it("fences the supervisor websocket upgrade on the same generation check", () => {
    // The websocket transport does not pass through authenticateUser, so it has
    // to run the fence itself. Without it, a signed-out or password-changed
    // session could still open live-call listen/whisper for the token's TTL.
    const supervisorWs = read("src/services/supervisor-websocket-service.ts");

    expect(supervisorWs).toContain(
      'import { isSessionGenerationActive } from "../lib/session-generation"',
    );
    expect(supervisorWs).toContain("isSessionGenerationActive(payload, user)");
    expect(supervisorWs).toContain("tenantStore.run(payload.sub");
    expect(supervisorWs).toContain('ws.close(4001, "Session has been revoked")');
    expect(supervisorWs).not.toContain("Number(payload.session_version)");
    // The fence must gate the connection before userId is trusted.
    expect(supervisorWs.indexOf("isActiveSupervisorSession(payload)")).toBeLessThan(
      supervisorWs.indexOf("userId = payload.sub"),
    );
  });

  it("fails closed when a shadowed legacy issuer omits the generation", () => {
    const auth = read("src/lib/auth-service.ts");
    const unit = read("src/lib/auth-service.test.ts");
    const behavioral = read("tests/auth-service-behavioral.test.ts");

    expect(auth).toContain('throw new Error("SESSION_VERSION_REQUIRED")');
    expect(unit).toContain("refuses to mint a token without a verified session generation");
    expect(behavioral).toContain("refuses omitted or invalid session generations");
  });
});
