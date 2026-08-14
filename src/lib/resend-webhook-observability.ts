export type ResendOperationalSeverity = "error" | "warning" | null;

/**
 * Delivery failures need an incident signal; delays need a searchable warning.
 * Permanent recipient-risk events are handled by the suppression path instead
 * of being promoted to infrastructure incidents.
 */
export function resendOperationalSeverity(eventType: string): ResendOperationalSeverity {
  if (eventType === "email.failed") return "error";
  if (eventType === "email.delivery_delayed") return "warning";
  return null;
}
