import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "./server-context";
import {
  isKnowledgeIndexConfigured,
  parseKnowledgeIndexState,
  type KnowledgeIndexState,
} from "./knowledge-index-search";

/**
 * Keeps one meaning-based index per Bot in step with what the Bot was taught.
 * The job sweep finds Bots whose rules or facts changed since the last build,
 * compiles them into one document, uploads it, swaps it into the Bot's index,
 * and removes the old copy. One index per Bot keeps tenants apart by
 * construction: a search can only ever name the asking Bot's own index.
 *
 * Nothing here is customer-facing; callers simply get better answers.
 */

const MANAGEMENT_URL = "https://management-api.x.ai/v1";
const FILES_URL = "https://api.x.ai/v1/files";
const REQUEST_TIMEOUT_MS = 30_000;
/** Bots rebuilt per sweep tick, so one tick never spends long on indexing. */
const SYNC_BATCH = 3;
/** Large knowledge bases are indexed whole; this only bounds a runaway Bot. */
const MAX_DOCUMENT_CHARS = 4_000_000;

function outsideTenant<T>(operation: () => PromiseLike<T>): Promise<T> {
  return tenantStore.exit(async () => await operation());
}

function managementKey(): string {
  return process.env.XAI_MANAGEMENT_API_KEY?.trim() || "";
}

function apiKey(): string {
  return process.env.XAI_API_KEY?.trim() || "";
}

async function call(
  url: string,
  init: RequestInit & { key: string },
): Promise<Record<string, unknown>> {
  const { key, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: { Authorization: `Bearer ${key}`, ...(rest.headers || {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const which = url.startsWith(MANAGEMENT_URL) ? "management key" : "API key";
    throw Object.assign(
      new Error(`Knowledge index request failed (HTTP ${response.status}, ${which}).`),
      { status: response.status },
    );
  }
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The Bot's rules then facts, labelled and blank-line separated so chunks split cleanly. */
export function compileKnowledgeDocument(input: {
  agentName: string;
  rules: readonly string[];
  facts: readonly string[];
}): { text: string; entries: number } {
  const rules = input.rules.map((rule) => rule.trim()).filter(Boolean);
  const facts = input.facts.map((fact) => fact.trim()).filter(Boolean);
  const parts = [`# What ${input.agentName || "this Bot"} knows`];
  if (rules.length) parts.push("## Rules", ...rules.map((rule) => `Rule: ${rule}`));
  if (facts.length) parts.push("## Facts", ...facts.map((fact) => `Fact: ${fact}`));
  return {
    text: parts.join("\n\n").slice(0, MAX_DOCUMENT_CHARS),
    entries: rules.length + facts.length,
  };
}

/** Same fingerprint the sweep computes in SQL, so a rebuilt Bot reads as current. */
export function knowledgeContentHash(rules: readonly string[], facts: readonly string[]): string {
  return createHash("md5")
    .update(`${rules.join("\n")}\u0001${facts.join("\n")}`)
    .digest("hex");
}

async function createCollection(agentId: string): Promise<string> {
  const result = await call(`${MANAGEMENT_URL}/collections`, {
    key: managementKey(),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection_name: `botbound-bot-${agentId}`.slice(0, 120) }),
  });
  const id = typeof result.collection_id === "string" ? result.collection_id : "";
  if (!id) throw new Error("Knowledge index was created without an id.");
  return id;
}

async function uploadDocument(agentId: string, text: string): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([text], { type: "text/markdown" }),
    `botbound-knowledge-${agentId}.md`,
  );
  const result = await call(FILES_URL, { key: apiKey(), method: "POST", body: form });
  const id =
    typeof result.id === "string"
      ? result.id
      : typeof result.file_id === "string"
        ? result.file_id
        : "";
  if (!id) throw new Error("Knowledge document upload returned no id.");
  return id;
}

