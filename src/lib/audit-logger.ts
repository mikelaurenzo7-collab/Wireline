// src/lib/audit-logger.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEventType, AuditSeverity } from '../types/audit';

export class AuditLogger {
  private failureCount = 0;

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
  }): Promise<{ success: boolean; error?: string }> {
    // Validate required fields
    if (!data.action || !data.eventType) {
      console.error('[AuditLogger] Missing required fields:', {
        action: data.action,
        eventType: data.eventType
      });
      return { success: false, error: 'Missing required fields' };
    }

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

    const { error } = await this.supabase.from('wireline_audit_log').insert(record);

    if (error) {
      this.failureCount++;
      console.error('[AuditLogger] Failed to log event:', {
        eventType: data.eventType,
        error: error.message,
        totalFailures: this.failureCount
      });
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  public getStats() {
    return { failureCount: this.failureCount };
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
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      'login': 'auth.login',
      'logout': 'auth.logout',
      'failed_login': 'auth.failed_login',
      'password_reset': 'auth.password_reset'
    };

    return await this.log({
      eventType: eventTypeMap[action],
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
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      'created': 'agent.created',
      'updated': 'agent.updated',
      'deleted': 'agent.deleted',
      'training_updated': 'agent.training_updated'
    };

    return await this.log({
      eventType: eventTypeMap[action],
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
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      'rate_limit_exceeded': 'security.rate_limit_exceeded',
      'unauthorized_access': 'security.unauthorized_access',
      'suspicious_activity': 'security.suspicious_activity'
    };

    return await this.log({
      eventType: eventTypeMap[action],
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
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      'updated': 'settings.updated',
      'api_key_rotated': 'settings.api_key_rotated'
    };

    return await this.log({
      eventType: eventTypeMap[action],
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
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      'export': 'data.export',
      'import': 'data.import',
      'bulk_delete': 'data.bulk_delete'
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === 'bulk_delete' ? 'warning' : 'info',
      resourceType: params.resourceType,
      metadata: { record_count: params.recordCount },
      ip: params.ip
    });
  }
}
