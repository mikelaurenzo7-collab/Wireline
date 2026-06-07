#!/usr/bin/env node
/**
 * One-time ops: import legacy Twilio-only rows (vapiNumberId = PN…) into Vapi
 * and patch wireline_phone_numbers with the Vapi UUID so voice + outbound work.
 *
 * Usage:
 *   node scripts/backfill-vapi-phone-ids.mjs --dry-run
 *   node scripts/backfill-vapi-phone-ids.mjs --user-id <uuid>
 *
 * Requires POSTGRES_URL, VAPI_PRIVATE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 */
import postgres from "postgres";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const userIdFlag = process.argv.find((a) => a.startsWith("--user-id="))?.split("=")[1];

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const vapiKey = process.env.VAPI_PRIVATE_KEY?.trim();
const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim();

if (!process.env.POSTGRES_URL || !vapiKey || !twilioSid || !twilioToken) {
  console.error("Missing POSTGRES_URL, VAPI_PRIVATE_KEY, or Twilio credentials.");
  process.exit(1);
}

async function importToVapi(number) {
  const res = await fetch("https://api.vapi.ai/phone-number", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vapiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "twilio",
      number,
      twilioAccountSid: twilioSid,
      twilioAuthToken: twilioToken,
      name: `Wireline backfill ${number}`,
      smsEnabled: false,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

const rows = await sql`
  SELECT id, user_id, phone_number, vapi_number_id, agent_id
  FROM wireline_phone_numbers
  WHERE vapi_number_id LIKE 'PN%'
  ${userIdFlag ? sql`AND user_id = ${userIdFlag}::uuid` : sql``}
  ORDER BY created_at ASC
`;

console.log(`Found ${rows.length} legacy Twilio-SID row(s). dryRun=${dryRun}`);

for (const row of rows) {
  console.log(`→ ${row.phone_number} (agent ${row.agent_id || "unassigned"})`);
  if (dryRun) continue;
  try {
    const created = await importToVapi(row.phone_number);
    await sql`
      UPDATE wireline_phone_numbers
      SET vapi_number_id = ${created.id}
      WHERE id = ${row.id}
    `;
    console.log(`  ✓ Vapi id ${created.id}`);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
  }
}

await sql.end();
