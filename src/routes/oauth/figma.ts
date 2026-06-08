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
  figmaOAuthConfigured,
  exchangeFigmaCode,
  generateFigmaPkcePair,
  getFigmaAuthUrl,
  fetchFigmaMe,
} from "../../lib/figma-service";
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
  "/api/oauth/figma/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!figmaOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing FIGMA_CLIENT_ID or FIGMA_CLIENT_SECRET in environment variables.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const redirectUri = `${oauthBaseUrl(req)}/api/oauth/figma/callback`;
    const { verifier, challenge } = generateFigmaPkcePair();
    const authUrl = getFigmaAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid, pkceVerifier: verifier } : undefined),
      challenge,
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/figma/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Figma OAuth error from provider", { error, error_description });
      return res.status(400).send(`Figma OAuth error: ${error_description || error}`);
    }

    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Figma.");
    }
    if (!vs.pkceVerifier) {
      return res.status(400).send("Missing PKCE verifier. Please restart the sign-in flow.");
    }

    try {
      const redirectUri = `${oauthBaseUrl(req)}/api/oauth/figma/callback`;
      const tokens = await exchangeFigmaCode(code, redirectUri, vs.pkceVerifier);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      let connectedAccount = tokens.user_id_string || "";
      await upsertDesignIntegration({
        userId,
        provider: "figma",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        connectedAccount,
        metadata: {},
      });

      try {
        const me = await fetchFigmaMe(userId);
        connectedAccount = me.email || me.handle || connectedAccount;
        await upsertDesignIntegration({
          userId,
          provider: "figma",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          connectedAccount,
          metadata: { handle: me.handle },
        });
      } catch (e: any) {
        log.warn("Figma profile fetch after connect failed", { error: e?.message });
      }

      const targetOrigin = oauthBaseUrl(req);
      const { html, csp } = renderDesignOAuthCallbackPage("figma", targetOrigin, IS_PROD);
      res.setHeader("Content-Security-Policy", csp);
      res.send(html);
    } catch (e: any) {
      log.error("Figma OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Figma authentication failed. Please try again.");
    }
  },
);

export default router;
