#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("POSTGRES_URL or DATABASE_URL is required for the Supabase exposure guard.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const anonRows = await client.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name like 'wireline\\_%' escape '\\'
        and grantee = 'anon'
      order by table_name, privilege_type
    `);

    const webhookPolicy = await client.query(`
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'wireline_webhook_health'
        and policyname = 'tenant_isolation'
    `);

    const issues = [];
    if (anonRows.rows.length > 0) {
      issues.push(`anon still has Wireline table privileges (${anonRows.rows.length} rows)`);
    }
    if (webhookPolicy.rows.length === 0) {
      issues.push("wireline_webhook_health is missing tenant_isolation");
    }

    if (issues.length > 0) {
      console.error("Database exposure guard failed:\n");
      for (const issue of issues) console.error(`  - ${issue}`);
      process.exit(1);
    }

    console.log("✅ Supabase exposure guard passed.");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});