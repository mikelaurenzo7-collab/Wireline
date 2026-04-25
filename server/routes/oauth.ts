import { Router, type Request, type Response } from "express";

import {
  authenticateUser,
  createOAuthState,
  verifyOAuthState,
  type AuthenticatedRequest,
} from "../lib/auth";
import { env } from "../lib/env";
import { AppError, asyncHandler } from "../lib/errors";
import {
  getConfiguredBaseUrl,
  getGoogleOAuthClient,
  GOOGLE_OAUTH_SCOPES,
  google,
} from "../lib/google";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rateLimit";
import { db } from "../lib/supabase";

const router = Router();

router.get(
  "/api/oauth/google/url",
  rateLimit({ max: 10, windowMs: 10 * 60 * 1000 }),
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw AppError.internal(
        "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables."
      );
    }

    const oauth2Client = getGoogleOAuthClient(req);
    const state = createOAuthState(req.user!.id, getConfiguredBaseUrl(req));
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_OAUTH_SCOPES,
      prompt: "consent",
      state,
    });

    res.json({ url: authUrl });
  })
);

router.get(
  ["/api/oauth/google/callback", "/api/oauth/google/callback/"],
  rateLimit({ max: 20, windowMs: 10 * 60 * 1000 }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Google.");
    }
    if (!state || typeof state !== "string") {
      return res.status(400).send("Missing OAuth state.");
    }

    const verifiedState = verifyOAuthState(state);
    if (!verifiedState) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }

    try {
      const oauth2Client = getGoogleOAuthClient(req);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const emailAddress = userInfo.data.email;

      if (!emailAddress) throw new Error("Could not fetch user email.");

      await db.from("wireline_email_accounts").upsert(
        {
          user_id: verifiedState.userId,
          email: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expiry_date,
        },
        { onConflict: "email" }
      );

      res.send(`
      <html>
        <body>
          <script>
            const targetOrigin = ${JSON.stringify(verifiedState.origin)};
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, targetOrigin);
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
    } catch (error) {
      logger.error({ err: error }, "OAuth Callback Error");
      res.status(500).send("Authentication failed.");
    }
  })
);

export default router;
