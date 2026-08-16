/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Slack Integration Service — real OAuth 2.0 flow.
 *
 * Account Holders connect their Slack workspace via Admin → Integrations.
 * The bot token is stored encrypted in wireline_crm_connections (provider='slack').
 * Agents can post notifications to configured channels.
 */

const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_API = "https://slack.com/api";

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

interface SlackConnection {
  id: string;
  accessToken: string;
  metadata: any;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth
// ────────────────────────────────────────────────────────────────────

export function slackOAuthConfigured(): boolean {
  return !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

const SLACK_SCOPES = ["chat:write", "channels:read", "groups:read", "team:read"].join(",");

export function getSlackAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${SLACK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeSlackCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  team: { id: string; name: string };
  bot_user_id: string;
}> {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    client_secret: process.env.SLACK_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
  });

  const r = await fetchWithTimeout(
    SLACK_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!data.ok) {
    throw new Error(data.error || "Slack token exchange failed");
  }
  return {
    access_token: data.access_token,
    team: data.team || { id: "", name: "" },
    bot_user_id: data.bot_user_id || "",
  };
}

// ────────────────────────────────────────────────────────────────────
//  Token Retrieval
// ────────────────────────────────────────────────────────────────────

async function getConnection(userId: string): Promise<SlackConnection | null> {
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "slack")),
    )
    .limit(1);

  return data || null;
}

async function getToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;
  return decryptSecret(conn.accessToken);
}

// ────────────────────────────────────────────────────────────────────
//  Slack API Operations
// ────────────────────────────────────────────────────────────────────

export async function listChannels(userId: string): Promise<SlackChannel[]> {
  const token = await getToken(userId);
  if (!token) return [];

  try {
    const r = await fetchWithTimeout(
      `${SLACK_API}/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } },
      15_000,
    );
    const data = (await r.json()) as any;
    if (!data.ok) {
      log.warn("Slack channels list failed", { error: data.error });
      return [];
    }
    return (data.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private || false,
    }));
  } catch (err) {
    log.error("Slack listChannels failed", { error: getErrorMessage(err) });
    return [];
  }
}

export type SlackNotifyContext = {
  agentName?: string;
  caller?: string;
  outcome?: string;
  urgency?: "normal" | "high";
  callId?: string;
};

export function pickDefaultChannelId(channels: SlackChannel[]): string | null {
  const general = channels.find((c) => c.name === "general");
  if (general) return general.id;
  const pub = channels.find((c) => !c.is_private);
  return pub?.id ?? channels[0]?.id ?? null;
}

export async function bootstrapDefaultChannel(userId: string): Promise<string | null> {
  const existing = await getDefaultChannel(userId);
  if (existing) return existing;
  const channels = await listChannels(userId);
  const pick = pickDefaultChannelId(channels);
  if (pick) await setDefaultChannel(userId, pick);
  return pick;
}

function buildSlackBlocks(text: string, ctx?: SlackNotifyContext): unknown[] {
  const header =
    ctx?.urgency === "high"
      ? ":rotating_light: *Wireline, urgent*"
      : ":robot_face: *Wireline agent*";
  const fields: string[] = [];
  if (ctx?.agentName) fields.push("*Agent:* " + ctx.agentName);
  if (ctx?.caller) fields.push("*Caller:* " + ctx.caller);
  if (ctx?.outcome) fields.push("*Outcome:* " + ctx.outcome);
  if (ctx?.callId) fields.push("*Call:* `" + ctx.callId + "`");
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: header + "\n" + text } },
  ];
  if (fields.length) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: fields.join("  ·  ") }],
    });
  }
  return blocks;
}

export async function postAgentNotification(
  userId: string,
  message: string,
  ctx?: SlackNotifyContext,
): Promise<boolean> {
  const channel = (await getDefaultChannel(userId)) || (await bootstrapDefaultChannel(userId));
  if (!channel) {
    log.warn("Slack: no default channel, connect Slack and pick a channel in Admin");
    return false;
  }
  const fallback = ctx?.urgency === "high" ? "🚨 " + message : message;
  return postMessage(userId, channel, fallback, buildSlackBlocks(message, ctx));
}

export async function postMessage(
  userId: string,
  channel: string,
  text: string,
  blocks?: any[],
): Promise<boolean> {
  const token = await getToken(userId);
  if (!token) {
    log.warn("Slack not connected, skipping message");
    return false;
  }

  try {
    const body: any = { channel, text };
    if (blocks) body.blocks = blocks;

    const r = await fetchWithTimeout(
      `${SLACK_API}/chat.postMessage`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      10_000,
    );
    const data = (await r.json()) as any;
    if (!data.ok) {
      log.warn("Slack postMessage failed", { error: data.error, channel });
      return false;
    }
    try {
      const { dispatchWebhook } = await import("./webhook-helpers");
      await dispatchWebhook(userId, "slack.message_sent", {
        channel,
        ts: data.ts,
        ok: true,
      });
    } catch {
      /* non-fatal */
    }
    return true;
  } catch (err) {
    log.error("Slack postMessage error", { error: getErrorMessage(err) });
    return false;
  }
}

export async function getDefaultChannel(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn?.metadata) return null;
  return (conn.metadata as any).default_channel || null;
}

export async function setDefaultChannel(userId: string, channelId: string): Promise<void> {
  const conn = await getConnection(userId);
  if (!conn) return;
  const meta = (conn.metadata || {}) as any;
  meta.default_channel = channelId;
  await drizzle
    .update(schema.crmConnections)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(schema.crmConnections.id, conn.id));
}

export async function disconnectSlack(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "slack");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "slack")),
    );
}
