// Lightweight event tracker. Business events are logged as structured JSON
// so they appear in Vercel runtime logs (searchable, filterable, alertable).
// No external SDK required — Vercel captures all stdout/stderr.

import { log as serverLog } from "./server-context";

type EventLogger = (params: Record<string, unknown>) => void;

const logEvent =
  (event: string): EventLogger =>
  (params) => {
    serverLog.info(`[event:${event}]`, { event, ...params });
  };

export const SentryEvents = {
  callCompleted: logEvent("call_completed"),
  callFailed: logEvent("call_failed"),
  emailSent: logEvent("email_sent"),
  emailFailed: logEvent("email_failed"),
  outboundDialStarted: logEvent("outbound_dial_started"),
  leadConnected: logEvent("lead_connected"),
  apiError: logEvent("api_error"),
  aiApiFailure: logEvent("ai_api_failure"),
  databaseError: logEvent("database_error"),
  externalServiceError: logEvent("external_service_error"),
  rateLimited: logEvent("rate_limited"),
  webhookDeliveryFailed: logEvent("webhook_delivery_failed"),
  slowOperation: logEvent("slow_operation"),
  cacheOperation: logEvent("cache_operation"),
  budgetWarning: logEvent("budget_warning"),
  budgetExceeded: logEvent("budget_exceeded"),
  agentOptimized: logEvent("agent_optimized"),
};

export function reportBatchEvent(_event: string, _params: Record<string, unknown>): void {
  return;
}
