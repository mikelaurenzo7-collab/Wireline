import { describe, expect, it } from "vitest";

import { resolveProductionSchemaDatabase } from "../scripts/run-production-schema-effects.mjs";
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
});
