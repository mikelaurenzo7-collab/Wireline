import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({ drizzle: {} }));

import {
  excerptAroundMatch,
  knowledgeMatchScore,
  knowledgeSearchWords,
  loadPromptKnowledge,
  searchAgentKnowledge,
} from "../src/lib/agent-knowledge-search";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

type Rows = { rules: string[]; facts: string[]; newest: string[] };

/**
 * A database double that renders each query to SQL (so its shape can be
 * checked) and answers by table: matching rules, matching facts, or the
 * newest facts when a query has no word filter.
 */
function fakeDb(rows: Rows) {
  const sqlDb = drizzle.mock();
  const queries: string[] = [];
  const db = {
    select: (fields: never) => {
      const builder = sqlDb.select(fields);
      const wrap = (inner: unknown): unknown =>
        new Proxy(inner as object, {
          get(target, key) {
            if (key === "then") {
              const { sql } = (target as { toSQL: () => { sql: string } }).toSQL();
              queries.push(sql);
              const content = sql.includes('"wireline_directives"')
                ? rows.rules
                : sql.includes("ilike")
                  ? rows.facts
                  : rows.newest;
              const result = content.map((value) => ({ content: value }));
              return (resolveRows: (value: unknown) => void) => resolveRows(result);
            }
            const value = Reflect.get(target, key);
            return typeof value === "function"
              ? (...args: unknown[]) => wrap(value.apply(target, args))
              : value;
          },
        });
      return wrap(builder);
    },
  };
  return { db: db as never, queries };
}

const scope = { userId: "00000000-0000-4000-8000-000000000001", agentId: "bot-1" };

describe("knowledge search words", () => {
  it("keeps meaningful words in any language and drops filler", () => {
    expect(knowledgeSearchWords("What are your hours on Saturday?")).toEqual(["hours", "saturday"]);
    expect(knowledgeSearchWords("¿Cuánto cuesta la reparación del año?")).toEqual([
      "cuánto",
      "cuesta",
      "reparación",
      "del",
      "año",
    ]);
    expect(knowledgeSearchWords("the the THE price price")).toEqual(["price"]);
    expect(knowledgeSearchWords("is it ok?")).toEqual([]);
    expect(
      knowledgeSearchWords(Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ")),
    ).toHaveLength(32);
  });

  it("scores word hits and rewards the whole question", () => {
    const words = knowledgeSearchWords("weekend hours");
    expect(knowledgeMatchScore("Weekend hours are 10 to 2.", words, "weekend hours")).toBe(10);
    expect(knowledgeMatchScore("Hours are 9 to 5.", words, "weekend hours")).toBe(1);
    expect(knowledgeMatchScore("We sell tires.", words, "weekend hours")).toBe(0);
  });

  it("shows the part of a long entry around the match", () => {
    const entry = `${"Intro. ".repeat(300)}Gift cards never expire. ${"Outro. ".repeat(300)}`;
    const excerpt = excerptAroundMatch(entry, ["gift"], 600);
    expect(excerpt).toContain("Gift cards never expire.");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerptAroundMatch("Short entry.", ["gift"], 600)).toBe("Short entry.");
  });
});

