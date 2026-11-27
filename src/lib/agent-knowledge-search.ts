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

/**
 * Words too common to tell one fact from another. Matching is by substring,
 * so a short common word is worse than useless: "any" is inside "company",
 * "all" inside "install", "was" inside "wash".
 */
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "and",
  "any",
  "are",
  "been",
  "but",
  "can",
  "could",
  "did",
  "does",
  "for",
  "from",
  "get",
  "got",
  "had",
  "has",
  "have",
  "hello",
  "her",
  "here",
  "him",
  "his",
  "how",
  "into",
  "its",
  "just",
  "not",
  "our",
  "please",
  "some",
  "than",
  "thank",
  "thanks",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "yeah",
  "yes",
  "you",
  "your",
]);

const MAX_QUERY_WORDS = 32;
/** Rows Postgres returns per table before the exact-phrase bonus reorders them. */
const CANDIDATES_PER_TABLE = 40;
const EXACT_PHRASE_BONUS = 8;
/** Meaning-based matches kept per search, beside keyword matches. */
const SEMANTIC_RESERVE = 3;
/**
 * How long a search that already has keyword matches waits for the meaning
 * index. A caller is on the line: a slow index is not worth the silence when
 * there is already something to answer from.
 */
const MEANING_WAIT_BESIDE_KEYWORD_MS = 600;

/**
 * Matching is by substring, so the shorter form of a word finds both: asked
 * about "Sundays", a fact that says "Closed Sunday" has to match, and asked
 * about "prices", one that says "Price list".
 */
