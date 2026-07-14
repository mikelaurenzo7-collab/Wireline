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
} from "./product-events";

export type ServerProductEventInput = {
  event: ProductEventName;
  userId: string;
  audience?: ProductEventAudience;
  planId?: ProductEventPayload["planId"];
  wedge?: string;
  templateId?: string;
  agentId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const SERVER_EMIT_ONCE = new Set<string>();

function prepareServerProductEvent(input: ServerProductEventInput) {
  if (!isProductEventName(input.event)) return null;
  const payload = makeProductEvent({
    event: input.event,
    surface: "api",
    audience: input.audience,
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

  log.info("product_event", {
    product_event: payload.event,
    product_event_version: PRODUCT_EVENT_VERSION,
    userId: input.userId,
    agentId: input.agentId ?? null,
    audience: payload.audience,
    wedge: payload.wedge ?? null,
    metadata: payload.metadata ?? {},
    payload,
  });

  return {
    payload,
    record: {
      userId: input.userId,
      action: payload.event,
      eventType: "product.event",
      severity: "info",
      resourceType: "product_event",
      resourceId: input.agentId ?? input.userId,
      metadata: {
        product_event_version: PRODUCT_EVENT_VERSION,
        audience: payload.audience,
        wedge: payload.wedge ?? null,
        template_id: payload.templateId ?? null,
        plan_id: payload.planId ?? null,
        agent_id: input.agentId ?? null,
        ...(payload.metadata || {}),
        full_payload: payload,
      },
    },
  };
}

/**
 * Persist a product event before acknowledging a workflow milestone whose UI
 * depends on that durable row (for example, Studio browser-test readiness).
 */
export async function persistServerProductEvent(input: ServerProductEventInput): Promise<boolean> {
  const prepared = prepareServerProductEvent(input);
  if (!prepared) return false;
  await drizzle.insert(schema.auditLog).values(prepared.record);
  return true;
}

/** Emit a best-effort product event from server workflows. */
export function emitServerProductEvent(input: ServerProductEventInput): void {
  const prepared = prepareServerProductEvent(input);
  if (!prepared) return;

  // Durable persistence for analytics / activation funnels (best-effort).
  void drizzle
    .insert(schema.auditLog)
    .values(prepared.record)
    .catch((err: unknown) => {
      log.warn("product_event audit persist failed", {
        event: prepared.payload.event,
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
