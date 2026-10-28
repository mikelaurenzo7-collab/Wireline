import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  tenantStore: { exit: (fn: () => unknown) => fn() },
}));

import { mergeMeaningMatches } from "../src/lib/agent-knowledge-search";
import { drizzle } from "../src/lib/server-context";
import {
  compileKnowledgeDocument,
  knowledgeContentHash,
  knowledgeIndexHealth,
  resetKnowledgeIndexSweepState,
  syncStaleKnowledgeIndexes,
} from "../src/lib/knowledge-index";
import {
  KNOWLEDGE_SEARCH_URL,
  isKnowledgeIndexConfigured,
  parseKnowledgeIndexState,
  searchKnowledgeIndex,
  semanticKnowledgeMatches,
} from "../src/lib/knowledge-index-search";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const COLLECTION = "collection_dbc087b1-6c99-493d-86c6-b401fee34a9d";

/** A thenable query builder: every method chains, awaiting yields `result`. */
function queryChain<T>(result: T) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "where", "orderBy", "limit", "update", "set"]) {
    chain[method] = () => chain;
  }
  chain.then = (onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetKnowledgeIndexSweepState();
  for (const key of Object.keys(drizzle)) delete (drizzle as Record<string, unknown>)[key];
});

describe("knowledge index", () => {
  it("stays inert until both keys exist", () => {
    expect(isKnowledgeIndexConfigured({ XAI_API_KEY: "k" })).toBe(false);
    expect(isKnowledgeIndexConfigured({ XAI_MANAGEMENT_API_KEY: "m" })).toBe(false);
    expect(isKnowledgeIndexConfigured({ XAI_API_KEY: " ", XAI_MANAGEMENT_API_KEY: "m" })).toBe(
      false,
    );
    expect(isKnowledgeIndexConfigured({ XAI_API_KEY: "k", XAI_MANAGEMENT_API_KEY: "m" })).toBe(
      true,
    );
  });

  it("accepts only well-formed index ids", () => {
    expect(parseKnowledgeIndexState({ collectionId: COLLECTION, fileId: "file_1" })).toMatchObject({
      collectionId: COLLECTION,
      fileId: "file_1",
    });
    expect(parseKnowledgeIndexState({ collectionId: "../other" })).toBeNull();
    expect(parseKnowledgeIndexState(null)).toBeNull();
    expect(parseKnowledgeIndexState([])).toBeNull();
  });

  it("searches only the Bot's own index and returns clean text", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const fetchImpl = vi.fn(async () =>
      Response.json({
        matches: [
          {
            chunk_content: "## Facts\n\nFact: Closed on Sundays.",
            collection_ids: [COLLECTION],
            score: 1.2,
          },
          { chunk_content: "Another tenant's secret", collection_ids: ["collection_other"] },
          { chunk_content: "Fact: Closed on Sundays.", collection_ids: [COLLECTION] },
        ],
      }),
    ) as unknown as typeof fetch;
    const chunks = await searchKnowledgeIndex(COLLECTION, "are you open sundays", 3, fetchImpl);
    expect(chunks).toEqual(["Closed on Sundays."]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(KNOWLEDGE_SEARCH_URL);
    expect(JSON.parse(String(init.body))).toEqual({
      query: "are you open sundays",
      source: { collection_ids: [COLLECTION] },
      limit: 3,
    });
  });

  it("fails open to keyword search on any provider problem", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const down = vi.fn(async () => new Response("nope", { status: 503 }));
    const thrown = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await searchKnowledgeIndex(COLLECTION, "hours", 3, down as never)).toEqual([]);
    expect(await searchKnowledgeIndex(COLLECTION, "hours", 3, thrown as never)).toEqual([]);
    vi.stubEnv("XAI_API_KEY", "");
    expect(await searchKnowledgeIndex(COLLECTION, "hours", 3, down as never)).toEqual([]);
  });

  it("does not touch the database when the index is not configured", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("XAI_MANAGEMENT_API_KEY", "");
    const db = { select: vi.fn() };
    expect(
      await semanticKnowledgeMatches(db as never, {
        userId: "u",
        agentId: "a",
        query: "hours",
        limit: 3,
      }),
    ).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("keeps keyword matches first and reserves room for reworded answers", () => {
    const keyword = Array.from({ length: 8 }, (_, i) => ({
      source: "knowledge" as const,
      content: `Keyword fact ${i}`,
      score: 8 - i,
    }));
    const merged = mergeMeaningMatches(
      keyword,
      ["Weekend hours: closed Sundays.", "Keyword fact 0"],
      8,
    );
    expect(merged).toHaveLength(8);
    expect(merged[0].content).toBe("Keyword fact 0");
    expect(merged.map((m) => m.content)).toContain("Weekend hours: closed Sundays.");
    // A meaning match that a keyword match already holds is not repeated.
    expect(merged.filter((m) => m.content === "Keyword fact 0")).toHaveLength(1);
    expect(mergeMeaningMatches([], ["Only by meaning"], 8)).toEqual([
      { source: "knowledge", content: "Only by meaning", score: 0 },
    ]);
  });

  it("compiles rules and facts into one labelled document", () => {
    const doc = compileKnowledgeDocument({
      agentName: "Ava",
      rules: ["Always confirm the callback number.", " "],
      facts: ["Weekend hours: closed Sundays."],
    });
    expect(doc.entries).toBe(2);
    expect(doc.text).toContain("# What Ava knows");
    expect(doc.text).toContain("Rule: Always confirm the callback number.");
    expect(doc.text).toContain("Fact: Weekend hours: closed Sundays.");
  });

  it("hashes content exactly as the sweep's SQL fingerprint does", () => {
    const rules = ["r1", "r2"];
    const facts = ["f1"];
    expect(knowledgeContentHash(rules, facts)).toBe(
      createHash("md5").update("r1\nr2\u0001f1").digest("hex"),
    );
    const source = read("src/lib/knowledge-index.ts");
    expect(source).toContain("string_agg(d.content, E'\\n' order by d.id)");
    expect(source).toContain("string_agg(k.content, E'\\n' order by k.id)");
    expect(source).toContain("|| chr(1) ||");
  });

  it("runs from the job sweep and is erased with the account", () => {
    expect(read("src/routes/job-routes.ts")).toContain(
      "await syncStaleKnowledgeIndexes(withinSweepBudget)",
    );
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain("deleteKnowledgeIndex(parseKnowledgeIndexState(row.index))");
    expect(read("drizzle/migrations/0183_agent_knowledge_index.sql")).toContain(
      'ADD COLUMN IF NOT EXISTS "knowledge_index" jsonb',
    );
  });

  it("keeps vendor names out of the index's customer-visible text", () => {
    const doc = compileKnowledgeDocument({ agentName: "Ava", rules: [], facts: ["x"] }).text;
    expect(doc).not.toMatch(/xai|grok/i);
  });

  it("reports a rejected management key as a paused sweep on the health surface", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_MANAGEMENT_API_KEY", "test-management-key");
    const db = drizzle as Record<string, unknown>;
    db.execute = async () => [
      {
        agent_id: "agent_1",
        user_id: "user_1",
        name: "Mira",
        knowledge_index: null,
        content_hash: "abc",
        entries: 1,
      },
    ];
    db.select = () => queryChain([{ content: "Closed on Sundays." }]);
    db.update = () => queryChain(undefined);
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchImpl);

    expect(knowledgeIndexHealth()).toMatchObject({
      configured: true,
      paused_until: null,
      last_error: null,
    });
    await expect(syncStaleKnowledgeIndexes()).resolves.toEqual({ synced: 0, failed: 1 });

    const health = knowledgeIndexHealth();
    expect(health.paused_until).not.toBeNull();
    expect(health.last_error?.message).toContain("HTTP 401, management key");
    // The pause is honoured without touching the provider again.
    fetchImpl.mockClear();
    await expect(syncStaleKnowledgeIndexes()).resolves.toEqual({ synced: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    // The authenticated health probe exposes this state without provider I/O.
    const healthRoutes = read("src/routes/health-routes.ts");
    expect(healthRoutes).toContain("knowledge_index: knowledgeIndexProbe()");
    expect(healthRoutes).toContain("Index sweep paused: xAI rejected a key");
  });

  it("clears the last sweep error once a Bot syncs again", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_MANAGEMENT_API_KEY", "test-management-key");
    const db = drizzle as Record<string, unknown>;
    db.execute = async () => [
      {
        agent_id: "agent_1",
        user_id: "user_1",
        name: "Mira",
        knowledge_index: null,
        content_hash: "abc",
        entries: 1,
      },
    ];
    db.select = () => queryChain([{ content: "Closed on Sundays." }]);
    db.update = () => queryChain(undefined);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls += 1;
        if (calls === 1) return new Response("flaky", { status: 500 });
        if (url.endsWith("/collections")) return Response.json({ collection_id: COLLECTION });
        if (url.endsWith("/files")) return Response.json({ id: "file_1" });
        return Response.json({});
      }),
    );

    await expect(syncStaleKnowledgeIndexes()).resolves.toEqual({ synced: 0, failed: 1 });
    expect(knowledgeIndexHealth().last_error?.message).toContain("HTTP 500");
    // A 500 backs off only that Bot; lift the backoff and the next tick succeeds.
    resetKnowledgeIndexSweepState();
    await expect(syncStaleKnowledgeIndexes()).resolves.toEqual({ synced: 1, failed: 0 });
    expect(knowledgeIndexHealth()).toMatchObject({ paused_until: null, last_error: null });
    expect(knowledgeIndexHealth().last_synced_at).not.toBeNull();
  });
});
