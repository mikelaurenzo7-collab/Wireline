import { describe, expect, it } from "vitest";

import {
  assertIsolatedPreviewDatabaseUrl,
  resolvePreviewMigrationDatabaseUrl,
} from "../scripts/lib/preview-migration-database.mjs";

const projectRef = "ewgqxfnjxdzoawlkcyfb";
const sessionPoolerHost = "aws-0-us-east-2.pooler.supabase.com";

describe("isolated Preview migration database", () => {
  it("leaves an exact direct or session-pooler 5432 connection unchanged", () => {
    for (const databaseUrl of [
      `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
      `postgresql://postgres.${projectRef}:secret@${sessionPoolerHost}:5432/postgres?sslmode=require`,
    ]) {
      expect(
        resolvePreviewMigrationDatabaseUrl({ databaseUrl, projectRef, sessionPoolerHost: "" }),
      ).toBe(databaseUrl);
    }
  });

  it("derives a session-pooler URL from either sealed Supabase 6543 connection form", () => {
    for (const databaseUrl of [
      `postgresql://postgres:s%40fe%3Apass@db.${projectRef}.supabase.co:6543/postgres?sslmode=require&pgbouncer=true`,
      `postgresql://postgres.${projectRef}:s%40fe%3Apass@${sessionPoolerHost}:6543/postgres?sslmode=require&pgbouncer=true`,
    ]) {
      const resolved = resolvePreviewMigrationDatabaseUrl({
        databaseUrl,
        projectRef,
        sessionPoolerHost,
      });
      const url = new URL(resolved);

      expect(url.hostname).toBe(sessionPoolerHost);
      expect(url.port).toBe("5432");
      expect(decodeURIComponent(url.username)).toBe(`postgres.${projectRef}`);
      expect(decodeURIComponent(url.password)).toBe("s@fe:pass");
      expect(url.pathname).toBe("/postgres");
      expect(url.searchParams.get("sslmode")).toBe("require");
      expect(url.searchParams.has("pgbouncer")).toBe(false);
    }
  });

  it("fails closed without a reviewed Supabase session-pooler hostname", () => {
    const databaseUrl = `postgresql://postgres.${projectRef}:do-not-print@${sessionPoolerHost}:6543/postgres`;

    for (const host of [
      "",
      "database.example.com",
      "pooler.supabase.com",
      "evil.pooler.supabase.com.example",
    ]) {
      expect(() =>
        resolvePreviewMigrationDatabaseUrl({ databaseUrl, projectRef, sessionPoolerHost: host }),
      ).toThrow("reviewed Supabase session-pooler hostname");
    }

    try {
      resolvePreviewMigrationDatabaseUrl({ databaseUrl, projectRef, sessionPoolerHost: "" });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
    }
  });

  it("rejects project mismatch, malformed pooler identity, and unsupported ports", () => {
    expect(() =>
      assertIsolatedPreviewDatabaseUrl({
        databaseUrl: `postgresql://postgres.abcdefghijklmnopqrst:secret@${sessionPoolerHost}:6543/postgres`,
        projectRef,
      }),
    ).toThrow("does not match");

    expect(() =>
      assertIsolatedPreviewDatabaseUrl({
        databaseUrl: `postgresql://postgres:secret@${sessionPoolerHost}:6543/postgres`,
        projectRef,
      }),
    ).toThrow("postgres.<project-ref>");

    expect(() =>
      resolvePreviewMigrationDatabaseUrl({
        databaseUrl: `postgresql://postgres.${projectRef}:secret@${sessionPoolerHost}:6432/postgres`,
        projectRef,
        sessionPoolerHost,
      }),
    ).toThrow("port 5432 or a transaction pooler on port 6543");
  });
});
