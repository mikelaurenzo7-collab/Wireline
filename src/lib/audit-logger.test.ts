// src/lib/audit-logger.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { AuditLogger } from "./audit-logger";

// Type for chainable insert mock
interface InsertChain {
  values: Mock;
  [key: string]: Mock | InsertChain;
}

describe("AuditLogger", () => {
  let mockDrizzle: any;
  let logger: AuditLogger;
  let insertChain: InsertChain;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Create chainable mock object for insert().values() pattern
    insertChain = {
      values: vi.fn(() => Promise.resolve({ success: true })),
    };

    mockDrizzle = {
      insert: vi.fn(() => insertChain),
    };

    logger = new AuditLogger(mockDrizzle);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should log auth events", async () => {
    const result = await logger.logAuth("login", {
      userId: "user-123",
      email: "test@example.com",
      ip: "192.168.1.1",
      userAgent: "Test Browser",
    });

    expect(result.success).toBe(true);
    expect(mockDrizzle.insert).toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.login",
        userId: "user-123",
        action: "login",
        severity: "info",
      }),
    );
  });

  it("should log security events with critical severity", async () => {
    const result = await logger.logSecurity("unauthorized_access", {
      userId: "user-123",
      resource: "agent-settings",
      ip: "192.168.1.1",
    });

    expect(result.success).toBe(true);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "security.unauthorized_access",
        severity: "critical",
      }),
    );
  });

  it("should log agent operations", async () => {
    const result = await logger.logAgentOperation("created", {
      userId: "user-123",
      agentId: "node-sales-1",
      agentName: "Sales Agent",
      metadata: { role: "sales" },
    });

    expect(result.success).toBe(true);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent.created",
        resourceType: "agent",
        resourceId: "node-sales-1",
      }),
    );
  });

  it("should handle database errors gracefully", async () => {
    insertChain.values.mockRejectedValue(new Error("Database connection failed"));

    const result = await logger.logAuth("login", {
      userId: "user-123",
      email: "test@example.com",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database connection failed");
  });

  it("should track failure count", async () => {
    insertChain.values.mockRejectedValue(new Error("Error 1"));

    await logger.logAuth("login", { userId: "user-123", email: "test@example.com" });
    await logger.logAuth("login", { userId: "user-123", email: "test@example.com" });

    const stats = logger.getStats();
    expect(stats.failureCount).toBe(2);
  });
});
