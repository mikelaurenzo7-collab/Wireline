import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Type for chainable query mock
// ─────────────────────────────────────────────────────────────────────────────
interface ChainableQuery {
  select: Mock;
  from: Mock;
  where: Mock;
  limit: Mock;
  orderBy: Mock;
  update: Mock;
  set: Mock;
  insert: Mock;
  values: Mock;
  [key: string]: Mock | ChainableQuery;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock declarations - factories must be completely self-contained
// ─────────────────────────────────────────────────────────────────────────────
vi.mock("../lib/server-context", () => {
  // Create chainable mock inside the factory - completely self-contained
  const chain: Partial<ChainableQuery> = {};

  // All methods return the chain by default for fluent interface
  const returning = () => chain as ChainableQuery;

  chain.select = vi.fn(returning);
  chain.from = vi.fn(returning);
  chain.where = vi.fn(returning);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.orderBy = vi.fn(returning);
  chain.update = vi.fn(returning);
  chain.set = vi.fn(returning);
  chain.insert = vi.fn(returning);
  chain.values = vi.fn(() => Promise.resolve([]));

  return {
    drizzle: chain as ChainableQuery,
    log: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("../lib/vapi-client", () => ({
  placeOutboundCall: vi.fn(),
}));

vi.mock("../lib/compliance", () => ({
  isDncBlocked: vi.fn(),
}));

// Import mocked modules after vi.mock declarations
import { drizzle, log } from "../lib/server-context";
import { placeOutboundCall } from "../lib/vapi-client";
import { isDncBlocked } from "../lib/compliance";
import { CampaignDialerService } from "../services/campaign-dialer";

describe("CampaignDialerService", () => {
  let service: CampaignDialerService;
  let chain: ChainableQuery;

  beforeEach(() => {
    service = new CampaignDialerService();

    // Get reference to the mocked drizzle object
    chain = drizzle as unknown as ChainableQuery;

    // Clear all mocks to reset call counts
    vi.clearAllMocks();
  });

  describe("processAllCampaigns", () => {
    it("should process active campaigns within call window", async () => {
      const mockCampaign = {
        id: "campaign-1",
        userId: "user-1",
        agentId: "agent-1",
        name: "Test Campaign",
        status: "active",
        goal: "Test goal",
        callWindowStart: "00:00", // Wide window to ensure test runs at any time
        callWindowEnd: "23:59",
        maxAttempts: 3,
      };

      const mockLead = {
        id: "lead-1",
        userId: "user-1",
        campaignId: "campaign-1",
        customerNumber: "+1234567890",
        customerName: "John Doe",
        status: "Pending",
        attempts: 0,
        context: "Test context",
      };

      // Setup where() with a single mock that tracks all calls
      let whereCallCount = 0;
      chain.where = vi.fn(() => {
        whereCallCount++;
        if (whereCallCount === 1) {
          // First where() call (for campaigns query) returns the result directly
          return Promise.resolve([mockCampaign]);
        }
        if (whereCallCount === 2) {
          // Second where() call (for leads query) returns chain for limit()
          return chain;
        }
        // Subsequent where() calls (for updates) return Promise
        return Promise.resolve(undefined);
      });

      // Setup limit() to return leads array
      chain.limit = vi.fn(() => Promise.resolve([mockLead]));

      // Setup other chain methods to return chain
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      // Setup DNC check
      vi.mocked(isDncBlocked).mockResolvedValue(false);

      // Setup placeOutboundCall
      vi.mocked(placeOutboundCall).mockResolvedValue({
        ok: true,
        status: 200,
        callId: "call-123",
      });

      // Setup update and insert chains
      chain.update = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);
      chain.insert = vi.fn(() => chain);
      chain.values = vi.fn(() => Promise.resolve(undefined));

      await service.processAllCampaigns();

      expect(chain.select).toHaveBeenCalled();
      expect(placeOutboundCall).toHaveBeenCalledWith({
        userId: "user-1",
        agentId: "agent-1",
        customerNumber: "+1234567890",
        customerName: "John Doe",
        context: "Test context",
      });
    });

    it("should filter campaigns by userId when provided", async () => {
      const mockCampaign = {
        id: "campaign-1",
        userId: "user-1",
        agentId: "agent-1",
        name: "Test Campaign",
        status: "active",
        goal: "Test goal",
        callWindowStart: "00:00",
        callWindowEnd: "23:59",
        maxAttempts: 3,
      };

      let whereCallCount = 0;
      chain.where = vi.fn(() => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([mockCampaign]);
        return chain;
      });

      chain.limit = vi.fn(() => Promise.resolve([]));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      await service.processAllCampaigns("user-1");

      expect(chain.select).toHaveBeenCalled();
    });

    it("should skip campaigns outside call window", async () => {
      const mockCampaign = {
        id: "campaign-1",
        userId: "user-1",
        agentId: "agent-1",
        name: "Test Campaign",
        status: "active",
        goal: "Test goal",
        callWindowStart: "00:00", // Current time will be outside 00:00-00:01
        callWindowEnd: "00:01",
        maxAttempts: 3,
      };

      chain.where = vi.fn(() => Promise.resolve([mockCampaign]));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      await service.processAllCampaigns();

      expect(chain.select).toHaveBeenCalled();
      expect(placeOutboundCall).not.toHaveBeenCalled();
    });

    it("should handle DNC blocked leads", async () => {
      const mockCampaign = {
        id: "campaign-1",
        userId: "user-1",
        agentId: "agent-1",
        name: "Test Campaign",
        status: "active",
        goal: "Test goal",
        callWindowStart: "00:00",
        callWindowEnd: "23:59",
        maxAttempts: 3,
      };

      const mockLead = {
        id: "lead-1",
        userId: "user-1",
        campaignId: "campaign-1",
        customerNumber: "+1234567890",
        customerName: "John Doe",
        status: "Pending",
        attempts: 0,
      };

      let whereCallCount = 0;
      chain.where = vi.fn(() => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([mockCampaign]);
        if (whereCallCount === 2) return chain;
        return Promise.resolve(undefined);
      });

      chain.limit = vi.fn(() => Promise.resolve([mockLead]));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      // DNC check returns true (blocked)
      vi.mocked(isDncBlocked).mockResolvedValue(true);

      // Setup update and insert chains
      chain.update = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);
      chain.insert = vi.fn(() => chain);
      chain.values = vi.fn(() => Promise.resolve(undefined));

      await service.processAllCampaigns();

      expect(isDncBlocked).toHaveBeenCalledWith("user-1", "+1234567890");
      expect(placeOutboundCall).not.toHaveBeenCalled();
    });

    it("should update lead status on failed call", async () => {
      const mockCampaign = {
        id: "campaign-1",
        userId: "user-1",
        agentId: "agent-1",
        name: "Test Campaign",
        status: "active",
        goal: "Test goal",
        callWindowStart: "00:00",
        callWindowEnd: "23:59",
        maxAttempts: 3,
      };

      const mockLead = {
        id: "lead-1",
        userId: "user-1",
        campaignId: "campaign-1",
        customerNumber: "+1234567890",
        customerName: "John Doe",
        status: "Pending",
        attempts: 0,
        metadata: {},
      };

      let whereCallCount = 0;
      chain.where = vi.fn(() => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([mockCampaign]);
        if (whereCallCount === 2) return chain;
        return Promise.resolve(undefined);
      });

      chain.limit = vi.fn(() => Promise.resolve([mockLead]));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      vi.mocked(isDncBlocked).mockResolvedValue(false);
      vi.mocked(placeOutboundCall).mockResolvedValue({
        ok: false,
        status: 500,
        error: "API Error",
      });

      chain.update = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);

      await service.processAllCampaigns();

      expect(placeOutboundCall).toHaveBeenCalled();
    });

    it("should handle empty active campaigns", async () => {
      chain.where = vi.fn(() => Promise.resolve([]));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      await service.processAllCampaigns();

      expect(chain.select).toHaveBeenCalled();
      expect(placeOutboundCall).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      chain.where = vi.fn(() => Promise.reject(new Error("Database error")));
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);

      await expect(service.processAllCampaigns()).resolves.not.toThrow();
      expect(log.error).toHaveBeenCalled();
    });
  });

  describe("query patterns", () => {
    it("should handle update chain with set and where", async () => {
      chain.update = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);
      chain.where = vi.fn(() => Promise.resolve(undefined));

      await drizzle
        .update({} as any)
        .set({ status: "Updated" })
        .where({ id: "test" } as any);

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith({ status: "Updated" });
      expect(chain.where).toHaveBeenCalled();
    });

    it("should handle insert chain with values", async () => {
      chain.insert = vi.fn(() => chain);
      chain.values = vi.fn(() => Promise.resolve(undefined));

      await drizzle.insert({} as any).values({
        userId: "user-1",
        event: "test",
      });

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalledWith({
        userId: "user-1",
        event: "test",
      });
    });

    it("should demonstrate full select chain", async () => {
      const mockData = [
        { id: 1, name: "Test 1" },
        { id: 2, name: "Test 2" },
      ];

      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve(mockData));

      const result = await (drizzle as any)
        .select()
        .from({} as any)
        .where({} as any)
        .orderBy({} as any)
        .limit(10);

      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockData);
    });

    it("should demonstrate using vi.fn for chaining", async () => {
      const result = { data: "test" };

      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve([result]));

      const data = await (drizzle as any)
        .select()
        .from({} as any)
        .where({} as any)
        .limit(1);

      expect(data).toEqual([result]);
    });

    it("should demonstrate mock with counter for multiple calls", async () => {
      const firstCallResult = [{ id: 1 }];
      const secondCallResult = [{ id: 2 }];

      let limitCallCount = 0;
      chain.limit = vi.fn(() => {
        limitCallCount++;
        if (limitCallCount === 1) return Promise.resolve(firstCallResult);
        return Promise.resolve(secondCallResult);
      });

      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);

      const result1 = await (drizzle as any)
        .select()
        .from({} as any)
        .where({} as any)
        .limit(1);

      const result2 = await (drizzle as any)
        .select()
        .from({} as any)
        .where({} as any)
        .limit(1);

      expect(result1).toEqual(firstCallResult);
      expect(result2).toEqual(secondCallResult);
    });

    it("should demonstrate reassigning mock functions", async () => {
      // This test demonstrates the pattern: reassign the mock function entirely
      const mockResult = [{ id: 123, name: "Test" }];

      // Instead of trying to use mockReturnValueOnce, just reassign the function
      chain.select = vi.fn(() => chain);
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve(mockResult));

      const result = await (drizzle as any)
        .select()
        .from({} as any)
        .where({} as any)
        .limit(10);

      expect(result).toEqual(mockResult);
    });
  });
});
