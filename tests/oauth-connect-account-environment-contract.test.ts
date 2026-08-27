import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

type OAuthRouteContract = {
  file: string;
  start: string;
  callback: string;
  authorization: string;
  exchange: string;
};

const ROUTES: OAuthRouteContract[] = [
  {
    file: "google.ts",
    start: '"/api/oauth/google/url"',
    callback: '["/api/oauth/google/callback", "/api/oauth/google/callback/"]',
    authorization: "oauth2Client.generateAuthUrl(",
    exchange: "oauth2Client.getToken(code)",
  },
  {
    file: "google-sheets.ts",
    start: '"/api/oauth/google_sheets/url"',
    callback: '["/api/oauth/google_sheets/callback", "/api/oauth/google_sheets/callback/"]',
    authorization: "getGoogleSheetsAuthUrl(",
    exchange: "exchangeGoogleSheetsCode(code, redirectUri)",
  },
  {
    file: "microsoft.ts",
    start: '"/api/oauth/microsoft/url"',
    callback: '"/api/oauth/microsoft/callback"',
    authorization: "new URLSearchParams({",
    exchange: 'fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token"',
  },
  {
    file: "yahoo.ts",
    start: '"/api/oauth/yahoo/url"',
    callback: '"/api/oauth/yahoo/callback"',
    authorization: "new URLSearchParams({",
    exchange: 'fetch("https://api.login.yahoo.com/oauth2/get_token"',
  },
  {
    file: "apollo.ts",
    start: '"/api/oauth/apollo/url"',
    callback: '"/api/oauth/apollo/callback"',
    authorization: "getApolloAuthUrl(",
    exchange: "exchangeApolloCode(code, redirectUri)",
  },
  {
    file: "hubspot.ts",
    start: '"/api/oauth/hubspot/url"',
    callback: '"/api/oauth/hubspot/callback"',
    authorization: "getHubSpotAuthUrl(",
    exchange: "exchangeHubSpotCode(code, redirectUri)",
  },
  {
    file: "salesforce.ts",
    start: '"/api/oauth/salesforce/url"',
    callback: '"/api/oauth/salesforce/callback"',
    authorization: "getSalesforceAuthUrl(",
    exchange: "exchangeSalesforceCode(code, redirectUri)",
  },
  {
    file: "meta.ts",
    start: '"/api/oauth/meta/url"',
    callback: '"/api/oauth/meta/callback"',
    authorization: "getMetaAuthUrl(",
    exchange: "exchangeMetaCode(code, redirectUri)",
  },
  {
    file: "shopify.ts",
    start: '"/api/oauth/shopify/url"',
    callback: '"/api/oauth/shopify/callback"',
    authorization: "getShopifyAuthUrl(",
    exchange: "exchangeShopifyCode(shopDomain, code)",
  },
  {
    file: "slack.ts",
    start: '"/api/oauth/slack/url"',
    callback: '"/api/oauth/slack/callback"',
    authorization: "getSlackAuthUrl(",
    exchange: "exchangeSlackCode(code, redirectUri)",
  },
  {
    file: "square.ts",
    start: '"/api/oauth/square/url"',
    callback: '"/api/ecommerce/oauth/callback"',
    authorization: "getSquareAuthUrl(",
    exchange: "exchangeSquareCode(code, redirectUri)",
  },
  {
    file: "x.ts",
    start: '"/api/oauth/x/url"',
    callback: '"/api/oauth/x/callback"',
    authorization: "getXAuthUrl(",
    exchange: "exchangeXCode(code, redirectUri, vs.pkceVerifier)",
  },
  {
    file: "zoom.ts",
    start: '"/api/oauth/zoom/url"',
    callback: '"/api/oauth/zoom/callback"',
    authorization: "getZoomAuthUrl(",
    exchange: "exchangeZoomCode(code, redirectUri)",
  },
];

function afterMarker(contents: string, marker: string): string {
  const index = contents.indexOf(marker);
  expect(index, `missing marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return contents.slice(index);
}

describe("integration OAuth account-environment contract", () => {
  it.each(ROUTES)(
    "$file gates authorization and callback token exchange",
    ({ file, start, callback, authorization, exchange }) => {
      const contents = source(`src/routes/oauth/${file}`);
      const startRoute = afterMarker(contents, start);
      const startGuard = startRoute.indexOf("await assertOAuthProviderConnectAllowed(");
      const authorizationCall = startRoute.indexOf(authorization);
      expect(startGuard).toBeGreaterThanOrEqual(0);
      expect(authorizationCall).toBeGreaterThan(startGuard);

      const callbackRoute = afterMarker(contents, callback);
      const linkedUser = callbackRoute.indexOf("await resolveLinkedOAuthUserId(req");
      const callbackGuard = callbackRoute.indexOf("await assertOAuthProviderConnectAllowed(");
      const tokenExchange = callbackRoute.indexOf(exchange);
      expect(linkedUser).toBeGreaterThanOrEqual(0);
      expect(callbackGuard).toBeGreaterThan(linkedUser);
      expect(tokenExchange).toBeGreaterThan(callbackGuard);
    },
  );

  it("gates both Microsoft Graph connectors in their shared start and callback helpers", () => {
    const contents = source("src/routes/oauth/microsoft-graph.ts");
    const start = afterMarker(contents, "function buildMsGraphUrlRoute");
    const startGuard = start.indexOf("await assertOAuthProviderConnectAllowed(uid, provider)");
    expect(startGuard).toBeGreaterThanOrEqual(0);
    expect(start.indexOf("getTeamsAuthUrl(")).toBeGreaterThan(startGuard);
    expect(start.indexOf("getExcelAuthUrl(")).toBeGreaterThan(startGuard);

    const callback = afterMarker(contents, "async function handleMsGraphCallback");
    const linkedUser = callback.indexOf("await resolveLinkedOAuthUserId(req, vs)");
    const callbackGuard = callback.indexOf(
      "await assertOAuthProviderConnectAllowed(userId, provider)",
    );
    const tokenExchange = callback.indexOf("exchangeMicrosoftGraphCode(code, redirectUri)");
    expect(linkedUser).toBeGreaterThanOrEqual(0);
    expect(callbackGuard).toBeGreaterThan(linkedUser);
    expect(tokenExchange).toBeGreaterThan(callbackGuard);
  });

  it("leaves BotBound sign-in OAuth and every disconnect/revoke lane outside the connect fence", () => {
    const signInOAuth = source("src/routes/auth-oauth-routes.ts");
    expect(signInOAuth).not.toContain("oauth-connect-environment");
    expect(signInOAuth).not.toContain("assertOAuthProviderConnectAllowed");

    for (const { file } of [...ROUTES, { file: "microsoft-graph.ts" }] as {
      file: string;
    }[]) {
      const contents = source(`src/routes/oauth/${file}`);
      const disconnectRoutes = contents.split("router.post(").slice(1);
      for (const route of disconnectRoutes) {
        if (!route.includes("/disconnect")) continue;
        expect(
          route.slice(0, route.indexOf("router.") >= 0 ? route.indexOf("router.") : undefined),
        ).not.toContain("assertOAuthProviderConnectAllowed");
      }
    }
  });
});
