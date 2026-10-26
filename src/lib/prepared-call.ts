import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { requireTenantChannel } from "./channel-entitlements";
import { outboundCallingAvailability, outboundCallingEnabledFor } from "./outbound-call-purpose";
import {
  prepareCallSchema,
  preparedCallSchema,
  type PrepareCallInput,
  type PreparedCall,
} from "./prepared-call-contract";
import { drizzle } from "./server-context";
import { readNativeOutboundRequestStatus } from "./voice/openai-outbound-placement";
import type { PlaceOutboundCallInput } from "./voice/outbound-call-service";

const ACTION = "mcp.call.prepare";
const RESOURCE = "prepared_call";
const TTL_MS = 24 * 60 * 60_000;

/** Tenant-owned immutable proposal. This receipt is not permission to dispatch. */
export async function readPreparedCall(userId: string, requestKey: string): Promise<PreparedCall> {
  if (!/^[a-f0-9-]{36}$/i.test(requestKey)) throw AppError.notFound("Prepared call not found.");
  const [row] = await drizzle
    .select({ metadata: schema.auditLog.metadata })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.action, ACTION),
        eq(schema.auditLog.resourceType, RESOURCE),
        eq(schema.auditLog.idempotencyKey, requestKey.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound("Prepared call not found.");
  const parsed = preparedCallSchema.safeParse(row.metadata);
  if (!parsed.success || parsed.data.request_key !== requestKey.toLowerCase())
    throw AppError.serviceUnavailable("This prepared call cannot be verified.");
  return parsed.data;
}

export async function prepareCall(userId: string, raw: unknown): Promise<PreparedCall> {
  const parsed = prepareCallSchema.safeParse(raw);
  if (!parsed.success)
    throw AppError.badRequest(
      "Provide a request UUIDv4, Bot, US phone number, instruction, and service or callback purpose.",
    );
  const input = parsed.data;
  if (!outboundCallingEnabledFor(input.call_purpose, outboundCallingAvailability()))
    throw AppError.serviceUnavailable("Calling is temporarily unavailable.");
  await requireTenantChannel(userId, "voice");
  const [agent] = await drizzle
    .select({
      id: schema.agents.id,
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, input.agent_id)))
    .limit(1);
  if (!agent) throw AppError.notFound("Bot not found.");
  // Existing unique (user_id, action, idempotency_key) serializes concurrent prepares.
  // No phone provider, consent claim, or wallet reservation occurs at preparation.
  const prepared: PreparedCall = {
    ...input,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  };
  const [inserted] = await drizzle
    .insert(schema.auditLog)
    .values({
      userId,
      action: ACTION,
      eventType: ACTION,
      resourceType: RESOURCE,
      resourceId: input.request_key,
      idempotencyKey: input.request_key,
      metadata: prepared,
    })
    .onConflictDoNothing()
    .returning({ id: schema.auditLog.id });
  if (inserted) return prepared;
  const previous = await readPreparedCall(userId, input.request_key);
  assertSamePreparedInput(previous, input);
  return previous;
}

export function assertSamePreparedInput(
  stored: PrepareCallInput,
  requested: PrepareCallInput,
): void {
  if (
    stored.request_key !== requested.request_key ||
    stored.agent_id !== requested.agent_id ||
    stored.phone !== requested.phone ||
    stored.instruction !== requested.instruction ||
    stored.call_purpose !== requested.call_purpose
  )
    throw AppError.conflict("This request key already belongs to a different call.");
}

export async function assertPreparedCallMatches(
  input: PlaceOutboundCallInput & { preparedRequestId: string },
  options: { allowExpiredReceipt?: boolean } = {},
): Promise<PreparedCall> {
  const stored = await readPreparedCall(input.userId, input.preparedRequestId);
  if (!options.allowExpiredReceipt && Date.parse(stored.expires_at) <= Date.now())
    throw AppError.conflict("This call proposal expired. Prepare a new call before reviewing it.");
  if (input.callPurpose === "marketing_or_sales" || input.customerName)
    throw AppError.conflict("The call does not match the reviewed proposal.");
  assertSamePreparedInput(stored, {
    request_key: input.requestKey?.toLowerCase() ?? "",
    agent_id: input.agentId,
    phone: input.customerNumber,
    instruction: input.context ?? "",
    call_purpose: input.callPurpose,
  });
  return stored;
}

export async function preparedCallStatus(userId: string, requestKey: string) {
  const prepared = await readPreparedCall(userId, requestKey);
  try {
    const result = await readNativeOutboundRequestStatus(userId, prepared.request_key);
    return { request_key: prepared.request_key, expires_at: prepared.expires_at, ...result };
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 404) throw error;
    const expired = Date.parse(prepared.expires_at) <= Date.now();
    return {
      request_key: prepared.request_key,
      expires_at: prepared.expires_at,
      status: expired ? "expired" : "awaiting_review",
      terminal: expired,
    };
  }
}
