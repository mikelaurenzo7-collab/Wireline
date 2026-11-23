import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("real-database test lane", () => {
  it("refuses any database that is not on this machine", () => {
    const prepare = read("scripts/prepare-test-database.mjs");
    expect(prepare).toContain('["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)');
    expect(prepare).toContain("Refusing to prepare a non-local database");
    expect(prepare).toContain("delete env.DATABASE_URL;");
  });

  it("runs on its own command, never inside the default suite", () => {
    expect(read("vitest.config.ts")).toContain('"tests/db/**",');
    expect(read("vitest.db.config.ts")).toContain('include: ["tests/db/**/*.db.test.ts"]');
    expect(JSON.parse(read("package.json")).scripts["test:db"]).toContain(
      "vitest run --config vitest.db.config.ts",
    );
  });

  it("mirrors production security, including the unique indexes the schema omits", () => {
    const fixture = read("tests/db/fixtures/production-security.sql");
    expect(fixture.match(/CREATE POLICY /g)).toHaveLength(110);
    expect(fixture.match(/CREATE UNIQUE INDEX IF NOT EXISTS /g)).toHaveLength(30);
    expect(fixture).toContain("wireline_dnc_list_user_phone_unique");
    expect(fixture).toContain("uq_consent_log_twilio_message_sid");
    expect(fixture).toContain("idx_sms_messages_user_twilio_sid");
  });
});
