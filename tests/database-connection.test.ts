import { describe, expect, it } from "vitest";
import {
  isLikelyResolvableDatabaseHost,
  isPostgresConnectionString,
  resolveDatabaseConnection,
} from "../src/lib/database-connection";

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

  it("fails without echoing invalid connection material", () => {
    expect(() =>
      resolveDatabaseConnection({
        DATABASE_POOL_URL: "base",
        POSTGRES_URL: "also-not-a-url",
      }),
    ).toThrow("Database connection is not configured with a valid PostgreSQL URL.");
  });
});
