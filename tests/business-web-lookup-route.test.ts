import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, { guards: unknown[]; handler: Handler }>(),
  owns: true,
  research: vi.fn(),
  writes: 0,
}));

vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: unknown[]) =>
          h.routes.set(`${method} ${path}`, {
            guards: handlers.slice(0, -1),
            handler: handlers.at(-1) as Handler,
          }),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: "authenticateUser" }));
vi.mock("../src/middleware/website-knowledge-rate-limits", () => ({
  websiteKnowledgeBurstRateLimit: "burst",
  websiteKnowledgeDailyRateLimit: "daily",
}));
vi.mock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: "launchGate" }));
vi.mock("../src/lib/spend-guards", () => ({
  enforcePrivateTextSimulationSpendCap: "privateSpendCap",
}));
vi.mock("../src/lib/website-knowledge-service", () => ({ importWebsiteKnowledge: vi.fn() }));
vi.mock("../src/lib/fresh-public-research", () => ({ freshPublicResearch: h.research }));
vi.mock("../src/lib/server-context", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => (h.owns ? [{ id: "bot" }] : []),
    insert: () => {
      h.writes += 1;
      return chain;
    },
  };
  return { drizzle: chain, log: { info: vi.fn(), error: vi.fn() } };
});

import "../src/routes/website-knowledge-routes";

async function lookUp(body: unknown) {
  const json = vi.fn();
  await h.routes
    .get("post /api/agent-config/:id/web-lookup")!
    .handler({ user: { id: "tenant" }, params: { id: "bot" }, body }, { json });
  return json.mock.calls[0]?.[0];
}

beforeEach(() => {
  h.owns = true;
  h.writes = 0;
  h.research.mockReset();
});

describe("Bo looks a business up before anything is saved", () => {
  it("runs behind the website importer's guards and the private spend cap", () => {
    expect(h.routes.get("post /api/agent-config/:id/web-lookup")!.guards).toEqual([
      "authenticateUser",
      "burst",
      "daily",
      "launchGate",
      "privateSpendCap",
    ]);
  });

  it("writes the research question itself and returns what was found, saving nothing", async () => {
    h.research.mockResolvedValue({
      answer: "Rivera Plumbing serves Austin. Open 8 to 6.",
      sources: [{ title: "Rivera Plumbing", uri: "https://rivera.example" }],
      mode: "web_search",
    });

    expect(await lookUp({ business: "  Rivera   Plumbing in Austin " })).toEqual({
      found: true,
      answer: "Rivera Plumbing serves Austin. Open 8 to 6.",
      sources: [{ title: "Rivera Plumbing", uri: "https://rivera.example" }],
    });
    const question = h.research.mock.calls[0]![0] as string;
    expect(question).toContain('"Rivera Plumbing in Austin"');
    expect(question).toContain("If you cannot find this exact business, say so.");
    expect(h.writes).toBe(0);
  });

  it("reports nothing found when research is unavailable", async () => {
    h.research.mockResolvedValue({
      answer: "Unable to look that up.",
      sources: [],
      mode: "unavailable",
    });
    expect(await lookUp({ business: "Rivera Plumbing" })).toEqual({
      found: false,
      answer: "",
      sources: [],
    });
  });

  it("refuses an empty or oversized description and another account's Bot", async () => {
    await expect(lookUp({ business: " " })).rejects.toMatchObject({ status: 400 });
    await expect(lookUp({ business: "x".repeat(601) })).rejects.toMatchObject({ status: 400 });
    h.owns = false;
    await expect(lookUp({ business: "Rivera Plumbing" })).rejects.toMatchObject({ status: 404 });
    expect(h.research).not.toHaveBeenCalled();
  });
});
