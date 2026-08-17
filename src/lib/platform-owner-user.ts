import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { isOwnerEmail } from "./platform-owner-emails";
import { drizzle } from "./server-context";

/** True when `userId` is the platform owner account (`OWNER_EMAIL` / `OWNER_EMAILS`). */
export async function isPlatformOwnerUserId(userId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await drizzle
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return isOwnerEmail(row?.email);
}
