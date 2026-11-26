import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { adminPool, createUser } from "./helpers";

const { plan, streamContext } = vi.hoisted(() => ({
  plan: vi.fn(async () => ({ reply: "Saved reply", changes: [], toolToggles: [], actions: [] })),
  streamContext: vi.fn(() => ({})),
}));
vi.mock("../../src/lib/workspace-planner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/workspace-planner")>()),
  planWorkspace: plan,
  buildWorkspaceStreamContext: streamContext,
}));
vi.mock("../../src/lib/ai-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/ai-client")>()),
  isRuntimeAvailable: () => true,
}));
vi.mock("../../src/lib/ai-structured", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/ai-structured")>()),
  runStructuredStream: async () => ({ result: { reply: "Streamed reply" } }),
}));
function pass(_req: Request, _res: Response, next: NextFunction) {
  next();
}
vi.mock("../../src/middleware/auth", () => ({
  authenticateUser: pass,
  authenticateEventStream: pass,
}));
vi.mock("../../src/middleware/api-rate-limits", () => ({
  claudeRateLimiter: pass,
  smsRateLimit: pass,
}));
vi.mock("../../src/lib/spend-guards", () => ({
  enforceSpendCap: pass,
  enforcePrivateTextSimulationSpendCap: pass,
}));
vi.mock("../../src/middleware/audit-middleware", () => ({ withAudit: () => pass }));

const pool = adminPool();
const { tenantStore } = await import("../../src/lib/server-context");
const { default: router } = await import("../../src/routes/agent-workspace-routes");
let server: Server;
let owner: string;
const bot = randomUUID();
const thread = randomUUID();
let base: string;

beforeAll(async () => {
  owner = await createUser(pool, "studio-history");
  await pool.query("INSERT INTO wireline_agents (id, user_id, name) VALUES ($1, $2, 'Test Bot')", [
    bot,
    owner,
  ]);
  await pool.query(
    "INSERT INTO wireline_agent_conversation_messages (agent_id,user_id,role,content) VALUES ($1,$2,'Account Holder','Old conversation')",
    [bot, owner],
  );
  const app = express();
  app.use(
    express.json(),
    (req, _res, next) => {
      Object.assign(req, { user: { id: owner } });
      tenantStore.run(owner, next);
    },
    router,
  );
  const errors: ErrorRequestHandler = (e, _req, res, _next) =>
    res.status(e.statusCode || e.status || 500).json({ error: e.message });
  app.use(errors);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agents/${bot}/workspace/messages`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

it("keeps legacy, new, and resumed chats distinct for both composer routes and files only the selected chat", async () => {
  const send = (path: string, content: string) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  const read = async (path: string) => {
    const response = await fetch(base + path);
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    return data;
  };
  expect((await read("")).messages[0].content).toBe("Old conversation");
  expect((await read(`?thread=${thread}`)).messages).toEqual([]);
  const first = await send(`?thread=${thread}`, "Schedule office hours");
  expect(first.status, await first.text()).toBe(200);
  expect(plan).toHaveBeenCalledWith(expect.objectContaining({ history: [] }));
  const streamed = await send(`/stream?thread=${thread}`, "Use Tuesday");
  expect(await streamed.text()).toContain("Streamed reply");
  expect(streamContext).toHaveBeenCalledWith(
    expect.objectContaining({
      history: [
        { role: "Account Holder", content: "Schedule office hours" },
        { role: "agent", content: "Saved reply" },
      ],
    }),
  );
  const moved = await fetch(base + `?thread=${thread}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: "Operations" }),
  });
  expect(await moved.json()).toEqual({ project: "Operations" });
  expect((await read("?view=history")).threads).toMatchObject([
    { id: thread, title: "Schedule office hours", project: "Operations" },
    { id: "legacy", title: "Earlier conversation", project: null },
  ]);
  const cleared = await fetch(base + `?thread=${thread}`, { method: "DELETE" });
  expect(await cleared.json()).toEqual({ cleared: true });
  expect((await read("?view=history")).threads.map((chat: { id: string }) => chat.id)).toEqual([
    "legacy",
  ]);
  expect((await read("?thread=legacy")).messages[0].content).toBe("Old conversation");
});
