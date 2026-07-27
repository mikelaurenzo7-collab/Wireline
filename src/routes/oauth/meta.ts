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
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import { getErrorMessage } from "../../lib/server-utils";
import {
  metaOAuthConfigured,
  getMetaAuthUrl,
  exchangeMetaCode,
  getMetaUserInfo,
  subscribePageToLeadgen,
  disconnectMeta,
} from "../../lib/meta-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Meta OAuth (placeholder — connect button shows, data flows are
//  future work). Routes return 503 until META_APP_ID + META_APP_SECRET
//  land in env. When configured, the OAuth dance + token storage work
//  end-to-end; the Lead Ads webhook + CAPI export ship in a later
//  phase, at which point the stored token is already there to use.
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/meta/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!metaOAuthConfigured()) {
      return res
        .status(503)
        .json({ error: "Meta integration is finishing setup. Try again shortly." });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/meta/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getMetaAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/meta/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Meta OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Meta authorization was not completed. Please restart the connection.");
    }
    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Meta.");
    }
    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/meta/callback`;
      const tokens = await exchangeMetaCode(code, redirectUri);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const info = await getMetaUserInfo(tokens.access_token);
      const accessTokenM = encryptSecret(tokens.access_token);
      const expiresAtM = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

      // Pull the pages the user manages so the Lead Ads webhook can
      // route incoming events to this tenant. The /me/accounts call
      // returns each page's own access_token (needed to subscribe
      // that page to leadgen events). Fail closed on a non-OK / network
      // error — empty-success left a "connected" CRM with no page_ids
      // and Lead Ads never routed.
      let pageRows: { data?: { id: string; name: string; access_token?: string }[] };
      try {
        const pageRes = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(tokens.access_token)}`,
        );
        if (!pageRes.ok) {
          log.warn("Meta /me/accounts failed during OAuth callback", {
            status: pageRes.status,
          });
          return res
            .status(502)
            .send(
              "Connected to Meta, but we could not load your Facebook Pages. Reconnect from Wire → Integrations.",
            );
        }
        pageRows = (await pageRes.json()) as typeof pageRows;
      } catch (pageErr) {
        log.warn("Meta /me/accounts network failure during OAuth callback", {
          error: getErrorMessage(pageErr),
        });
        return res
          .status(502)
          .send(
            "Connected to Meta, but we could not load your Facebook Pages. Reconnect from Wire → Integrations.",
          );
      }
      const pages: { id: string; name: string; access_token?: string }[] = pageRows.data || [];
      const pageIds = pages.map((p) => p.id);

      // Best-effort: subscribe every managed page to leadgen events.
      // Failures don't block the OAuth flow — Account Holder can re-trigger
      // later via a reconnect.
      await Promise.all(
        pages.map((p) =>
          p.access_token
            ? subscribePageToLeadgen(p.id, p.access_token).catch(() => false)
            : Promise.resolve(false),
        ),
      );

      const metaMetadata = {
        page_ids: pageIds,
        page_names: pages.map((p) => p.name),
        // Stored so the Data Deletion Callback can map an incoming
        // revocation event (signed_request.user_id) back to this
        // tenant. Without this, the callback can ack Meta but can't
        // disconnect the right account.
        facebook_user_id: info?.id || null,
      };

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "meta",
          accessToken: accessTokenM,
          expiresAt: expiresAtM,
          connectedEmail: info?.email || info?.name || null,
          metadata: metaMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            accessToken: accessTokenM,
            expiresAt: expiresAtM,
            connectedEmail: info?.email || info?.name || null,
            metadata: metaMetadata,
            updatedAt: new Date(),
            active: true,
          },
        });

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'meta' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Meta connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Meta OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Meta authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/meta/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectMeta(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Meta disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Meta");
    }
  },
);

export default router;
