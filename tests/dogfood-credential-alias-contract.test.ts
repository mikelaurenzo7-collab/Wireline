import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CANONICAL_DOGFOOD_ORIGIN,
  requireCanonicalCredentialTarget,
  requireCompleteCredentialPair,
  requireDogfoodCredentials,
} from "../scripts/dogfood-credentials.mjs";

const CREDENTIAL_KEYS = [
  "DOGFOOD_EMAIL",
  "DOGFOOD_PASSWORD",
  "WIRELINE_E2E_EMAIL",
  "WIRELINE_E2E_PASSWORD",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of CREDENTIAL_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CREDENTIAL_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("dogfood credential aliases", () => {
  it("does not misrepresent the render smoke as billing lifecycle proof", () => {
    const dogfood = readFileSync(resolve(process.cwd(), "scripts/prod-dogfood.mjs"), "utf8");
    expect(dogfood).toContain("does not certify checkout");
    expect(dogfood).toContain("Portal, cancellation");
    expect(dogfood).toContain("allowance reversal");
  });

  it("accepts the documented Wireline E2E aliases", () => {
    process.env.WIRELINE_E2E_EMAIL = "  Founder@BotBound.app ";
    process.env.WIRELINE_E2E_PASSWORD = "wireline-test-password";

    expect(requireDogfoodCredentials()).toEqual({
      email: "founder@botbound.app",
      password: "wireline-test-password",
    });
  });

  it("keeps explicit dogfood credentials highest precedence", () => {
    process.env.DOGFOOD_EMAIL = "dogfood@botbound.app";
    process.env.DOGFOOD_PASSWORD = "dogfood-password";
    process.env.WIRELINE_E2E_EMAIL = "e2e@botbound.app";
    process.env.WIRELINE_E2E_PASSWORD = "e2e-password";

    expect(requireDogfoodCredentials()).toEqual({
      email: "dogfood@botbound.app",
      password: "dogfood-password",
    });
  });

  it("fails closed when no complete credential pair is configured", () => {
    process.env.WIRELINE_E2E_EMAIL = "founder@botbound.app";
    expect(() => requireDogfoodCredentials()).toThrow(/WIRELINE_E2E_EMAIL/);
  });

  it("never combines an email and password from different alias pairs", () => {
    process.env.DOGFOOD_EMAIL = "dogfood@botbound.app";
    process.env.WIRELINE_E2E_PASSWORD = "unrelated-password";

    expect(() => requireDogfoodCredentials()).toThrow(/DOGFOOD_PASSWORD/);
  });

  it("gives asset scripts the same complete-pair boundary", () => {
    const assets = readFileSync(
      resolve(process.cwd(), "scripts/build-official-assets.mjs"),
      "utf8",
    );
    const marketing = readFileSync(resolve(process.cwd(), "scripts/marketing-kit.mjs"), "utf8");
    expect(assets).toContain("requireCompleteCredentialPair");
    expect(marketing).toContain("requireCompleteCredentialPair");

    expect(() =>
      requireCompleteCredentialPair(
        [
          { label: "DEMO", email: "demo@example.com", password: "" },
          { label: "DOGFOOD", email: "", password: "unrelated" },
        ],
        "missing",
      ),
    ).toThrow(/DEMO_PASSWORD/);
  });

  it("never sends launch credentials to a configurable or malformed origin", () => {
    expect(requireCanonicalCredentialTarget("")).toBe(CANONICAL_DOGFOOD_ORIGIN);
    expect(CANONICAL_DOGFOOD_ORIGIN).toBe("https://botbound.app");
    expect(requireCanonicalCredentialTarget("https://botbound.app/")).toBe(
      CANONICAL_DOGFOOD_ORIGIN,
    );
    for (const target of [
      "http://botbound.app",
      "https://evil.example.com",
      "https://botbound.app.evil.example.com",
      "https://user:pass@botbound.app",
      "https://botbound.app:444",
      "https://botbound.app/redirect",
      "https://trywireline.com",
    ]) {
      expect(() => requireCanonicalCredentialTarget(target)).toThrow(/Refusing|must be/);
    }

    for (const path of [
      "scripts/prod-dogfood.mjs",
      "scripts/dogfood-reset.mjs",
      "scripts/build-official-assets.mjs",
      "scripts/marketing-kit.mjs",
    ]) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8")).toContain(
        "requireCanonicalCredentialTarget",
      );
    }
  });
});
