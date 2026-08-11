import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");
const verifierSource = readFileSync("scripts/check-production-schema-effects.mjs", "utf8");
const migrationSource = readFileSync("drizzle/migrations/0142_resend_delivery_feedback.sql", "utf8");

describe("production schema effects", () => {
  it("pins the full Resend feedback table contract, not just object names", () => {
    for (const table of [
      "wireline_email_delivery_suppressions",
      "wireline_resend_webhook_events",
    ]) {
      expect(migrationSource).toContain(table);
      expect(verifierSource).toContain(table);
    }

    expect(verifierSource).toContain("DATABASE_POOL_URL || process.env.POSTGRES_URL");
    expect(verifierSource).toContain("information_schema.columns");
    expect(verifierSource).toContain("PRIMARY KEY");
    expect(verifierSource).toContain("pg_get_indexdef");
    expect(verifierSource).toContain("indisvalid");
    expect(verifierSource).toContain("permissive, roles, cmd, qual, with_check");
    expect(verifierSource).toContain("wrong_deny_policy_definition");
    expect(verifierSource).toContain("wrong_server_policy_definition");
    expect(verifierSource).toContain("can_select");
    expect(verifierSource).toContain("can_insert");
    expect(verifierSource).toContain("can_update");
    expect(verifierSource).toContain("can_delete");
    expect(verifierSource).toContain("wrong_primary_key");
    expect(verifierSource).toContain("wrong_index_definition");
  });

  it("runs the read-only schema assertion on every real production build", () => {
    const migrate = 'run("npm", ["run", "db:migrate"]);';
    const verify = 'run("node", ["scripts/check-production-schema-effects.mjs"]);';
    const migrateAt = buildSource.indexOf(migrate);
    const verifyAt = buildSource.indexOf(verify);

    expect(migrateAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(migrateAt);
    expect(buildSource).toContain(
      'const shouldVerifyProductionSchema = environment === "production" && !isDuplicateV0Project;',
    );
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("if (shouldVerifyProductionSchema)");
    expect(buildSource.slice(migrateAt, verifyAt)).toContain("Skipping database migrations");
  });
});