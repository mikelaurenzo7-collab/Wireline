/**
 * Seed showcase data (calls, leads, appointments, email + SMS) for a demo tenant.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-account.mts
 *   npx tsx scripts/seed-demo-account.mts wireline.demo@trywireline.com
 *
 * Requires DATABASE_URL (or POSTGRES_URL) in the environment.
 */
import "dotenv/config";
import {
  DEFAULT_DEMO_EMAIL,
  resolveDemoUserId,
  seedDemoAccountData,
} from "../src/lib/demo-account-seed";

const email = (process.argv[2] || process.env.DEMO_EMAIL || DEFAULT_DEMO_EMAIL).trim().toLowerCase();

const userId = await resolveDemoUserId(email);
if (!userId) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const { agentId, report } = await seedDemoAccountData(userId);
console.log(JSON.stringify({ ok: true, email, userId, agentId, report }, null, 2));
