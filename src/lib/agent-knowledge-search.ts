import { and, desc, eq, ilike, or, sql, type AnyColumn } from "drizzle-orm";

import * as schema from "../db/schema";
import { OPENING_GREETING_PREFIX } from "./agent-greeting";
import { semanticKnowledgeMatches } from "./knowledge-index-search";
import type { drizzle as serverDrizzle } from "./server-context";

/**
 * One way to find what a Bot was taught. Prompts hold only the top rules and
 * a few facts, so every surface reaches the rest by searching. Searches used
 * to read only the newest 80 to 200 rows and text replies only the newest 8,
 * so a fact taught earlier went unanswered once a Bot had learned more.
 * Postgres now ranks all of a Bot's rows by how many query words each holds.
 */

type KnowledgeDb = Pick<typeof serverDrizzle, "select">;

export type KnowledgeSnippet = { source: "rule" | "knowledge"; content: string; score: number };

/** Words too common to tell one fact from another. */
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "our",
  "please",
  "that",
  "the",
  "their",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

const MAX_QUERY_WORDS = 32;
/** Rows Postgres returns per table before the exact-phrase bonus reorders them. */
const CANDIDATES_PER_TABLE = 40;
const EXACT_PHRASE_BONUS = 8;
/** Meaning-based matches kept per search, beside keyword matches. */
const SEMANTIC_RESERVE = 3;

/** Distinct words of three or more letters or digits, in any language, without stop words. */
export function knowledgeSearchWords(text: string): string[] {
  const words: string[] =
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)))].slice(
    0,
    MAX_QUERY_WORDS,
  );
}

function normalizedPhrase(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Query words an entry contains, plus a bonus when it holds the whole question. */
export function knowledgeMatchScore(
  content: string,
  words: readonly string[],
  phrase = "",
): number {
  const lower = content.normalize("NFKC").toLowerCase();
  const hits = words.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0);
  return hits + (phrase && lower.includes(phrase) ? EXACT_PHRASE_BONUS : 0);
}

/**
 * The window of an entry around its first match, so an answer in the second
 * half of a long entry is shown rather than the entry's opening lines.
 */
