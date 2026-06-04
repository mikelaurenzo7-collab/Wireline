import { AGENT_TOOL_CATALOG } from "./agent-capabilities";
import {
  filterToolsByTenantConnections,
  type TenantIntegrationConnections,
} from "./tenant-integration-connections";
import { loadPlatformIntegrationFlags } from "./platform-integration-flags";
import { DIRECTOR_INTEGRATION_TOOLS } from "./director-integration-tools";

function formatMailboxCalendarLines(conn: TenantIntegrationConnections): string {
  const lines: string[] = [];
  if (conn.google_calendar || conn.microsoft_calendar) {
    const parts = [
      conn.google_calendar ? "Google Calendar" : null,
      conn.microsoft_calendar ? "Microsoft Calendar" : null,
    ].filter(Boolean);
    lines.push(`- Calendar · CONNECTED (${parts.join(" + ")})`);
  } else {
    lines.push("- Calendar · connect Google or Outlook in Integrations");
  }
  if (conn.google_mail || conn.microsoft_mail) {
    const parts = [
      conn.google_mail ? "Gmail" : null,
      conn.microsoft_mail ? "Outlook mail" : null,
    ].filter(Boolean);
    lines.push(`- Email send · CONNECTED (${parts.join(" + ")}) — use actions.send_email`);
  } else {
    lines.push(
      "- Email send · connect Gmail or Outlook in Integrations (or use actions.send_email after connect)",
    );
  }
  return lines.join("\n");
}

export function formatDirectorIntegrationPrompt(connections: TenantIntegrationConnections): string {
  const platform = loadPlatformIntegrationFlags();
  const available = filterToolsByTenantConnections(
    DIRECTOR_INTEGRATION_TOOLS,
    connections,
    platform,
  );
  const availableSet = new Set(available);

  const toolLines = AGENT_TOOL_CATALOG.filter((t) =>
    DIRECTOR_INTEGRATION_TOOLS.includes(t.name),
  ).map((t) => {
    const connected = availableSet.has(t.name);
    const integration = t.integration ? String(t.integration) : "platform";
    return `- ${t.name} (${t.label}) · ${integration}${connected ? " · CONNECTED" : " · connect in Integrations"}`;
  });

  const header = formatMailboxCalendarLines(connections);
  const body =
    toolLines.length > 0
      ? toolLines.join("\n")
      : "(No merchant integration tools yet — connect Shopify, CRM, Slack, etc.)";

  return `${header}\n${body}`;
}
