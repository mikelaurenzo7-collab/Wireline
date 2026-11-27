import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({ drizzle: {} }));

import {
  excerptAroundMatch,
  knowledgeMatchScore,
  knowledgeSearchWords,
  loadPromptKnowledge,
  searchAgentKnowledge,
} from "../src/lib/agent-knowledge-search";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

type Rows = { rules: string[]; facts: string[]; newest: string[]; index?: unknown };
const COLLECTION = "collection_dbc087b1-6c99-493d-86c6-b401fee34a9d";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * A database double that renders each query to SQL (so its shape can be
 * checked) and answers by table: matching rules, matching facts, the Bot's
 * meaning index, or the newest facts when a query has no word filter.
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
              if (sql.includes('"knowledge_index"')) {
                return (resolveRows: (value: unknown) => void) =>
                  resolveRows([{ index: rows.index ?? null }]);
              }
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
    // The caller's own words lead; the words a fact would use follow.
    expect(knowledgeSearchWords("What are your hours on Saturday?")).toEqual([
      "hour",
      "saturday",
      "open",
      "close",
    ]);
    expect(knowledgeSearchWords("¿Cuánto cuesta la reparación del año?")).toEqual([
      "cuánto",
      "cuesta",
      "reparación",
      "del",
      "año",
    ]);
    expect(knowledgeSearchWords("the the THE price price")).toEqual([
      "price",
      "cost",
      "$",
      "fee",
      "rate",
    ]);
    expect(knowledgeSearchWords("is it ok?")).toEqual([]);
    // Matching is by substring: "any" is inside "company", "all" inside "install".
    expect(knowledgeSearchWords("Do you have any of them at all, or not?")).toEqual([]);
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

/**
 * An audit ran real questions against real saved facts. "Are you open on
 * Sundays?" did not find "Closed Sunday", "Where are you?" was refused as too
 * broad, "A/C" was dropped as too short, and a long overview hid the price
 * the caller asked for.
 */
describe("questions callers really ask", () => {
  it("matches the singular a fact was written in", () => {
    const words = knowledgeSearchWords("Are you open on Sundays?");
    expect(words).toEqual(["open", "sunday", "hour", "close"]);
    expect(knowledgeMatchScore("Closed Sunday.", words)).toBe(2);
    expect(knowledgeSearchWords("batteries, boxes, classes and prices")).toEqual([
      "batter",
      "box",
      "class",
      "price",
      "cost",
      "$",
      "fee",
      "rate",
    ]);
    // Words that only look plural are left alone.
    expect(knowledgeSearchWords("business address")).toEqual([
      "business",
      "address",
      "located",
      "location",
    ]);
  });

  it("brings the words a fact would use for where, when and how much", () => {
    expect(knowledgeSearchWords("Where are you?")).toEqual(["address", "located", "location"]);
    expect(knowledgeSearchWords("When do you close?")).toEqual(["close", "hour", "open"]);
    expect(knowledgeSearchWords("How much is a tankless install?")).toEqual([
      "much",
      "tankless",
      "install",
      "price",
      "cost",
      "$",
      "fee",
    ]);
  });

  it("keeps short forms written with a slash, and numbers", () => {
    expect(knowledgeSearchWords("Do you fix A/C?")).toEqual(["fix", "a/c"]);
    expect(knowledgeSearchWords("Are you open 24/7?")).toEqual([
      "open",
      "24/7",
      "24",
      "hour",
      "close",
    ]);
    expect(knowledgeSearchWords("Is it $85 or 90?")).toEqual(["85", "90"]);
  });

  it("keeps the caller's own words when a long message is capped", () => {
    const long = `${Array.from({ length: 31 }, (_, i) => `topic${i}`).join(" ")} price`;
    const words = knowledgeSearchWords(long);
    expect(words).toHaveLength(32);
    expect(words).toContain("price");
    expect(words).not.toContain("cost");
  });

  it("puts the entry that names what was asked ahead of one that only talks about prices", async () => {
    const overview = "Our pricing: service call fee $89. Costs vary by job. Price match guarantee.";
    const answer = "Tankless install: $2,400.";
    const { db } = fakeDb({ rules: [], facts: [overview, answer], newest: [] });
    const matches = await searchAgentKnowledge(db, {
      ...scope,
      query: "How much is a tankless install?",
      limit: 2,
    });
    expect(matches.map((match) => match.content)).toEqual([answer, overview]);
  });

  it("shows the part of a long entry that holds the most of the question", () => {
    const entry = `We install water heaters of every kind. ${"Filler sentence about the company. ".repeat(40)}Tankless install: $2,400 including haul-away. ${"More filler here. ".repeat(40)}`;
    const words = knowledgeSearchWords("How much is a tankless install?");
    // The first match is the entry's opening line, which has no price.
    expect(entry.toLowerCase().indexOf("install")).toBeLessThan(10);
    const excerpt = excerptAroundMatch(entry, words, 600);
    expect(excerpt).toContain("Tankless install: $2,400 including haul-away.");
    expect(excerpt.length).toBeLessThanOrEqual(602);
    // An answer at the very end of an entry is shown too.
    const tail = `${"Opening words about us. ".repeat(40)}Parking is free behind the building.`;
    expect(excerptAroundMatch(tail, ["parking"], 600)).toContain(
      "Parking is free behind the building.",
    );
  });
});