export function excerptAroundMatch(
  content: string,
  words: readonly string[],
  maxChars: number,
): string {
  if (content.length <= maxChars) return content;
  const lower = content.toLowerCase();
  let hit = -1;
  for (const word of words) {
    const index = lower.indexOf(word);
    if (index >= 0 && (hit < 0 || index < hit)) hit = index;
  }
  if (hit < 0) return `${content.slice(0, maxChars)}…`;
  // Leave a third of the window as lead-in so the match keeps its context.
  const start = Math.max(0, hit - Math.floor(maxChars / 3));
  const end = start + maxChars;
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function mentionsAny(column: AnyColumn, words: readonly string[]) {
  return or(...words.map((word) => ilike(column, likePattern(word))));
}

/** How many query words a row holds, so Postgres returns the best rows of any age. */
function matchedWordCount(column: AnyColumn, words: readonly string[]) {
  return sql<number>`(${sql.join(
    words.map((word) => sql`(case when ${column} ilike ${likePattern(word)} then 1 else 0 end)`),
    sql` + `,
  )})`;
}

/**
 * Directive order for prompts: the opening greeting first, then priority,
 * newest first among equals. A prompt-sized slice therefore always keeps the
 * greeting callers hear, however many rules a Bot has.
 */
export const DIRECTIVE_PROMPT_ORDER = [
  sql`(left(${schema.directives.content}, ${OPENING_GREETING_PREFIX.length}) = ${OPENING_GREETING_PREFIX}) desc`,
  desc(schema.directives.priority),
  desc(schema.directives.id),
] as const;

type SearchScope = { userId: string; agentId: string };

function matchingRules(db: KnowledgeDb, scope: SearchScope, words: readonly string[]) {
  return db
    .select({ content: schema.directives.content })
    .from(schema.directives)
    .where(
      and(
        eq(schema.directives.agentId, scope.agentId),
        eq(schema.directives.userId, scope.userId),
        mentionsAny(schema.directives.content, words),
      ),
    )
    .orderBy(
      desc(matchedWordCount(schema.directives.content, words)),
      desc(schema.directives.priority),
      desc(schema.directives.id),
    )
    .limit(CANDIDATES_PER_TABLE);
}

function matchingFacts(db: KnowledgeDb, scope: SearchScope, words: readonly string[]) {
  return db
    .select({ content: schema.knowledge.content })
    .from(schema.knowledge)
    .where(
      and(
        eq(schema.knowledge.agentId, scope.agentId),
        eq(schema.knowledge.userId, scope.userId),
        mentionsAny(schema.knowledge.content, words),
      ),
    )
    .orderBy(
      desc(matchedWordCount(schema.knowledge.content, words)),
      desc(schema.knowledge.createdAt),
    )
    .limit(CANDIDATES_PER_TABLE);
}

function ranked(
  rows: Array<{ source: KnowledgeSnippet["source"]; content: string }>,
  words: readonly string[],
  query: string,
): KnowledgeSnippet[] {
  const phrase = normalizedPhrase(query);
  return rows
    .map((row) => ({ ...row, content: row.content.trim() }))
    .filter((row) => row.content)
    .map((row) => ({ ...row, score: knowledgeMatchScore(row.content, words, phrase) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The rules and facts that best answer `query`, best first, searched across
 * everything the Bot was taught. Empty when the query has no searchable words.
 */
export async function searchAgentKnowledge(
  db: KnowledgeDb,
  input: SearchScope & { query: string; limit: number },
): Promise<KnowledgeSnippet[]> {
  const words = knowledgeSearchWords(input.query);
  if (!input.userId || !input.agentId || !words.length) return [];
  const [rules, facts, meaning] = await Promise.all([
    matchingRules(db, input, words),
    matchingFacts(db, input, words),
    semanticKnowledgeMatches(db, { ...input, limit: SEMANTIC_RESERVE }),
  ]);
  const keyword = ranked(
    [
      ...rules.map((row) => ({ source: "rule" as const, content: row.content })),
      ...facts.map((row) => ({ source: "knowledge" as const, content: row.content })),
    ],
    words,
    input.query,
  );
  return mergeMeaningMatches(keyword, meaning, input.limit);
}

/** Index results that a keyword match already holds add nothing. */
function alreadyCovered(chunk: string, keyword: readonly KnowledgeSnippet[]): boolean {
  const probe = normalizedPhrase(chunk).slice(0, 160);
  return keyword.some((match) => normalizedPhrase(match.content).includes(probe));
}

/**
 * Keyword matches stay first: they hold the caller's own words. Up to
 * SEMANTIC_RESERVE meaning matches follow, so a reworded question still
 * reaches its answer even when keyword matches would fill every slot.
 */
export function mergeMeaningMatches(
  keyword: readonly KnowledgeSnippet[],
  meaning: readonly string[],
  limit: number,
): KnowledgeSnippet[] {
  const extra = meaning
    .filter((chunk) => !alreadyCovered(chunk, keyword))
    .slice(0, SEMANTIC_RESERVE)
    .map((content) => ({ source: "knowledge" as const, content, score: 0 }));
  const keep = Math.max(0, limit - extra.length);
  return [...keyword.slice(0, keep), ...extra, ...keyword.slice(keep)].slice(0, limit);
}

/**
 * Facts for a prompt: those that match what the customer said first, then
 * the newest, without repeats. A Bot with a large knowledge base still puts
 * the facts this conversation needs in front of the model.
 */
export async function loadPromptKnowledge(
  db: KnowledgeDb,
  input: SearchScope & { text: string; relevant: number; total: number },
): Promise<string[]> {
  const words = knowledgeSearchWords(input.text);
  const [matches, newest] = await Promise.all([
    words.length ? matchingFacts(db, input, words) : Promise.resolve([]),
    db
      .select({ content: schema.knowledge.content })
      .from(schema.knowledge)
      .where(
        and(eq(schema.knowledge.agentId, input.agentId), eq(schema.knowledge.userId, input.userId)),
      )
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(input.total),
  ]);
  const relevant = ranked(
    matches.map((row) => ({ source: "knowledge" as const, content: row.content })),
    words,
    input.text,
  )
    .slice(0, input.relevant)
    .map((match) => match.content);
  const seen = new Set<string>();
  return [...relevant, ...newest.map((row) => row.content.trim())]
    .filter((content) => {
      if (!content || seen.has(content)) return false;
      seen.add(content);
      return true;
    })
    .slice(0, input.total);
}
