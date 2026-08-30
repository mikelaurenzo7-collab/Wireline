import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveProductionSchemaDatabase } from "../scripts/run-production-schema-effects.mjs";
import { resolveProductionMigrationDatabaseUrl } from "../scripts/lib/production-migration-database.mjs";
import { tryResolveDatabaseConnection } from "../src/lib/database-connection";
import { resolveTenantDatabaseScope } from "../src/lib/tenant-context-scope";

const pool = "postgresql://wireline:secret@pool.example.com:6543/wireline";
const direct = "postgresql://wireline:secret@db.example.com:5432/wireline";

describe("production schema database selection", () => {
  it("prefers a valid runtime pool URL", () => {
    expect(
      resolveProductionSchemaDatabase({
        DATABASE_POOL_URL: pool,
        POSTGRES_URL: direct,
      }),
    ).toEqual({
      connectionString: pool,
      source: "DATABASE_POOL_URL",
      ignoredInvalidPoolUrl: false,
    });
  });

  it("ignores a malformed optional pool URL and falls back to POSTGRES_URL", () => {
    expect(
      resolveProductionSchemaDatabase({
        DATABASE_POOL_URL: "not-a-postgres-url",
        POSTGRES_URL: direct,
      }),
    ).toEqual({
      connectionString: direct,
      source: "POSTGRES_URL",
      ignoredInvalidPoolUrl: true,
    });
  });

  it("does not certify DATABASE_URL when the runtime would have no database", () => {
    expect(
      resolveProductionSchemaDatabase({
        DATABASE_URL: "postgresql://legacy:secret@legacy.example.com:5432/wireline",
      }),
    ).toBeNull();
  });

  it("rejects PostgreSQL-looking URLs without a database name", () => {
    expect(
      resolveProductionSchemaDatabase({
        DATABASE_POOL_URL: "postgresql://wireline:secret@pool.example.com/",
        POSTGRES_URL: "postgresql://wireline:secret@db.example.com/",
      }),
    ).toBeNull();
  });

  it("stays behaviorally identical to the runtime selector across fallback edge cases", () => {
    const environments = [
      { DATABASE_POOL_URL: pool, POSTGRES_URL: direct },
      { DATABASE_POOL_URL: "not-a-postgres-url", POSTGRES_URL: direct },
      { DATABASE_POOL_URL: "postgresql://wireline:secret@base/wireline", POSTGRES_URL: direct },
      { POSTGRES_URL: direct },
      { DATABASE_URL: "postgresql://legacy:secret@legacy.example.com:5432/wireline" },
      {
        DATABASE_POOL_URL: "postgresql://wireline:secret@pool.example.com/",
        POSTGRES_URL: "postgresql://wireline:secret@db.example.com/",
      },
      {},
    ] as const;

    for (const env of environments) {
      expect(resolveProductionSchemaDatabase(env)).toEqual(tryResolveDatabaseConnection(env));
    }
  });


  it("keeps production migrations on the canonical port-5432 session URL", () => {
    const canonicalSession =
      "postgresql://postgres.ogenlhodmwvyacvnrsnj:secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require";
    const contaminated = canonicalSession.replace("/postgres?", "/postgresProductionUpdated?");

    expect(resolveProductionMigrationDatabaseUrl(canonicalSession)).toEqual({
      connectionString: canonicalSession,
      normalizedDatabaseName: false,
    });
    const repaired = resolveProductionMigrationDatabaseUrl(contaminated);
    expect(new URL(repaired.connectionString)).toMatchObject({
      hostname: "aws-0-us-east-2.pooler.supabase.com",
      port: "5432",
      username: "postgres.ogenlhodmwvyacvnrsnj",
      password: "secret",
      pathname: "/postgres",
    });
    expect(repaired.normalizedDatabaseName).toBe(true);
  });

  it("rejects a transaction pooler or a different Supabase project for migrations", () => {
    expect(() =>
      resolveProductionMigrationDatabaseUrl(
        "postgresql://postgres.ogenlhodmwvyacvnrsnj:secret@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow("port 5432");
    expect(() =>
      resolveProductionMigrationDatabaseUrl(
        "postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
      ),
    ).toThrow("canonical Supabase project");
  });

  it("passes only the normalized session URL into the production migration child", () => {
    const buildSource = readFileSync(new URL("../scripts/vercel-build.mjs", import.meta.url), "utf8");
    const drizzleSource = readFileSync(new URL("../drizzle.config.ts", import.meta.url), "utf8");

    expect(buildSource).toContain("resolveProductionMigrationDatabaseUrl(databaseUrl)");
    expect(buildSource).toContain("env: { POSTGRES_URL: migrationDatabaseUrl }");
    expect(drizzleSource).toContain(
      "process.env.POSTGRES_URL || process.env.DATABASE_URL",
    );
    expect(drizzleSource).not.toContain("DATABASE_POOL_URL");
  });

});

describe("tenant database connection scope", () => {
  it("reserves raw root scope for genuinely absent bootstrap/system context", () => {
    expect(resolveTenantDatabaseScope(undefined)).toEqual({ kind: "root" });
    expect(resolveTenantDatabaseScope("")).toEqual({ kind: "root" });
  });

  it("accepts only UUID tenant claims and carries the validated id forward", () => {
    const userId = "77e92712-8401-4a90-899c-b16213289ce3";
    expect(resolveTenantDatabaseScope(userId)).toEqual({ kind: "tenant", userId });
  });

  it("fails closed instead of upgrading malformed tenant claims to root access", () => {
    expect(() => resolveTenantDatabaseScope("e2e-gold@trywireline.com")).toThrow(
      "INVALID_TENANT_CONTEXT",
    );
    expect(() => resolveTenantDatabaseScope("not-a-tenant-uuid")).toThrow(
      "INVALID_TENANT_CONTEXT",
    );
  });

  it("wires the classifier into the pooled connection boundary", () => {
    const source = readFileSync(new URL("../src/lib/server-context.ts", import.meta.url), "utf8");
    expect(source).toContain("connectionScope = resolveTenantDatabaseScope(userId)");
    expect(source).toContain('connectionScope.kind === "root"');
    expect(source).toContain("scopeClientToTenant(connectionScope.userId)");
    expect(source).not.toContain("!userId || !UUID_RE.test(userId)");
  });
});
