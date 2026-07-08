/**
 * Sales tenants default to approval-gated integration writebacks
 * (calendar, email, CRM) unless autonomy is explicitly set to auto.
 */

const SALES_ROLE_MARKERS = ["sales", "sdr", "outbound", "revenue"];

export function isSalesAgentRole(role?: string | null): boolean {
  const normalized = (role || "").toLowerCase();
  return SALES_ROLE_MARKERS.some((marker) => normalized.includes(marker));
}

export type IntegrationActionType = "send_email" | "schedule_calendar" | "update_crm_lead";

export function requiresSalesApprovalForIntegration(args: {
  agentRole?: string | null;
  autonomyLevel?: string | null;
  actionType: IntegrationActionType;
}): boolean {
  if (args.autonomyLevel === "auto") return false;
  if (!isSalesAgentRole(args.agentRole)) return false;
  return (
    args.actionType === "send_email" ||
    args.actionType === "schedule_calendar" ||
    args.actionType === "update_crm_lead"
  );
}
