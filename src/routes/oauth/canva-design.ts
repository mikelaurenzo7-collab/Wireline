/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { log, IS_PROD } from "../../lib/server-context";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  generateOAuthState,
  verifyOAuthState,
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import {
  canvaOAuthConfigured,
  exchangeCanvaCode,
  generateCanvaPkcePair,
  getCanvaAuthUrl,
} from "../../lib/canva-connect-service";
import { upsertDesignIntegration } from "../../lib/design-integrations";
import { renderDesignOAuthCallbackPage } from "../../lib/design-oauth-callback-html";

const router = express.Router();

function oauthBaseUrl(req: express.Request): string {
  return (
    (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
    `${req.protocol}://${req.get("host")}`
  );
}

router.get(
  "/api/oauth/canva/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!canvaOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing CANVA_CLIENT_ID or CANVA_CLIENT_SECRET in environment variables.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const redirectUri = `${oauthBaseUrl(req)}/api/oauth/canva/callback`;
    const { verifier, challenge } = generateCanvaPkcePair();
    const authUrl = getCanvaAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid, pkceVerifier: verifier } : undefined),
      challenge,
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/canva/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Canva OAuth error from provider", { error, error_description });
      return res.status(400).send(`Canva OAuth error: ${error_description || error}`);
    }

    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Canva.");
    }
    if (!vs.pkceVerifier) {
      return res.status(400).send("Missing PKCE verifier. Please restart the sign-in flow.");
    }

    try {
      const redirectUri = `${oauthBaseUrl(req)}/api/oauth/canva/callback`;
      const tokens = await exchangeCanvaCode(code, redirectUri, vs.pkceVerifier);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      await upsertDesignIntegration({
        userId,
        provider: "canva",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        connectedAccount: "Canva",
        metadata: {},
      });

      const targetOrigin = oauthBaseUrl(req);
      const { html, csp } = renderDesignOAuthCallbackPage("canva", targetOrigin, IS_PROD);
      res.setHeader("Content-Security-Policy", csp);
      res.send(html);
    } catch (e: any) {
      log.error("Canva OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Canva authentication failed. Please try again.");
    }
  },
);

export default router;
