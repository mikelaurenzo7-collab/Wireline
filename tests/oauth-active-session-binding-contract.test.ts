import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { JwtPayload } from "../src/lib/auth-utils";
import { isSessionGenerationActive } from "../src/lib/session-generation";

const oauthHelpers = readFileSync(resolve(process.cwd(), "src/lib/oauth-helpers.ts"), "utf8");
const authMiddleware = readFileSync(resolve(process.cwd(), "src/middleware/auth.ts"), "utf8");
const sessionRoutes = readFileSync(
  resolve(process.cwd(), "src/routes/auth-session-hardening-routes.ts"),
  "utf8",
);

const basePayload: JwtPayload = {
  aud: "authenticated",
  exp: 2_000_000_000,
  iat: 1_700_000_000,
  iss: "wireline-internal",
  sub: "00000000-0000-4000-8000-000000000001",
};
const sessionState = {
  sessionRevokedBefore: new Date(1_700_000_000_500),
  sessionVersion: 7,
};

describe("canonical active-session generation fence", () => {
  it("accepts only an exact numeric generation for current tokens", () => {
    expect(
      isSessionGenerationActive({ ...basePayload, session_version: 7 }, sessionState),
    ).toBe(true);
    expect(
      isSessionGenerationActive({ ...basePayload, session_version: 6 }, sessionState),
    ).toBe(false);
  });

  it("rejects malformed present generation claims instead of downgrading them to legacy", () => {
    for (const malformedVersion of ["7", null, undefined, -1, 7.5]) {
      expect(
        isSessionGenerationActive(
          {
            ...basePayload,
            iat_ms: 1_700_000_001_000,
            session_version: malformedVersion,
          },
          sessionState,
        ),
      ).toBe(false);
    }
  });

  it("uses a strict issued-at boundary only when the generation claim is absent", () => {
    expect(
      isSessionGenerationActive(
        { ...basePayload, iat_ms: 1_700_000_001_000 },
        sessionState,
      ),
    ).toBe(true);
    expect(
      isSessionGenerationActive(
        { ...basePayload, iat_ms: sessionState.sessionRevokedBefore.getTime() },
        sessionState,
      ),
    ).toBe(false);
    expect(
      isSessionGenerationActive(
        { ...basePayload, iat_ms: 1_700_000_000_000 },
        sessionState,
      ),
    ).toBe(false);
  });

  it("rejects a malformed present millisecond claim and supports older second-only tokens", () => {
    expect(
      isSessionGenerationActive(
        { ...basePayload, iat: 1_700_000_002, iat_ms: "1700000002000" },
        sessionState,
      ),
    ).toBe(false);
    expect(
      isSessionGenerationActive({ ...basePayload, iat: 1_700_000_002 }, sessionState),
    ).toBe(true);
  });
});

describe("active-session consumer wiring", () => {
  it("shares one executable generation fence across every session consumer", () => {
    expect(oauthHelpers).toContain('import { isSessionGenerationActive } from "./session-generation"');
    expect(authMiddleware).toContain(
      'import { isSessionGenerationActive } from "../lib/session-generation"',
    );
    expect(sessionRoutes).toContain(
      'import { isSessionGenerationActive } from "../lib/session-generation"',
    );

    for (const consumer of [oauthHelpers, authMiddleware, sessionRoutes]) {
      expect(consumer).toContain("isSessionGenerationActive(payload, user)");
      expect(consumer).not.toContain("function tokenSessionVersion");
      expect(consumer).not.toContain("function payloadSessionVersion");
      expect(consumer).not.toContain("function tokenIssuedAtMs");
      expect(consumer).not.toContain("function issuedAtMs");
    }
  });

  it("still binds the active OAuth session user to the signed initiating account", () => {
    expect(oauthHelpers).toContain("sessionUserId === state.userId");
    expect(oauthHelpers).toContain(
      "if (!payload || !(await isActiveOAuthSession(payload))) return null",
    );
    expect(oauthHelpers).not.toContain("return payload?.sub ?? null");
  });
});
