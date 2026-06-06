/**
 * Director turn persistence guards — idempotent inserts and thread cleanup.
 */
import { desc, eq } from "drizzle-orm";
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

function findDirectorReplyForOperator(
  rows: DirectorRow[],
  operatorMessage: string,
): DirectorRow | null {
  const probe = operatorMessage.trim();
  if (!probe) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].role !== "operator" || rows[i].content.trim() !== probe) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j].role === "director") return rows[j];
      if (rows[j].role === "operator") break;
    }
    return null;
  }
  return null;
}

async function loadRecentDirectorRows(userId: string, limit = 16): Promise<DirectorRow[]> {
  return drizzle
    .select({
      role: schema.directorConversationMessages.role,
      content: schema.directorConversationMessages.content,
      reasoning: schema.directorConversationMessages.reasoning,
      metadata: schema.directorConversationMessages.metadata,
      createdAt: schema.directorConversationMessages.createdAt,
    })
    .from(schema.directorConversationMessages)
    .where(eq(schema.directorConversationMessages.userId, userId))
    .orderBy(desc(schema.directorConversationMessages.createdAt))
    .limit(limit);
}

export async function hasSubstantiveDirectorReplyForOperator(
  userId: string,
  operatorMessage: string,
): Promise<boolean> {
  const rows = await loadRecentDirectorRows(userId);
  const match = findDirectorReplyForOperator(rows, operatorMessage);
  return Boolean(match && isSubstantiveDirectorReply(match.content));
}

export async function loadExistingDirectorTurnResponse(
  userId: string,
  operatorMessage: string,
): Promise<{
  content: string;
  reasoning: string | null;
  metadata: DirectorMessageMetadata;
} | null> {
  const rows = await loadRecentDirectorRows(userId);
  const match = findDirectorReplyForOperator(rows, operatorMessage);
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
  operatorMessage: string;
  reply: string;
  reasoning?: string | null;
  metadata?: DirectorMessageMetadata | Record<string, unknown> | null;
}): Promise<InsertDirectorReplyResult> {
  const reply = input.reply.trim();
  if (!reply) return "skipped_stub";

  if (await hasSubstantiveDirectorReplyForOperator(input.userId, input.operatorMessage)) {
    return isDirectorStubReply(reply) ? "skipped_stub" : "skipped_duplicate";
  }

  if (isDirectorStubReply(reply) && wantsLongDeliverable(input.operatorMessage)) {
    return "skipped_stub";
  }

  await insertDirectorMessage({
    userId: input.userId,
    role: "director",
    content: reply,
    reasoning: input.reasoning ?? null,
    metadata: input.metadata ?? null,
  });
  return "inserted";
}
