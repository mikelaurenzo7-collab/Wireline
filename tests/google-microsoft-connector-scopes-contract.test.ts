import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GOOGLE_SHEETS_SCOPES } from "../src/lib/google-sheets-service";
import { MS_EXCEL_SCOPES, MS_TEAMS_SCOPES } from "../src/lib/microsoft-graph-service";
import {
  MS_SCOPES,
  SCOPES,
  googleConnectScopes,
  microsoftConnectScopes,
} from "../src/lib/oauth-helpers";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const CANONICAL_ORIGIN = "https://botbound.app";

/**
 * The Google workspace connection is one OAuth client/grant used by Gmail,
 * Calendar, and Drive. `drive.file` is the least-privilege write scope that
 * can call files.create for exported artifacts; `drive.readonly` cannot.
 */
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

const MICROSOFT_WORKSPACE_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.Read",
  "Calendars.ReadWrite",
  "Files.Read.All",
];

interface RedirectContract {
  label: string;
  path: string;
  /** The one route file that registers this exact callback path. */
  ownerFile: string;
  /** The file that constructs the redirect URI passed to the provider. */
  builderFile: string;
  /** The constant/derivation the route must use instead of an inline host. */
  builder: string;
}

const REDIRECT_URIS: RedirectContract[] = [
  {
    label: "Google sign-in",
    path: "/api/auth/google/callback",
    ownerFile: "src/routes/auth-oauth-routes.ts",
    builderFile: "src/routes/auth-oauth-routes.ts",
    builder: "const redirectUri = `${baseUrl}/api/auth/google/callback`;",
  },
  {
    label: "Microsoft sign-in",
    path: "/api/auth/microsoft/callback",
    ownerFile: "src/routes/auth-oauth-routes.ts",
    builderFile: "src/routes/auth-oauth-routes.ts",
    builder: "const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;",
  },
  {
    label: "Google workspace Gmail/Calendar/Drive",
    path: "/api/oauth/google/callback",
    ownerFile: "src/routes/oauth/google.ts",
    builderFile: "src/lib/oauth-helpers.ts",
    builder: "`${baseUrl}/api/oauth/google/callback`,",
  },
  {
    label: "Google Sheets/Drive files",
    path: "/api/oauth/google_sheets/callback",
    ownerFile: "src/routes/oauth/google-sheets.ts",
    builderFile: "src/routes/oauth/google-sheets.ts",
    builder: "const redirectUri = `${baseUrl}/api/oauth/google_sheets/callback`;",
  },
  {
    label: "Microsoft 365 Outlook/Calendar/Files",
    path: "/api/oauth/microsoft/callback",
    ownerFile: "src/routes/oauth/microsoft.ts",
    builderFile: "src/lib/oauth-helpers.ts",
    builder: "`${baseUrl}/api/oauth/microsoft/callback`;",
  },
  {
    label: "Microsoft Teams",
    path: "/api/oauth/microsoft_teams/callback",
    ownerFile: "src/routes/oauth/microsoft-graph.ts",
    builderFile: "src/routes/oauth/microsoft-graph.ts",
    builder: "return `${baseUrl}/api/oauth/${provider}/callback`;",
  },
  {
    label: "Microsoft Excel/OneDrive",
    path: "/api/oauth/microsoft_excel/callback",
    ownerFile: "src/routes/oauth/microsoft-graph.ts",
    builderFile: "src/routes/oauth/microsoft-graph.ts",
    builder: "return `${baseUrl}/api/oauth/${provider}/callback`;",
  },
];

/** Route sources that could accidentally re-register or hardcode a callback. */
const ROUTE_SOURCE_FILES = [
  "src/routes/auth-oauth-routes.ts",
  "src/routes/auth-oauth-browser-binding.ts",
  "src/routes/oauth/google.ts",
  "src/routes/oauth/google-sheets.ts",
  "src/routes/oauth/microsoft.ts",
  "src/routes/oauth/microsoft-graph.ts",
  "src/routes/oauth/yahoo.ts",
  "src/routes/oauth/index.ts",
  "src/routes/oauth/status.ts",
];

