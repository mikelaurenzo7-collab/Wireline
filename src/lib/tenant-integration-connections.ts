import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { type AgentToolName, SHOPIFY_TOOL_NAMES, SQUARE_TOOL_NAMES } from "./agent-capabilities";
import {
  loadPlatformIntegrationFlags,
  type PlatformIntegrationFlags,
} from "./platform-integration-flags";
import { X_ENGAGEMENT_TOOL_NAMES } from "./x-service";

const CRM_TOOL_NAMES = new Set<AgentToolName>([
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_opportunity",
  "crm_create_contact",
  "crm_update_deal_stage",
]);

/**
 * These services currently use Wireline-owned platform credentials and do not
 * have a tenant account/template/pixel ownership registry. They must not be
 * exposed to arbitrary live tenant agents: X Ads would disclose Wireline's
 * campaign data, DocuSign would send from Wireline's account, and Meta lead
 * events would pollute Wireline's conversion destination.
 *
 * The underlying server services remain available to deliberate internal
 * workflows. Re-enable live use only after the resource is bound to userId.
 */
export const UNSCOPED_PLATFORM_LIVE_TOOL_NAMES = new Set<AgentToolName>([
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
  "send_contract",
  "meta_submit_lead",
]);

export interface TenantIntegrationConnections {
  shopify: boolean;
  square: boolean;
  slack: boolean;
  x: boolean;
  microsoft_teams: boolean;
  microsoft_excel: boolean;
  google_sheets: boolean;
  salesforce: boolean;
  hubspot: boolean;
  zoom: boolean;
  /** Google Calendar OAuth (calendarAccounts). */
  google_calendar: boolean;
  /** Microsoft 365 Calendar OAuth. */
  microsoft_calendar: boolean;
  /** Gmail / Google mail OAuth (emailAccounts). */
  google_mail: boolean;
  /** Microsoft Outlook mail OAuth. */
  microsoft_mail: boolean;
}

const SHOPIFY_SET = new Set<string>(SHOPIFY_TOOL_NAMES);
const SQUARE_SET = new Set<string>(SQUARE_TOOL_NAMES);
const X_ENGAGEMENT_SET = new Set<string>(X_ENGAGEMENT_TOOL_NAMES);

/** Active CRM OAuth rows for a tenant — used to gate voice tool schemas. */
export async function loadTenantIntegrationConnections(
  userId: string,
): Promise<TenantIntegrationConnections> {
  const [crmRows, calendarRows, emailRows] = await Promise.all([
    drizzle
      .select({
        provider: schema.crmConnections.provider,
        active: schema.crmConnections.active,
      })
      .from(schema.crmConnections)
      .where(eq(schema.crmConnections.userId, userId)),
    drizzle
      .select({ provider: schema.calendarAccounts.provider })
      .from(schema.calendarAccounts)
      .where(eq(schema.calendarAccounts.userId, userId)),
    drizzle
      .select({ provider: schema.emailAccounts.provider })
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.userId, userId)),
  ]);

  const providers = new Set(crmRows.filter((r) => r.active !== false).map((r) => r.provider));
  const calendarProviders = new Set(
    calendarRows.map((r) => (r.provider || "google").toLowerCase()),
  );
  const mailProviders = new Set(emailRows.map((r) => (r.provider || "google").toLowerCase()));

  return {
    shopify: providers.has("shopify"),
    square: providers.has("square"),
    slack: providers.has("slack"),
    x: providers.has("x"),
    microsoft_teams: providers.has("microsoft_teams"),
    microsoft_excel: providers.has("microsoft_excel"),
    google_sheets: providers.has("google_sheets"),
    salesforce: providers.has("salesforce"),
    hubspot: providers.has("hubspot"),
    zoom: providers.has("zoom"),
    google_calendar: calendarProviders.has("google"),
    microsoft_calendar: calendarProviders.has("microsoft") || calendarProviders.has("microsoft365"),
    google_mail: mailProviders.has("google"),
    microsoft_mail: mailProviders.has("microsoft") || mailProviders.has("microsoft365"),
  };
}

export function filterToolsByTenantConnections(
  toolNames: readonly AgentToolName[],
  conn: TenantIntegrationConnections,
  platform: PlatformIntegrationFlags = loadPlatformIntegrationFlags(),
): AgentToolName[] {
  return toolNames.filter((name) => {
    if (UNSCOPED_PLATFORM_LIVE_TOOL_NAMES.has(name)) return false;
    if (SHOPIFY_SET.has(name)) return conn.shopify;
    if (SQUARE_SET.has(name)) return conn.square;
    if (name === "send_slack_notification") return conn.slack;
    if (X_ENGAGEMENT_SET.has(name)) return conn.x;
    if (name === "send_teams_message") return conn.microsoft_teams;
    if (name === "log_to_excel") return conn.microsoft_excel;
    if (name === "log_to_google_sheets") return conn.google_sheets;
    if (name === "generate_zoom_link") return conn.zoom;
    if (name === "check_calendar_availability" || name === "book_appointment") {
      return conn.google_calendar || conn.microsoft_calendar;
    }
    if (CRM_TOOL_NAMES.has(name)) return conn.salesforce || conn.hubspot;
    if (name === "enrich_lead") return platform.apollo;
    if (name === "gemini_ground") return platform.liveResearch;
    return true;
  });
}
