import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  SUPABASE_ROOT_CA_2021,
  getDrizzlePostgresCredentials,
  getPostgresConnectionConfig,
  isSupabasePostgresConnectionString,
} from "../src/lib/postgres-tls.mjs";
import { isValidSupabaseBackupUrl } from "../scripts/validate-postgres-backup-url.mjs";

const { Pool } = pg;

const supabaseUrl =
  "postgresql://postgres.preview:p%40ss@aws-1-us-east-2.pooler.supabase.com:6543/postgres";

describe("Supabase PostgreSQL TLS policy", () => {
  it("pins a currently valid official Supabase root certificate", () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA_2021);
    const backupCertificate = readFileSync(
      resolve(process.cwd(), "certs/supabase-root-2021.crt"),
      "utf8",
    );

    expect(certificate.subject).toContain("Supabase Root 2021 CA");
    expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
    expect(backupCertificate.trim()).toBe(SUPABASE_ROOT_CA_2021.trim());
  });

  it("accepts only authenticated Supabase backup URLs on the verified 5432 lane", () => {
    for (const valid of [
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgres://postgres.abcdefghijklmnopqrst:secret@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
    ]) {
      expect(isValidSupabaseBackupUrl(valid)).toBe(true);
    }

    for (const invalid of [
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:6543/postgres",
      "postgresql://postgres.ref:secret@database.example.com:5432/postgres",
      "postgresql://postgres.ref@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/",
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?ssl=true",
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?SSLMODE=no-verify",
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?ssl_min_protocol_version=TLSv1.2",
      "postgresql://postgres.ref:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?gssencmode=require",
    ]) {
      expect(isValidSupabaseBackupUrl(invalid)).toBe(false);
    }
  });

  it("uses discrete credentials so URL SSL flags cannot replace strict verification", async () => {
    const config = getPostgresConnectionConfig(
      `${supabaseUrl}?sslmode=no-verify&sslrootcert=untrusted.pem&application_name=botbound`,
    );

    expect(config).toMatchObject({
      host: "aws-1-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.preview",
      password: "p@ss",
      database: "postgres",
      ssl: {
        ca: SUPABASE_ROOT_CA_2021,
        rejectUnauthorized: true,
        servername: "aws-1-us-east-2.pooler.supabase.com",
      },
    });
    expect(config).not.toHaveProperty("connectionString");

    const pool = new Pool(config);
    try {
      expect(pool.options.ssl).toMatchObject({
        ca: SUPABASE_ROOT_CA_2021,
        rejectUnauthorized: true,
        servername: "aws-1-us-east-2.pooler.supabase.com",
      });
    } finally {
      await pool.end();
    }
  });

  it("gives Drizzle Kit the strict host-credential branch", () => {
    const credentials = getDrizzlePostgresCredentials(
      `${supabaseUrl}?sslmode=disable&uselibpqcompat=true`,
    );

    expect(credentials).toMatchObject({
      host: "aws-1-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.preview",
      password: "p@ss",
      database: "postgres",
      ssl: {
        ca: SUPABASE_ROOT_CA_2021,
        rejectUnauthorized: true,
      },
    });
    expect(credentials).not.toHaveProperty("url");
  });

  it("does not change unrelated or local database-provider policy", () => {
    const local = "postgresql://postgres:postgres@127.0.0.1:5432/botbound";
    const other = "postgresql://user:pass@db.example.com:5432/app?sslmode=require";

    expect(isSupabasePostgresConnectionString(local)).toBe(false);
    expect(isSupabasePostgresConnectionString(supabaseUrl)).toBe(true);
    expect(getPostgresConnectionConfig(local)).toEqual({ connectionString: local });
    expect(getPostgresConnectionConfig(other)).toEqual({ connectionString: other });
  });
});

describe("production PostgreSQL constructor coverage", () => {
  const helperConsumers = [
    "src/lib/server-context.ts",
    "src/lib/db-health-check.ts",
    "src/services/presence-stream-service.ts",
    "scripts/check-migration-drift.mjs",
    "scripts/check-production-schema-effects.mjs",
    "scripts/generate-launch-status.mjs",
    "scripts/production-activation-report.ts",
    "scripts/production-outcome-report.ts",
    "scripts/set-account-environment.ts",
  ];

  it.each(helperConsumers)("%s uses the centralized verified TLS policy", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
    expect(source).toContain("getPostgresConnectionConfig");
  });

  it("routes Drizzle migrations through strict discrete credentials", () => {
    const source = readFileSync(resolve(process.cwd(), "drizzle.config.ts"), "utf8");
    expect(source).toContain("getDrizzlePostgresCredentials");
    expect(source).not.toContain("dbCredentials: {\n    url:");
  });

  it("contains no explicit TLS-verification bypass", () => {
    const source = helperConsumers
      .map((relativePath) => readFileSync(resolve(process.cwd(), relativePath), "utf8"))
      .join("\n");
    expect(source).not.toContain("rejectUnauthorized: false");
    expect(source).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
  });

  it("uses a dedicated backup URL and verified CA instead of an API service-role key", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/backup-schema.sh"), "utf8");
    expect(source).toContain("POSTGRES_BACKUP_URL");
    expect(source).toContain('PGSSLMODE="verify-full"');
    expect(source).toContain("PGSSLROOTCERT");
    expect(source).toContain("validate-postgres-backup-url.mjs");
    expect(source).toContain("mktemp");
    expect(source).toContain('mv -- "$BACKUP_TMP_FILE" "$BACKUP_TARGET"');
    expect(source).toContain('PGGSSENCMODE="disable"');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("PGPASSWORD");
  });
});
