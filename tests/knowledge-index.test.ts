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
import { compileKnowledgeDocument, knowledgeContentHash } from "../src/lib/knowledge-index";
import {
  KNOWLEDGE_SEARCH_URL,
  isKnowledgeIndexConfigured,
  parseKnowledgeIndexState,
  searchKnowledgeIndex,
  semanticKnowledgeMatches,
} from "../src/lib/knowledge-index-search";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const COLLECTION = "collection_dbc087b1-6c99-493d-86c6-b401fee34a9d";

afterEach(() => vi.unstubAllEnvs());

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
});
