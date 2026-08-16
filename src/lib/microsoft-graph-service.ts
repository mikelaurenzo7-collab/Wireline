import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Microsoft Graph Integration Service — Teams + Excel.
 *
 * Two independent, least-privilege OAuth connections:
 *   provider 'microsoft_teams' — post channel notifications
 *   provider 'microsoft_excel' — append call rows to a managed workbook
 *
 * Deliberately separate from the Outlook mail/calendar connection
 * (which lives in emailAccounts / calendarAccounts). These live in
 * crmConnections and never touch the Outlook flow, so connecting
 * Teams or Excel can never disturb an Account Holder's existing email sync.
 *
 * Microsoft access tokens last ~1 hour; tokens are stored encrypted
 * and auto-refreshed when within 5 minutes of expiry.
 */

const MS_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

export const MS_TEAMS_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
].join(" ");

export const MS_EXCEL_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Files.ReadWrite",
].join(" ");

export type MsGraphProvider = "microsoft_teams" | "microsoft_excel";

export interface TeamsChannelOption {
  team_id: string;
  team_name: string;
  channel_id: string;
  channel_name: string;
}

export function microsoftGraphConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function buildAuthUrl(redirectUri: string, state: string, scope: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope,
    state,
  });
  return `${MS_AUTHORITY}/authorize?${params.toString()}`;
}

export function getTeamsAuthUrl(redirectUri: string, state: string): string {
  return buildAuthUrl(redirectUri, state, MS_TEAMS_SCOPES);
}

export function getExcelAuthUrl(redirectUri: string, state: string): string {
  return buildAuthUrl(redirectUri, state, MS_EXCEL_SCOPES);
}

interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeMicrosoftGraphCode(
  code: string,
  redirectUri: string,
): Promise<MsTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetchWithTimeout(
    `${MS_AUTHORITY}/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as MsTokenResponse;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed");
  }
  return data;
}

async function refreshGraphToken(refreshToken: string): Promise<MsTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetchWithTimeout(
    `${MS_AUTHORITY}/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as MsTokenResponse;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Microsoft token refresh failed");
  }
  return data;
}

