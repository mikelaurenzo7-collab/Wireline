import {
  makeProductEvent,
  type ProductEventName,
  type ProductEventSurface,
} from "./product-events";

type WindowWithAnalytics = Window & {
  dataLayer?: { push: (data: Record<string, unknown>) => void };
};

/** GTM / FB Pixel aliases used in marketing tags (roadmap naming). */
const GTM_EVENT_ALIASES: Partial<Record<ProductEventName, string>> = {
  agent_created: "agent-created",
  first_call_completed: "first-call-made",
  upgrade_to_paid: "upgrade-to-paid",
};

const PRODUCT_EVENT_ONCE_PREFIX = "wireline:product-event-once:";

export function emitProductEvent(
  input: Omit<Parameters<typeof makeProductEvent>[0], "surface"> & {
    surface?: ProductEventSurface;
  },
): void {
  const event = makeProductEvent({
    surface: input.surface ?? "web_workspace",
    ...input,
  });

  if (typeof window === "undefined") return;

  const layer = (window as WindowWithAnalytics).dataLayer;
  if (layer && typeof layer.push === "function") {
    layer.push({
      event: GTM_EVENT_ALIASES[event.event] ?? event.event,
      wireline_event: event.event,
      wireline_surface: event.surface,
      wireline_audience: event.audience ?? null,
      wireline_agent_id: event.agentId ?? null,
      wireline_plan_id: event.planId ?? null,
      wireline_metadata: event.metadata ?? null,
      wireline_occurred_at: event.occurredAt,
    });
  }
}

/** Fire a product event at most once per browser profile (activation milestones). */
export function emitProductEventOnce(
  input: Omit<Parameters<typeof emitProductEvent>[0], "surface"> & {
    surface?: ProductEventSurface;
  },
): boolean {
  if (typeof window === "undefined") return false;
  const key = `${PRODUCT_EVENT_ONCE_PREFIX}${input.event}`;
  try {
    if (localStorage.getItem(key) === "1") return false;
    localStorage.setItem(key, "1");
  } catch {
    /* private mode — still attempt emit */
  }
  emitProductEvent(input);
  return true;
}
