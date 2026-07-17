import { createHmac } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { AppError } from "./api-error";
import { rateLimit } from "./rate-limit";
import { drizzle } from "./server-context";

export function mcpIssuer(req?: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req?.get("host");
  return host ? `https://${host}` : "https://trywireline.com";
}

export function mcpResourceUrl(req?: Request): string {
  return `${mcpIssuer(req)}/mcp`;
}

export function mcpTokenPepper(): string {
  const pepper = process.env.MCP_OAUTH_TOKEN_PEPPER?.trim();
  if (!pepper || pepper.length < 32) {
    throw AppError.fromHttpStatus(503, "Wireline account linking is not configured.");
  }
  return pepper;
}

export function hashMcpOAuthToken(value: string): string {
  return createHmac("sha256", mcpTokenPepper()).update(value, "utf8").digest("hex");
}

/** Reject legacy rows issued before RFC 9728 resource binding shipped. */
export function isMcpResourceBound(resource: string | null | undefined, req?: Request): boolean {
  return resource === mcpResourceUrl(req);
}

export async function revokeMcpAccessTokensForClient(
  userId: string,
  clientId: string,
): Promise<void> {
  await drizzle.execute(sql`
    DELETE FROM wireline_mcp_access_tokens
    WHERE user_id = ${userId}::uuid AND client_id = ${clientId}
  `);
}

/**
 * Delete expired OAuth rows so codes, access tokens, and refresh tokens do
 * not accumulate forever. Called opportunistically on token issuance; the
 * expires_at indexes keep each sweep cheap.
 */
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
      "Wireline agent draft changes are temporarily rate-limited. Try again in a few minutes.",
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
