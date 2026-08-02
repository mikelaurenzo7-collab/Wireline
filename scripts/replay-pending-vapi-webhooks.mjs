#!/usr/bin/env node
/**
 * Replay pending vapi_webhook jobs (e.g. after deploying the job-worker handler).
 *
 * Usage:
 *   POSTGRES_URL=... node scripts/replay-pending-vapi-webhooks.mjs [--limit=50]
 */
import postgres from "postgres";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set POSTGRES_URL or DATABASE_URL");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const rows = await sql`
  SELECT id, user_id, payload, attempts
  FROM wireline_jobs
  WHERE type = 'vapi_webhook' AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT ${limit}
`;

console.log(`Found ${rows.length} pending vapi_webhook job(s)`);

for (const row of rows) {
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
  break;
}

await sql.end();