describe("Google + Microsoft connector scope contract", () => {
  it("pins the Google workspace scope array to what its services actually call", () => {
    expect(SCOPES).toEqual(GOOGLE_WORKSPACE_SCOPES);

    // Gmail send + read (mailbox connect and daily brief).
    const mail = read("src/lib/integrations.ts") + read("src/lib/daily-brief.ts");
    expect(mail).toContain("gmail.users.messages.send");
    expect(mail).toContain("gmail.users.messages.list");
    expect(mail).toContain("gmail.users.messages.get");

    // Calendar read + event creation (sync and booking).
    const calendar = read("src/lib/integrations.ts") + read("src/services/google-calendar-sync.ts");
    expect(calendar).toContain("calendar.events");
    expect(calendar).toContain("calendar.events.insert");

    // Drive read/import (knowledge sync).
    const drive = read("src/services/google-drive-sync-v2.ts");
    expect(drive).toContain("drive.files.list");
    expect(drive).toContain("drive.files.export");
    expect(drive).toContain("drive.files.get");

    // Drive artifact upload requires a write scope; readonly is not enough.
    const artifacts = read("src/lib/connected-artifact-storage.ts");
    expect(artifacts).toContain("https://www.googleapis.com/upload/drive/v3/files");
    expect(artifacts).toContain('accessTokenFor(input.userId, "google_sheets")');
    expect(SCOPES).toContain("https://www.googleapis.com/auth/drive.file");
    expect(SCOPES).not.toContain("https://www.googleapis.com/auth/drive");
  });

  it("pins the Google Sheets connector to spreadsheets plus created Drive files", () => {
    const scopes = GOOGLE_SHEETS_SCOPES.split(" ");
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
    expect(scopes).toContain("https://www.googleapis.com/auth/spreadsheets");
    expect(scopes).toContain("https://www.googleapis.com/auth/drive.file");

    const service = read("src/lib/google-sheets-service.ts");
    expect(service).toContain("SHEETS_API");
    expect(service).toContain("values/Call Log!A:F:append");
    expect(service).toContain("DRIVE_API");
  });

  it("pins the Microsoft 365 workspace scopes to Outlook mail, calendar, and files", () => {
    expect(MS_SCOPES).toBe(MICROSOFT_WORKSPACE_SCOPES.join(" "));

    const integrations = read("src/lib/integrations.ts");
    expect(integrations).toContain("/me/sendMail");
    expect(integrations).toContain("/me/mailFolders/inbox/messages");
    expect(integrations).toContain("/me/events");
    expect(read("src/services/outlook-calendar-sync.ts")).toContain("/me/calendarView");
    expect(read("src/lib/oauth-helpers.ts")).toContain("/me/sendMail");

    // Mail.Send/Mail.Read are the only scopes the Email entitlement may drop;
    // the file/calendar scopes stay on every plan.
    expect(MS_SCOPES.split(" ")).toContain("Files.Read.All");
    expect(MS_SCOPES.split(" ")).toContain("Calendars.ReadWrite");
  });

  it("pins Microsoft Teams scopes to team/channel discovery and channel messages", () => {
    const scopes = MS_TEAMS_SCOPES.split(" ");
    for (const scope of [
      "offline_access",
      "openid",
      "profile",
      "User.Read",
      "ChannelMessage.Send",
      "Team.ReadBasic.All",
      "Channel.ReadBasic.All",
    ]) {
      expect(scopes, `Teams scope ${scope}`).toContain(scope);
    }

    const service = read("src/lib/microsoft-graph-service.ts");
    expect(service).toContain("`${GRAPH}/me/joinedTeams`");
    expect(service).toContain("`${GRAPH}/teams/${team.id}/channels`");
    expect(service).toContain("`${GRAPH}/teams/${team.id}/primaryChannel`");
    expect(service).toContain(
      "`${GRAPH}/teams/${target.teamId}/channels/${target.channelId}/messages`",
    );
  });

  it("pins Microsoft Excel/OneDrive scopes to workbook creation and file uploads", () => {
    const scopes = MS_EXCEL_SCOPES.split(" ");
    for (const scope of ["offline_access", "openid", "profile", "User.Read", "Files.ReadWrite"]) {
      expect(scopes, `Excel scope ${scope}`).toContain(scope);
    }

    const service = read("src/lib/microsoft-graph-service.ts");
    expect(service).toContain("`${GRAPH}/me/drive/root/children`");
    expect(service).toContain("/workbook/tables");
    expect(service).toContain("/workbook/worksheets");

    // OneDrive artifact upload reuses the microsoft_excel token and needs
    // Files.ReadWrite (present above), not the read-only mailbox scopes.
    const artifacts = read("src/lib/connected-artifact-storage.ts");
    expect(artifacts).toContain('accessTokenFor(input.userId, "microsoft_excel")');
    expect(artifacts).toContain("https://graph.microsoft.com/v1.0/me/drive/root:/");
    expect(artifacts).toContain('method: "PUT"');
  });

  it("pins every redirect URI to exactly one route owner, one builder, and the canonical origin", () => {
    const doc = read("docs/OAUTH_PROVIDER_SETUP.md");
    const inventory = read("scripts/print-oauth-redirects.mjs");

    for (const contract of REDIRECT_URIS) {
      const owners = ROUTE_SOURCE_FILES.filter((file) => read(file).includes(contract.path));
      expect(owners, `${contract.label} callback owner`).toEqual([contract.ownerFile]);
      expect(read(contract.builderFile), `${contract.label} builder`).toContain(contract.builder);
      expect(inventory, `${contract.label} operator inventory`).toContain(contract.path);
      expect(doc, `${contract.label} documented redirect URI`).toContain(
        `${CANONICAL_ORIGIN}${contract.path}`,
      );
    }

    // The origin comes from APP_URL/getCanonicalAppUrl, never a route literal.
    expect(read("src/lib/app-url.ts")).toContain("getCanonicalAppUrl");
    expect(read("src/lib/brand.ts")).toContain(`canonicalProductionOrigin: "${CANONICAL_ORIGIN}"`);
    expect(read("src/routes/auth-oauth-routes.ts")).toContain("return getCanonicalAppUrl()");
    for (const file of ROUTE_SOURCE_FILES) {
      expect(read(file), `${file} must not hardcode the production callback host`).not.toContain(
        `${CANONICAL_ORIGIN}/api/`,
      );
    }
  });

  it("wires each connector connect URL from the provider helper that owns its redirect URI", () => {
    expect(read("src/routes/oauth/google.ts")).toContain("getGoogleOAuthClient(req)");
    expect(read("src/routes/oauth/google-sheets.ts")).toContain(
      "getGoogleSheetsAuthUrl(redirectUri, state)",
    );
    expect(read("src/routes/oauth/microsoft.ts")).toContain("getMicrosoftRedirectUri(req)");
    expect(read("src/routes/oauth/microsoft-graph.ts")).toContain(
      "function msGraphRedirectUri(req: express.Request, provider: MsGraphProvider)",
    );
    expect(read("src/routes/oauth/microsoft-graph.ts")).toContain(
      "getTeamsAuthUrl(redirectUri, state)",
    );
    expect(read("src/routes/oauth/microsoft-graph.ts")).toContain(
      "getExcelAuthUrl(redirectUri, state)",
    );
  });

  it("serves /api/auth/providers availability from env for Google and Microsoft, in order", () => {
    const routes = read("src/routes/auth-oauth-routes.ts");
    const helperStart = routes.indexOf("export function getOAuthProviderAvailability");
    const helperEnd = routes.indexOf('router.get("/api/auth/providers"', helperStart);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = routes.slice(helperStart, helperEnd);

    for (const [provider, prefix] of [
      ["google", "GOOGLE"],
      ["microsoft", "MICROSOFT"],
    ] as const) {
      expect(helper).toMatch(
        new RegExp(
          `${provider}:\\s*Boolean\\(\\s*process\\.env\\.${prefix}_CLIENT_ID(?:\\?\\.trim\\(\\))?\\s*&&\\s*process\\.env\\.${prefix}_CLIENT_SECRET(?:\\?\\.trim\\(\\))?\\s*,?\\s*\\)`,
        ),
      );
    }
    // Payload order keeps Google ahead of Microsoft for every consumer.
    expect(helper.indexOf("google:")).toBeLessThan(helper.indexOf("microsoft:"));
    expect(helper.indexOf("microsoft:")).toBeLessThan(helper.indexOf("yahoo:"));

    const providersStart = routes.indexOf('router.get("/api/auth/providers"');
    const providersEnd = routes.indexOf("\n});", providersStart);
    expect(providersStart).toBeGreaterThanOrEqual(0);
    expect(providersEnd).toBeGreaterThan(providersStart);
    const providersRoute = routes.slice(providersStart, providersEnd + 4);
    expect(providersRoute).toContain("providers: getOAuthProviderAvailability()");
    expect(providersRoute).not.toContain("CLIENT_SECRET");
    expect(providersRoute).not.toContain("CLIENT_ID");
  });

  it("renders Microsoft sign-in immediately after Google from the availability payload", () => {
    const panel = read("src/components/auth/AuthAccessPanel.tsx");
    const providersStart = panel.indexOf("const PROVIDERS: Array<{");
    const providersEnd = panel.indexOf("export default function AuthAccessPanel", providersStart);
    expect(providersStart).toBeGreaterThanOrEqual(0);
    expect(providersEnd).toBeGreaterThan(providersStart);
    const providers = panel.slice(providersStart, providersEnd);

    expect(providers).toContain('id: "google"');
    expect(providers).toContain('label: "Google"');
    expect(providers).toContain('id: "microsoft"');
    expect(providers).toContain('label: "Microsoft"');
    expect(providers.indexOf('id: "google"')).toBeLessThan(providers.indexOf('id: "microsoft"'));
    // Distinct provider marks, not a text-only fallback.
    expect(providers).toContain("#4285F4");
    expect(providers).toContain("#F25022");

    // Availability stays fail-closed: only env-confirmed providers render.
    expect(panel).toContain('fetch("/api/auth/providers"');
    expect(panel).toContain("google: providers.google === true");
    expect(panel).toContain("microsoft: providers.microsoft === true");
    expect(panel).toContain("availableProviders[provider.id] === true");
    expect(panel).toContain("aria-label={`Continue with ${provider.label}`}");
  });

  it("keeps sign-in scopes minimal and separate from connector scopes", () => {
    const routes = read("src/routes/auth-oauth-routes.ts");
    const googleSignIn = routes.slice(
      routes.indexOf("const GOOGLE_SIGNIN_SCOPES"),
      routes.indexOf("const MICROSOFT_SIGNIN_SCOPES"),
    );
    const microsoftSignIn = routes.slice(
      routes.indexOf("const MICROSOFT_SIGNIN_SCOPES"),
      routes.indexOf("const YAHOO_SIGNIN_SCOPES"),
    );

    expect(googleSignIn).toContain('["openid", "email", "profile"]');
    expect(microsoftSignIn).toContain('"User.Read"');
    expect(microsoftSignIn).toContain('"offline_access"');
    // Microsoft's sign-in callback reads Graph /me, which is why User.Read is
    // required; connector-only scopes must never be granted at sign-in.
    expect(routes).toContain("https://graph.microsoft.com/v1.0/me");
    for (const forbidden of ["gmail.", "drive.", "calendar.events", "Mail.", "Calendars."]) {
      expect(googleSignIn, `sign-in must not request ${forbidden}`).not.toContain(forbidden);
      expect(microsoftSignIn, `sign-in must not request ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("never lets the Email entitlement filter remove non-mail Google or Microsoft scopes", () => {
    expect(googleConnectScopes(true)).toEqual([...SCOPES]);
    const googleCallsOnly = googleConnectScopes(false);
    expect(googleCallsOnly.some((scope) => scope.includes("/gmail."))).toBe(false);
    for (const scope of [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ]) {
      expect(googleCallsOnly, `Calls-only Google scope ${scope}`).toContain(scope);
    }

    expect(microsoftConnectScopes(true)).toBe(MS_SCOPES);
    const microsoftCallsOnly = microsoftConnectScopes(false).split(" ");
    expect(microsoftCallsOnly.some((scope) => scope.startsWith("Mail."))).toBe(false);
    for (const scope of ["offline_access", "User.Read", "Calendars.ReadWrite", "Files.Read.All"]) {
      expect(microsoftCallsOnly, `Calls-only Microsoft scope ${scope}`).toContain(scope);
    }

    // Routes must consume the shared filter so the invariant cannot drift.
    expect(read("src/routes/oauth/google.ts")).toContain(
      "scope: googleConnectScopes(emailIncluded)",
    );
    expect(read("src/routes/oauth/microsoft.ts")).toContain(
      "scope: microsoftConnectScopes(emailIncluded)",
    );
  });

  it("documents the console configuration operators must apply and the reconnect requirement", () => {
    const doc = read("docs/OAUTH_PROVIDER_SETUP.md");

    expect(doc).toMatch(/Google Cloud/);
    expect(doc).toMatch(/Microsoft Entra/);
    expect(doc).toMatch(/reconnect/i);
    expect(doc).toContain("https://www.googleapis.com/auth/drive.file");
    for (const api of [
      "Gmail API",
      "Google Calendar API",
      "Google Drive API",
      "Google Sheets API",
      "Microsoft Graph",
    ]) {
      expect(doc, `documented API enablement: ${api}`).toContain(api);
    }
    for (const scope of [
      "Mail.Send",
      "Mail.Read",
      "Calendars.ReadWrite",
      "Files.Read.All",
      "Files.ReadWrite",
      "ChannelMessage.Send",
      "Team.ReadBasic.All",
      "Channel.ReadBasic.All",
      "spreadsheets",
    ]) {
      expect(doc, `documented delegated scope ${scope}`).toContain(scope);
    }

    // Durable docs are indexed exactly once from docs/README.md.
    expect(read("docs/README.md")).toContain(
      "[OAUTH_PROVIDER_SETUP.md](./OAUTH_PROVIDER_SETUP.md)",
    );
    // Canonical inventory points operators at the runbook from env comments.
    expect(read(".env.example")).toContain("docs/OAUTH_PROVIDER_SETUP.md");
  });
});
