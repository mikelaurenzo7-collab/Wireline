import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { type AgentToolName, SHOPIFY_TOOL_NAMES, SQUARE_TOOL_NAMES } from "./agent-capabilities";
import {
  loadPlatformIntegrationFlags,
  type PlatformIntegrationFlags,
} from "./platform-integration-flags";

const CRM_TOOL_NAMES = new Set<AgentToolName>([
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_opportunity",
]);

export interface TenantIntegrationConnections {
  shopify: boolean;
  square: boolean;
  slack: boolean;
  microsoft_teams: boolean;
  microsoft_excel: boolean;
  salesforce: boolean;
  hubspot: boolean;
  zoom: boolean;
}

const SHOPIFY_SET = new Set<string>(SHOPIFY_TOOL_NAMES);
const SQUARE_SET = new Set<string>(SQUARE_TOOL_NAMES);

/** Active CRM OAuth rows for a tenant — used to gate voice tool schemas. */
export async function loadTenantIntegrationConnections(
  userId: string,
): Promise<TenantIntegrationConnections> {
  const rows = await drizzle
    .select({ provider: schema.crmConnections.provider })
    .from(schema.crmConnections)
    .where(eq(schema.crmConnections.userId, userId));

  const providers = new Set(rows.map((r) => r.provider));
  return {
    shopify: providers.has("shopify"),
    square: providers.has("square"),
    slack: providers.has("slack"),
    microsoft_teams: providers.has("microsoft_teams"),
    microsoft_excel: providers.has("microsoft_excel"),
    salesforce: providers.has("salesforce"),
    hubspot: providers.has("hubspot"),
    zoom: providers.has("zoom"),
  };
}

export function filterToolsByTenantConnections(
  toolNames: readonly AgentToolName[],
  conn: TenantIntegrationConnections,
  platform: PlatformIntegrationFlags = loadPlatformIntegrationFlags(),
): AgentToolName[] {
  return toolNames.filter((name) => {
    if (SHOPIFY_SET.has(name)) return conn.shopify;
    if (SQUARE_SET.has(name)) return conn.square;
    if (name === "send_slack_notification") return conn.slack;
    if (name === "send_teams_message") return conn.microsoft_teams;
    if (name === "log_to_excel") return conn.microsoft_excel;
    if (name === "generate_zoom_link") return conn.zoom;
    if (CRM_TOOL_NAMES.has(name)) return conn.salesforce || conn.hubspot;
    if (name === "enrich_lead") return platform.apollo;
    if (name === "send_contract") return platform.docusign;
    if (name === "gemini_ground") return platform.gemini;
    return true;
  });
}
