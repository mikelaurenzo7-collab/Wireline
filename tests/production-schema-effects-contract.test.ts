import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");
const verifierSource = readFileSync("scripts/check-production-schema-effects.mjs", "utf8");
const migrationSource = readFileSync("drizzle/migrations/0142_resend_delivery_feedback.sql", "utf8");

describe("production schema effects", () => {
  it("pins the latest Resend feedback migration effects", () => {
    for (const table of [
      "wireline_email_delivery_suppressions",
      "wireline_resend_webhook_events",
    ]) {
      expect(migrationSource).toContain(table);
      expect(verifierSource).toContain(table);
    }
    expect(verifierSource).toContain("relrowsecurity");
    expect(verifierSource).toContain("deny_direct_api_access");
    expect(verifierSource).toContain("wireline_server_access");
    expect(verifierSource).toContain("has_table_privilege");
  });

  it("runs only after the production migration command", () => {
    const migrate = 'run("npm", ["run", "db:migrate"]);';
    const verify = 'run("node", ["scripts/check-production-schema-effects.mjs"]);';
    const migrateAt = buildSource.indexOf(migrate);
    const verifyAt = buildSource.indexOf(verify);

    expect(migrateAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(migrateAt);
    expect(buildSource.slice(migrateAt, verifyAt)).not.toContain("} else {");
  });
});
