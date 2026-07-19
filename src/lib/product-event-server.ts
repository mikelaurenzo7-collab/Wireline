/**
 * Server-side product event emission — structured logs + durable audit trail.
 * Complements browser GTM events in product-event-client.ts.
 */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import {
  isProductEventName,
  makeProductEvent,
  PRODUCT_EVENT_VERSION,
  type ProductEventAudience,
  type ProductEventName,
  type ProductEventPayload,
  type ProductEventSurface,
} from "./product-events";

export type ServerProductEventInput = {
  event: ProductEventName;
  userId: string;
  audience?: ProductEventAudience;
  surface?: ProductEventSurface;
  correlationId?: string;
  demoAccount?: boolean;
  planId?: ProductEventPayload["planId"];
  wedge?: string;
  templateId?: string;
  agentId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const SERVER_EMIT_ONCE = new Set<string>();

/** Emit a product event from server workflows (activation, approvals, campaigns). */
export function emitServerProductEvent(input: ServerProductEventInput): void {
  if (!isProductEventName(input.event)) return;

  const payload = makeProductEvent({
    event: input.event,
    surface: input.surface ?? "api",
    audience: input.audience,
    correlationId: input.correlationId,
    planId: input.planId,
    wedge: input.wedge,
    templateId: input.templateId,
    agentId: input.agentId,
    accountId: input.userId,
    metadata: {
      ...input.metadata,
      user_id: input.userId,
    },
  });

  const demoAccount =
    input.demoAccount ?? String(process.env.WIRELINE_LAUNCH_DEMO_MODE || "").toLowerCase() === "true";

  log.info("product_event", {
    product_event: payload.event,
    product_event_version: PRODUCT_EVENT_VERSION,
    userId: input.userId,
    agentId: input.agentId ?? null,
    audience: payload.audience,
    surface: payload.surface,
    correlationId: payload.correlationId ?? null,
    demoAccount,
    wedge: payload.wedge ?? null,
    metadata: payload.metadata ?? {},
    payload,
  });

  // Durable persistence for analytics / activation funnels (best-effort).
  void drizzle
    .insert(schema.auditLog)
    .values({
      userId: input.userId,
      action: payload.event,
      eventType: "product.event",
      severity: "info",
      resourceType: "product_event",
      resourceId: input.agentId ?? input.userId,
      metadata: {
        product_event_version: PRODUCT_EVENT_VERSION,
        audience: payload.audience,
        surface: payload.surface,
        correlation_id: payload.correlationId ?? null,
        demo_account: demoAccount,
        wedge: payload.wedge ?? null,
        template_id: payload.templateId ?? null,
        plan_id: payload.planId ?? null,
        agent_id: input.agentId ?? null,
        ...(payload.metadata || {}),
        full_payload: payload,
      },
    })
    .catch((err: unknown) => {
      log.warn("product_event audit persist failed", {
        event: payload.event,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/** Emit at most once per user+event within this process (activation milestones). */
export function emitServerProductEventOnce(input: ServerProductEventInput): boolean {
  const key = `${input.userId}:${input.event}:${input.agentId ?? ""}`;
  if (SERVER_EMIT_ONCE.has(key)) return false;
  SERVER_EMIT_ONCE.add(key);
  emitServerProductEvent(input);
  return true;
}

/** Clear once-cache — for tests only. */
export function _resetServerProductEventOnceForTests(): void {
  SERVER_EMIT_ONCE.clear();
}
