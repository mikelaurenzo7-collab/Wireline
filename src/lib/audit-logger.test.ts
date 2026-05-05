// src/lib/audit-logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from './audit-logger';
import type { AuditEventType } from '../types/audit';

describe('AuditLogger', () => {
  let mockSupabase: any;
  let logger: AuditLogger;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null })
    };
    logger = new AuditLogger(mockSupabase);
  });

  it('should log auth events', async () => {
    await logger.logAuth('login', {
      userId: 'user-123',
      email: 'test@example.com',
      ip: '192.168.1.1',
      userAgent: 'Test Browser'
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('wireline_audit_log');
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'auth.login',
        user_id: 'user-123',
        action: 'login',
        severity: 'info'
      })
    );
  });

  it('should log security events with critical severity', async () => {
    await logger.logSecurity('unauthorized_access', {
      userId: 'user-123',
      resource: 'agent-settings',
      ip: '192.168.1.1'
    });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'security.unauthorized_access',
        severity: 'critical'
      })
    );
  });

  it('should log agent operations', async () => {
    await logger.logAgentOperation('created', {
      userId: 'user-123',
      agentId: 'node-sales-1',
      agentName: 'Sales Agent',
      metadata: { role: 'sales' }
    });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'agent.created',
        resource_type: 'agent',
        resource_id: 'node-sales-1'
      })
    );
  });
});
