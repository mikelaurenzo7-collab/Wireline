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

      expect(event.id).toBe(1);
      expect(event.event_type).toBe('auth.login');
      expect(event.severity).toBe('info');
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
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        event_type: 'settings.updated',
        severity: 'info',
        action: 'Updated settings',
        actor_email: 'user@example.com',
        created_at: '2026-05-05T10:02:00Z'
      };

      expect(minimalEvent.resource_type).toBeUndefined();
      expect(minimalEvent.ip_address).toBeUndefined();
      expect(minimalEvent.provider).toBeUndefined();
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
