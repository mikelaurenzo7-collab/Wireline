import { createHmac } from "node:crypto";
import type { Request } from "express";
import { eq, sql } from "drizzle-orm";
import { AppError } from "./api-error";
import { sessionUsers } from "../db/security-schema";
import { hasTerminalAccountDeletion } from "../middleware/auth";
import { resolveCanonicalAppUrl } from "./app-url";
import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { rateLimit } from "./rate-limit";
import { drizzle, tenantStore } from "./server-context";

export type McpGrantExecutor = Pick<typeof drizzle, "execute" | "select">;
type McpGrantTable = "wireline_mcp_oauth_codes" | "wireline_mcp_refresh_tokens";

/** MCP bearer grants use the same terminal lifecycle boundary as web sessions. */
export async function resolveMcpAccount(
  userId: string,
  executor: Pick<typeof drizzle, "select"> = drizzle,
): Promise<{ email: string } | null> {
  return tenantStore.run(userId, async () => {
    const [user] = await executor
      .select({ email: sessionUsers.email })
      .from(sessionUsers)
      .where(eq(sessionUsers.id, userId))
      .limit(1);
    if (!user || (await hasTerminalAccountDeletion(userId, executor))) return null;
    return user;
  });
}

/** Serialize issuance and revocation on the existing account row. */
export async function lockMcpGrantUser(executor: McpGrantExecutor, userId: string): Promise<void> {
  await executor.execute(sql`SELECT id FROM wireline_users WHERE id = ${userId}::uuid FOR UPDATE`);
}

/** Keep a one-time grant claim and all replacement credentials in one commit. */
export async function exchangeMcpGrant<T>(
  table: McpGrantTable,
  hash: string,
  exchange: (tx: McpGrantExecutor) => Promise<T | null>,
): Promise<T | null> {
  return drizzle.transaction(async (tx) => {
    // Lock the account before touching the grant row, matching password reset
    // and explicit disconnect. Re-read/claim the grant only after this lock:
    // revocation may have deleted it while the account lock was pending.
    const hashColumn = table === "wireline_mcp_oauth_codes" ? "code_hash" : "token_hash";
    const locked = (await tx.execute(sql`
      SELECT id FROM wireline_users
      WHERE id = (SELECT user_id FROM ${sql.raw(table)} WHERE ${sql.raw(hashColumn)} = ${hash})
      FOR UPDATE
    `)) as unknown as { rows?: Array<{ id: string }> };
    if (!locked.rows?.length) return null;
    return exchange(tx);
  });
}

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

export async function revokeMcpAccessTokensForClient(
  userId: string,
  clientId: string,
  executor: McpGrantExecutor = drizzle,
): Promise<void> {
  await executor.execute(sql`
    DELETE FROM wireline_mcp_access_tokens
    WHERE user_id = ${userId}::uuid AND client_id = ${clientId}
  `);
}

export async function revokeAllMcpGrantsForUser(
  userId: string,
  executor?: McpGrantExecutor,
): Promise<void> {
  const revoke = async (tx: McpGrantExecutor) => {
    await lockMcpGrantUser(tx, userId);
    await tx.execute(sql`DELETE FROM wireline_mcp_access_tokens WHERE user_id = ${userId}::uuid`);
    await tx.execute(sql`DELETE FROM wireline_mcp_refresh_tokens WHERE user_id = ${userId}::uuid`);
    await tx.execute(sql`DELETE FROM wireline_mcp_oauth_codes WHERE user_id = ${userId}::uuid`);
  };
  if (executor) return revoke(executor);
  return drizzle.transaction(revoke);
}

/** Token possession can revoke only its own client/resource grant, never another tenant. */
export async function revokeMcpGrantByToken(input: {
  tokenHash: string;
  clientId: string;
  resource: string;
}): Promise<void> {
  await drizzle.transaction(async (tx) => {
    // Same account-first ordering as token rotation; then re-read after locking.
    const owned = sql`
      SELECT user_id FROM wireline_mcp_access_tokens
      WHERE token_hash = ${input.tokenHash} AND client_id = ${input.clientId}
        AND resource = ${input.resource} AND expires_at > now()
      UNION
      SELECT user_id FROM wireline_mcp_refresh_tokens
      WHERE token_hash = ${input.tokenHash} AND client_id = ${input.clientId}
        AND resource = ${input.resource} AND expires_at > now()
    `;
    const locked = (await tx.execute(sql`
      SELECT id FROM wireline_users WHERE id IN (${owned}) FOR UPDATE
    `)) as unknown as { rows?: Array<{ id: string }> };
    if (locked.rows?.length !== 1) return;
    const matched = (await tx.execute(owned)) as unknown as { rows?: Array<{ user_id: string }> };
    const userId = locked.rows[0].id;
    if (matched.rows?.length !== 1 || matched.rows[0].user_id !== userId) return;
    for (const table of [
      "wireline_mcp_access_tokens",
      "wireline_mcp_refresh_tokens",
      "wireline_mcp_oauth_codes",
    ]) {
      await tx.execute(sql`DELETE FROM ${sql.raw(table)}
        WHERE user_id = ${userId}::uuid AND client_id = ${input.clientId} AND resource = ${input.resource}`);
    }
  });
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
