import { z } from "zod";
import { AppError } from "./api-error";
import { findOwnedAgentId } from "./agent-ownership";
import { changeOwnerMemory } from "./owner-memory-store";
import { OWNER_MEMORY_MAX_CHARS } from "./owner-memory";
import { buildWorkHandoffUrl, WORK_HANDOFF_MAX_CHARS } from "./work-handoff";
const agentId = z.string().trim().min(1).max(256);
const noteSchema = z
  .object({
    agent_id: agentId,
    content: z.string().trim().min(1).max(OWNER_MEMORY_MAX_CHARS),
    confirmed: z.literal(true),
  })
  .strict();
const handoffSchema = z
  .object({ agent_id: agentId, goal: z.string().trim().min(4).max(WORK_HANDOFF_MAX_CHARS) })
  .strict();

/** Caller must already hold notes.write and enter the account's tenant context. */
export async function saveConfirmedConnectorNote(userId: string, input: unknown) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success)
    throw AppError.badRequest(
      "Confirm the exact private note and choose a Bot. Notes must have 1 to 500 characters.",
    );
  await changeOwnerMemory(userId, parsed.data.agent_id, {
    action: "add",
    content: parsed.data.content,
  });
  return { status: "saved" as const, agent_id: parsed.data.agent_id };
}
/** Preparation is read-only. Only Studio's explicit Start work can admit a task. */
export async function prepareConnectorTask(userId: string, input: unknown, origin: string) {
  const parsed = handoffSchema.safeParse(input);
  if (!parsed.success)
    throw AppError.badRequest("Choose a Bot and describe a task in 4 to 2000 characters.");
  if (!(await findOwnedAgentId(parsed.data.agent_id, userId)))
    throw AppError.notFound("Bot not found.");
  return {
    status: "review_required" as const,
    agent_id: parsed.data.agent_id,
    review_url: buildWorkHandoffUrl(origin, parsed.data.agent_id, parsed.data.goal),
  };
}
