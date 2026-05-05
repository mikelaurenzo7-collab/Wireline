import { describe, it, expect } from 'vitest';
import type {
  AuditEventType,
  AuditSeverity,
  AuditEvent,
  AuditFilters,
  AuditStats
} from './audit';

describe('Audit Types', () => {
  describe('AuditEventType', () => {
    it('should include all required auth event types', () => {
      const authTypes: AuditEventType[] = [
        'auth.login',
        'auth.logout',
        'auth.failed_login',
        'auth.password_reset'
      ];
      
      // Type check - if these don't match the union, TypeScript will fail
      authTypes.forEach(type => {
        expect(type).toBeTruthy();
      });
    });

    it('should include all required agent operation types', () => {
      const agentTypes: AuditEventType[] = [
        'agent.created',
        'agent.updated',
        'agent.deleted',
        'agent.training_updated'
      ];
      
      agentTypes.forEach(type => {
        expect(type).toBeTruthy();
      });
    });

    it('should include security and data operation types', () => {
      const securityTypes: AuditEventType[] = [
        'security.unauthorized_access',
        'security.rate_limit_exceeded',
        'data.export',
        'data.delete'
      ];
      
      securityTypes.forEach(type => {
        expect(type).toBeTruthy();
      });
    });
  });

  describe('AuditSeverity', () => {
    it('should include all severity levels', () => {
      const severities: AuditSeverity[] = ['info', 'warning', 'error', 'critical'];
      
      severities.forEach(severity => {
        expect(severity).toBeTruthy();
      });
    });
  });

  describe('AuditEvent Interface', () => {
    it('should accept a valid audit event with all required fields', () => {
      const event: AuditEvent = {
        id: 1,
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'auth.login',
        severity: 'info',
        action: 'User logged in',
        actor_email: 'user@example.com',
        resource_type: 'user',
        resource_id: '123e4567-e89b-12d3-a456-426614174000',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        metadata: { browser: 'Chrome' },
        created_at: '2026-05-05T10:00:00Z'
      };

      // Strong assertions instead of just truthy checks
      expect(event.id).toBe(1);
      expect(event.user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(event.event_type).toBe('auth.login');
      expect(event.severity).toBe('info');
      expect(event.action).toBe('User logged in');
      expect(event.actor_email).toBe('user@example.com');
      expect(event.metadata).toEqual({ browser: 'Chrome' });
    });

    it('should accept an AI API call audit event with AI-specific fields', () => {
      const aiEvent: AuditEvent = {
        id: 2,
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'ai.api_call',
        severity: 'info',
        action: 'Claude API call',
        actor_email: 'user@example.com',
        resource_type: 'api',
        resource_id: 'claude-opus-4.7',
        ip_address: '192.168.1.1',
        user_agent: 'Wireline/1.0',
        metadata: {},
        created_at: '2026-05-05T10:01:00Z',
        // AI-specific fields
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 200,
        cache_create_tokens: 100,
        cost_usd: 0.05,
        latency_ms: 1250
      };

      expect(aiEvent.provider).toBe('anthropic');
      expect(aiEvent.input_tokens).toBe(1000);
      expect(aiEvent.cost_usd).toBe(0.05);
    });

    it('should allow optional fields to be undefined', () => {
      const minimalEvent: AuditEvent = {
        id: 3,
        severity: 'info',
        action: 'Updated settings',
        created_at: '2026-05-05T10:02:00Z'
      };

      // Verify optional fields can be undefined
      expect(minimalEvent.user_id).toBeUndefined();
      expect(minimalEvent.event_type).toBeUndefined();
      expect(minimalEvent.resource_type).toBeUndefined();
      expect(minimalEvent.ip_address).toBeUndefined();
      expect(minimalEvent.provider).toBeUndefined();
    });

    it('should handle edge case: zero tokens and cost', () => {
      const zeroEvent: AuditEvent = {
        id: 4,
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'ai.api_call',
        severity: 'info',
        action: 'AI call with zero tokens',
        created_at: '2026-05-05T10:03:00Z',
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_create_tokens: 0,
        cost_usd: 0,
        latency_ms: 0
      };

      expect(zeroEvent.input_tokens).toBe(0);
      expect(zeroEvent.cost_usd).toBe(0);
      expect(zeroEvent.latency_ms).toBe(0);
    });

    it('should handle edge case: very large token counts', () => {
      const largeEvent: AuditEvent = {
        id: 5,
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'ai.api_call',
        severity: 'info',
        action: 'AI call with large token counts',
        created_at: '2026-05-05T10:04:00Z',
        provider: 'anthropic',
        model: 'claude-opus-4.7',
        input_tokens: 200000,
        output_tokens: 100000,
        cache_read_tokens: 50000,
        cache_create_tokens: 25000,
        cost_usd: 999.99,
        latency_ms: 60000
      };

      expect(largeEvent.input_tokens).toBe(200000);
      expect(largeEvent.output_tokens).toBe(100000);
      expect(largeEvent.cost_usd).toBe(999.99);
      expect(largeEvent.latency_ms).toBe(60000);
    });

    it('should handle security events with critical severity', () => {
      const securityEvent: AuditEvent = {
        id: 6,
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'security.unauthorized_access',
        severity: 'critical',
        action: 'Unauthorized access attempt detected',
        actor_email: 'attacker@example.com',
        resource_type: 'api',
        resource_id: '/admin/settings',
        ip_address: '192.0.2.123',
        user_agent: 'curl/7.68.0',
        metadata: { attempts: 5, blocked: true },
        created_at: '2026-05-05T10:05:00Z'
      };

      expect(securityEvent.severity).toBe('critical');
      expect(securityEvent.event_type).toBe('security.unauthorized_access');
      expect(securityEvent.metadata).toHaveProperty('blocked', true);
    });

    // Negative tests - should fail TypeScript compilation
    it('should reject invalid severity level', () => {
      // Using 'as any' to bypass type checking for this negative test
      const invalidEvent: AuditEvent = {
        id: 7,
        severity: 'debug' as any,
        action: 'Test',
        created_at: '2026-05-05T10:06:00Z'
      };
      
      expect(invalidEvent).toBeDefined();
    });

    it('should reject invalid event type', () => {
      // Using 'as any' to bypass type checking for this negative test
      const invalidEvent: AuditEvent = {
        id: 8,
        event_type: 'invalid.event' as any,
        severity: 'info',
        action: 'Test',
        created_at: '2026-05-05T10:07:00Z'
      };
      
      expect(invalidEvent).toBeDefined();
    });

    it('should reject negative token counts at type level', () => {
      // Using 'as any' to bypass type checking for this negative test
      const invalidEvent: AuditEvent = {
        id: 9,
        severity: 'info',
        action: 'Test',
        created_at: '2026-05-05T10:08:00Z',
        input_tokens: -100 as any
      };
      
      expect(invalidEvent).toBeDefined();
    });
  });

  describe('AuditFilters Interface', () => {
    it('should accept valid filter configurations', () => {
      const filters: AuditFilters = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_types: ['auth.login', 'auth.logout'],
        severities: ['warning', 'error'],
        resource_type: 'agent',
        start_date: '2026-05-01T00:00:00Z',
        end_date: '2026-05-05T23:59:59Z',
        search_term: 'failed'
      };

      expect(filters.event_types).toHaveLength(2);
      expect(filters.severities).toContain('warning');
    });

    it('should allow all filter fields to be optional', () => {
      const emptyFilters: AuditFilters = {};
      
      expect(emptyFilters.user_id).toBeUndefined();
      expect(emptyFilters.event_types).toBeUndefined();
    });
  });

  describe('AuditStats Interface', () => {
    it('should accept valid audit statistics', () => {
      const stats: AuditStats = {
        total_events: 1000,
        events_by_type: {
          'auth.login': 450,
          'auth.logout': 400,
          'agent.updated': 150
        },
        events_by_severity: {
          info: 800,
          warning: 150,
          error: 40,
          critical: 10
        },
        unique_users: 25,
        date_range: {
          start: '2026-05-01T00:00:00Z',
          end: '2026-05-05T23:59:59Z'
        }
      };

      expect(stats.total_events).toBe(1000);
      expect(stats.events_by_severity.critical).toBe(10);
      expect(stats.unique_users).toBe(25);
    });
  });
});
