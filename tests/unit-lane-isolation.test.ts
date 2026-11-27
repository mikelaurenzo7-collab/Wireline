import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveDatabaseConnection } from "../src/lib/database-connection";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * On 2026-11-26 and 27 unit runs on a machine whose shell exported production
 * credentials ran locking queries against the production database: the config
 * only defaulted POSTGRES_URL, and the pool prefers DATABASE_POOL_URL. Nothing
 * was written, but nothing prevented it either.
 */
describe("the unit test lane", () => {
  it("connects only to a local database address, whatever the shell exports", () => {
    expect(process.env.DATABASE_POOL_URL).toBeUndefined();
    const connection = resolveDatabaseConnection(process.env);
    expect(connection?.source).toBe("POSTGRES_URL");
    expect(new URL(String(process.env.POSTGRES_URL)).hostname).toBe("127.0.0.1");
  });

  it("carries no live provider credential into a test", () => {
    for (const name of [
      "STRIPE_SECRET_KEY",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_API_SECRET",
      "XAI_API_KEY",
      "RESEND_API_KEY",
      "AGENTMAIL_API_KEY",
      "ELEVENLABS_API_KEY",
      "BROWSERBASE_API_KEY",
      "RENDER_API_KEY",
      "WIRELINE_VOICE_WORKER_SECRET",
    ]) {
      expect(process.env[name], name).toBeUndefined();
    }
  });

  it("sets the local address instead of defaulting it, and checks it again in every worker", () => {
    const config = read("vitest.config.ts");
    expect(config).toContain("process.env.POSTGRES_URL = LOCAL_TEST_DATABASE_URL;");
    expect(config).not.toMatch(/process\.env\.POSTGRES_URL\s*\?\?=/);
    expect(config).toContain("if (LIVE_CREDENTIAL.test(name)) delete process.env[name];");
    expect(config).toContain('"./tests/setup/local-database-only.ts"');
    expect(read("tests/setup/local-database-only.ts")).toContain("Unit tests must never reach one");
  });

  // The real-database lane writes. Its prepare step already refused a remote
  // address, but the pool it then tested through could still be the remote one.
  it("keeps the real-database lane on the local database its prepare step checked", () => {
    const config = read("vitest.db.config.ts");
    expect(config).toContain("delete process.env.DATABASE_POOL_URL;");
    expect(config).toContain("TEST_DATABASE_URL must point at a local database");
  });
});
