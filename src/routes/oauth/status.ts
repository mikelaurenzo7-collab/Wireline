/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { eq } from "drizzle-orm";
import { drizzle, log } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { authenticateUser } from "../../middleware/auth";
import { slackOAuthConfigured } from "../../lib/slack-service";
import { microsoftGraphConfigured } from "../../lib/microsoft-graph-service";
import { googleSheetsConfigured } from "../../lib/google-sheets-service";
import { computeIntegrationHealth } from "../../lib/integration-health";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  CRM Connection Status (shared endpoint)
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/crm/status",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    try {
      // The Supabase-client `db.from(...)` path was a runtime crash — the
      // server-context `db` is a Drizzle handle, so `.from()` was never
      // callable. Use Drizzle's typed select instead. This is what
      // CrmConnectionCard polls on mount to render connection badges.
      const connections = await drizzle
        .select({
          provider: schema.crmConnections.provider,
          connectedEmail: schema.crmConnections.connectedEmail,
          instanceUrl: schema.crmConnections.instanceUrl,
          createdAt: schema.crmConnections.createdAt,
          updatedAt: schema.crmConnections.updatedAt,
          metadata: schema.crmConnections.metadata,
          active: schema.crmConnections.active,
        })
        .from(schema.crmConnections)
        .where(eq(schema.crmConnections.userId, userId));

      const findBy = (p: string) => (connections || []).find((c) => c.provider === p);
      const isLive = (
        row: (typeof connections)[number] | undefined,
      ): row is (typeof connections)[number] => !!row && row.active !== false;
      const slackConn = findBy("slack");
      const teamsConn = findBy("microsoft_teams");
      const excelConn = findBy("microsoft_excel");
      const sheetsConn = findBy("google_sheets");

      res.json({
        slack: isLive(slackConn)
          ? {
              connected: true,
              configured: slackOAuthConfigured(),
              team: slackConn.connectedEmail,
              instance_url: slackConn.instanceUrl,
              connected_at: slackConn.createdAt,
              default_channel_id:
                (slackConn.metadata as { default_channel?: string } | null)?.default_channel ??
                null,
            }
          : { connected: false, configured: slackOAuthConfigured() },
        microsoft_teams: isLive(teamsConn)
          ? {
              connected: true,
              configured: microsoftGraphConfigured(),
              email: teamsConn.connectedEmail,
              connected_at: teamsConn.createdAt,
              team_id: (teamsConn.metadata as { team_id?: string } | null)?.team_id ?? null,
              channel_id:
                (teamsConn.metadata as { channel_id?: string } | null)?.channel_id ?? null,
              team_name: (teamsConn.metadata as { team_name?: string } | null)?.team_name ?? null,
              channel_name:
                (teamsConn.metadata as { channel_name?: string } | null)?.channel_name ?? null,
            }
          : { connected: false, configured: microsoftGraphConfigured() },
        microsoft_excel: isLive(excelConn)
          ? {
              connected: true,
              configured: microsoftGraphConfigured(),
              email: excelConn.connectedEmail,
              connected_at: excelConn.createdAt,
            }
          : { connected: false, configured: microsoftGraphConfigured() },
        google_sheets: isLive(sheetsConn)
          ? {
              connected: true,
              configured: googleSheetsConfigured(),
              email: sheetsConn.connectedEmail,
              connected_at: sheetsConn.createdAt,
            }
          : { connected: false, configured: googleSheetsConfigured() },
      });
    } catch (e: any) {
      log.error("CRM status check failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to check CRM status");
    }
  },
);

// ────────────────────────────────────────────────────────────────────
//  Integration health (OAuth scope freshness)
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/integration-health",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      const health = await computeIntegrationHealth(userId);
      res.json(health);
    } catch (e: any) {
      log.error("integration-health failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to load integration health.");
    }
  },
);

export default router;
