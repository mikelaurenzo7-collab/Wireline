#!/usr/bin/env node
/**
 * Replay pending vapi_webhook jobs (e.g. after deploying the job-worker handler).
 *
 * Usage:
 *   POSTGRES_URL=... node scripts/replay-pending-vapi-webhooks.mjs [--limit=50]
 */
import postgres from "postgres";
import { getPostgresConnectionConfig } from "../src/lib/postgres-tls.mjs";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set POSTGRES_URL or DATABASE_URL");
  process.exit(1);
}

const connection = getPostgresConnectionConfig(url);
const sql =
  "connectionString" in connection
    ? postgres(connection.connectionString, { max: 1 })
    : postgres({
        host: connection.host,
        port: connection.port,
        database: connection.database,
        user: connection.user,
        password: connection.password,
        ssl: connection.ssl,
        max: 1,
        // Supavisor transaction mode cannot retain prepared statements across
        // backend connections. Session/direct 5432 lanes may keep them.
        prepare: connection.port !== 6543,
      });

const rows = await sql`
  SELECT id, user_id, payload, attempts
  FROM wireline_jobs
  WHERE type = 'vapi_webhook' AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT ${limit}
`;

console.log(`Found ${rows.length} pending vapi_webhook job(s)`);

if (rows.length > 0) {
  const base =
    process.env.WIRELINE_REPLAY_BASE_URL ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";
  const sweepUrl = `${base.replace(/\/$/, "")}/api/jobs/sweep`;
  console.log(`Triggering sweep (processes queue): ${sweepUrl}`);
  const token = process.env.CRON_SECRET || process.env.JOBS_SWEEP_SECRET;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(sweepUrl, { method: "POST", headers });
  const body = await res.text();
  console.log(`Sweep ${res.status}: ${body.slice(0, 500)}`);
}

await sql.end();
