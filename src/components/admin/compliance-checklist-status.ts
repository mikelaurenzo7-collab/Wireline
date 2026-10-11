type IntegrationHealth = {
  has_oauth_connections?: boolean;
  reconnect_google_calendar?: boolean;
  reconnect_microsoft_calendar?: boolean;
  reconnect_hubspot?: boolean;
  reconnect_salesforce?: boolean;
  reconnect_google_sheets?: boolean;
  reconnect_microsoft_mailbox?: boolean;
  reasons?: unknown;
};

export type IntegrationChecklistStatus = "done" | "pending" | "not_applicable";

export function getIntegrationChecklistStatus(
  health: IntegrationHealth | null,
): IntegrationChecklistStatus {
  if (health?.has_oauth_connections === false) return "not_applicable";
  if (health?.has_oauth_connections !== true || !Array.isArray(health.reasons)) {
    return "pending";
  }

  const reconnectFlags = [
    health.reconnect_google_calendar,
    health.reconnect_microsoft_calendar,
    health.reconnect_hubspot,
    health.reconnect_salesforce,
    health.reconnect_google_sheets,
    health.reconnect_microsoft_mailbox,
  ];
  return reconnectFlags.every((flag) => flag === false) && health.reasons.length === 0
    ? "done"
    : "pending";
}
