// src/lib/audit-logger.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEventType, AuditSeverity } from '../types/audit';

export class AuditLogger {
  constructor(private supabase: SupabaseClient) {}

  private async log(data: {
    eventType: AuditEventType;
    userId?: string;
    action: string;
    severity?: AuditSeverity;
    actorEmail?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    provider?: string;
    model?: string;
    costUsd?: number;
    latencyMs?: number;
  }) {
    const record = {
      event_type: data.eventType,
      user_id: data.userId,
      action: data.action,
      severity: data.severity || 'info',
      actor_email: data.actorEmail,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      metadata: data.metadata,
      ip_address: data.ip,
      user_agent: data.userAgent,
      provider: data.provider,
      model: data.model,
      cost_usd: data.costUsd,
      latency_ms: data.latencyMs
    };

    await this.supabase.from('wireline_audit_log').insert(record);
  }

  async logAuth(
    action: 'login' | 'logout' | 'failed_login' | 'password_reset',
    params: {
      userId?: string;
      email?: string;
      ip?: string;
      userAgent?: string;
      reason?: string;
    }
  ) {
    await this.log({
      eventType: `auth.${action}` as AuditEventType,
      userId: params.userId,
      action,
      severity: action === 'failed_login' ? 'warning' : 'info',
      actorEmail: params.email,
      ip: params.ip,
      userAgent: params.userAgent,
      metadata: params.reason ? { reason: params.reason } : undefined
    });
  }

  async logAgentOperation(
    action: 'created' | 'updated' | 'deleted' | 'training_updated',
    params: {
      userId: string;
      agentId: string;
      agentName?: string;
      metadata?: Record<string, any>;
      ip?: string;
    }
  ) {
    await this.log({
      eventType: `agent.${action}` as AuditEventType,
      userId: params.userId,
      action,
      severity: 'info',
      resourceType: 'agent',
      resourceId: params.agentId,
      metadata: { agent_name: params.agentName, ...params.metadata },
      ip: params.ip
    });
  }

  async logSecurity(
    action: 'rate_limit_exceeded' | 'unauthorized_access' | 'suspicious_activity',
    params: {
      userId?: string;
      resource?: string;
      ip?: string;
      userAgent?: string;
      metadata?: Record<string, any>;
    }
  ) {
    await this.log({
      eventType: `security.${action}` as AuditEventType,
      userId: params.userId,
      action,
      severity: 'critical',
      metadata: { resource: params.resource, ...params.metadata },
      ip: params.ip,
      userAgent: params.userAgent
    });
  }

  async logSettings(
    action: 'updated' | 'api_key_rotated',
    params: {
      userId: string;
      changes?: Record<string, any>;
      ip?: string;
    }
  ) {
    await this.log({
      eventType: `settings.${action}` as AuditEventType,
      userId: params.userId,
      action,
      severity: 'info',
      resourceType: 'settings',
      metadata: params.changes,
      ip: params.ip
    });
  }

  async logDataOperation(
    action: 'export' | 'import' | 'bulk_delete',
    params: {
      userId: string;
      resourceType: string;
      recordCount: number;
      ip?: string;
    }
  ) {
    await this.log({
      eventType: `data.${action}` as AuditEventType,
      userId: params.userId,
      action,
      severity: action === 'bulk_delete' ? 'warning' : 'info',
      resourceType: params.resourceType,
      metadata: { record_count: params.recordCount },
      ip: params.ip
    });
  }
}