export async function getMicrosoftAccountEmail(accessToken: string): Promise<string> {
  try {
    const r = await fetchWithTimeout(
      `${GRAPH}/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      10_000,
    );
    const data = (await r.json()) as { mail?: string; userPrincipalName?: string };
    return data.mail || data.userPrincipalName || "microsoft-account";
  } catch {
    return "microsoft-account";
  }
}

interface GraphConnection {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
}

async function getConnection(
  userId: string,
  provider: MsGraphProvider,
): Promise<GraphConnection | null> {
  if (!userId) return null;
  const [conn] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, provider)),
    )
    .limit(1);
  if (!conn) return null;
  return {
    id: conn.id,
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.expiresAt,
    metadata: (conn.metadata as Record<string, unknown>) || {},
  };
}

/** Returns a valid (auto-refreshed) access token, or null when not connected. */
async function getAccessToken(userId: string, provider: MsGraphProvider): Promise<string | null> {
  const conn = await getConnection(userId, provider);
  if (!conn) return null;

  let token: string;
  let refresh: string | null = null;
  try {
    token = decryptSecret(conn.accessToken);
    if (conn.refreshToken) refresh = decryptSecret(conn.refreshToken);
  } catch (err) {
    log.error("Microsoft Graph token decrypt failed", { provider, error: getErrorMessage(err) });
    return null;
  }

  const expiringSoon = !conn.expiresAt || conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (expiringSoon && refresh) {
    try {
      const refreshed = await refreshGraphToken(refresh);
      token = refreshed.access_token;
      await drizzle
        .update(schema.crmConnections)
        .set({
          accessToken: encryptSecret(refreshed.access_token),
          refreshToken: refreshed.refresh_token
            ? encryptSecret(refreshed.refresh_token)
            : conn.refreshToken,
          expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.crmConnections.id, conn.id));
    } catch (err) {
      log.error("Microsoft Graph token refresh failed", {
        provider,
        error: getErrorMessage(err),
      });
      // Fall through with the existing token — it may not be expired yet.
    }
  }
  return token;
}

async function patchMetadata(connId: string, patch: Record<string, unknown>): Promise<void> {
  const [conn] = await drizzle
    .select({ metadata: schema.crmConnections.metadata })
    .from(schema.crmConnections)
    .where(eq(schema.crmConnections.id, connId))
    .limit(1);
  const meta = { ...((conn?.metadata as Record<string, unknown>) || {}), ...patch };
  await drizzle
    .update(schema.crmConnections)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(schema.crmConnections.id, connId));
}

// ────────────────────────────────────────────────────────────────────
//  Teams — channel notifications
// ────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** List teams + channels the Account Holder can post to (for Admin channel picker). */
export async function listTeamsNotifyTargets(userId: string): Promise<TeamsChannelOption[]> {
  const token = await getAccessToken(userId, "microsoft_teams");
  if (!token) return [];

  try {
    const teamsRes = await fetchWithTimeout(
      `${GRAPH}/me/joinedTeams`,
      { headers: { Authorization: `Bearer ${token}` } },
      15_000,
    );
    const teamsData = (await teamsRes.json()) as {
      value?: { id: string; displayName: string }[];
    };
    const teams = teamsData.value || [];
    const out: TeamsChannelOption[] = [];

    for (const team of teams.slice(0, 12)) {
      const chRes = await fetchWithTimeout(
        `${GRAPH}/teams/${team.id}/channels`,
        { headers: { Authorization: `Bearer ${token}` } },
        10_000,
      );
      if (!chRes.ok) continue;
      const chData = (await chRes.json()) as {
        value?: { id: string; displayName: string }[];
      };
      for (const ch of (chData.value || []).slice(0, 25)) {
        out.push({
          team_id: team.id,
          team_name: team.displayName,
          channel_id: ch.id,
          channel_name: ch.displayName,
        });
      }
    }
    return out;
  } catch (err) {
    log.error("Microsoft Teams list targets failed", { error: getErrorMessage(err) });
    return [];
  }
}

export async function setTeamsNotifyTarget(
  userId: string,
  teamId: string,
  channelId: string,
  labels?: { team_name?: string; channel_name?: string },
): Promise<void> {
  const conn = await getConnection(userId, "microsoft_teams");
  if (!conn) return;
  await patchMetadata(conn.id, {
    team_id: teamId,
    channel_id: channelId,
    team_name: labels?.team_name,
    channel_name: labels?.channel_name,
  });
}

/** After Teams OAuth, cache the first team/channel when none is selected yet. */
export async function bootstrapTeamsNotifyTarget(userId: string): Promise<boolean> {
  const conn = await getConnection(userId, "microsoft_teams");
  if (!conn) return false;
  const meta = conn.metadata as Record<string, unknown>;
  if (meta.team_id && meta.channel_id) return true;

  const targets = await listTeamsNotifyTargets(userId);
  const first = targets[0];
  if (!first) return false;

  await setTeamsNotifyTarget(userId, first.team_id, first.channel_id, {
    team_name: first.team_name,
    channel_name: first.channel_name,
  });
  return true;
}

/** Resolve (and cache) the Account Holder's default team + channel. */
async function resolveTeamsTarget(
  token: string,
  conn: GraphConnection,
): Promise<{ teamId: string; channelId: string } | null> {
  const cachedTeam = conn.metadata.team_id as string | undefined;
  const cachedChannel = conn.metadata.channel_id as string | undefined;
  if (cachedTeam && cachedChannel) return { teamId: cachedTeam, channelId: cachedChannel };

  const teamsRes = await fetchWithTimeout(
    `${GRAPH}/me/joinedTeams`,
    { headers: { Authorization: `Bearer ${token}` } },
    10_000,
  );
  const teamsData = (await teamsRes.json()) as {
    value?: { id: string; displayName: string }[];
  };
  const team = teamsData.value?.[0];
  if (!team) return null;

  const chRes = await fetchWithTimeout(
    `${GRAPH}/teams/${team.id}/primaryChannel`,
    { headers: { Authorization: `Bearer ${token}` } },
    10_000,
  );
  const channel = (await chRes.json()) as { id?: string; displayName?: string };
  if (!channel.id) return null;

  await patchMetadata(conn.id, {
    team_id: team.id,
    team_name: team.displayName,
    channel_id: channel.id,
    channel_name: channel.displayName,
  });
  return { teamId: team.id, channelId: channel.id };
}

function buildTeamsHtml(params: {
  text: string;
  context?: { agentName?: string; caller?: string; outcome?: string };
}): string {
  const lines: string[] = ["<strong>Wireline</strong>"];
  const ctx = params.context;
  if (ctx?.agentName) lines.push(`Agent: ${escapeHtml(ctx.agentName)}`);
  if (ctx?.caller) lines.push(`Caller: ${escapeHtml(ctx.caller)}`);
  if (ctx?.outcome) lines.push(`Outcome: ${escapeHtml(ctx.outcome)}`);
  lines.push(escapeHtml(params.text));
  return lines.join("<br>");
}

export async function sendTeamsMessage(params: {
  userId: string;
  text: string;
  context?: { agentName?: string; caller?: string; outcome?: string };
}): Promise<boolean> {
  const token = await getAccessToken(params.userId, "microsoft_teams");
  if (!token) {
    log.warn("Microsoft Teams not connected, skipping message");
    return false;
  }
  const conn = await getConnection(params.userId, "microsoft_teams");
  if (!conn) return false;

  try {
    const target = await resolveTeamsTarget(token, conn);
    if (!target) {
      log.warn("Microsoft Teams: no team/channel available for this account");
      return false;
    }
    const r = await fetchWithTimeout(
      `${GRAPH}/teams/${target.teamId}/channels/${target.channelId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: {
            contentType: "html",
            content: buildTeamsHtml(params),
          },
        }),
      },
      10_000,
    );
    if (!r.ok) {
      log.warn("Microsoft Teams sendMessage failed", { status: r.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("Microsoft Teams sendMessage error", { error: getErrorMessage(err) });
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
//  Excel — managed call-log workbook
// ────────────────────────────────────────────────────────────────────

const EXCEL_FILE_NAME = "Wireline Call Log.xlsx";
const EXCEL_HEADERS = ["Logged", "Caller", "Outcome", "Details"];

/** Ensure the managed workbook + table exist; ids are cached in metadata. */
async function ensureWorkbook(
  token: string,
  conn: GraphConnection,
): Promise<{ itemId: string; tableName: string } | null> {
  const cachedItem = conn.metadata.workbook_id as string | undefined;
  const cachedTable = conn.metadata.table_name as string | undefined;
  if (cachedItem && cachedTable) return { itemId: cachedItem, tableName: cachedTable };

  const auth = { Authorization: `Bearer ${token}` };

  // Find the workbook in the OneDrive root, or create it.
  let itemId: string | undefined;
  const findRes = await fetchWithTimeout(
    `${GRAPH}/me/drive/root:/${encodeURIComponent(EXCEL_FILE_NAME)}`,
    { headers: auth },
    10_000,
  );
  if (findRes.ok) {
    itemId = ((await findRes.json()) as { id?: string }).id;
  } else {
    const createRes = await fetchWithTimeout(
      `${GRAPH}/me/drive/root/children`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: EXCEL_FILE_NAME,
          file: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
      15_000,
    );
    if (!createRes.ok) {
      log.warn("Excel workbook create failed", { status: createRes.status });
      return null;
    }
    itemId = ((await createRes.json()) as { id?: string }).id;
  }
  if (!itemId) return null;

  // First worksheet name (default "Sheet1", but read it to be safe).
  const wsRes = await fetchWithTimeout(
    `${GRAPH}/me/drive/items/${itemId}/workbook/worksheets`,
    { headers: auth },
    10_000,
  );
  if (!wsRes.ok) {
    log.warn("Excel worksheets read failed", { status: wsRes.status });
    return null;
  }
  const wsName = ((await wsRes.json()) as { value?: { name: string }[] }).value?.[0]?.name;
  if (!wsName) return null;

  // Reuse an existing table if one is already present.
  let tableName: string | undefined;
  const tblRes = await fetchWithTimeout(
    `${GRAPH}/me/drive/items/${itemId}/workbook/tables`,
    { headers: auth },
    10_000,
  );
  if (tblRes.ok) {
    tableName = ((await tblRes.json()) as { value?: { name: string }[] }).value?.[0]?.name;
  }

  if (!tableName) {
    const endCol = String.fromCharCode(64 + EXCEL_HEADERS.length);
    await fetchWithTimeout(
      `${GRAPH}/me/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(wsName)}')/range(address='A1:${endCol}1')`,
      {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [EXCEL_HEADERS] }),
      },
      10_000,
    );
    const addRes = await fetchWithTimeout(
      `${GRAPH}/me/drive/items/${itemId}/workbook/tables/add`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${wsName}!A1:${endCol}1`, hasHeaders: true }),
      },
      10_000,
    );
    if (!addRes.ok) {
      log.warn("Excel table create failed", { status: addRes.status });
      return null;
    }
    tableName = ((await addRes.json()) as { name?: string }).name;
  }
  if (!tableName) return null;

  await patchMetadata(conn.id, { workbook_id: itemId, table_name: tableName });
  return { itemId, tableName };
}

export async function logToExcel(params: {
  userId: string;
  caller: string;
  outcome: string;
  details: string;
}): Promise<boolean> {
  const token = await getAccessToken(params.userId, "microsoft_excel");
  if (!token) {
    log.warn("Microsoft Excel not connected, skipping log");
    return false;
  }
  const conn = await getConnection(params.userId, "microsoft_excel");
  if (!conn) return false;

  try {
    const wb = await ensureWorkbook(token, conn);
    if (!wb) return false;
    const r = await fetchWithTimeout(
      `${GRAPH}/me/drive/items/${wb.itemId}/workbook/tables/${encodeURIComponent(wb.tableName)}/rows/add`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[new Date().toISOString(), params.caller, params.outcome, params.details]],
        }),
      },
      10_000,
    );
    if (!r.ok) {
      log.warn("Excel row append failed", { status: r.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("Excel logToExcel error", { error: getErrorMessage(err) });
    return false;
  }
}

export async function disconnectMicrosoftGraph(
  userId: string,
  provider: MsGraphProvider,
): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, provider);
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, provider)),
    );
}
