import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchSalesforceContacts: vi.fn(),
  logSalesforceCall: vi.fn(),
  createSalesforceOpportunity: vi.fn(),
  searchHubSpotContacts: vi.fn(),
  logHubSpotCall: vi.fn(),
  createHubSpotDeal: vi.fn(),
  dbFrom: vi.fn(),
}));

vi.mock('./salesforce-service', () => ({
  searchContacts: mocks.searchSalesforceContacts,
  logCall: mocks.logSalesforceCall,
  createOpportunity: mocks.createSalesforceOpportunity,
}));

vi.mock('./hubspot-service', () => ({
  searchContacts: mocks.searchHubSpotContacts,
  logCall: mocks.logHubSpotCall,
  createDeal: mocks.createHubSpotDeal,
}));

vi.mock('./server-context', () => ({
  db: {
    from: mocks.dbFrom,
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockDbConnection(provider: 'salesforce' | 'hubspot' | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: provider ? { provider } : null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: provider ? { provider } : null,
    }),
  };
  mocks.dbFrom.mockReturnValue(chain);
  return chain;
}

describe('CRMService.logCall', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {});

  it('auto-selects Salesforce when a connection exists and links the best phone match', async () => {
    mockDbConnection('salesforce');
    mocks.searchSalesforceContacts.mockResolvedValue([
      { sf_id: 'sf-other', phone: '+1 555 000 0000' },
      { sf_id: 'sf-match', phone: '+1 (555) 123-4567' },
    ]);
    mocks.logSalesforceCall.mockResolvedValue('task-123');

    const { CRMService } = await import('./crm-service');
    const service = new CRMService('user-1');

    const activityId = await service.logCall({
      crmType: 'auto',
      subject: 'Wireline call',
      description: 'Summary',
      to_number: '+15551234567',
      outcome: 'connected',
    });

    expect(activityId).toBe('task-123');
    expect(mocks.searchSalesforceContacts).toHaveBeenCalledWith('+15551234567', 'user-1');
    expect(mocks.logSalesforceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'sf-match',
        subject: 'Wireline call',
        description: 'Summary',
        outcome: 'connected',
      }),
      'user-1',
    );
  });

  it('uses HubSpot when explicitly requested and falls back to the first search result', async () => {
    mockDbConnection('hubspot');
    mocks.searchHubSpotContacts.mockResolvedValue([
      { hs_id: 'hs-first', phone: null },
      { hs_id: 'hs-second', phone: '+15559876543' },
    ]);
    mocks.logHubSpotCall.mockResolvedValue('call-789');

    const { CRMService } = await import('./crm-service');
    const service = new CRMService('user-2');

    const activityId = await service.logCall({
      crmType: 'hubspot',
      subject: 'Ignored by HubSpot',
      description: 'Detailed summary',
      to_number: '+15550001111',
      duration_minutes: 2,
      outcome: 'completed',
    });

    expect(activityId).toBe('call-789');
    expect(mocks.searchHubSpotContacts).toHaveBeenCalledWith('+15550001111', 'user-2');
    expect(mocks.logHubSpotCall).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'hs-first',
        to_number: '+15550001111',
        duration_ms: 120000,
        body: 'Detailed summary',
        outcome: 'completed',
      }),
      'user-2',
    );
  });

  it('returns null when no CRM connection exists', async () => {
    mockDbConnection(null);

    const { CRMService } = await import('./crm-service');
    const service = new CRMService('user-3');

    const activityId = await service.logCall({
      crmType: 'auto',
      subject: 'Wireline call',
      description: 'Summary',
      to_number: '+15551234567',
    });

    expect(activityId).toBeNull();
    expect(mocks.searchSalesforceContacts).not.toHaveBeenCalled();
    expect(mocks.searchHubSpotContacts).not.toHaveBeenCalled();
    expect(mocks.logSalesforceCall).not.toHaveBeenCalled();
    expect(mocks.logHubSpotCall).not.toHaveBeenCalled();
  });
});
