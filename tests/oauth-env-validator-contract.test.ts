import { afterEach, describe, expect, it } from "vitest";

import { ENV_REGISTRY, OAUTH_CREDENTIAL_PAIRS, validateEnv } from "../src/lib/env-validator";

const managedEnvNames = [
  ...new Set([
    ...OAUTH_CREDENTIAL_PAIRS.flatMap(({ identifierEnv, secretEnv }) => [identifierEnv, secretEnv]),
    "APOLLO_API_KEY",
    "OAUTH_BRIDGE_SECRET",
    "VERCEL_ENV",
    "NODE_ENV",
  ]),
];

const originalEnv = new Map(managedEnvNames.map((name) => [name, process.env[name]]));

function clearOAuthPairs(): void {
  for (const { identifierEnv, secretEnv } of OAUTH_CREDENTIAL_PAIRS) {
    delete process.env[identifierEnv];
    delete process.env[secretEnv];
  }
}

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("OAuth environment validation", () => {
  it("declares every OAuth credential as an optional pair", () => {
    for (const { identifierEnv, secretEnv } of OAUTH_CREDENTIAL_PAIRS) {
      for (const name of [identifierEnv, secretEnv]) {
        expect(ENV_REGISTRY.find((entry) => entry.name === name)).toMatchObject({
          group: "oauth",
          required: false,
        });
      }
    }

    expect(ENV_REGISTRY.find((entry) => entry.name === "OAUTH_BRIDGE_SECRET")).toMatchObject({
      group: "security",
      required: false,
    });
  });

  it("keeps Apollo's platform API key separate from its per-tenant OAuth pair", () => {
    expect(ENV_REGISTRY.find((entry) => entry.name === "APOLLO_API_KEY")).toMatchObject({
      group: "action_engine",
      required: false,
    });
    expect(OAUTH_CREDENTIAL_PAIRS).toContainEqual(
      expect.objectContaining({
        provider: "Apollo",
        identifierEnv: "APOLLO_CLIENT_ID",
        secretEnv: "APOLLO_CLIENT_SECRET",
      }),
    );
  });

  it("warns outside production when only half of an OAuth pair is configured", () => {
    clearOAuthPairs();
    process.env.VERCEL_ENV = "development";
    process.env.NODE_ENV = "test";
    process.env.YAHOO_CLIENT_ID = "client-id";

    const incomplete = validateEnv();
    expect(incomplete.warnings).toContainEqual(
      expect.objectContaining({
        var: "YAHOO_CLIENT_SECRET",
        group: "oauth",
        message: expect.stringContaining(
          "configure YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET together",
        ),
      }),
    );

    process.env.YAHOO_CLIENT_SECRET = "client-secret";
    const complete = validateEnv();
    expect(
      [...complete.errors, ...complete.warnings].some(
        (issue) => issue.var === "YAHOO_CLIENT_ID" || issue.var === "YAHOO_CLIENT_SECRET",
      ),
    ).toBe(false);
  });

  it("fails production validation when only half of an OAuth pair is configured", () => {
    clearOAuthPairs();
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.APOLLO_CLIENT_SECRET = "client-secret";

    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.byGroup.oauth.valid + result.byGroup.oauth.invalid).toBe(
      result.byGroup.oauth.total,
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        var: "APOLLO_CLIENT_ID",
        group: "oauth",
        message: expect.stringContaining(
          "configure APOLLO_CLIENT_ID and APOLLO_CLIENT_SECRET together",
        ),
      }),
    );
  });

  it("treats a whitespace-only OAuth credential as an incomplete pair", () => {
    clearOAuthPairs();
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "   ";

    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        var: "GOOGLE_CLIENT_SECRET",
        group: "oauth",
        message: expect.stringContaining(
          "configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together",
        ),
      }),
    );
  });
});
