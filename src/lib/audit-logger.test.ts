// src/lib/audit-logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from './audit-logger';

describe('AuditLogger', () => {
  let mockDrizzle: any;
  let logger: AuditLogger;

  beforeEach(() => {
    mockDrizzle = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue({ success: true })
    };
    logger = new AuditLogger(mockDrizzle);
  });

  it('should log auth events', async () => {
    const result = await logger.logAuth('login', {
      userId: 'user-123',
      email: 'test@example.com',
      ip: '192.168.1.1',
      userAgent: 'Test Browser'
    });

    expect(result.success).toBe(true);
    expect(mockDrizzle.insert).toHaveBeenCalled();
    expect(mockDrizzle.values).toHaveBeenCalledWith(
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
    expect(mockDrizzle.values).toHaveBeenCalledWith(
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
    expect(mockDrizzle.values).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'agent.created',
        resource_type: 'agent',
        resource_id: 'node-sales-1'
      })
    );
  });

  it('should handle database errors gracefully', async () => {
    mockDrizzle.values.mockRejectedValue(new Error('Database connection failed'));

    const result = await logger.logAuth('login', {
      userId: 'user-123',
      email: 'test@example.com'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database connection failed');
  });

  it('should track failure count', async () => {
    mockDrizzle.values.mockRejectedValue(new Error('Error 1'));

    await logger.logAuth('login', { userId: 'user-123', email: 'test@example.com' });
    await logger.logAuth('login', { userId: 'user-123', email: 'test@example.com' });

    const stats = logger.getStats();
    expect(stats.failureCount).toBe(2);
  });
});