describe("the meaning index beside keyword search", () => {
  const index = { collectionId: COLLECTION, fileId: "file_1" };
  const indexAnswers = (chunk: string) =>
    vi.fn(async () =>
      Response.json({ matches: [{ chunk_content: chunk, collection_ids: [COLLECTION] }] }),
    );

  it("answers a question of common words only by meaning, where the Bot has an index", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_MANAGEMENT_API_KEY", "");
    const fetchMock = indexAnswers("Fact: We repair and replace water heaters.");
    vi.stubGlobal("fetch", fetchMock);
    const { db, queries } = fakeDb({ rules: [], facts: [], newest: [], index });
    expect(knowledgeSearchWords("What do you do?")).toEqual([]);
    expect(
      await searchAgentKnowledge(db, { ...scope, query: "What do you do?", limit: 5 }),
    ).toEqual([{ source: "knowledge", content: "We repair and replace water heaters.", score: 0 }]);
    // Nothing to match by keyword, so neither table is searched.
    expect(queries.some((sql) => sql.includes("ilike"))).toBe(false);

    // One common word alone asks nothing, and the index is not called for it.
    fetchMock.mockClear();
    expect(await searchAgentKnowledge(db, { ...scope, query: "what?", limit: 5 })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds what the index finds by meaning to what keywords found", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", indexAnswers("Fact: We are closed on public holidays."));
    const { db } = fakeDb({
      rules: [],
      facts: ["Gift cards never expire."],
      newest: [],
      index,
    });
    const matches = await searchAgentKnowledge(db, {
      ...scope,
      query: "Do gift cards expire?",
      limit: 5,
    });
    expect(matches.map((match) => match.content)).toEqual([
      "Gift cards never expire.",
      "We are closed on public holidays.",
    ]);
  });

  it("does not keep a caller waiting on a slow index once keywords found something", async () => {
    vi.useFakeTimers();
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { db } = fakeDb({ rules: [], facts: ["Gift cards never expire."], newest: [], index });
    let done = false;
    const search = searchAgentKnowledge(db, {
      ...scope,
      query: "Do gift cards expire?",
      limit: 3,
    }).then((matches) => {
      done = true;
      return matches;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect((await search).map((match) => match.content)).toEqual(["Gift cards never expire."]);
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
    // Newest first among equals, then the id: one import saves many rows with
    // one timestamp, and without it the order changed from call to call.
    expect(facts).toContain('"created_at" desc, "wireline_knowledge"."id" desc limit');
  });

  it("asks nothing when the question has no searchable words", async () => {
    vi.stubEnv("XAI_API_KEY", "");
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
