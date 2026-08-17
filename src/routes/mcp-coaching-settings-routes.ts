import { Router, type Response } from "express";
import { sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import {
  readMcpCoachingWritesEnabled,
  writeMcpCoachingWritesEnabled,
} from "../lib/mcp-coaching-preferences";
import { revokeAllMcpGrantsForUser } from "../lib/mcp-oauth-security";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { userPreferencesRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

function clientLabel(clientId: string, clientName: string | null): string {
  if (clientName && clientName.trim()) return clientName.trim();
  try {
    const host = new URL(clientId).hostname;
    if (host === "chatgpt.com") return "ChatGPT";
    if (host === "claude.ai" || host === "claude.com") return "Claude";
  } catch {
    // fall through
  }
  if (clientId.startsWith("wlmcp_client_")) return "Cursor or Claude";
  return "Connected app";
}

router.get(
  "/api/mcp/connections",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payload = await tenantStore.run(req.user.id, async () => {
        const coachingWritesEnabled = await readMcpCoachingWritesEnabled(req.user.id);
        const result = (await drizzle.execute(sql`
          SELECT
            t.client_id,
            t.scope,
            t.expires_at,
            t.created_at,
            c.client_name
          FROM wireline_mcp_access_tokens t
          LEFT JOIN wireline_mcp_oauth_clients c ON c.client_id = t.client_id
          WHERE t.user_id = ${req.user.id}::uuid
            AND t.expires_at > now()
          ORDER BY t.created_at DESC
          LIMIT 20
        `)) as unknown as {
          rows?: Array<{
            client_id: string;
            scope: string;
            expires_at: Date | string;
            created_at: Date | string;
            client_name: string | null;
          }>;
        };
        return {
          coaching_writes_enabled: coachingWritesEnabled,
          connections: (result.rows || []).map((row) => ({
            client: clientLabel(row.client_id, row.client_name),
            scope: row.scope,
            created_at:
              row.created_at instanceof Date
                ? row.created_at.toISOString()
                : String(row.created_at),
            expires_at:
              row.expires_at instanceof Date
                ? row.expires_at.toISOString()
                : String(row.expires_at),
          })),
        };
      });
      res.json(payload);
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to list MCP connections", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load connected apps.");
    }
  },
);

router.post(
  "/api/mcp/coaching-writes",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (typeof req.body?.enabled !== "boolean") {
        throw AppError.fromHttpStatus(400, "enabled must be true or false.");
      }
      const enabled = await tenantStore.run(req.user.id, () =>
        writeMcpCoachingWritesEnabled(req.user.id, req.body.enabled),
      );
      res.json({ coaching_writes_enabled: enabled });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update MCP coaching writes", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update connected-app training permission.");
    }
  },
);

router.delete(
  "/api/mcp/connections",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await tenantStore.run(req.user.id, () => revokeAllMcpGrantsForUser(req.user.id));
      res.json({ disconnected: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to revoke MCP connections", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect connected apps.");
    }
  },
);

export default router;
