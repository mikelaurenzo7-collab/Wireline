/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { eq } from "drizzle-orm";
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
import {
  sfOAuthConfigured,
  getSalesforceAuthUrl,
  exchangeSalesforceCode,
  disconnectSalesforce,
} from "../../lib/salesforce-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Salesforce OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/salesforce/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!sfOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing SALESFORCE_CLIENT_ID or SALESFORCE_CLIENT_SECRET in environment variables.",
      });
    }

    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getSalesforceAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/salesforce/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error } = req.query;
    if (error) {
      log.warn("Salesforce OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Salesforce authorization was not completed. Please restart the connection.");
    }

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Salesforce.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;

      const tokens = await exchangeSalesforceCode(code, redirectUri);

      // Fetch the user identity to link the connection
      const idRes = await fetch(tokens.id, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const identity = idRes.ok ? ((await idRes.json()) as any) : {};
      const connectedEmail = identity.email || "";

      const userId = await resolveLinkedOAuthUserId(req, vs);

      if (!userId) {
        return res
          .status(401)
          .send("Complete this connection in the same browser and Wireline account that started it.");
      }

      const accessTokenSf = encryptSecret(tokens.access_token);
      const refreshTokenSf = encryptSecret(tokens.refresh_token);
      const expiresAtSf = new Date(Date.now() + tokens.expires_in * 1000);

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "salesforce",
          instanceUrl: tokens.instance_url,
          accessToken: accessTokenSf,
          refreshToken: refreshTokenSf,
          expiresAt: expiresAtSf,
          connectedEmail,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: tokens.instance_url,
            accessToken: accessTokenSf,
            refreshToken: refreshTokenSf,
            expiresAt: expiresAtSf,
            connectedEmail,
            updatedAt: new Date(),
            active: true,
          },
        });

      await drizzle
        .update(schema.settings)
        .set({ crmType: "salesforce" })
        .where(eq(schema.settings.userId, userId));

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'salesforce' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Salesforce connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Salesforce OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Salesforce authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/salesforce/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    try {
      await disconnectSalesforce(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Salesforce disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Salesforce");
    }
  },
);

export default router;
