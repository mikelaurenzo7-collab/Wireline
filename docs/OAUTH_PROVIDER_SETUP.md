# Google and Microsoft OAuth provider setup

**Role:** canonical provider-console configuration for BotBound sign-in and for
every Google Workspace / Microsoft 365 connector (Gmail, Outlook, Calendar,
Drive, OneDrive, Sheets, Excel, Teams, and generated file artifacts).

**Scope:** external console values only. Origin/cutover sequencing, dashboard
inventory, and launch acceptance live in
[BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md](./BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md).
Runtime source of truth: `src/routes/auth-oauth-routes.ts`,
`src/routes/oauth/`, `src/lib/oauth-helpers.ts`,
`src/lib/google-sheets-service.ts`, and `src/lib/microsoft-graph-service.ts`.

The server derives every redirect URI from `APP_URL` (`src/lib/app-url.ts`);
production requires exactly `https://botbound.app`. Do not register ephemeral
Preview hosts. Print the authoritative inventory for any origin with:

```bash
node scripts/print-oauth-redirects.mjs
node scripts/print-oauth-redirects.mjs http://localhost:3000
```

## One client per provider

| Provider  | Environment variables                            | Shared by                                                                                              |
| --------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Google    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | Account sign-in, Gmail + Calendar + Drive workspace connection, Google Sheets + Drive file connection  |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Account sign-in, Outlook mail + Calendar + Files connection, Microsoft Teams, Microsoft Excel/OneDrive |

Both providers use one OAuth client per provider. Adding a surface means adding
a redirect URI and delegated scopes to the existing registration, never a new
client (except for a deliberate development/production split).

## Redirect URI matrix

Production values below are the only registrations required for the launch
origin. Add the `http://localhost:3000` equivalents for local development when
the provider allows multiple redirect URIs.

| Provider app | Surface                                    | Production redirect URI                                   | Owning code                                                                          |
| ------------ | ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Google       | Account sign-in                            | `https://botbound.app/api/auth/google/callback`           | `src/routes/auth-oauth-routes.ts` (`GOOGLE_SIGNIN_SCOPES`)                           |
| Google       | Gmail + Calendar + Drive workspace connect | `https://botbound.app/api/oauth/google/callback`          | `src/routes/oauth/google.ts`; `getGoogleOAuthClient()` in `src/lib/oauth-helpers.ts` |
| Google       | Google Sheets + Drive files                | `https://botbound.app/api/oauth/google_sheets/callback`   | `src/routes/oauth/google-sheets.ts`                                                  |
| Microsoft    | Account sign-in                            | `https://botbound.app/api/auth/microsoft/callback`        | `src/routes/auth-oauth-routes.ts` (`MICROSOFT_SIGNIN_SCOPES`)                        |
| Microsoft    | Outlook mail + Calendar + Files            | `https://botbound.app/api/oauth/microsoft/callback`       | `src/routes/oauth/microsoft.ts`; `getMicrosoftRedirectUri()`                         |
| Microsoft    | Microsoft Teams                            | `https://botbound.app/api/oauth/microsoft_teams/callback` | `src/routes/oauth/microsoft-graph.ts` (`MS_TEAMS_SCOPES`)                            |
| Microsoft    | Microsoft Excel + OneDrive                 | `https://botbound.app/api/oauth/microsoft_excel/callback` | `src/routes/oauth/microsoft-graph.ts` (`MS_EXCEL_SCOPES`)                            |

`tests/google-microsoft-connector-scopes-contract.test.ts` fails if a route
registers a callback path that is not in this document, or if a documented URI
is not registered by exactly one route file.

## Google Cloud configuration

1. Create or reuse the project that owns the BotBound production OAuth client.
2. **APIs & Services → OAuth consent screen**: configure an External user type
   (or Internal only for a private Workspace-only deployment). Keep the
   app name, support email, and authorized domain as `botbound.app`. Add the
   delegated scopes below. Gmail and Drive read scopes require Google's
   sensitive/restricted-scope review before public use; an unverified External
   app is limited to its listed test users, so keep the app in Testing with
   explicit test users until verification completes.
3. **APIs & Services → Credentials → OAuth 2.0 Client ID → Web application**:
   add the three Google redirect URIs above (plus local development URIs) and
   set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the Render environment.
4. **APIs & Services → Enable APIs**: enable Gmail API, Google Calendar API,
   Google Drive API, and Google Sheets API. Google sign-in itself needs no
   additional API enablement.

### Delegated scopes per Google surface

| Surface               | Scopes requested                                                                                                | Code constant                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sign-in               | `openid`, `email`, `profile`                                                                                    | `GOOGLE_SIGNIN_SCOPES`                                       |
| Gmail                 | `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly`                  | `SCOPES` in `src/lib/oauth-helpers.ts`                       |
| Calendar              | `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.readonly`          | `SCOPES`                                                     |
| Drive (read/import)   | `https://www.googleapis.com/auth/drive.readonly`                                                                | `SCOPES`                                                     |
| Drive (create/export) | `https://www.googleapis.com/auth/drive.file`                                                                    | `SCOPES` and `GOOGLE_SHEETS_SCOPES`                          |
| Identity              | `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`            | `SCOPES`                                                     |
| Google Sheets         | `openid`, `email`, `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.file` | `GOOGLE_SHEETS_SCOPES` in `src/lib/google-sheets-service.ts` |

