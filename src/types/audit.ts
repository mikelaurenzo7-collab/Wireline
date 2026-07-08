/* eslint-disable @typescript-eslint/no-explicit-any -- shared type shims bridge untyped third-party modules. */
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

/**
 * Complete audit event record structure.
 * Combines general audit fields with optional AI-specific fields
 * for comprehensive activity tracking and compliance reporting.
 */
export interface AuditEvent {
  // Core identification
  id: number;
  user_id?: string; // Optional - can be NULL if auth.uid() is NULL
  event_type?: AuditEventType; // Optional - nullable column in schema
  severity: AuditSeverity;
  action: string;

  // Actor context
  actor_email?: string;

  // Resource context
  resource_type?: string;
  resource_id?: string;

  // Request context
  ip_address?: string;
  user_agent?: string;

  // Additional context
  metadata?: Record<string, any>;

  // Timestamp
  created_at: string;

  // AI-specific fields (for ai.api_call events)
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_create_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
}

/**
 * Filters for querying audit events.
 * All fields are optional to support flexible filtering.
 */
export interface AuditFilters {
  user_id?: string;
  event_types?: AuditEventType[];
  severities?: AuditSeverity[];
  resource_type?: string;
  resource_id?: string;
  start_date?: string;
  end_date?: string;
  search_term?: string;
  actor_email?: string;
}

/**
 * Aggregated statistics for audit events over a time period.
 * Used for compliance dashboards and security monitoring.
 */
export interface AuditStats {
  total_events: number;
  events_by_type: Record<string, number>;
  events_by_severity: Record<AuditSeverity, number>;
  unique_users: number;
  date_range: {
    start: string;
    end: string;
  };
  // Optional breakdown by resource type
  events_by_resource?: Record<string, number>;
  // Optional AI usage stats
  ai_usage?: {
    total_calls: number;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    calls_by_provider: Record<string, number>;
  };
}
