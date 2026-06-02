import { describe, expect, it, vi } from "vitest";
import { createAuditExportHandler, type AuditRoutesDeps } from "./audit-handlers.js";

function createResponseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    send: vi.fn(),
    setHeader: vi.fn(),
  };
}

function createExportDeps(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const logDataOperation = vi.fn().mockResolvedValue(undefined);

  const deps: AuditRoutesDeps = {
    drizzle: { select } as unknown as AuditRoutesDeps["drizzle"],
    auditLogger: { logDataOperation },
    log: { error: vi.fn() },
  };

  return { deps, select, from, where, orderBy, limit, logDataOperation };
}

describe("createAuditExportHandler", () => {
  it("rejects unsupported export formats before querying", async () => {
    const { deps, select } = createExportDeps([]);
    const handler = createAuditExportHandler(deps);
    const res = createResponseMock();

    await handler(
      {
        user: { id: "user-1" },
        query: { format: "xml" },
      },
      res,
    );

    expect(select).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid export format" });
  });

  it("normalizes JSON export payloads to snake_case", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z");
    const { deps, logDataOperation } = createExportDeps([
      {
        id: 7n,
        eventType: "ai.api_call",
        actorEmail: "ops@wireline.example",
        resourceId: "lead-42",
        createdAt,
        ipAddress: "127.0.0.1",
      },
    ]);
    const handler = createAuditExportHandler(deps);
    const res = createResponseMock();

    await handler(
      {
        user: { id: "user-1" },
        query: { format: "JSON", days: "14" },
        ip: "127.0.0.1",
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "7",
        event_type: "ai.api_call",
        actor_email: "ops@wireline.example",
        resource_id: "lead-42",
        created_at: createdAt.toISOString(),
        ip_address: "127.0.0.1",
      },
    ]);
    expect(logDataOperation).toHaveBeenCalledWith(
      "export",
      expect.objectContaining({ userId: "user-1", resourceType: "audit_log", recordCount: 1 }),
    );
  });

  it("escapes formula-looking CSV values", async () => {
    const { deps } = createExportDeps([
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        eventType: "ai.api_call",
        severity: "info",
        action: "=cmd|' /C calc'!A0",
        actorEmail: "ops@wireline.example",
        resourceType: "lead",
        resourceId: "lead-42",
        ipAddress: "127.0.0.1",
        costUsd: "0.01",
        latencyMs: 25,
      },
    ]);
    const handler = createAuditExportHandler(deps);
    const res = createResponseMock();

    await handler(
      {
        user: { id: "user-1" },
        query: {},
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send.mock.calls[0][0]).toContain(`"'=cmd|' /C calc'!A0"`);
  });

  it("rejects oversized exports and caps audit logging counts", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      createdAt: `2026-06-01T00:00:${String(i).padStart(2, "0")}Z`,
      eventType: "ai.api_call",
      severity: "info",
      action: "chat",
    }));
    const { deps, limit, logDataOperation } = createExportDeps(rows);
    const handler = createAuditExportHandler(deps);
    const res = createResponseMock();

    await handler(
      {
        user: { id: "user-1" },
        query: { format: "csv" },
      },
      res,
    );

    expect(limit).toHaveBeenCalledWith(5001);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Audit export exceeds 5,000 rows. Narrow your filters and try again.",
    });
    expect(res.send).not.toHaveBeenCalled();
    expect(logDataOperation).toHaveBeenCalledWith(
      "export",
      expect.objectContaining({ recordCount: 5000 }),
    );
  });
});
