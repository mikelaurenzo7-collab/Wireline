/**
 * Comprehensive audit event types for Wireline activity monitoring.
 * Covers authentication, agent operations, settings changes, billing,
 * API usage, security events, and data operations.
 */
export type AuditEventType =
  // Authentication events
  | "auth.login"
  | "auth.logout"
  | "auth.failed_login"
  | "auth.password_reset"
  | "auth.session_expired"
  | "auth.terms_accepted"

  // Agent operations
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "agent.training_updated"
  | "agent.deployed"
  | "agent.paused"

  // Settings and configuration
  | "settings.updated"
  | "settings.fleet_updated"
  | "settings.knowledge_base_updated"

  // Billing events
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_cancelled"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.checkout_started"
  | "billing.portal_opened"

  // API usage events
  | "ai.api_call"
  | "api.webhook_sent"
  | "api.webhook_failed"
  | "api.intake_received"
  | "api.webhook_created"
  | "api.webhook_updated"
  | "api.webhook_deleted"
  | "api.webhook_tested"

  // Intake key lifecycle
  | "security.intake_key_created"
  | "security.intake_key_updated"
  | "security.intake_key_deleted"

  // DNC list lifecycle
  | "dnc.added"
  | "dnc.removed"

  // Quota enforcement
  | "quota.override_set"
  | "quota.override_denied"

  // Job queue operations
  | "jobs.sweep_started"
  | "jobs.sweep_completed"
  | "jobs.sweep_denied"

  // Security events
  | "security.unauthorized_access"
  | "security.rate_limit_exceeded"
  | "security.suspicious_activity"
  | "security.api_key_created"
  | "security.api_key_deleted"
  | "security.api_key_rotated"

  // Data operations
  | "data.export"
  | "data.delete"
  | "data.bulk_delete"
  | "data.import"
  | "data.account_deletion_requested"
  | "data.account_deletion_cancelled"
  | "data.account_deleted"

  // Product analytics / activation funnel
  | "product.event";

/**
 * Severity levels for audit events.
 * - info: Normal operations
 * - warning: Noteworthy but not problematic
 * - error: Operation failed or problem occurred
 * - critical: Security issue or system-critical failure
 */
export type AuditSeverity = "info" | "warning" | "error" | "critical";
