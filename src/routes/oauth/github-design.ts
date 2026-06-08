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
  githubDesignOAuthConfigured,
  exchangeGithubDesignCode,
  getGithubDesignAuthUrl,
  fetchGithubUser,
} from "../../lib/design-github-pr";
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
  "/api/oauth/github/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!githubDesignOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error:
          "Missing GITHUB_DESIGN_CLIENT_ID or GITHUB_DESIGN_CLIENT_SECRET in environment variables.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const redirectUri = `${oauthBaseUrl(req)}/api/oauth/github/callback`;
    const authUrl = getGithubDesignAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/github/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("GitHub OAuth error from provider", { error, error_description });
      return res.status(400).send(`GitHub OAuth error: ${error_description || error}`);
    }

    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by GitHub.");
    }

    try {
      const redirectUri = `${oauthBaseUrl(req)}/api/oauth/github/callback`;
      const tokens = await exchangeGithubDesignCode(code, redirectUri);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const profile = await fetchGithubUser(tokens.access_token);

      await upsertDesignIntegration({
        userId,
        provider: "github",
        accessToken: tokens.access_token,
        refreshToken: null,
        expiresAt: null,
        connectedAccount: profile.login,
        metadata: { scope: tokens.scope },
      });

      const targetOrigin = oauthBaseUrl(req);
      const { html, csp } = renderDesignOAuthCallbackPage("github", targetOrigin, IS_PROD);
      res.setHeader("Content-Security-Policy", csp);
      res.send(html);
    } catch (e: any) {
      log.error("GitHub OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("GitHub authentication failed. Please try again.");
    }
  },
);

export default router;
