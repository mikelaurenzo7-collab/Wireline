import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/agent-call-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const ledger = readFileSync("src/components/OutcomeLedger.tsx", "utf8");

describe("agent outcome scope", () => {
  it("proves agent ownership and scopes calls by tenant plus agent before pagination", () => {
    expect(route).toContain('"/api/agents/:agentId/calls"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("eq(schema.agents.id, agentId)");
    expect(route).toContain("eq(schema.agents.userId, req.user.id)");
    expect(route).toContain("eq(schema.callLogs.userId, req.user.id)");
    expect(route).toContain("eq(schema.callLogs.agentId, agentId)");
    expect(route).toContain(".where(callScope)");
    expect(route).toContain(".orderBy(desc(schema.callLogs.createdAt))");
    expect(route).toContain(".limit(limit)");
    expect(route.indexOf(".where(callScope)")).toBeLessThan(route.indexOf(".limit(limit)"));
  });

  it("preserves authenticated recording proxies and private response caching", () => {
    expect(route).toContain("`/api/calls/${String(call.id)}/recording`");
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(route).not.toContain("recordingUrl: call.recordingUrl,");
  });

  it("registers the scoped route and uses it only for agent ledgers", () => {
    expect(registry).toContain('import agentCallRouter from "../routes/agent-call-routes";');
    expect(registry).toContain("app.use(agentCallRouter);");
    expect(ledger).toContain(
      "`/api/agents/${encodeURIComponent(agentId)}/calls?limit=${limit}`",
    );
    expect(ledger).toContain("`/api/calls?limit=${limit}`");
    expect(ledger).toContain("!agentId || row.agent_id === agentId");
  });
});