function singular(word: string): string {
  if (/^\p{N}/u.test(word) || word.length < 4) return word;
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3);
  if (/(?:x|z|ch|sh|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * What callers ask and how owners write it down are different words. The
 * commonest questions (where, when, how much) are answered by facts that
 * never use the question's own word, so each brings the words a fact would.
 */
const QUESTION_WORDS: Readonly<Record<string, readonly string[]>> = {
  where: ["address", "located", "location"],
  located: ["address", "location"],
  location: ["address", "located"],
  address: ["located", "location"],
  directions: ["address", "located", "location"],
  open: ["hour", "close"],
  close: ["hour", "open"],
  closed: ["hour", "open"],
  hour: ["open", "close"],
  much: ["price", "cost", "$", "fee"],
  price: ["cost", "$", "fee", "rate"],
  cost: ["price", "$", "fee", "rate"],
  charge: ["price", "cost", "$", "fee"],
  fee: ["price", "cost", "$"],
  pay: ["payment", "accept"],
  payment: ["pay", "accept"],
  book: ["appointment", "schedule"],
  appointment: ["book", "schedule"],
  schedule: ["appointment", "book"],
};

/**
 * The question's own words, without stop words: words of three or more
 * letters or digits in their singular form, short forms written with a slash
 * ("a/c", "24/7"), and numbers of two or more digits. Any language.
 */
function ownSearchWords(lower: string): string[] {
  const tokens: string[] = lower.match(/[\p{L}\p{N}]+(?:\/[\p{L}\p{N}]+)*/gu) ?? [];
  const own: string[] = [];
  for (const token of tokens) {
    const parts = token.includes("/") ? [token, ...token.split("/")] : [token];
    for (const part of parts) {
      const keep = part.length > 2 || /^\p{N}{2,}$/u.test(part);
      if (keep && !STOP_WORDS.has(part)) own.push(singular(part));
    }
  }
  return [...new Set(own)];
}

/**
 * Distinct search words for a question: its own words first, then the words
 * a fact would use for the commonest questions. Capped, keeping its own.
 */
export function knowledgeSearchWords(text: string): string[] {
  const lower = text.normalize("NFKC").toLowerCase();
  const own = ownSearchWords(lower);
  // "Where are you?" has no word of its own left once the common ones go.
  const asked = /\bwhere\b/.test(lower) ? [...own, "where"] : own;
  const related = asked.flatMap((word) => QUESTION_WORDS[word] ?? []);
  return [...new Set([...own, ...related])].slice(0, MAX_QUERY_WORDS);
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
 * The window of an entry that holds the most of the question's words, so an
 * answer near the end of a long entry is shown rather than the entry's
 * opening lines. The first match used to anchor the window, and a common word
 * early in a pasted overview then hid the price further down.
 */
export function excerptAroundMatch(
  content: string,
  words: readonly string[],
  maxChars: number,
): string {
  if (content.length <= maxChars) return content;
  const lower = content.toLowerCase();
  const hits: number[] = [];
  for (const word of words) {
    let index = lower.indexOf(word);
    while (index >= 0 && hits.length < 400) {
      hits.push(index);
      index = lower.indexOf(word, index + 1);
    }
  }
  if (!hits.length) return `${content.slice(0, maxChars)}…`;
  hits.sort((a, b) => a - b);
  // Leave a third of the window as lead-in so the match keeps its context.
  const windowStart = (hit: number) => Math.max(0, hit - Math.floor(maxChars / 3));
  let start = windowStart(hits[0]);
  let best = -1;
  for (const hit of hits) {
    const from = windowStart(hit);
    const window = lower.slice(from, from + maxChars);
    const held = words.reduce((count, word) => count + (window.includes(word) ? 1 : 0), 0);
    // The earliest window wins a tie.
    if (held > best) {
      best = held;
      start = from;
    }
  }
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

/**
 * Words that mark the facts callers ask for most: where the business is, when
 * it is open, what things cost, and how to book or pay.
 */
const CORE_FACT_WORDS = [
  "address",
  "located",
  "location",
  "parking",
  "open",
  "close",
  "hour",
  "price",
  "cost",
  "fee",
  "rate",
  "charge",
  "$",
  "free",
  "estimate",
  "quote",
  "service",
  "appointment",
  "book",
  "schedule",
  "cancel",
  "payment",
  "insurance",
  "warranty",
  "emergency",
  "deliver",
] as const;

/**
 * The order of a prompt's opening facts. Facts on a core subject come first,
 * the shortest of them leading because a one-line price or address answers
 * more per character than a pasted overview; the rest follow newest first.
 * The id settles ties: an import saves many rows in one statement, with one
 * timestamp, and without it the facts a Bot opened with changed between calls.
 */
const onCoreSubject = sql<number>`(case when ${mentionsAny(schema.knowledge.content, CORE_FACT_WORDS)} then 1 else 0 end)`;
export const OPENING_FACTS_ORDER = [
  desc(onCoreSubject),
  sql`(case when ${mentionsAny(schema.knowledge.content, CORE_FACT_WORDS)} then length(${schema.knowledge.content}) else 2147483647 end) asc`,
  desc(schema.knowledge.createdAt),
  desc(schema.knowledge.id),
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
      desc(schema.knowledge.id),
    )
    .limit(CANDIDATES_PER_TABLE);
}

function ranked(
  rows: Array<{ source: KnowledgeSnippet["source"]; content: string }>,
  words: readonly string[],
  query: string,
): KnowledgeSnippet[] {
  const phrase = normalizedPhrase(query);
  // The question's own words count twice. The words added for it only widen
  // the net, and an entry that happens to hold several of them must not
  // outrank the one that names what the caller asked about.
  const own = ownSearchWords(phrase);
  return rows
    .map((row) => ({ ...row, content: row.content.trim() }))
    .filter((row) => row.content)
    .map((row) => ({
      ...row,
      score:
        knowledgeMatchScore(row.content, words, phrase) + knowledgeMatchScore(row.content, own),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** `work`, or nothing once `ms` has passed. `work` must not reject. */
function within<T>(work: Promise<T[]>, ms: number): Promise<T[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T[]>((resolve) => {
      timer = setTimeout(() => resolve([]), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The rules and facts that best answer `query`, best first, searched across
 * everything the Bot was taught. A question made only of common words ("what
 * do you do?") has nothing to match by keyword and is answered by meaning
 * alone, where the Bot has an index.
 */
export async function searchAgentKnowledge(
  db: KnowledgeDb,
  input: SearchScope & { query: string; limit: number },
): Promise<KnowledgeSnippet[]> {
  const words = knowledgeSearchWords(input.query);
  if (!input.userId || !input.agentId) return [];
  const asksSomething = input.query.trim().split(/\s+/).length > 1;
  if (!words.length && !asksSomething) return [];
  const byMeaning = semanticKnowledgeMatches(db, { ...input, limit: SEMANTIC_RESERVE });
  if (!words.length) return mergeMeaningMatches([], await byMeaning, input.limit);
  const [rules, facts] = await Promise.all([
    matchingRules(db, input, words),
    matchingFacts(db, input, words),
  ]);
  const keyword = ranked(
    [
      ...rules.map((row) => ({ source: "rule" as const, content: row.content })),
      ...facts.map((row) => ({ source: "knowledge" as const, content: row.content })),
    ],
    words,
    input.query,
  );
  const meaning = await (keyword.length
    ? within(byMeaning, MEANING_WAIT_BESIDE_KEYWORD_MS)
    : byMeaning);
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