async function addDocument(collectionId: string, fileId: string): Promise<void> {
  await call(`${MANAGEMENT_URL}/collections/${collectionId}/documents/${fileId}`, {
    key: managementKey(),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Best effort: an old copy left behind is wasted storage, never a wrong answer. */
async function removeDocument(collectionId: string, fileId: string): Promise<void> {
  await call(`${MANAGEMENT_URL}/collections/${collectionId}/documents/${fileId}`, {
    key: managementKey(),
    method: "DELETE",
  }).catch(() => {});
  await call(`${FILES_URL}/${fileId}`, { key: apiKey(), method: "DELETE" }).catch(() => {});
}

export async function deleteKnowledgeIndex(state: KnowledgeIndexState | null): Promise<void> {
  if (!state || !isKnowledgeIndexConfigured()) return;
  if (state.fileId) {
    await call(`${FILES_URL}/${state.fileId}`, { key: apiKey(), method: "DELETE" }).catch(() => {});
  }
  await call(`${MANAGEMENT_URL}/collections/${state.collectionId}`, {
    key: managementKey(),
    method: "DELETE",
  }).catch((error: unknown) => {
    log.warn("Knowledge index delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function saveState(agentId: string, userId: string, state: KnowledgeIndexState | null) {
  await outsideTenant(() =>
    drizzle
      .update(schema.agents)
      .set({ knowledgeIndex: state })
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId))),
  );
}

type StaleBot = {
  agentId: string;
  userId: string;
  agentName: string;
  index: KnowledgeIndexState | null;
  contentHash: string;
  entries: number;
};

/** Rebuild one Bot's index from its current rules and facts. */
export async function syncAgentKnowledgeIndex(bot: StaleBot): Promise<"synced" | "cleared"> {
  const [ruleRows, factRows] = await outsideTenant(() =>
    Promise.all([
      drizzle
        .select({ content: schema.directives.content })
        .from(schema.directives)
        .where(
          and(eq(schema.directives.agentId, bot.agentId), eq(schema.directives.userId, bot.userId)),
        )
        .orderBy(asc(schema.directives.id)),
      drizzle
        .select({ content: schema.knowledge.content })
        .from(schema.knowledge)
        .where(
          and(eq(schema.knowledge.agentId, bot.agentId), eq(schema.knowledge.userId, bot.userId)),
        )
        .orderBy(asc(schema.knowledge.id)),
    ]),
  );
  const rules = ruleRows.map((row) => row.content);
  const facts = factRows.map((row) => row.content);
  const doc = compileKnowledgeDocument({ agentName: bot.agentName, rules, facts });

  if (doc.entries === 0) {
    await deleteKnowledgeIndex(bot.index);
    await saveState(bot.agentId, bot.userId, null);
    return "cleared";
  }

  const collectionId = bot.index?.collectionId || (await createCollection(bot.agentId));
  // Save the index id before uploading so a failed upload never orphans it.
  if (!bot.index) {
    await saveState(bot.agentId, bot.userId, { collectionId, fileId: null, contentHash: null });
  }
  try {
    const fileId = await uploadDocument(bot.agentId, doc.text);
    await addDocument(collectionId, fileId);
    await saveState(bot.agentId, bot.userId, {
      collectionId,
      fileId,
      contentHash: knowledgeContentHash(rules, facts),
      entries: doc.entries,
      syncedAt: new Date().toISOString(),
      error: null,
    });
    if (bot.index?.fileId && bot.index.fileId !== fileId) {
      await removeDocument(collectionId, bot.index.fileId);
    }
    return "synced";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep the last good document searchable; the hash mismatch retries next tick.
    await saveState(bot.agentId, bot.userId, {
      ...(bot.index || { collectionId, fileId: null, contentHash: null }),
      collectionId,
      error: message.slice(0, 200),
    });
    throw error;
  }
}

/**
 * Bots whose taught content no longer matches their index, oldest first. The
 * fingerprint is an md5 over each Bot's rules and facts in id order, the same
 * input knowledgeContentHash() hashes, so an unchanged Bot is never rebuilt.
 */
async function findStaleBots(limit: number): Promise<StaleBot[]> {
  const result = await outsideTenant(() =>
    drizzle.execute(sql`
      with taught as (
        select a.id as agent_id, a.user_id, a.name, a.knowledge_index,
          md5(
            coalesce((select string_agg(d.content, E'\n' order by d.id) from wireline_directives d
              where d.agent_id = a.id and d.user_id = a.user_id), '')
            || chr(1) ||
            coalesce((select string_agg(k.content, E'\n' order by k.id) from wireline_knowledge k
              where k.agent_id = a.id and k.user_id = a.user_id), '')
          ) as content_hash,
          (select count(*) from wireline_directives d where d.agent_id = a.id and d.user_id = a.user_id)
          + (select count(*) from wireline_knowledge k where k.agent_id = a.id and k.user_id = a.user_id)
            as entries
        from wireline_agents a
        where a.knowledge_index is not null
          or exists (select 1 from wireline_directives d where d.agent_id = a.id)
          or exists (select 1 from wireline_knowledge k where k.agent_id = a.id)
      )
      select agent_id, user_id, name, knowledge_index, content_hash, entries from taught
      where knowledge_index is null and entries > 0
         or (knowledge_index is not null and coalesce(knowledge_index->>'contentHash', '') <> content_hash)
      order by coalesce(knowledge_index->>'syncedAt', '') asc
      limit ${limit}
    `),
  );
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) || [];
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      agentId: String(row.agent_id),
      userId: String(row.user_id),
      agentName: String(row.name || ""),
      index: parseKnowledgeIndexState(row.knowledge_index),
      contentHash: String(row.content_hash || ""),
      entries: Number(row.entries || 0),
    };
  });
}

