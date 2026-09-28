import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  execute: vi.fn(),
  plan: vi.fn(),
  tenant: vi.fn((_id, work) => work()),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { execute: h.execute },
  tenantStore: { run: h.tenant },
  quotaTracker: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/computer-planner", () => ({ planComputerStep: h.plan }));
vi.mock("../src/lib/agent-draft-service", () => ({
  createAgentDraft: vi.fn(),
  getAgentDraft: vi.fn(),
  updateAgentDraft: vi.fn(),
}));
vi.mock("../src/lib/mcp-agent-coaching", () => ({
  getAgentCoachingBrief: vi.fn(),
  addAgentTrainingItem: vi.fn(),
}));
vi.mock("../src/lib/private-agent-test", () => ({ runPrivateAgentTestTurn: vi.fn() }));
vi.mock("../src/lib/voice/openai-realtime-service", () => ({
  createOpenAIRealtimeSimulationCall: vi.fn(),
}));
vi.mock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: vi.fn() }));
vi.mock("../src/middleware/audit-middleware", () => ({}));
import router from "../src/routes/chatgpt-mcp-account-routes";
afterEach(() => vi.unstubAllEnvs());

let scopes: string | null;
beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_TOKEN_PEPPER", "test-pepper-at-least-thirty-two-characters");
  vi.stubEnv("APP_URL", "https://botbound.app");
  scopes = "agents.read computer.plan";
  h.execute.mockReset().mockImplementation(async () => ({
    rows:
      scopes === null
        ? []
        : [
            {
              user_id: "owner-1",
              email: "owner@example.test",
              client_id: "botbound-desktop",
              resource: "https://botbound.app/mcp",
              scope: scopes,
              expires_at: new Date(Date.now() + 60_000),
            },
          ],
  }));
  h.plan
    .mockReset()
    .mockResolvedValue({ decision: "needs_input", summary: "Select a window", action: null });
  h.tenant.mockClear();
});
async function call(authorization = "Bearer fixture") {
  const route = router.stack.find((layer) => layer.route?.path === "/mcp")!.route!;
  const handler = route.stack[0].handle;
  const req = {
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "plan_computer_step", arguments: { agent_id: "agent-1" } },
    },
    get: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined),
  };
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  await handler(req as never, res as never, vi.fn());
  return res;
}
describe("computer MCP authority", () => {
  it.each([null, "agents.read agents.write demo.voice", "computer.plan"])(
    "denies absent/revoked/insufficient grant %s before planning",
    async (scope) => {
      scopes = scope;
      const result = await call();
      expect(result.statusCode).toBe(scope === null ? 401 : 403);
      expect(h.plan).not.toHaveBeenCalled();
      expect(h.tenant).not.toHaveBeenCalled();
    },
  );
  it("does not authorize an anonymous public caller", async () => {
    expect((await call("")).statusCode).toBe(401);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.plan).not.toHaveBeenCalled();
  });
  it("binds planning to the OAuth subject and returns a proposal without executing it", async () => {
    const result = await call();
    expect(result.statusCode).toBe(200);
    expect(h.tenant).toHaveBeenCalledWith("owner-1", expect.any(Function));
    expect(h.plan).toHaveBeenCalledWith("owner-1", { agent_id: "agent-1" });
    expect(result.body).toMatchObject({
      result: {
        structuredContent: { decision: "needs_input", action: null },
        _meta: { execution: "local_owner_approval_required" },
      },
    });
  });
});
