import "dotenv/config";
import { drizzle } from "../src/lib/server-context";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth-service";

async function run() {
  const email = "testdev@wireline.app";
  const password = "TestDev2026!";

  console.log(`Checking user ${email}...`);
  const [user] = await drizzle
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user) {
    console.log("User not found. Inserting...");
    const hp = hashPassword(password);
    const [newUser] = await drizzle
      .insert(schema.users)
      .values({
        email,
        passwordHash: hp,
        fullName: "Test Developer",
        emailVerified: true,
      })
      .returning();

    console.log("Inserted user:", newUser.id);

    // Also add a subscription so subscription lookup doesn't fail
    const [sub] = await drizzle
      .insert(schema.subscriptions)
      .values({
        userId: newUser.id,
        plan: "business-starter",
        status: "active",
      })
      .returning();

    console.log("Created subscription:", sub.plan);
  } else {
    console.log("User found:", user.id);
    console.log("Updating password hash to ensure it matches...");
    const hp = hashPassword(password);
    await drizzle
      .update(schema.users)
      .set({ passwordHash: hp })
      .where(eq(schema.users.id, user.id));
    console.log("Password hash updated successfully!");
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
