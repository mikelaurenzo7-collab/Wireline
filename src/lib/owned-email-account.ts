import { eq, sql } from "drizzle-orm";

import { emailAccounts } from "../db/schema";
import { drizzle } from "./server-context";

export const EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE =
  "This mailbox is already connected to another Wireline account. Disconnect it there or contact support before connecting it here.";

export interface OwnedEmailAccountInput {
  userId: string;
  emailAddress: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: bigint | null;
  oauthGrantedScopes: string | null;
}

export async function upsertOwnedEmailAccount(input: OwnedEmailAccountInput): Promise<boolean> {
  const emailAddress = input.emailAddress.trim().toLowerCase();
  const refreshTokenUpdate = input.refreshToken
    ? input.refreshToken
    : sql<string | null>`case when ${emailAccounts.provider} = ${input.provider} then ${emailAccounts.refreshToken} else null end`;

  const [row] = await drizzle
    .insert(emailAccounts)
    .values({ ...input, emailAddress })
    .onConflictDoUpdate({
      target: emailAccounts.emailAddress,
      set: {
        provider: input.provider,
        accessToken: input.accessToken,
        refreshToken: refreshTokenUpdate,
        expiresAt: input.expiresAt,
        oauthGrantedScopes: input.oauthGrantedScopes,
      },
      setWhere: eq(emailAccounts.userId, input.userId),
    })
    .returning({ id: emailAccounts.id });

  return Boolean(row);
}
