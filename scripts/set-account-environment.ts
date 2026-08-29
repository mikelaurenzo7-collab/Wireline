#!/usr/bin/env ts-node

import "../src/lib/load-env";
import pkg from "pg";
import { resolveDatabaseConnection } from "../src/lib/database-connection";
import { getPostgresConnectionConfig } from "../src/lib/postgres-tls.mjs";

const { Pool } = pkg;
const VALID_ENVIRONMENTS = new Set(["production", "test", "demo"]);

type AccountEnvironmentResult = {
  user_id: string;
  account_email: string;
  previous_environment: string;
  account_environment: string;
  product_events_updated: number;
  audit_log_id: string | number;
};

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function requireFlag(args: string[], name: string): string {
  const value = readFlag(args, name)?.trim();
  if (!value) throw new Error(`Missing required --${name} value.`);
  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const accountEmail = normalizeEmail(requireFlag(args, "email"));
  const environment = requireFlag(args, "environment").toLowerCase();
  const reason = requireFlag(args, "reason");
  const actorEmail = normalizeEmail(requireFlag(args, "actor-email"));
  const confirmationEmail = normalizeEmail(requireFlag(args, "confirm-email"));

  if (!VALID_ENVIRONMENTS.has(environment)) {
    throw new Error("--environment must be production, test, or demo.");
  }
  if (reason.length < 8) {
    throw new Error("--reason must contain at least 8 characters.");
  }
  if (confirmationEmail !== accountEmail) {
    throw new Error("--confirm-email must exactly match the normalized target account email.");
  }
  if (environment === "production" && !args.includes("--confirm-production-promotion")) {
    throw new Error(
      "Refusing production classification without --confirm-production-promotion. " +
        "The database will still run its non-destructive promotion preflight.",
    );
  }
  if (!args.includes("--apply")) {
    throw new Error("Refusing mutation without the explicit --apply flag.");
  }

  const selected = resolveDatabaseConnection();
  if (selected.ignoredInvalidPoolUrl) {
    console.warn(
      "Ignoring invalid DATABASE_POOL_URL and using the validated POSTGRES_URL fallback.",
    );
  }

  const pool = new Pool({
    ...getPostgresConnectionConfig(selected.connectionString),
    max: 1,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      const result = await client.query(
        `SELECT *
           FROM public.wireline_set_account_environment($1, $2, $3, $4)`,
        [accountEmail, environment, reason, actorEmail],
      );
      const row = result.rows[0] as AccountEnvironmentResult | undefined;
      if (!row || result.rows.length !== 1) {
        throw new Error("Account environment mutation did not return exactly one audited result.");
      }
      await client.query("COMMIT");

      console.log(
        JSON.stringify(
          {
            ok: true,
            userId: row.user_id,
            accountEmail: row.account_email,
            previousEnvironment: row.previous_environment,
            accountEnvironment: row.account_environment,
            productEventsUpdated: Number(row.product_events_updated),
            auditLogId: String(row.audit_log_id),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const postgresError = error as Error & {
    code?: string;
    detail?: string;
    hint?: string;
  };
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Account environment mutation failed: ${message}`);
  if (postgresError.detail) {
    try {
      const diagnostics = JSON.parse(postgresError.detail) as unknown;
      console.error(`Promotion preflight diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
    } catch {
      console.error(`Database detail: ${postgresError.detail}`);
    }
  }
  if (postgresError.hint) console.error(`Remediation: ${postgresError.hint}`);
  if (postgresError.code) console.error(`Database error code: ${postgresError.code}`);
  process.exitCode = 1;
});
