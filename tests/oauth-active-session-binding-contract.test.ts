import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const helpers = readFileSync(resolve(process.cwd(), "src/lib/oauth-helpers.ts"), "utf8");

describe("OAuth integration active-session binding", () => {
  it("requires the completing JWT to pass the database session-generation fence", () => {
    expect(helpers).toContain('import { sessionUsers } from "../db/security-schema"');
    expect(helpers).toContain("async function isActiveOAuthSession");
    expect(helpers).toContain("sessionUsers.sessionVersion");
    expect(helpers).toContain("sessionUsers.sessionRevokedBefore");
    expect(helpers).toContain("version === user.sessionVersion");
    expect(helpers).toContain("tokenIssuedAtMs(payload) > user.sessionRevokedBefore.getTime()");
    expect(helpers).toContain("if (!payload || !(await isActiveOAuthSession(payload))) return null");
  });

  it("still binds the active session user to the signed initiating account", () => {
    expect(helpers).toContain("sessionUserId === state.userId");
    expect(helpers).not.toContain("return payload?.sub ?? null");
  });
});
