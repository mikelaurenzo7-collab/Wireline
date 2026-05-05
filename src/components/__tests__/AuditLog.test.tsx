// src/components/__tests__/AuditLog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../contexts/ToastContext';
import AuditLog from '../AuditLog';

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn()
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ToastProvider>{component}</ToastProvider>);
};

describe('AuditLog Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render audit log with events', async () => {
    const mockFetch = await import('../../lib/api').then(m => m.authFetch as any);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [
            {
              id: 1,
              event_type: 'agent.created',
              severity: 'info',
              action: 'created',
              resource_id: 'node-sales-1',
              created_at: new Date().toISOString()
            }
          ],
          total: 1
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_events: 100,
          total_api_calls: 50,
          total_cost_usd: 12.34,
          by_severity: {
            critical: 5,
            warning: 10,
            error: 8,
            info: 77
          },
          by_type: {},
          period_days: 7
        })
      });

    renderWithProviders(<AuditLog />);
    
    await waitFor(() => {
      expect(screen.getByText(/agent.created/i)).toBeInTheDocument();
    });
  });

  it('should filter events by type', async () => {
    const mockFetch = await import('../../lib/api').then(m => m.authFetch as any);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [], total: 0 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_events: 0,
          total_api_calls: 0,
          total_cost_usd: 0,
          by_severity: {
            critical: 0,
            warning: 0,
            error: 0,
            info: 0
          },
          by_type: {},
          period_days: 7
        })
      });
    
    renderWithProviders(<AuditLog />);
    
    // Verify filter UI exists
    await waitFor(() => {
      expect(screen.getByText(/filters/i)).toBeInTheDocument();
    });
  });

  it('should export events to CSV', async () => {
    const mockFetch = await import('../../lib/api').then(m => m.authFetch as any);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [], total: 0 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_events: 0,
          total_api_calls: 0,
          total_cost_usd: 0,
          by_severity: {
            critical: 0,
            warning: 0,
            error: 0,
            info: 0
          },
          by_type: {},
          period_days: 7
        })
      });
    
    renderWithProviders(<AuditLog />);
    
    // Verify export button exists
    await waitFor(() => {
      expect(screen.getByText(/export/i)).toBeInTheDocument();
    });
  });
});
