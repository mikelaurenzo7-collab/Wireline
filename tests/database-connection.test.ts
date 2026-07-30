import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLikelyResolvableDatabaseHost,
  isPostgresConnectionString,
  resolveDatabaseConnection,
  tryResolveDatabaseConnection,
} from "../src/lib/database-connection";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("database connection selection", () => {
  it("prefers a valid pool URL", () => {
    expect(
      resolveDatabaseConnection({
        DATABASE_POOL_URL: "postgresql://user:secret@pool.example.com:6543/postgres",
        POSTGRES_URL: "postgresql://user:secret@direct.example.com:5432/postgres",
      }),
    ).toMatchObject({
      source: "DATABASE_POOL_URL",
      ignoredInvalidPoolUrl: false,
    });
  });

  it("falls back to POSTGRES_URL when the pool override is malformed", () => {
    const selected = resolveDatabaseConnection({
      DATABASE_POOL_URL: "base",
      POSTGRES_URL: "postgresql://user:secret@direct.example.com:5432/postgres",
    });

    expect(selected.source).toBe("POSTGRES_URL");
    expect(selected.ignoredInvalidPoolUrl).toBe(true);
    expect(selected.connectionString).toContain("direct.example.com");
  });

  it("falls back when the pool override has a single-label production host", () => {
    const selected = resolveDatabaseConnection({
      DATABASE_POOL_URL: "postgresql://user:secret@base:5432/postgres",
      POSTGRES_URL: "postgresql://user:secret@direct.example.com:5432/postgres",
    });

    expect(selected.source).toBe("POSTGRES_URL");
    expect(selected.ignoredInvalidPoolUrl).toBe(true);
  });

  it("accepts postgres and postgresql protocols but rejects unrelated URLs", () => {
    expect(isPostgresConnectionString("postgres://user:secret@db.example.com/app")).toBe(true);
    expect(isPostgresConnectionString("postgresql://user:secret@db.example.com/app")).toBe(true);
    expect(isPostgresConnectionString("https://db.example.com/app")).toBe(false);
    expect(isPostgresConnectionString("base")).toBe(false);
  });

  it("rejects single-label database hostnames that caused production DNS failures", () => {
    expect(isLikelyResolvableDatabaseHost("db.example.com")).toBe(true);
    expect(isLikelyResolvableDatabaseHost("localhost")).toBe(true);
    expect(isLikelyResolvableDatabaseHost("127.0.0.1")).toBe(true);
    expect(isLikelyResolvableDatabaseHost("base")).toBe(false);
    expect(isPostgresConnectionString("postgresql://user:secret@base:5432/postgres")).toBe(false);
  });

  it("supports deliberately unconfigured deployments without weakening strict callers", () => {
    expect(tryResolveDatabaseConnection({})).toBeNull();
    expect(
      tryResolveDatabaseConnection({
        DATABASE_POOL_URL: "base",
        POSTGRES_URL: "also-not-a-url",
      }),
    ).toBeNull();
  });

  it("fails without echoing invalid connection material", () => {
    expect(() =>
      resolveDatabaseConnection({
        DATABASE_POOL_URL: "base",
        POSTGRES_URL: "also-not-a-url",
      }),
    ).toThrow("Database connection is not configured with a valid PostgreSQL URL.");
  });
});


describe("pooled database write readiness", () => {
  it("keeps tenant and queue writes immune to leaked pool session state", () => {
    const serverContext = read("src/lib/server-context.ts");
    const tenantCheckout = serverContext.slice(
      serverContext.indexOf("async function scopeClientToTenant"),
      serverContext.indexOf("/* eslint-disable @typescript-eslint/no-explicit-any", serverContext.indexOf("async function scopeClientToTenant")),
    );
    const begin = tenantCheckout.indexOf('client.query("BEGIN")');
    const readWrite = tenantCheckout.indexOf('client.query("SET TRANSACTION READ WRITE")');
    const tenantRole = tenantCheckout.indexOf('client.query("SET LOCAL ROLE wireline_server")');

    expect(begin).toBeGreaterThan(-1);
    expect(readWrite).toBeGreaterThan(begin);
    expect(tenantRole).toBeGreaterThan(readWrite);
    expect(serverContext).not.toMatch(
      /client\.query\(["'`]SET (?:SESSION CHARACTERISTICS AS TRANSACTION READ ONLY|default_transaction_read_only\s*=\s*on)/i,
    );

    const queue = read("src/lib/job-queue-base.ts");
    expect(queue).toContain('const WRITE_TRANSACTION_CONFIG = { accessMode: "read write" as const };');
    expect(queue.match(/writeTransactionConfig\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(7);

    const health = read("src/lib/db-health-check.ts");
    expect(health).toContain("resolveDatabaseConnection()");
    expect(health).toContain('await client.query("SET TRANSACTION READ WRITE")');
    expect(health).toContain("pg_is_in_recovery() AS in_recovery");

    const runbook = read("docs/DATABASE_OPERATIONS.md");
    expect(runbook).toContain("Never run `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`");
    expect(runbook).toContain(
      "https://supabase.com/docs/guides/troubleshooting/resolving-cannot-execute-update-in-a-read-only-transaction-on-transaction-pooler-connections-ef582c",
    );
  });
});
