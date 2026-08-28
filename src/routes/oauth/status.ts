/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { and, eq } from "drizzle-orm";
import { drizzle, log } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { authenticateUser } from "../../middleware/auth";
import { sfOAuthConfigured } from "../../lib/salesforce-service";
import { hsOAuthConfigured } from "../../lib/hubspot-service";
import { slackOAuthConfigured } from "../../lib/slack-service";
import { xOAuthConfigured } from "../../lib/x-service";
import { zoomOAuthConfigured } from "../../lib/zoom-service";
import { apolloOAuthConfigured, apolloPlatformConfigured } from "../../lib/apollo-service";
import { metaOAuthConfigured } from "../../lib/meta-service";
import { shopifyOAuthConfigured } from "../../lib/shopify-service";
import { squareOAuthConfigured } from "../../lib/square-service";
import { microsoftGraphConfigured } from "../../lib/microsoft-graph-service";
import { googleSheetsConfigured } from "../../lib/google-sheets-service";
import { computeIntegrationHealth } from "../../lib/integration-health";
import {
  getSalesforceSyncPreferences,
  mergeSalesforceSyncPreferences,
  SalesforceSyncPreferencesSchema,
} from "../../lib/salesforce-sync-preferences";

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
      const sfConn = findBy("salesforce");
      const hsConn = findBy("hubspot");
      const slackConn = findBy("slack");
      const xConn = findBy("x");
      const zoomConn = findBy("zoom");
      const apolloConn = findBy("apollo");
      const metaConn = findBy("meta");
      const shopifyConn = findBy("shopify");
      const squareConn = findBy("square");
      const teamsConn = findBy("microsoft_teams");
      const excelConn = findBy("microsoft_excel");
      const sheetsConn = findBy("google_sheets");

      res.json({
        salesforce: isLive(sfConn)
          ? {
              connected: true,
              configured: sfOAuthConfigured(),
              email: sfConn.connectedEmail,
              instance_url: sfConn.instanceUrl,
              connected_at: sfConn.createdAt,
              sync_preferences: getSalesforceSyncPreferences(sfConn.metadata),
            }
          : { connected: false, configured: sfOAuthConfigured() },
        hubspot: isLive(hsConn)
          ? {
              connected: true,
              configured: hsOAuthConfigured(),
              email: hsConn.connectedEmail,
              instance_url: hsConn.instanceUrl,
              connected_at: hsConn.createdAt,
            }
          : { connected: false, configured: hsOAuthConfigured() },
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
        x: isLive(xConn)
          ? {
              connected: true,
              configured: xOAuthConfigured(),
              email: xConn.connectedEmail,
              instance_url: xConn.instanceUrl,
              connected_at: xConn.createdAt,
              username:
                (xConn.metadata as { username?: string } | null)?.username ??
                xConn.connectedEmail?.replace(/^@/, "") ??
                null,
            }
          : { connected: false, configured: xOAuthConfigured() },
        zoom: isLive(zoomConn)
          ? {
              connected: true,
              configured: zoomOAuthConfigured(),
              instance_url: zoomConn.instanceUrl,
              connected_at: zoomConn.createdAt,
            }
          : { connected: false, configured: zoomOAuthConfigured() },
        apollo: isLive(apolloConn)
          ? {
              connected: true,
              configured: apolloPlatformConfigured(),
              email: apolloConn.connectedEmail,
              connected_at: apolloConn.createdAt,
              platform_active: apolloPlatformConfigured(),
              oauth_connect_available: apolloOAuthConfigured(),
            }
          : {
              connected: false,
              configured: apolloPlatformConfigured(),
              platform_active: apolloPlatformConfigured(),
              oauth_connect_available: apolloOAuthConfigured(),
            },
        meta: isLive(metaConn)
          ? {
              connected: true,
              configured: metaOAuthConfigured(),
              email: metaConn.connectedEmail,
              connected_at: metaConn.createdAt,
            }
          : { connected: false, configured: metaOAuthConfigured() },
        shopify: isLive(shopifyConn)
          ? {
              connected: true,
              configured: shopifyOAuthConfigured(),
              email: shopifyConn.connectedEmail,
              instance_url: shopifyConn.instanceUrl,
              connected_at: shopifyConn.createdAt,
            }
          : { connected: false, configured: shopifyOAuthConfigured() },
        square: isLive(squareConn)
          ? {
              connected: true,
              configured: squareOAuthConfigured(),
              email: squareConn.connectedEmail,
              connected_at: squareConn.createdAt,
            }
          : { connected: false, configured: squareOAuthConfigured() },
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
//  Salesforce delivery preferences
// ────────────────────────────────────────────────────────────────────

router.put(
  "/api/oauth/crm/salesforce/preferences",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    const parsed = SalesforceSyncPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.fromHttpStatus(400, "Invalid Salesforce call activity preference.");
    }

    try {
      const [connection] = await drizzle
        .select({
          id: schema.crmConnections.id,
          metadata: schema.crmConnections.metadata,
          active: schema.crmConnections.active,
        })
        .from(schema.crmConnections)
        .where(
          and(
            eq(schema.crmConnections.userId, userId),
            eq(schema.crmConnections.provider, "salesforce"),
          ),
        )
        .limit(1);

      if (!connection || connection.active === false) {
        throw AppError.fromHttpStatus(
          409,
          "Connect an active Salesforce account before changing call activity delivery.",
        );
      }

      const metadata = mergeSalesforceSyncPreferences(connection.metadata, parsed.data);
      await drizzle
        .update(schema.crmConnections)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(schema.crmConnections.id, connection.id));

      res.json({ preferences: getSalesforceSyncPreferences(metadata) });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("Salesforce preference update failed", { userId, error: error?.message });
      throw AppError.fromHttpStatus(500, "Failed to update Salesforce call activity preference.");
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
