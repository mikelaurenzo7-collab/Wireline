import * as Sentry from '@sentry/react';

// Track business metrics and operational events in Sentry
// These appear in Sentry Dashboards as custom metrics for trend analysis

export const SentryEvents = {
  // Call tracking
  callCompleted: (params: { duration_ms: number; agent_id: string; direction: 'inbound' | 'outbound' }) => {
    Sentry.captureMessage('Call completed', {
      level: 'info',
      tags: {
        event: 'call_completed',
        direction: params.direction,
      },
      measurements: {
        duration_ms: { value: params.duration_ms, unit: 'milliseconds' },
      },
    });
  },

  callFailed: (params: { error: string; agent_id: string; reason: string }) => {
    Sentry.captureMessage(`Call failed: ${params.reason}`, {
      level: 'warning',
      tags: {
        event: 'call_failed',
        reason: params.reason,
      },
    });
  },

  // Email tracking
  emailSent: (params: { thread_id: string; recipient_count: number }) => {
    Sentry.captureMessage('Email sent', {
      level: 'info',
      tags: {
        event: 'email_sent',
      },
      measurements: {
        recipient_count: { value: params.recipient_count, unit: 'none' },
      },
    });
  },

  emailFailed: (params: { reason: string }) => {
    Sentry.captureMessage(`Email failed: ${params.reason}`, {
      level: 'warning',
      tags: {
        event: 'email_failed',
      },
    });
  },

  // Outbound dial tracking
  outboundDialStarted: (params: { lead_count: number; agent_id: string }) => {
    Sentry.captureMessage('Outbound dial campaign started', {
      level: 'info',
      tags: {
        event: 'outbound_dial_started',
      },
      measurements: {
        lead_count: { value: params.lead_count, unit: 'none' },
      },
    });
  },

  leadConnected: (params: { agent_id: string }) => {
    Sentry.captureMessage('Lead successfully connected', {
      level: 'info',
      tags: {
        event: 'lead_connected',
      },
    });
  },

  // API errors that matter for operations
  apiError: (params: { endpoint: string; status: number; error_type: string }) => {
    Sentry.captureMessage(`API error: ${params.endpoint}`, {
      level: 'error',
      tags: {
        event: 'api_error',
        endpoint: params.endpoint,
        status: String(params.status),
        error_type: params.error_type,
      },
    });
  },

  // Rate limiting (should be rare in production)
  rateLimited: (params: { endpoint: string; user_id?: string }) => {
    Sentry.captureMessage(`Rate limited: ${params.endpoint}`, {
      level: 'warning',
      tags: {
        event: 'rate_limited',
        endpoint: params.endpoint,
      },
    });
  },

  // Webhook delivery issues
  webhookDeliveryFailed: (params: { webhook_id: string; attempt: number; status_code?: number }) => {
    Sentry.captureMessage(`Webhook delivery failed (attempt ${params.attempt})`, {
      level: 'warning',
      tags: {
        event: 'webhook_delivery_failed',
        attempt: String(params.attempt),
      },
    });
  },

  // Agent training/optimization events
  agentOptimized: (params: { agent_id: string; metric_improved: string }) => {
    Sentry.captureMessage(`Agent optimized: ${params.metric_improved}`, {
      level: 'info',
      tags: {
        event: 'agent_optimized',
      },
    });
  },

  // Spending/budget alerts
  budgetWarning: (params: { user_id: string; spent: number; budget: number }) => {
    Sentry.captureMessage('Budget warning: approaching limit', {
      level: 'warning',
      tags: {
        event: 'budget_warning',
      },
      measurements: {
        spent_percent: {
          value: (spent / budget) * 100,
          unit: 'percent',
        },
      },
    });
  },

  budgetExceeded: (params: { user_id: string; spent: number; budget: number }) => {
    Sentry.captureMessage('Budget exceeded', {
      level: 'error',
      tags: {
        event: 'budget_exceeded',
      },
    });
  },
};

// Helper to batch similar events (e.g. reporting multiple call metrics at once)
export function reportBatchEvent(name: string, count: number, attributes?: Record<string, string>) {
  Sentry.captureMessage(`${name} (×${count})`, {
    level: 'info',
    tags: {
      event: name,
      batch: 'true',
      count: String(count),
      ...(attributes || {}),
    },
  });
}