`drive.file` is the narrowest write scope that supports `files.create` for
artifacts BotBound creates. The broad `https://www.googleapis.com/auth/drive`
scope is never requested.

## Microsoft Entra configuration

1. **Microsoft Entra admin center → App registrations → New registration**.
   Supported account types: _Accounts in any organizational directory and
   personal Microsoft accounts_ (the same registration serves personal MSA and
   work/school tenants). Keep implicit grant disabled; BotBound uses the
   authorization-code flow with a confidential client secret.
2. **Authentication → Platform configurations → Web → Redirect URIs**: add the
   four Microsoft redirect URIs above (plus local development URIs).
3. **Certificates & secrets**: create a client secret and set
   `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. Rotate before expiry;
   a half-configured pair fails production env validation closed.
4. **API permissions → Microsoft Graph → Delegated permissions**: add the
   scopes below, then **Grant admin consent** for organizational tenants where
   required. Graph application permissions are never used: all connector calls
   are `/me`-scoped.

### Delegated scopes per Microsoft surface

| Surface                              | Scopes requested                                                                                                          | Code constant                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sign-in                              | `openid`, `email`, `profile`, `offline_access`, `User.Read` (`User.Read` is required for the callback's Graph `/me` read) | `MICROSOFT_SIGNIN_SCOPES`                                 |
| Outlook mail                         | `Mail.Send`, `Mail.Read`                                                                                                  | `MS_SCOPES` in `src/lib/oauth-helpers.ts`                 |
| Outlook Calendar                     | `Calendars.ReadWrite`                                                                                                     | `MS_SCOPES`                                               |
| Outlook Files                        | `Files.Read.All`                                                                                                          | `MS_SCOPES`                                               |
| Identity/refresh                     | `offline_access`, `User.Read`                                                                                             | `MS_SCOPES`                                               |
| Microsoft Teams                      | `offline_access`, `openid`, `profile`, `User.Read`, `ChannelMessage.Send`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`  | `MS_TEAMS_SCOPES` in `src/lib/microsoft-graph-service.ts` |
| Microsoft Excel / OneDrive artifacts | `offline_access`, `openid`, `profile`, `User.Read`, `Files.ReadWrite`                                                     | `MS_EXCEL_SCOPES`                                         |

Teams channel posting also depends on tenant policy: the consenting account
must be a member of the target team and the tenant must allow third-party apps
to post channel messages. Those are customer tenant settings, not BotBound
scopes; surface the failure in the connect flow instead of widening scopes.

## Email entitlement filtering

The Google and Microsoft workspace connections are also the calendar/file
connectors, so the Email channel entitlement must never remove non-mail scopes.
The server filters by scope name, not by array position:

- `googleConnectScopes(false)` drops scopes containing `/gmail.` and keeps
  identity, Calendar, and Drive scopes (`src/lib/oauth-helpers.ts`).
- `microsoftConnectScopes(false)` drops scopes starting with `Mail.` and keeps
  `Calendars.ReadWrite` and `Files.Read.All`.

Connector routes read this state from the tenant entitlement service at both
`/url` and `/callback`, fail closed when it cannot be resolved, and persist the
granted scope string so `/api/oauth/integration-health` can flag stale grants.

## Reconnect and scope-upgrade note

- `https://www.googleapis.com/auth/drive.file` was added to the Google
  workspace connect scopes so the Google connection can create files in Drive;
  the previous grant requested only `drive.readonly`, which cannot call
  `files.create`. Existing Google grants keep their earlier scope set, so
  read-only Drive import continues to work. **Reconnect Google** (Connections →
  Email & Calendar → Connect Google) to grant the write scope. This mirrors the
  existing calendar scope-upgrade behavior: `googleGrantedScopesAllowCalendarWrite()`
  flags grants that predate `calendar.events`, and the integration-health
  surface tells the Account Holder to reconnect.
- The Google Sheets connection has requested `drive.file` since it shipped, so
  report exports saved to Google Drive do not need a Sheets reconnect.
- No Microsoft scope changed in this pass; existing Outlook, Teams, and Excel
  connections remain valid. If an older Excel/OneDrive grant predates
  `Files.ReadWrite`, reconnect Microsoft Excel to restore artifact uploads.
- Scope upgrades are additive: a grant that predates `drive.file` keeps serving
  read-only Drive imports, and a Drive write it cannot perform returns the
  provider's authorization error. Reconnecting grants the new scope; BotBound
  never silently downgrades or widens an existing grant.

## Operator verification

1. `node scripts/print-oauth-redirects.mjs` prints every callback for
   `APP_URL`; confirm each one is registered in the matching console.
2. `GET /api/auth/providers` returns `{ google, microsoft, yahoo }` booleans
   derived only from env presence; both must be `true` before launch. The
   sign-in panel renders Google first, then Microsoft, when available.
3. `GET /api/oauth/crm/status` (authenticated) reports `configured` for
   `google_sheets`, `microsoft_teams`, and `microsoft_excel`.
4. Complete one sign-in and one connect/disconnect cycle per surface on the
   canonical origin. Reconnect Google once to confirm the new `drive.file`
   consent, then export one report to Drive and one to OneDrive.

## Related documents

- [BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md](./BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md) — origin cutover, dashboard fields, and launch acceptance.
- [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) — Render environment and release verification.
- [security/auth-password-controls.md](./security/auth-password-controls.md) — session and password posture that OAuth sign-in coexists with.
- `.env.example` — canonical environment inventory.
