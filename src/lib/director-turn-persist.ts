/**
 * Director turn persistence guards — idempotent inserts and thread cleanup.
 */
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { insertDirectorMessage } from "./director-store";
import { parseDirectorMetadata, type DirectorMessageMetadata } from "./director-message-metadata";
import { wantsLongDeliverable } from "./director-deliverables";
import {
  DIRECTOR_STUB_REPLY,
  collapseDirectorThreadDuplicates,
  isDirectorStubReply,
  isSubstantiveDirectorReply,
} from "./director-reply-utils";
import {
  DIRECTOR_THREAD_KEY,
  type DirectorConversationThreadKey,
  parseDirectorThreadKey,
} from "./director-thread-keys";

export {
  DIRECTOR_STUB_REPLY,
  collapseDirectorThreadDuplicates,
  isDirectorStubReply,
  isSubstantiveDirectorReply,
};

type DirectorRow = {
  role: string;
  content: string;
  reasoning: string | null;
  metadata: unknown;
  createdAt: Date;
};

function findDirectorReplyForAccountHolder(
  rows: DirectorRow[],
  userMessage: string,
): DirectorRow | null {
  const probe = userMessage.trim();
  if (!probe) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].role !== "Account Holder" || rows[i].content.trim() !== probe) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j].role === "director") return rows[j];
      if (rows[j].role === "Account Holder") break;
    }
    return null;
  }
  return null;
}

async function loadRecentDirectorRows(
  userId: string,
  limit = 16,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
): Promise<DirectorRow[]> {
  return drizzle
    .select({
      role: schema.directorConversationMessages.role,
      content: schema.directorConversationMessages.content,
      reasoning: schema.directorConversationMessages.reasoning,
      metadata: schema.directorConversationMessages.metadata,
      createdAt: schema.directorConversationMessages.createdAt,
    })
    .from(schema.directorConversationMessages)
    .where(
      and(
        eq(schema.directorConversationMessages.userId, userId),
        eq(schema.directorConversationMessages.threadKey, threadKey),
      ),
    )
    .orderBy(desc(schema.directorConversationMessages.createdAt))
    .limit(limit);
}

export async function hasSubstantiveDirectorReplyForAccountHolder(
  userId: string,
  userMessage: string,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
): Promise<boolean> {
  const rows = await loadRecentDirectorRows(userId, 16, threadKey);
  const match = findDirectorReplyForAccountHolder(rows, userMessage);
  return Boolean(match && isSubstantiveDirectorReply(match.content));
}

export async function loadExistingDirectorTurnResponse(
  userId: string,
  userMessage: string,
  threadKey: DirectorConversationThreadKey = DIRECTOR_THREAD_KEY,
): Promise<{
  content: string;
  reasoning: string | null;
  metadata: DirectorMessageMetadata;
} | null> {
  const rows = await loadRecentDirectorRows(userId, 16, threadKey);
  const match = findDirectorReplyForAccountHolder(rows, userMessage);
  if (!match || !isSubstantiveDirectorReply(match.content)) return null;
  return {
    content: match.content,
    reasoning: match.reasoning,
    metadata: parseDirectorMetadata(match.metadata),
  };
}

export type InsertDirectorReplyResult = "inserted" | "skipped_duplicate" | "skipped_stub";

export async function insertDirectorReplyIfAbsent(input: {
  userId: string;
  userMessage: string;
  reply: string;
  threadKey?: DirectorConversationThreadKey;
  reasoning?: string | null;
  metadata?: DirectorMessageMetadata | Record<string, unknown> | null;
}): Promise<InsertDirectorReplyResult> {
  const reply = input.reply.trim();
  if (!reply) return "skipped_stub";
  const threadKey = parseDirectorThreadKey(input.threadKey);

  if (
    await hasSubstantiveDirectorReplyForAccountHolder(input.userId, input.userMessage, threadKey)
  ) {
    return isDirectorStubReply(reply) ? "skipped_stub" : "skipped_duplicate";
  }

  if (isDirectorStubReply(reply) && wantsLongDeliverable(input.userMessage)) {
    return "skipped_stub";
  }

  await insertDirectorMessage({
    userId: input.userId,
    role: "director",
    threadKey,
    content: reply,
    reasoning: input.reasoning ?? null,
    metadata: input.metadata ?? null,
  });
  return "inserted";
}
