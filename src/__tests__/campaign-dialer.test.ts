import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignDialerService } from '../services/campaign-dialer';
import { drizzle } from '../lib/server-context';
import * as schema from '../db/schema';
import { placeOutboundCall } from '../lib/vapi-client';

vi.mock('../lib/vapi-client', () => ({
  placeOutboundCall: vi.fn(),
}));

vi.mock('../lib/server-context', () => ({
  drizzle: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    }))
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe('CampaignDialerService', () => {
  let service: CampaignDialerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CampaignDialerService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('isWithinWindow should return true for 10:00 when window is 09:00-17:00', () => {
    const result = (service as any).isWithinWindow('09:00', '17:00', '10:00');
    expect(result).toBe(true);
  });

  it('isWithinWindow should return false for 18:00 when window is 09:00-17:00', () => {
    const result = (service as any).isWithinWindow('09:00', '17:00', '18:00');
    expect(result).toBe(false);
  });

  it('processCampaignLeads should process eligible leads', async () => {
    const mockLeads = [
      { id: 1, status: 'Pending', attempts: 0, customerNumber: '+1234567890', userId: 'user1' }
    ];
    
    // Mock the leads selection
    (drizzle.select() as any).from.mockReturnValueOnce({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(mockLeads))
      }))
    });

    // Mock dialLead
    const dialLeadSpy = vi.spyOn(service as any, 'dialLead').mockResolvedValue(undefined);

    await (service as any).processCampaignLeads({ id: 'camp1', maxAttempts: 3 });

    expect(dialLeadSpy).toHaveBeenCalledWith(mockLeads[0], { id: 'camp1', maxAttempts: 3 });
  });

  it('dialLead should call placeOutboundCall for valid leads', async () => {
    const lead = { id: 1, userId: 'user1', customerNumber: '+1234567890', customerName: 'John', context: 'Test', attempts: 0 };
    const campaign = { id: 'camp1', agentId: 'agent1', goal: 'Goal' };

    (placeOutboundCall as any).mockResolvedValue({ ok: true, callId: 'call123' });

    await (service as any).dialLead(lead, campaign);

    expect(placeOutboundCall).toHaveBeenCalledWith({
      userId: 'user1',
      agentId: 'agent1',
      customerNumber: '+1234567890',
      customerName: 'John',
      context: 'Test'
    });
  });
});
