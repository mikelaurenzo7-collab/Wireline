/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveLinkedOAuthUserId,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import { getErrorMessage } from "../../lib/server-utils";
import {
  slackOAuthConfigured,
  getSlackAuthUrl,
  exchangeSlackCode,
  disconnectSlack,
  listChannels as listSlackChannels,
  setDefaultChannel as setSlackDefaultChannel,
  bootstrapDefaultChannel,
} from "../../lib/slack-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Slack OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/slack/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!slackOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET in environment variables.",
      });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getSlackAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/slack/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      log.warn("Slack OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Slack authorization was not completed. Please restart the connection.");
    }
    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Slack.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
      const tokens = await exchangeSlackCode(code, redirectUri);

      const userId = await resolveLinkedOAuthUserId(req, vs);
      if (!userId) {
        return res
          .status(401)
          .send("Complete this connection in the same browser and Wireline account that started it.");
      }

      const slackInstanceUrl = `https://${tokens.team.name}.slack.com`;
      const accessTokenSlack = encryptSecret(tokens.access_token);
      const refreshTokenSlack = encryptSecret("slack-no-refresh");
      const slackMetadata = {
        team_id: tokens.team.id,
        team_name: tokens.team.name,
        bot_user_id: tokens.bot_user_id,
      };

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "slack",
          instanceUrl: slackInstanceUrl,
          accessToken: accessTokenSlack,
          refreshToken: refreshTokenSlack,
          connectedEmail: tokens.team.name,
          metadata: slackMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: slackInstanceUrl,
            accessToken: accessTokenSlack,
            refreshToken: refreshTokenSlack,
            connectedEmail: tokens.team.name,
            metadata: slackMetadata,
            updatedAt: new Date(),
            active: true,
          },
        });

      void bootstrapDefaultChannel(userId).catch((err) =>
        log.warn("bootstrapDefaultChannel failed", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'slack' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Slack connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Slack OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Slack authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/slack/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectSlack(userId);
      res.json({ ok: true });
    } catch (err: any) {
      log.error("POST /api/oauth/slack/disconnect failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Slack");
    }
  },
);

router.get(
  "/api/oauth/slack/channels",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      const channels = await listSlackChannels(userId);
      res.json({ channels });
    } catch (err: any) {
      log.error("GET /api/oauth/slack/channels failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to list Slack channels");
    }
  },
);

router.post(
  "/api/oauth/slack/default-channel",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    const { channel_id } = req.body;
    if (!channel_id) throw AppError.fromHttpStatus(400, "channel_id required");
    try {
      await setSlackDefaultChannel(userId, channel_id);
      res.json({ ok: true });
    } catch (err: any) {
      log.error("POST /api/oauth/slack/default-channel failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to set default channel");
    }
  },
);

export default router;
