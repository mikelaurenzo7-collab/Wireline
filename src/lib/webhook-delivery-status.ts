/** Canonical webhook delivery statuses — keep in sync with wireline_webhook_deliveries.status */
export const WEBHOOK_DELIVERY_PENDING = "pending" as const;
export const WEBHOOK_DELIVERY_SUCCESS = "success" as const;
export const WEBHOOK_DELIVERY_FAILED = "failed" as const;

export const WEBHOOK_DELIVERY_STATUSES = [
  WEBHOOK_DELIVERY_PENDING,
  WEBHOOK_DELIVERY_SUCCESS,
  WEBHOOK_DELIVERY_FAILED,
] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export function isWebhookDeliveryStatus(value: string): value is WebhookDeliveryStatus {
  return (WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(value);
}
