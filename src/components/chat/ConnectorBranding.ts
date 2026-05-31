/**
 * ConnectorBranding — canonical brand identities for every Wireline integration.
 *
 * Used by ToolCallTheater, IntegrationActivityCard, and the connector health
 * strip in the agent header to keep branding consistent across the product.
 */
import type { ToolIntegration } from "../../lib/agent-capabilities";
import { AGENT_TOOL_CATALOG } from "../../lib/agent-capabilities";

export interface ConnectorBrand {
  name: string;
  abbreviation: string;
  /** Primary brand color — used for borders, icon backgrounds, scan lines. */
  color: string;
  /** Darker secondary for gradients. */
  secondaryColor: string;
  /** Keywords that hint this connector is relevant to a user message. */
  keywords: string[];
  /** Generic action verb shown while executing. */
  actionVerb: string;
}

export const CONNECTOR_BRANDS: Record<ToolIntegration, ConnectorBrand> = {
  shopify: {
    name: "Shopify",
    abbreviation: "SH",
    color: "#96BF48",
    secondaryColor: "#578A00",
    keywords: [
      "order",
      "product",
      "inventory",
      "shopify",
      "store",
      "return",
      "cancel",
      "discount",
      "shipping",
    ],
    actionVerb: "Querying store",
  },
  square: {
    name: "Square",
    abbreviation: "SQ",
    color: "#3E4348",
    secondaryColor: "#1A1A1A",
    keywords: ["square", "payment", "invoice", "pos", "checkout"],
    actionVerb: "Querying payments",
  },
  crm: {
    name: "HubSpot CRM",
    abbreviation: "HS",
    color: "#FF7A59",
    secondaryColor: "#C94D2B",
    keywords: [
      "crm",
      "contact",
      "lead",
      "hubspot",
      "salesforce",
      "deal",
      "opportunity",
      "pipeline",
    ],
    actionVerb: "Querying CRM",
  },
  calendar: {
    name: "Calendar",
    abbreviation: "CAL",
    color: "#4285F4",
    secondaryColor: "#1A56C4",
    keywords: [
      "calendar",
      "appointment",
      "book",
      "schedule",
      "availability",
      "meeting",
      "slot",
      "time",
    ],
    actionVerb: "Checking availability",
  },
  twilio: {
    name: "Twilio",
    abbreviation: "TWL",
    color: "#F22F46",
    secondaryColor: "#B5001F",
    keywords: ["text", "sms", "whatsapp", "twilio", "message"],
    actionVerb: "Sending message",
  },
  slack: {
    name: "Slack",
    abbreviation: "SL",
    color: "#7B5EA7",
    secondaryColor: "#4A154B",
    keywords: ["slack", "notify", "channel", "team", "notification"],
    actionVerb: "Posting to Slack",
  },
  zoom: {
    name: "Zoom",
    abbreviation: "ZM",
    color: "#2D8CFF",
    secondaryColor: "#0063CC",
    keywords: ["zoom", "video", "link", "meeting"],
    actionVerb: "Generating link",
  },
  docusign: {
    name: "DocuSign",
    abbreviation: "DS",
    color: "#F5A623",
    secondaryColor: "#C47D00",
    keywords: ["docusign", "contract", "sign", "document", "signature"],
    actionVerb: "Sending contract",
  },
  apollo: {
    name: "Apollo",
    abbreviation: "AP",
    color: "#7C3AED",
    secondaryColor: "#5B21B6",
    keywords: ["apollo", "enrich", "prospect", "data"],
    actionVerb: "Enriching lead",
  },
  meta: {
    name: "Meta Ads",
    abbreviation: "META",
    color: "#1877F2",
    secondaryColor: "#0D5DB8",
    keywords: ["meta", "facebook", "instagram", "ad", "lead form"],
    actionVerb: "Submitting lead",
  },
  gemini: {
    name: "Google Gemini",
    abbreviation: "GEM",
    color: "#4285F4",
    secondaryColor: "#1557B0",
    keywords: ["gemini", "ground", "search", "verify", "fact"],
    actionVerb: "Grounding response",
  },
  microsoft_teams: {
    name: "MS Teams",
    abbreviation: "TMS",
    color: "#5C5FC6",
    secondaryColor: "#464775",
    keywords: ["teams", "microsoft", "notify", "channel"],
    actionVerb: "Posting to Teams",
  },
  microsoft_excel: {
    name: "Excel",
    abbreviation: "XLS",
    color: "#217346",
    secondaryColor: "#0F5132",
    keywords: ["excel", "spreadsheet", "log", "sheet"],
    actionVerb: "Logging to Excel",
  },
  google_sheets: {
    name: "Google Sheets",
    abbreviation: "GS",
    color: "#34A853",
    secondaryColor: "#1B7A30",
    keywords: ["sheets", "google", "spreadsheet", "log"],
    actionVerb: "Logging to Sheets",
  },
};

/**
 * Given a user message and the list of enabled tools, return up to 3
 * connector integrations that are most likely to be invoked. Connectors
 * whose keywords appear in the message score higher; ties are broken by
 * catalog order. If no keyword hits, returns the first 2 enabled connectors.
 */
export function selectRelevantConnectors(
  message: string,
  enabledTools: string[],
): ToolIntegration[] {
  const lc = message.toLowerCase();

  // Collect unique integrations from the enabled tools
  const integrationSet = new Set<ToolIntegration>();
  for (const toolName of enabledTools) {
    const entry = AGENT_TOOL_CATALOG.find((t) => t.name === toolName);
    if (entry?.integration) integrationSet.add(entry.integration);
  }

  if (integrationSet.size === 0) return [];

  // Score each integration by keyword relevance
  const scored: [ToolIntegration, number][] = [...integrationSet].map((integration) => {
    const brand = CONNECTOR_BRANDS[integration];
    const score = brand.keywords.filter((kw) => lc.includes(kw)).length;
    return [integration, score];
  });

  // Sort: score desc, stable order for ties (preserves catalog order)
  scored.sort((a, b) => b[1] - a[1]);

  const relevant = scored.filter(([, s]) => s > 0).map(([i]) => i);

  // If no keyword hits, fall back to first 2 enabled connectors
  if (relevant.length === 0) {
    return scored.slice(0, 2).map(([i]) => i);
  }

  return relevant.slice(0, 3);
}

/**
 * Derive the active connector integrations from the enabled tools list
 * (used for the connector health strip in the agent header).
 */
export function getConnectorHealth(enabledTools: string[]): ToolIntegration[] {
  const seen = new Set<ToolIntegration>();
  const result: ToolIntegration[] = [];
  for (const toolName of enabledTools) {
    const entry = AGENT_TOOL_CATALOG.find((t) => t.name === toolName);
    if (entry?.integration && !seen.has(entry.integration)) {
      seen.add(entry.integration);
      result.push(entry.integration);
    }
  }
  return result;
}
