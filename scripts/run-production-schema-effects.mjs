#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isLikelyResolvableDatabaseHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  if (!host) return false;
  if (LOCAL_DATABASE_HOSTS.has(host)) return true;
  if (IPV4_RE.test(host)) return true;
  if (host.includes(":")) return true;
  return host.includes(".");
}

function isPostgresConnectionString(value) {
  if (!String(value || "").trim()) return false;
  try {
    const url = new URL(String(value).trim());
    return (
      POSTGRES_PROTOCOLS.has(url.protocol) &&
      Boolean(url.hostname) &&
      isLikelyResolvableDatabaseHost(url.hostname) &&
      Boolean(url.pathname && url.pathname !== "/")
    );
  } catch {
    return false;
  }
}

/**
 * Keep the read-only production schema assertion pinned to the exact database
 * selection policy used by `src/lib/database-connection.ts`: a valid pooler
 * wins, a malformed optional pooler falls back to the required POSTGRES_URL,
 * and DATABASE_URL is not a runtime recovery path.
 */
export function resolveProductionSchemaDatabase(env = process.env) {
  const poolUrl = String(env.DATABASE_POOL_URL || "").trim();
  if (isPostgresConnectionString(poolUrl)) {
    return { connectionString: poolUrl, source: "DATABASE_POOL_URL", ignoredInvalidPoolUrl: false };
  }

  const postgresUrl = String(env.POSTGRES_URL || "").trim();
  if (isPostgresConnectionString(postgresUrl)) {
    return {
      connectionString: postgresUrl,
      source: "POSTGRES_URL",
      ignoredInvalidPoolUrl: Boolean(poolUrl),
    };
  }

  return null;
}

export function runProductionSchemaEffects(env = process.env) {
  const selected = resolveProductionSchemaDatabase(env);
  if (!selected) {
    console.error(
      "Production schema verification requires the runtime-selected DATABASE_POOL_URL or POSTGRES_URL to be a valid PostgreSQL URL.",
    );
    return 1;
  }

  if (selected.ignoredInvalidPoolUrl) {
    console.warn(
      "Production schema verification ignored invalid DATABASE_POOL_URL and selected validated POSTGRES_URL, matching runtime behavior.",
    );
  }

  const childEnv = { ...env, DATABASE_POOL_URL: selected.connectionString };
  delete childEnv.DATABASE_URL;
  // The verifier reads DATABASE_POOL_URL first. Supplying the already-selected
  // connection there makes it impossible for its legacy fallback order to
  // silently certify a different database than the application runtime.
  const result = spawnSync(process.execPath, ["scripts/check-production-schema-effects.mjs"], {
    stdio: "inherit",
    env: childEnv,
  });
  return result.status ?? 1;
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(runProductionSchemaEffects());
