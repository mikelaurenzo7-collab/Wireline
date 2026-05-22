// No-op Sentry events shim. The SDK was removed pre-launch (see ./sentry.ts).
// Route handlers and middleware still call SentryEvents.x(...) — those now
// log to console. Restore the original implementation from git history to
// re-enable structured event tracking once paid telemetry is justified.

type EventLogger = (params: Record<string, unknown>) => void;

const log =
  (event: string): EventLogger =>
  (params) => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- intentional dev-only shim for the removed Sentry SDK
      console.info(`[event:${event}]`, params);
    }
  };

export const SentryEvents = {
  callCompleted: log("call_completed"),
  callFailed: log("call_failed"),
  emailSent: log("email_sent"),
  emailFailed: log("email_failed"),
  outboundDialStarted: log("outbound_dial_started"),
  leadConnected: log("lead_connected"),
  apiError: log("api_error"),
  aiApiFailure: log("ai_api_failure"),
  databaseError: log("database_error"),
  externalServiceError: log("external_service_error"),
  rateLimited: log("rate_limited"),
  webhookDeliveryFailed: log("webhook_delivery_failed"),
  slowOperation: log("slow_operation"),
  cacheOperation: log("cache_operation"),
  budgetWarning: log("budget_warning"),
  budgetExceeded: log("budget_exceeded"),
  agentOptimized: log("agent_optimized"),
};

export function reportBatchEvent(_event: string, _params: Record<string, unknown>): void {
  return;
}