/** A Bot whose rebuild failed waits before it is tried again, so it cannot block others. */
const RETRY_BACKOFF_MS = 30 * 60_000;
const retryAfter = new Map<string, number>();
/** A rejected key fails every Bot the same way, so the whole sweep pauses instead. */
let pausedUntil = 0;

function isAuthRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/** One sweep tick: rebuild up to SYNC_BATCH changed Bots. Never throws. */
export async function syncStaleKnowledgeIndexes(
  withinBudget: () => boolean = () => true,
): Promise<{ synced: number; failed: number }> {
  if (!isKnowledgeIndexConfigured() || Date.now() < pausedUntil) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  let stale: StaleBot[] = [];
  try {
    const now = Date.now();
    stale = (await findStaleBots(SYNC_BATCH * 5))
      .filter((bot) => (retryAfter.get(bot.agentId) ?? 0) <= now)
      .slice(0, SYNC_BATCH);
  } catch (error) {
    log.warn("Knowledge index scan failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { synced, failed };
  }
  for (const bot of stale) {
    if (!withinBudget()) break;
    try {
      await syncAgentKnowledgeIndex(bot);
      retryAfter.delete(bot.agentId);
      synced++;
    } catch (error) {
      failed++;
      if (isAuthRejection(error)) {
        pausedUntil = Date.now() + RETRY_BACKOFF_MS;
        log.error("Knowledge index paused: the provider rejected a key", {
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      retryAfter.set(bot.agentId, Date.now() + RETRY_BACKOFF_MS);
      log.warn("Knowledge index sync failed", {
        agentId: bot.agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { synced, failed };
}

/** Read a Bot's index state for cleanup before the Bot row is deleted. */
export async function knowledgeIndexFor(
  agentId: string,
  userId: string,
): Promise<KnowledgeIndexState | null> {
  const [row] = await outsideTenant(() =>
    drizzle
      .select({ index: schema.agents.knowledgeIndex })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1),
  );
  return parseKnowledgeIndexState(row?.index);
}
