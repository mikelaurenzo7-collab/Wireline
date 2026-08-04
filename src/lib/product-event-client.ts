import {
  makeProductEvent,
  type ProductEventName,
  type ProductEventPayload,
  type ProductEventSurface,
} from "./product-events";

type WindowWithAnalytics = Window & {
  dataLayer?: { push: (data: Record<string, unknown>) => void };
  plausible?: (
    event: string,
    options?: { props?: Record<string, string | number | boolean | null> },
  ) => void;
};

/** GTM / FB Pixel aliases used in marketing tags (roadmap naming). */
const GTM_EVENT_ALIASES: Partial<Record<ProductEventName, string>> = {
  agent_created: "agent-created",
  training_asset_added: "first-training-source-added",
  number_wired: "first-number-wired",
  phone_channel_wired: "first-number-wired",
  first_call_completed: "first-call-made",
  first_next_action_approved: "first_next_action_approved",
  upgrade_to_paid: "upgrade-to-paid",
};

const PRODUCT_EVENT_ONCE_PREFIX = "wireline:product-event-once:";

/**
 * Keep activation milestones semantically strict at the final client boundary.
 * The setup wizard may be deferred or skipped; those navigation actions must
 * not be persisted as launch readiness or a completed launch.
 */
export function shouldDispatchProductEvent(
  input: Pick<ProductEventPayload, "event" | "metadata">,
): boolean {
  if (
    input.event === "launch_readiness_reached" &&
    input.metadata?.source === "wizard_train_step"
  ) {
    return false;
  }

  if (input.event === "agent_launch_completed") {
    return input.metadata?.has_line === true && input.metadata?.test_started === true;
  }

  return true;
}

function createCorrelationId(event: ProductEventName): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${event}:${random}`;
}

function postAuthenticatedProductEvent(event: ReturnType<typeof makeProductEvent>): boolean {
  if (event.surface === "marketing_web" || typeof fetch !== "function") return false;

  // Session identity is resolved from the httpOnly cookie on the server. The
  // client-supplied account id is never trusted. keepalive protects navigation
  // milestones without blocking the UI.
  void fetch("/api/product-events", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => undefined);
  return true;
}

export function emitProductEvent(
  input: Omit<Parameters<typeof makeProductEvent>[0], "surface"> & {
    surface?: ProductEventSurface;
  },
): boolean {
  if (typeof window === "undefined") return false;
  if (!shouldDispatchProductEvent(input)) return false;

  const event = makeProductEvent({
    ...input,
    surface: input.surface ?? "web_workspace",
    correlationId: input.correlationId ?? createCorrelationId(input.event),
  });
  const analytics = window as WindowWithAnalytics;
  let dispatched = false;

  const layer = analytics.dataLayer;
  if (layer && typeof layer.push === "function") {
    layer.push({
      event: GTM_EVENT_ALIASES[event.event] ?? event.event,
      wireline_event: event.event,
      wireline_surface: event.surface,
      wireline_audience: event.audience ?? null,
      wireline_agent_id: event.agentId ?? null,
      wireline_plan_id: event.planId ?? null,
      wireline_correlation_id: event.correlationId ?? null,
      wireline_metadata: event.metadata ?? null,
      wireline_occurred_at: event.occurredAt,
    });
    dispatched = true;
  }

  if (typeof analytics.plausible === "function") {
    analytics.plausible(GTM_EVENT_ALIASES[event.event] ?? event.event, {
      props: {
        wireline_event: event.event,
        surface: event.surface,
        audience: event.audience ?? null,
        plan_id: event.planId ?? null,
        wedge: event.wedge ?? null,
      },
    });
    dispatched = true;
  }

  // Marketing milestones are client-analytics only. Still count them as
  // dispatched so once-guards work when GTM/Plausible are not loaded.
  if (event.surface === "marketing_web") return true;

  return postAuthenticatedProductEvent(event) || dispatched;
}

function onceScope(
  input: Omit<Parameters<typeof emitProductEvent>[0], "surface"> & {
    surface?: ProductEventSurface;
  },
): string {
  return (
    input.agentId ??
    input.accountId ??
    String(
      input.metadata?.user_id ??
        input.metadata?.account_id ??
        input.metadata?.call_id ??
        input.metadata?.scope ??
        "global",
    )
  );
}

/** Fire a product event at most once per browser profile (activation milestones). */
export function emitProductEventOnce(
  input: Omit<Parameters<typeof emitProductEvent>[0], "surface"> & {
    surface?: ProductEventSurface;
  },
): boolean {
  if (typeof window === "undefined") return false;
  const key = `${PRODUCT_EVENT_ONCE_PREFIX}${input.event}:${onceScope(input)}`;
  try {
    if (localStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode — still attempt emit */
  }

  const dispatched = emitProductEvent(input);
  if (!dispatched) return false;

  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode — event was still dispatched */
  }
  return true;
}
