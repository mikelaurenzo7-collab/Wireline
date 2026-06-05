/**
 * Create (or refresh) a password-based demo account with the full founder fleet.
 *
 * Usage:
 *   DEMO_EMAIL=wireline.demo@trywireline.com DEMO_PASSWORD='WirelineDemo!2026' \
 *     npx tsx scripts/provision-demo-account.mts
 *
 * Requires DATABASE_URL (or POSTGRES_URL) in the environment.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "../src/lib/server-context";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/lib/auth-service";
import { seedFounderFleet } from "../src/lib/founder-fleet-seed";
import { ensureDemoProSubscription } from "../src/lib/demo-account-seed";

const DEMO_EMAIL = (process.env.DEMO_EMAIL || "wireline.demo@trywireline.com").trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "WirelineDemo!2026";
const DEMO_NAME = process.env.DEMO_NAME || "Wireline Demo";

async function main() {
  const [existing] = await drizzle
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(trim(${schema.users.email})) = ${DEMO_EMAIL}`)
    .limit(1);

  let userId = existing?.id;
  const passwordHash = hashPassword(DEMO_PASSWORD);

  if (userId) {
    await drizzle
      .update(schema.users)
      .set({
        passwordHash,
        fullName: DEMO_NAME,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
    console.log(`Updated existing demo user ${DEMO_EMAIL}`);
  } else {
    const [created] = await drizzle
      .insert(schema.users)
      .values({
        email: DEMO_EMAIL,
        passwordHash,
        fullName: DEMO_NAME,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: schema.users.id });
    userId = created.id;
    console.log(`Created demo user ${DEMO_EMAIL}`);
  }

  await ensureDemoProSubscription(userId);
  const report = await seedFounderFleet(userId);
  console.log(
    JSON.stringify(
      {
        ok: true,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        userId,
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
