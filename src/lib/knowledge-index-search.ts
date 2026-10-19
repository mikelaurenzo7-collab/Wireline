import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import type { drizzle as serverDrizzle } from "./server-context";

/**
 * Meaning-based search over a Bot's knowledge index. Keyword search misses a
 * caller who asks "are you open Sundays?" when the Bot was taught "weekend
 * hours: closed". The index finds the answer by meaning instead. It only adds
 * to keyword results: any failure, timeout, or missing index returns [] and
 * the Bot answers from keyword matches exactly as before.
 *
 * This file stays free of server-context imports so the hot search path, and
 * the tests that exercise it, never pull in the database client.
 */

export const KNOWLEDGE_SEARCH_URL = "https://api.x.ai/v1/documents/search";
const SEARCH_TIMEOUT_MS = 1_500;
const MAX_CHUNK_CHARS = 1_200;

export type KnowledgeIndexState = {
  collectionId: string;
  fileId?: string | null;
  contentHash?: string | null;
  entries?: number;
  syncedAt?: string;
  error?: string | null;
};

type IndexDb = Pick<typeof serverDrizzle, "select">;

/** The index needs both keys: one builds it, the other searches it. */
export function isKnowledgeIndexConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.XAI_API_KEY?.trim() && env.XAI_MANAGEMENT_API_KEY?.trim());
}

export function parseKnowledgeIndexState(value: unknown): KnowledgeIndexState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const collectionId = typeof record.collectionId === "string" ? record.collectionId.trim() : "";
  if (!/^collection_[A-Za-z0-9-]{8,80}$/.test(collectionId)) return null;
  return {
    collectionId,
    fileId: typeof record.fileId === "string" ? record.fileId : null,
    contentHash: typeof record.contentHash === "string" ? record.contentHash : null,
    entries: typeof record.entries === "number" ? record.entries : undefined,
    syncedAt: typeof record.syncedAt === "string" ? record.syncedAt : undefined,
    error: typeof record.error === "string" ? record.error : null,
  };
}

/** Index chunks carry the compiler's "Rule:" / "Fact:" labels; callers see plain text. */
function cleanChunk(text: string): string {
  return text
    .replace(/^#+ .*$/gm, "")
    .replace(/^(Rule|Fact): /gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHUNK_CHARS);
}

export async function searchKnowledgeIndex(
  collectionId: string,
  query: string,
  limit: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const key = process.env.XAI_API_KEY?.trim();
  const trimmed = query.trim().slice(0, 600);
  if (!key || !trimmed || limit <= 0) return [];
  try {
    const response = await fetchImpl(KNOWLEDGE_SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: trimmed,
        source: { collection_ids: [collectionId] },
        limit,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return [];
    }
    const payload = (await response.json()) as { matches?: unknown };
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const chunks: string[] = [];
    for (const match of matches) {
      if (!match || typeof match !== "object") continue;
      const record = match as Record<string, unknown>;
      // Never trust a chunk from any index but the one this Bot owns.
      const owners = Array.isArray(record.collection_ids) ? record.collection_ids : [collectionId];
      if (!owners.includes(collectionId)) continue;
      const content =
        typeof record.chunk_content === "string" ? cleanChunk(record.chunk_content) : "";
      if (content && !chunks.includes(content)) chunks.push(content);
    }
    return chunks.slice(0, limit);
  } catch {
    return [];
  }
}

/** The Bot's own index, read with tenant and Bot ownership, or null. */
export async function loadKnowledgeIndex(
  db: IndexDb,
  scope: { userId: string; agentId: string },
): Promise<KnowledgeIndexState | null> {
  if (!isKnowledgeIndexConfigured()) return null;
  try {
    const rows = await db
      .select({ index: schema.agents.knowledgeIndex })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, scope.agentId), eq(schema.agents.userId, scope.userId)))
      .limit(1);
    return parseKnowledgeIndexState(rows[0]?.index);
  } catch {
    return null;
  }
}

/** Index matches for one question, or [] when the Bot has no usable index. */
export async function semanticKnowledgeMatches(
  db: IndexDb,
  scope: { userId: string; agentId: string; query: string; limit: number },
): Promise<string[]> {
  if (!isKnowledgeIndexConfigured() || !scope.userId || !scope.agentId) return [];
  const index = await loadKnowledgeIndex(db, scope);
  if (!index?.fileId) return [];
  return searchKnowledgeIndex(index.collectionId, scope.query, scope.limit);
}