describe("searching everything a Bot was taught", () => {
  it("ranks every matching row in Postgres instead of reading only the newest", async () => {
    const { db, queries } = fakeDb({
      rules: ["Never quote a price for gift wrapping."],
      facts: ["Gift cards never expire.", "Gift wrapping is free in December."],
      newest: [],
    });
    const matches = await searchAgentKnowledge(db, {
      ...scope,
      query: "Do gift cards expire?",
      limit: 2,
    });
    expect(matches.map((match) => match.content)).toEqual([
      "Gift cards never expire.",
      "Never quote a price for gift wrapping.",
    ]);
    const facts = queries.find((sql) => sql.includes('"wireline_knowledge"')) ?? "";
    // Filtered to rows that mention a query word, best match first, any age.
    expect(facts).toMatch(/ilike \$\d+ or .*ilike \$\d+/);
    expect(facts).toMatch(/order by \(\(case when .* ilike \$\d+ then 1 else 0 end\)/);
    expect(facts).toContain('"created_at" desc limit');
  });

  it("asks nothing when the question has no searchable words", async () => {
    const { db, queries } = fakeDb({ rules: ["x"], facts: ["x"], newest: [] });
    expect(await searchAgentKnowledge(db, { ...scope, query: "is it ok?", limit: 5 })).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("puts the facts a conversation needs ahead of the newest, without repeats", async () => {
    const { db } = fakeDb({
      rules: [],
      facts: ["Gift cards never expire."],
      newest: ["We open at 9.", "Gift cards never expire.", "Parking is free."],
    });
    expect(
      await loadPromptKnowledge(db, {
        ...scope,
        text: "Do gift cards expire?",
        relevant: 2,
        total: 3,
      }),
    ).toEqual(["Gift cards never expire.", "We open at 9.", "Parking is free."]);
  });

  it("finds the business topic after a longer question's instruction preface", async () => {
    const prefixOnlyFact = "Answer using saved company facts without changing settings.";
    const topicFact =
      "BotBound helps service businesses with incoming inquiries, outbound sales follow-up, and SMS. Prospect research and sender setup support permission-based outreach; sensitive actions require approval.";
    const { db } = fakeDb({
      rules: [],
      facts: [prefixOnlyFact, topicFact],
      newest: [prefixOnlyFact],
    });

    expect(
      await loadPromptKnowledge(db, {
        ...scope,
        text: "Answer only from your saved company facts, without changing settings or contacting anyone: I run a small service business. How could BotBound help with incoming inquiries, outbound sales follow-up, and SMS? What would still need my approval or setup? Please be brief, identify yourself accurately, and do not promise a booking or callback has happened.",
        relevant: 1,
        total: 1,
      }),
    ).toEqual([topicFact]);
  });
});

describe("every surface uses the shared search", () => {
  it("routes calls, voice tests, and text replies through it", () => {
    const core = read("src/lib/bot-tools/core.ts");
    expect(core).toContain("await searchAgentKnowledge(drizzle, {");
    expect(core).toContain("excerptAroundMatch(match.content, words, MAX_KB_RESULT_CHARS)");
    expect(core).not.toMatch(/from\(schema\.knowledge\)[\s\S]{0,200}\.limit\(200\)/);

    const live = read("src/lib/voice/openai-live-agent-service.ts");
    expect(live).toContain("await searchAgentKnowledge(drizzle, {");
    expect(live).toContain("excerptAroundMatch(match.content, words, MAX_LIVE_KB_RESULT_CHARS)");

    expect(read("src/lib/voice/openai-phone-agent-runtime.ts")).not.toContain(
      "searchApprovedAgentKnowledge",
    );
    for (const path of [
      "src/lib/agent-text-reply.ts",
      "src/lib/private-agent-test.ts",
      "src/routes/agent-test-routes.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("await loadPromptKnowledge(drizzle, {");
      expect(source, path).toContain(".orderBy(...DIRECTIVE_PROMPT_ORDER)");
    }
  });

  it("keeps the opening greeting in every prompt-sized slice of rules", () => {
    const search = read("src/lib/agent-knowledge-search.ts");
    expect(search).toContain(
      "sql`(left(${schema.directives.content}, ${OPENING_GREETING_PREFIX.length}) = ${OPENING_GREETING_PREFIX}) desc`",
    );
    for (const path of [
      "src/lib/voice/openai-phone-agent-runtime.ts",
      "src/lib/voice/openai-live-agent-service.ts",
    ]) {
      expect(read(path), path).toContain(".orderBy(...DIRECTIVE_PROMPT_ORDER)");
    }
  });
});
