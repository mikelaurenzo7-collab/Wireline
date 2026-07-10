import { describe, expect, it } from "vitest";
import {
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

  it("accepts postgres and postgresql protocols but rejects unrelated URLs", () => {
    expect(isPostgresConnectionString("postgres://user:secret@db.example.com/app")).toBe(true);
    expect(isPostgresConnectionString("postgresql://user:secret@db.example.com/app")).toBe(true);
    expect(isPostgresConnectionString("https://db.example.com/app")).toBe(false);
    expect(isPostgresConnectionString("base")).toBe(false);
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
