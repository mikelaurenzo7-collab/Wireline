import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const helperUrl = pathToFileURL(
  resolve(process.cwd(), "scripts/lib/test-estate-environment.mjs"),
).href;

function probeEnvironment() {
  const source = {
    PATH: "/safe/bin",
    LANG: "en_US.UTF-8",
    SENTRY_DSN: "https://public@example.invalid/1",
    VITE_SUPABASE_URL: "https://production.supabase.invalid",
    VITE_SUPABASE_ANON_KEY: "public-production-key",
    DOGFOOD_EMAIL: "founder@example.invalid",
    OWNER_EMAILS: "owner@example.invalid",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_OIDC_TOKEN: "oidc-secret",
    FUTURE_PROVIDER_CREDENTIAL: "future-secret",
    FUTURE_DATABASE_URL: "postgresql://future-secret",
  };
  const script = `
    import { buildTestEstateEnvironment } from ${JSON.stringify(helperUrl)};
    const source = ${JSON.stringify(source)};
    process.stdout.write(JSON.stringify(buildTestEstateEnvironment(source, "/isolated/home")));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `environment probe exited ${result.status}`);
  }
  return JSON.parse(result.stdout) as Record<string, string>;
}

describe("test estate clean-room environment", () => {
  it("passes only OS bootstrap values and deterministic test identity", () => {
    const env = probeEnvironment();

    expect(env.PATH).toBe("/safe/bin");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.HOME).toBe("/isolated/home");
    expect(env.USERPROFILE).toBe("/isolated/home");
    expect(env.NODE_ENV).toBe("test");
    expect(env.VERCEL_ENV).toBe("development");
    expect(env.CI).toBe("1");
    expect(env.TZ).toBe("UTC");
    expect(env.WIRELINE_TEST_ESTATE_CLEAN_ROOM).toBe("true");
    expect(env.VERCEL).toBeUndefined();
  });

  it("omits known and unknown application/provider variables by default", () => {
    const env = probeEnvironment();

    for (const name of [
      "SENTRY_DSN",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "DOGFOOD_EMAIL",
      "OWNER_EMAILS",
      "VERCEL_OIDC_TOKEN",
      "FUTURE_PROVIDER_CREDENTIAL",
      "FUTURE_DATABASE_URL",
    ]) {
      expect(env[name], name).toBeUndefined();
    }
  });
});
