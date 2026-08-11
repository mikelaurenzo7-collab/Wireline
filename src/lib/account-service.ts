/**
 * account-service.ts — CRUD + resolution for Wireline accounts.
 *
 * Each user can own at most two accounts: one personal and one business.
 * The first account created at signup is the "primary" (is_primary=true).
 * Account type currently drives product lens and agent archetype defaults;
 * agents, settings, and billing remain user-scoped until workspace isolation
 * is enforced end-to-end.
 */
import { eq, and } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import type { AccountType } from "./account-type";

export type WirelineAccount = {
  id: string;
  userId: string;
  type: AccountType;
  label: string | null;
  isPrimary: boolean;
  createdAt: Date | null;
};

function toAccount(row: typeof schema.accounts.$inferSelect): WirelineAccount {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as AccountType,
    label: row.label,
    isPrimary: row.isPrimary ?? false,
    createdAt: row.createdAt,
  };
}

export async function getAccountsForUser(userId: string): Promise<WirelineAccount[]> {
  const rows = await drizzle
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId))
    .orderBy(schema.accounts.createdAt);
  return rows.map(toAccount);
}

export async function getAccountById(
  accountId: string,
  userId: string,
): Promise<WirelineAccount | null> {
  const [row] = await drizzle
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, userId)))
    .limit(1);
  return row ? toAccount(row) : null;
}

export async function getAccountByType(
  userId: string,
  type: AccountType,
): Promise<WirelineAccount | null> {
  const [row] = await drizzle
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.type, type)))
    .limit(1);
  return row ? toAccount(row) : null;
}

export async function getPrimaryAccount(userId: string): Promise<WirelineAccount | null> {
  const [row] = await drizzle
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.isPrimary, true)))
    .limit(1);
  return row ? toAccount(row) : null;
}

export async function createAccount(
  userId: string,
  type: AccountType,
  label?: string,
): Promise<WirelineAccount> {
  const existing = await getAccountByType(userId, type);
  if (existing) {
    log.warn("account already exists for this type", { userId, type });
    return existing;
  }

  const allAccounts = await getAccountsForUser(userId);
  const isPrimary = allAccounts.length === 0;

  const defaultLabel = type === "personal" ? "Personal" : "My Business";

  const [inserted] = await drizzle
    .insert(schema.accounts)
    .values({
      userId,
      type,
      label: label ?? defaultLabel,
      isPrimary,
    })
    .returning();

  log.info("account created", { userId, type, isPrimary, accountId: inserted.id });
  return toAccount(inserted);
}

/**
 * Ensure the user has at least their primary account. Called during
 * sign-in bridge to lazily migrate pre-account-separation users.
 */
export async function ensureDefaultAccount(
  userId: string,
  preferredType: AccountType = "business",
): Promise<WirelineAccount> {
  const existing = await getAccountsForUser(userId);
  if (existing.length > 0) return existing.find((a) => a.isPrimary) ?? existing[0];
  return createAccount(
    userId,
    preferredType,
    preferredType === "personal" ? "Personal" : "My Business",
  );
}

/**
 * Resolve the account that owns a newly-created agent.
 *
 * A client-supplied account id is accepted only when it belongs to the same
 * authenticated user. Callers can distinguish an invalid requested account
 * (`null`) from the no-request case, which falls back to the tenant's primary
 * account and lazily creates that account only for legacy users that somehow
 * predate account bootstrap.
 */
export async function resolveAgentAccountForCreate(
  userId: string,
  requestedAccountId?: string | null,
): Promise<WirelineAccount | null> {
  const requested = requestedAccountId?.trim();
  if (requested) return getAccountById(requested, userId);
  return ensureDefaultAccount(userId);
}
