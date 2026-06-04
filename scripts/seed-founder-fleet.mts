/**
 * One-shot CLI: seed the founder account with the full agent fleet.
 * Usage: npx tsx scripts/seed-founder-fleet.mts [email]
 */
import "dotenv/config";
import { seedFounderFleet, resolveFounderUserId } from "../src/lib/founder-fleet-seed";

const emailArg = process.argv[2];
const userId = await resolveFounderUserId(emailArg);
if (!userId) {
  console.error(
    emailArg
      ? `No user found for ${emailArg}`
      : "Set OWNER_EMAIL or pass an email: npx tsx scripts/seed-founder-fleet.mts you@example.com",
  );
  process.exit(1);
}

const report = await seedFounderFleet(userId);
console.log(JSON.stringify({ ok: true, userId, report }, null, 2));
