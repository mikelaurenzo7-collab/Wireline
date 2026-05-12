// src/lib/audit-logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from './audit-logger';

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
    const result = await logger.logAuth('login', {
      userId: 'user-123',
      email: 'test@example.com',
      ip: '192.168.1.1',
      userAgent: 'Test Browser'
    });

    expect(result.success).toBe(true);
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
    const result = await logger.logSecurity('unauthorized_access', {
      userId: 'user-123',
      resource: 'agent-settings',
      ip: '192.168.1.1'
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'security.unauthorized_access',
        severity: 'critical'
      })
    );
  });

  it('should log agent operations', async () => {
    const result = await logger.logAgentOperation('created', {
      userId: 'user-123',
      agentId: 'node-sales-1',
      agentName: 'Sales Agent',
      metadata: { role: 'sales' }
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'agent.created',
        resource_type: 'agent',
        resource_id: 'node-sales-1'
      })
    );
  });

  it('should log settings updates', async () => {
    const result = await logger.logSettings('updated', {
      userId: 'user-123',
      changes: { theme: 'dark' },
      ip: '192.168.1.1'
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'settings.updated',
        action: 'updated',
        resource_type: 'settings'
      })
    );
  });

  it('should log data operations', async () => {
    const result = await logger.logDataOperation('export', {
      userId: 'user-123',
      resourceType: 'call_logs',
      recordCount: 100,
      ip: '192.168.1.1'
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'data.export',
        action: 'export',
        severity: 'info'
      })
    );
  });

  it('should log bulk delete with warning severity', async () => {
    const result = await logger.logDataOperation('bulk_delete', {
      userId: 'user-123',
      resourceType: 'contacts',
      recordCount: 50
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning'
      })
    );
  });

  it('should handle database errors gracefully', async () => {
    mockSupabase.insert.mockResolvedValue({
      error: { message: 'Database connection failed' }
    });

    const result = await logger.logAuth('login', {
      userId: 'user-123',
      email: 'test@example.com'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database connection failed');
  });

  it('should succeed even with minimal params', async () => {
    const result = await logger.logAuth('login', {
      userId: undefined,
      email: undefined
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'auth.login',
        action: 'login'
      })
    );
  });

  it('should track failure count', async () => {
    mockSupabase.insert.mockResolvedValue({
      error: { message: 'Error 1' }
    });

    await logger.logAuth('login', { userId: 'user-123', email: 'test@example.com' });
    await logger.logAuth('login', { userId: 'user-123', email: 'test@example.com' });

    const stats = logger.getStats();
    expect(stats.failureCount).toBe(2);
  });
});
