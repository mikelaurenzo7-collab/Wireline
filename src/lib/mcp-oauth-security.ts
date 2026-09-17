import { createHmac } from "node:crypto";
import type { Request } from "express";
import { eq, sql } from "drizzle-orm";
import { sessionUsers } from "../db/security-schema";
import { AppError } from "./api-error";
import { resolveCanonicalAppUrl } from "./app-url";
import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { rateLimit } from "./rate-limit";
import { drizzle } from "./server-context";

export function mcpIssuer(_req?: Request): string {
  const canonical = resolveCanonicalAppUrl();
  if ("url" in canonical) return canonical.url;
  return BOTBOUND_PRODUCTION_ORIGIN;
}

export function mcpResourceUrl(req?: Request): string {
  return `${mcpIssuer(req)}/mcp`;
}

export function mcpTokenPepper(): string {
  const pepper = process.env.MCP_OAUTH_TOKEN_PEPPER?.trim();
  if (!pepper || pepper.length < 32) {
    throw AppError.fromHttpStatus(503, "BotBound account linking is not configured.");
  }
  return pepper;
}

export function hashMcpOAuthToken(value: string): string {
  return createHmac("sha256", mcpTokenPepper()).update(value, "utf8").digest("hex");
}

export function isMcpResourceBound(resource: string | null | undefined, req?: Request): boolean {
  return resource === mcpResourceUrl(req);
}

export type McpGrantTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

// Recovery, disconnect, authorization, and refresh all take this lock before
// touching grant rows. A grant read before recovery cannot mint new credentials
// after recovery's deletion has committed.
export async function lockMcpGrantOwner(tx: McpGrantTransaction, userId: string) {
  const [owner] = await tx
    .select()
    .from(sessionUsers)
    .where(eq(sessionUsers.id, userId))
    .for("update");
  return owner ?? null;
}

export type StoredMcpGrant = {
  user_id: string;
  email: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  resource: string | null;
  expires_at: Date | string;
};

export async function consumeMcpGrant<T>(
  kind: "authorization_code" | "refresh_token",
  hash: string,
  perform: (tx: McpGrantTransaction, grant: StoredMcpGrant) => Promise<T>,
): Promise<T | null> {
  const table =
    kind === "authorization_code"
      ? sql`wireline_mcp_oauth_codes`
      : sql`wireline_mcp_refresh_tokens`;
  const key = kind === "authorization_code" ? sql`code_hash` : sql`token_hash`;
  return drizzle.transaction(async (tx) => {
    const candidate = await tx.execute<{ user_id: string }>(sql`
      SELECT user_id FROM ${table} WHERE ${key} = ${hash} LIMIT 1
    `);
    const userId = candidate.rows[0]?.user_id;
    if (!userId || !(await lockMcpGrantOwner(tx, userId))) return null;
    const claimed = await tx.execute<StoredMcpGrant>(sql`
      DELETE FROM ${table} WHERE ${key} = ${hash} AND user_id = ${userId}::uuid RETURNING *
    `);
    const grant = claimed.rows[0];
    if (!grant) return null;
    return perform(tx, grant);
  });
}

export async function revokeMcpAccessTokensForClient(
  userId: string,
  clientId: string,
  db: Pick<McpGrantTransaction, "execute"> = drizzle,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM wireline_mcp_access_tokens
    WHERE user_id = ${userId}::uuid AND client_id = ${clientId}
  `);
}

export async function revokeAllMcpGrantsForUser(
  userId: string,
  tx: McpGrantTransaction | undefined = undefined,
): Promise<void> {
  if (!tx)
    return drizzle.transaction((transaction) => revokeAllMcpGrantsForUser(userId, transaction));
  if (!(await lockMcpGrantOwner(tx, userId))) return;
  await tx.execute(sql`DELETE FROM wireline_mcp_access_tokens WHERE user_id = ${userId}::uuid`);
  await tx.execute(sql`DELETE FROM wireline_mcp_refresh_tokens WHERE user_id = ${userId}::uuid`);
  await tx.execute(sql`DELETE FROM wireline_mcp_oauth_codes WHERE user_id = ${userId}::uuid`);
}

export async function pruneExpiredMcpOAuthRows(): Promise<void> {
  await Promise.all([
    drizzle.execute(sql`DELETE FROM wireline_mcp_oauth_codes WHERE expires_at < now()`),
    drizzle.execute(sql`DELETE FROM wireline_mcp_access_tokens WHERE expires_at < now()`),
    drizzle.execute(sql`DELETE FROM wireline_mcp_refresh_tokens WHERE expires_at < now()`),
  ]);
}

export async function backfillMcpOAuthResourceBindings(resource: string): Promise<number> {
  const results = await Promise.all([
    drizzle.execute(
      sql`UPDATE wireline_mcp_oauth_codes SET resource = ${resource} WHERE resource IS NULL`,
    ),
    drizzle.execute(
      sql`UPDATE wireline_mcp_access_tokens SET resource = ${resource} WHERE resource IS NULL`,
    ),
    drizzle.execute(
      sql`UPDATE wireline_mcp_refresh_tokens SET resource = ${resource} WHERE resource IS NULL`,
    ),
  ]);
  return results.reduce(
    (sum, result) => sum + Number((result as { rowCount?: number }).rowCount || 0),
    0,
  );
}

export async function assertMcpDraftWriteRateLimit(userId: string): Promise<void> {
  const limit = await rateLimit(`mcp-draft-write:${userId}`, {
    bucket: "mcp-draft-write",
    windowMs: 60 * 60 * 1000,
    max: 30,
    failClosedOnError: true,
  });
  if (!limit.allowed) {
    throw AppError.tooManyRequests(
      "BotBound Bot draft changes are temporarily rate-limited. Try again in a few minutes.",
    );
  }
}

export async function assertMcpTokenEndpointRateLimit(ip: string): Promise<void> {
  const limit = await rateLimit(`mcp-oauth-token:${ip || "anon"}`, {
    bucket: "mcp-oauth-token",
    windowMs: 60 * 1000,
    max: 40,
    failClosedOnError: true,
  });
  if (!limit.allowed) {
    throw AppError.tooManyRequests("Too many token requests. Try again shortly.");
  }
}
