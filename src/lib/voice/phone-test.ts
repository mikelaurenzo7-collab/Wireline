import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../account-environment-policy";
import { getCanonicalAppUrl } from "../app-url";
import { enqueue } from "../job-queue";
import { evaluateOutboundDialGate } from "../outbound-dial-gate";
import {
  phoneTestIsTerminal,
  type PhoneTestReceipt,
  type PhoneTestStatus,
} from "../phone-test-contract";
import { drizzle, tenantStore } from "../server-context";
import { inferStateFromPhone } from "../tcpa-consent";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import {
  releaseVoiceCallFundingInTransaction,
  reserveVoiceCallFunding,
} from "../voice-call-funding";
import {
  appendVoiceIdentityReceipt,
  bindVoiceFundingAlias,
  PHONE_TEST_ID,
  phoneTestFundingId,
  readVoiceIdentityReceipt,
  voicePhoneFingerprint,
  type VoiceIdentityTransaction,
} from "../voice-call-identity";
import { trackVoiceMinutes } from "../voice-usage";
import {
  commitPlatformCostReservation,
  markPlatformCostReservationAmbiguous,
  releasePlatformCostReservation,
  reservePlatformCostRecord,
  type PlatformCostReservation,
} from "../../middleware/audit-middleware";
import { isAmbiguousTwilioCallCreateError } from "./outbound-call-service";
import {
  issueOpenAIOutboundToken,
  openAIOutboundPlacementMatches,
  verifyOpenAIOutboundToken,
} from "./openai-outbound-token";
import { buildOpenAIOutboundSipUri, openAISipConfigured } from "./openai-sip-config";

export const PHONE_TEST_MAX_SECONDS = 120;
const TERMINAL_CARRIER = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);
const CALL_SID = /^CA[a-f0-9]{32}$/i;
const SOURCE = "phone_test";
type Lead = typeof schema.outboundLeads.$inferSelect;
type Test = {
  version: 1;
  request_id: string;
  status: PhoneTestStatus;
  expires_at: string;
  attempts: number;
  /** New intents retain answered evidence before applying no-answer accounting. */
  unanswered_release_version?: 1;
  answered_at?: string;
  provider_attempted_at?: string;
  verified_at?: string;
  cancel_requested?: boolean;
  carrier_status?: string;
  carrier_error_code?: string;
  error?: string;
};
/** Provider codes are short decimal diagnostics, never raw messages or URLs. */
export function normalizePhoneTestCarrierErrorCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[1-9]\d{3,5}$/.test(value) ? value : undefined;
}
function carrierFailureMessage(status: unknown, rawErrorCode?: unknown): string | undefined {
  const message =
    status === "busy"
      ? "The carrier reported the line as busy. Check Do Not Disturb or call blocking, then try again."
      : status === "no-answer"
        ? "Your phone did not answer the call. Check reception or call filtering, then try again."
        : status === "failed"
          ? "The carrier could not connect the call. Check your number and try again."
          : status === "canceled"
            ? "The carrier canceled the call before it connected."
            : undefined;
  const code = normalizePhoneTestCarrierErrorCode(rawErrorCode);
  return message ? `${message}${code ? ` Carrier code ${code}.` : ""}` : undefined;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function native(lead: Lead) {
  return record(record(lead.metadata).native_voice);
}
function testOf(lead: Lead): Test {
  const test = record(native(lead).phone_test);
  if (
    lead.source !== SOURCE ||
    test.version !== 1 ||
    !PHONE_TEST_ID.test(String(test.request_id)) ||
    native(lead).placement_id !== test.request_id ||
    !Number.isFinite(Date.parse(String(test.expires_at)))
  )
    throw AppError.conflict("This phone test receipt could not be verified.");
  return test as Test;
}
export function normalizePhoneTestNumber(value: string): string {
  const digits = value.replace(/[\s().+-]/g, "");
  const normalized = /^\d{10}$/.test(digits)
    ? `+1${digits}`
    : /^1\d{10}$/.test(digits)
      ? `+${digits}`
      : "";
  const state = inferStateFromPhone(normalized);
  if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(normalized) || !state || ["PR", "VI", "GU"].includes(state))
    throw AppError.badRequest("Enter a supported US phone number you control.");
  return normalized;
}
function signingSecret(): string {
  const secret = String(process.env.INTERNAL_JWT_SECRET || "").trim();
  if (secret.length < 32)
    throw AppError.serviceUnavailable("Phone verification is temporarily unavailable.");
  return secret;
}
/** Purpose-bound deterministic OTP. The raw code is never stored or logged. */
export function phoneTestCode(input: {
  userId: string;
  agentId: string;
  requestKey: string;
  phone: string;
}): string {
  const digest = createHmac("sha256", signingSecret())
    .update(
      JSON.stringify([
        "botbound:self-phone-test:dtmf:v1",
        input.userId,
        input.agentId,
        input.requestKey,
        input.phone,
      ]),
    )
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
function codeMatches(actual: string, expected: string): boolean {
  return /^\d{6}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function receipt(lead: Lead, terminal?: Record<string, unknown>): PhoneTestReceipt {
  const test = testOf(lead);
  const error =
    carrierFailureMessage(
      terminal?.carrier_status ?? test.carrier_status,
      terminal?.carrier_error_code ?? test.carrier_error_code,
    ) ?? test.error;
  const state =
    !phoneTestIsTerminal(test.status) &&
    test.status !== "ending" &&
    Date.parse(test.expires_at) <= Date.now()
      ? "uncertain"
      : test.verified_at && native(lead).state === "connected" && test.status === "creating"
        ? "connected"
        : test.status;
  return {
    id: test.request_id,
    agent_id: lead.agentId!,
    status: state,
    expires_at: test.expires_at,
    phone_last4: lead.customerNumber!.slice(-4),
    ...(!test.verified_at &&
    ["creating", "ringing", "verifying"].includes(state) &&
    Date.parse(test.expires_at) > Date.now()
      ? {
          verification_code: phoneTestCode({
            userId: lead.userId,
            agentId: lead.agentId!,
            requestKey: test.request_id,
            phone: lead.customerNumber!,
          }),
        }
      : {}),
    ...(error ? { error } : {}),
  };
}
async function walletLock(tx: VoiceIdentityTransaction, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
}
async function findTest(
  reader: Pick<typeof drizzle, "select">,
  userId: string,
  requestKey: string,
): Promise<Lead | undefined> {
  const [lead] = await reader
    .select()
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.userId, userId),
        eq(schema.outboundLeads.idempotencyKey, `phone-test:${requestKey}`),
      ),
    )
    .limit(1);
  return lead;
}
async function assertPhoneTestAgentOwned(
  reader: Pick<typeof drizzle, "select">,
  userId: string,
  agentId: string,
) {
  const [agent] = await reader
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, agentId)))
    .limit(1);
  if (!agent) throw AppError.notFound("Bot not found.");
}
async function updateTest(
  tx: VoiceIdentityTransaction,
  lead: Lead,
  patch: Partial<Test>,
  voicePatch: Record<string, unknown> = {},
) {
  const updatedTest = { ...testOf(lead), ...patch };
  const [updated] = await tx
    .update(schema.outboundLeads)
    .set({
      metadata: {
        ...record(lead.metadata),
        native_voice: { ...native(lead), ...voicePatch, phone_test: updatedTest },
      },
      ...(phoneTestIsTerminal(updatedTest.status)
        ? { status: updatedTest.status === "completed" ? "Completed" : "Failed" }
        : {}),
    })
    .where(and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, lead.userId)))
    .returning();
  if (!updated) throw AppError.conflict("The phone test changed. Refresh and try again.");
  return updated;
}
async function cancelledReceipt(
  userId: string,
  agentId: string,
  requestKey: string,
): Promise<PhoneTestReceipt | null> {
  const row = await readVoiceIdentityReceipt(drizzle, userId, `phone_test_cancel:${requestKey}`);
  if (!row) return null;
  const scope = record(row.metadata);
  if (scope.agent_id !== agentId) throw AppError.notFound("Phone test not found.");
  return {
    id: requestKey,
    agent_id: agentId,
    status: "cancelled",
    expires_at: String(scope.created_at),
  };
}
export async function getPhoneTest(
  userId: string,
  agentId: string,
  requestKey: string,
): Promise<PhoneTestReceipt> {
  phoneTestFundingId(requestKey);
  const lead = await findTest(drizzle, userId, requestKey);
  if (!lead) {
    const cancelled = await cancelledReceipt(userId, agentId, requestKey);
    if (cancelled) return cancelled;
    throw AppError.notFound("Phone test not found. Keep this request open while it connects.");
  }
  if (lead.agentId !== agentId) throw AppError.notFound("Phone test not found.");
  // Legacy terminal receipts already contain the authoritative carrier status.
  // Read it without rewriting historical evidence or touching the provider.
  const terminal = phoneTestIsTerminal(testOf(lead).status)
    ? await readVoiceIdentityReceipt(
        drizzle,
        userId,
        `voice_phone_test_terminal:${phoneTestFundingId(requestKey)}`,
      )
    : undefined;
  return receipt(lead, terminal ? record(terminal.metadata) : undefined);
}
export function phoneTestWebhookUrl(
  kind: "answer" | "gather" | "status" | "fallback",
  token: string,
): string {
  const url = new URL(`/api/twilio-webhook/phone-test/${kind}`, getCanonicalAppUrl());
  url.searchParams.set("token", token);
  // Status and Gather retries replay durable state; they can never create another call.
  return `${url.toString()}#ct=2000&rt=5000&tt=15000&rc=2&rp=ct,rt,5xx`;
}

export async function createPhoneTest(input: {
  userId: string;
  agentId: string;
  phone: string;
  requestKey: string;
}): Promise<PhoneTestReceipt> {
  const requestKey = input.requestKey.toLowerCase();
  const canonical = phoneTestFundingId(requestKey);
  const phone = normalizePhoneTestNumber(input.phone);
  const prior = await findTest(drizzle, input.userId, requestKey);
  if (prior) {
    if (prior.agentId !== input.agentId || prior.customerNumber !== phone)
      throw AppError.conflict("This phone test already belongs to another request.");
    return receipt(prior);
  }
  const cancelled = await cancelledReceipt(input.userId, input.agentId, requestKey);
  if (cancelled) return cancelled;
  await assertPhoneTestAgentOwned(drizzle, input.userId, input.agentId);
  await assertLiveExternalActionAllowed(input.userId, "phone_test_create");
  await assertExternalEntityActionAllowed(input.userId, "phone_test_create", { phone });
  const gate = await evaluateOutboundDialGate({
    userId: input.userId,
    phone,
    isMarketingCall: false,
    requireFederalDncScreening: false,
    isRequestedCallback: true,
  });
  if (!gate.allowed) {
    if (gate.reason === "outside_permitted_calling_hours")
      throw AppError.conflict(
        "Try your phone test between 8am and 9pm at your number's local time.",
      );
    throw AppError.forbidden(
      "This number cannot receive the requested test. Check your Do Not Call settings.",
    );
  }
  if (!openAISipConfigured())
    throw AppError.serviceUnavailable("Calling is temporarily unavailable. Please retry shortly.");
  signingSecret();
  const client = getTwilioClient();
  if (!client)
    throw AppError.serviceUnavailable("Calling is temporarily unavailable. Please retry shortly.");
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "phone_test_create",
    ttlMs: 15 * 60_000,
    retainOnSuccess: (result: PhoneTestReceipt) => !phoneTestIsTerminal(result.status),
    perform: async () => {
      const prepared = await drizzle.transaction(async (tx) => {
        await walletLock(tx, input.userId);
        const cancellation = await readVoiceIdentityReceipt(
          tx,
          input.userId,
          `phone_test_cancel:${requestKey}`,
        );
        if (cancellation) return { cancelled: true } as const;
        const existing = await findTest(tx, input.userId, requestKey);
        if (existing) {
          if (existing.agentId !== input.agentId || existing.customerNumber !== phone)
            throw AppError.conflict("This phone test already belongs to another request.");
          return { lead: existing, created: false } as const;
        }
        await assertPhoneTestAgentOwned(tx, input.userId, input.agentId);
        const [count] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, input.userId),
              eq(schema.outboundLeads.source, SOURCE),
              gte(schema.outboundLeads.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
            ),
          );
        if (Number(count?.count || 0) >= 5)
          throw AppError.tooManyRequests(
            "You have used today's five phone tests. Try again tomorrow.",
          );
        const [recent] = await tx
          .select({ id: schema.outboundLeads.id })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, input.userId),
              eq(schema.outboundLeads.source, SOURCE),
              gte(schema.outboundLeads.createdAt, new Date(Date.now() - 60_000)),
            ),
          )
          .limit(1);
        if (recent) throw AppError.tooManyRequests("Please wait one minute between phone tests.");
        const [line] = await tx
          .select()
          .from(schema.phoneNumbers)
          .where(
            and(
              eq(schema.phoneNumbers.userId, input.userId),
              eq(schema.phoneNumbers.agentId, input.agentId),
            ),
          )
          .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
          .limit(1);
        if (
          !line ||
          !/^PN[a-f0-9]{32}$/i.test(String(line.vapiNumberId)) ||
          !/^\+1\d{10}$/.test(line.phoneNumber)
        )
          throw AppError.conflict("Connect this Bot's phone number before testing a call.");
        if (line.phoneNumber === phone)
          throw AppError.badRequest("Enter your own phone, rather than the Bot's number.");
        const funding = await reserveVoiceCallFunding(tx, {
          userId: input.userId,
          providerCallId: canonical,
          maxSeconds: PHONE_TEST_MAX_SECONDS,
          phoneTest: { agentId: input.agentId, phone, from: line.phoneNumber },
        });
        if (!funding)
          throw AppError.serviceUnavailable("Phone test funding could not be verified.");
        const expiresAt = new Date(funding.deadlineAtMs).toISOString();
        const now = new Date().toISOString();
        const test: Test = {
          version: 1,
          request_id: requestKey,
          status: "creating",
          expires_at: expiresAt,
          attempts: 0,
          unanswered_release_version: 1,
        };
        const [lead] = await tx
          .insert(schema.outboundLeads)
          .values({
            userId: input.userId,
            agentId: input.agentId,
            customerNumber: phone,
            source: SOURCE,
            idempotencyKey: `phone-test:${requestKey}`,
            status: "Dialing",
            attempts: 1,
            lastCalledAt: new Date(),
            context:
              "The account owner requested a short, non-marketing test of this Bot on their own verified phone. Do not place another call.",
            metadata: {
              native_voice: {
                provider: "twilio_openai_realtime_sip",
                call_purpose: "service_or_requested",
                outbound_line_number: line.phoneNumber,
                placement_id: requestKey,
                placement_claimed_at: now,
                state: "creating",
                do_not_retry: true,
                phone_test: test,
              },
            },
          })
          .returning();
        if (!lead) throw new Error("Phone test could not be saved.");
        await tx.insert(schema.consentLog).values({
          userId: input.userId,
          callId: canonical,
          customerNumber: phone,
          event: "self_phone_test_requested",
          ruleVersion: "phone-test-v1",
          metadata: {
            agent_id: input.agentId,
            request_id: requestKey,
            purpose: "self_phone_test",
            requested_ai_call: true,
            expires_at: expiresAt,
          },
        });
        await enqueue(tx, {
          userId: input.userId,
          type: "phone_test_reconcile",
          payload: { requestKey, agentId: input.agentId },
          runAt: new Date(funding.deadlineAtMs + 5000),
          maxAttempts: 12,
        });
        return { lead, created: true } as const;
      });
      if ("cancelled" in prepared)
        return (await cancelledReceipt(input.userId, input.agentId, requestKey))!;
      if (!prepared.created) return receipt(prepared.lead);
      // Budget reservation is a separate committed transaction: never budget-after-wallet.
      const spend = await reservePlatformCostRecord({
        userId: input.userId,
        action: "voice.phone_test.carrier",
        provider: "twilio",
        model: "bounded_us_phone_test",
        costUsd: 0.1,
        idempotencyKey: `phone-test-carrier:${requestKey}`,
        requestMeta: {
          surface: "phone_test",
          funding_id: canonical,
          maximum_seconds: PHONE_TEST_MAX_SECONDS,
          estimate_only: true,
        },
      });
      if (!spend.reserved) {
        await failBeforeCarrier(
          prepared.lead,
          "Your call budget could not be verified. Please retry shortly.",
        );
        return getPhoneTest(input.userId, input.agentId, requestKey);
      }
      return placePhoneTest(prepared.lead, spend.reservation);
    },
  });
  if (!outcome.performed)
    throw AppError.conflict("Calling is unavailable while account deletion is in progress.");
  return outcome.result;
}

async function failBeforeCarrier(lead: Lead, error: string) {
  await drizzle.transaction(async (tx) => {
    await walletLock(tx, lead.userId);
    const current = await findTest(tx, lead.userId, testOf(lead).request_id);
    if (!current || testOf(current).provider_attempted_at) return;
    await updateTest(tx, current, {
      status: testOf(current).cancel_requested ? "cancelled" : "failed",
      error,
    });
    await releaseVoiceCallFundingInTransaction(tx, {
      userId: lead.userId,
      providerCallId: phoneTestFundingId(testOf(lead).request_id),
    });
  });
}

async function lockedTest(
  tx: VoiceIdentityTransaction,
  userId: string,
  requestKey: string,
): Promise<Lead | undefined> {
  await walletLock(tx, userId);
  const first = await findTest(tx, userId, requestKey);
  if (!first) return;
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(first.id)}`}))`,
  );
  return findTest(tx, userId, requestKey);
}
async function bindCarrier(
  tx: VoiceIdentityTransaction,
  lead: Lead,
  callSid: string,
): Promise<Lead> {
  const test = testOf(lead);
  if (
    !CALL_SID.test(callSid) ||
    !test.provider_attempted_at ||
    (lead.callId && lead.callId !== callSid)
  )
    throw AppError.conflict("The phone test carrier identity does not match.");
  await bindVoiceFundingAlias(tx, {
    userId: lead.userId,
    canonicalCallId: phoneTestFundingId(test.request_id),
    providerCallId: `twilio:${callSid}`,
    phase: "carrier",
  });
  if (lead.callId === callSid) return lead;
  const [bound] = await tx
    .update(schema.outboundLeads)
    .set({
      callId: callSid,
      metadata: {
        ...record(lead.metadata),
        native_voice: { ...native(lead), twilio_call_sid: callSid },
      },
    })
    .where(and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, lead.userId)))
    .returning();
  if (!bound) throw AppError.conflict("The phone test carrier binding changed.");
  return bound;
}
async function placePhoneTest(
  lead: Lead,
  spend: PlatformCostReservation,
): Promise<PhoneTestReceipt> {
  const test = testOf(lead);
  const attempted = await drizzle.transaction(async (tx) => {
    const current = await lockedTest(tx, lead.userId, test.request_id);
    if (!current) throw AppError.notFound("Phone test not found.");
    const state = testOf(current);
    if (state.cancel_requested || Date.parse(state.expires_at) <= Date.now()) {
      await updateTest(tx, current, { status: "cancelled", cancel_requested: true });
      await releaseVoiceCallFundingInTransaction(tx, {
        userId: lead.userId,
        providerCallId: phoneTestFundingId(test.request_id),
      });
      return null;
    }
    if (state.provider_attempted_at) return null;
    // Commit an irretryable provider-attempt marker BEFORE the network call.
    return updateTest(tx, current, {
      provider_attempted_at: new Date().toISOString(),
      status: "creating",
    });
  });
  if (!attempted) {
    await releasePlatformCostReservation(spend);
    return getPhoneTest(lead.userId, lead.agentId!, test.request_id);
  }
  const { token } = issueOpenAIOutboundToken({ leadId: lead.id, placementId: test.request_id });
  let acceptedCallSid: string | null = null;
  try {
    // A short parent limit covers the verification phase too, independent of
    // SIP startup. The durable deadline job also terminates a surviving parent.
    const call = await getTwilioClient()!.calls.create({
      to: lead.customerNumber!,
      from: String(native(lead).outbound_line_number),
      url: phoneTestWebhookUrl("answer", token),
      method: "POST",
      fallbackUrl: phoneTestWebhookUrl("fallback", token),
      fallbackMethod: "POST",
      statusCallback: phoneTestWebhookUrl("status", token),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 15,
      timeLimit: 90,
      // No AMD or recording: possession + explicit DTMF consent precedes AI.
    });
    if (!CALL_SID.test(String(call.sid)))
      throw new Error("Carrier acceptance identity unavailable.");
    acceptedCallSid = call.sid;
    const accepted = await drizzle.transaction(async (tx) => {
      const current = await lockedTest(tx, lead.userId, test.request_id);
      if (!current) throw AppError.notFound("Phone test not found.");
      const bound = await bindCarrier(tx, current, call.sid);
      const state = testOf(bound);
      if (phoneTestIsTerminal(state.status) || state.verified_at || state.cancel_requested)
        return bound;
      return updateTest(tx, bound, {
        status: state.status === "verifying" ? "verifying" : "ringing",
      });
    });
    // Persist provider acceptance first. An accounting write failure is never
    // evidence that a carrier call with a returned SID was not placed.
    await commitPlatformCostReservation(spend);
    if (testOf(accepted).cancel_requested)
      await reconcilePhoneTest(lead.userId, lead.agentId!, test.request_id, true);
    return getPhoneTest(lead.userId, lead.agentId!, test.request_id);
  } catch (error) {
    // If a signed callback already bound a SID, local create failure cannot
    // prove non-delivery. A known or ambiguous carrier always keeps its hold.
    const current = await findTest(drizzle, lead.userId, test.request_id);
    const ambiguous =
      Boolean(acceptedCallSid || current?.callId) || isAmbiguousTwilioCallCreateError(error);
    if (ambiguous) await markPlatformCostReservationAmbiguous(spend);
    else await releasePlatformCostReservation(spend);
    await drizzle.transaction(async (tx) => {
      const row = await lockedTest(tx, lead.userId, test.request_id);
      if (!row || phoneTestIsTerminal(testOf(row).status) || testOf(row).verified_at) return;
      if (row.callId) return;
      if (acceptedCallSid) {
        // Retry only the exact SDK-returned identity, never Calls.create or a
        // search by phone/time. This repairs a transient first binding failure.
        const bound = await bindCarrier(tx, row, acceptedCallSid);
        await updateTest(tx, bound, {
          status: testOf(bound).cancel_requested ? "ending" : "ringing",
        });
        return;
      }
      await updateTest(tx, row, {
        status: ambiguous ? "uncertain" : "failed",
        error: ambiguous
          ? "The carrier has not confirmed this call. Keep this request open; it will not redial."
          : "The carrier could not place this call. Check the number and try a new test.",
      });
      if (!ambiguous)
        await releaseVoiceCallFundingInTransaction(tx, {
          userId: lead.userId,
          providerCallId: phoneTestFundingId(test.request_id),
        });
    });
    return getPhoneTest(lead.userId, lead.agentId!, test.request_id);
  }
}

export const phoneTestHangupTwiml = () =>
  '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export function phoneTestGatherTwiml(token: string, attempt = 1): string {
  const action = phoneTestWebhookUrl("gather", token).replace("#", `&attempt=${attempt}#`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="6" timeout="12" actionOnEmptyResult="true" method="POST" action="' +
    xml(action) +
    '"><Say>This is the BotBound phone test you requested. To speak with your AI bot and allow this test conversation to be transcribed, enter the six digit code shown in BotBound. If you did not request this call, hang up.</Say></Gather><Hangup/></Response>'
  );
}
export function phoneTestBridgeTwiml(input: {
  token: string;
  from: string;
  remainingSeconds: number;
}): string {
  const seconds = Math.floor(input.remainingSeconds);
  if (seconds < 1 || seconds > PHONE_TEST_MAX_SECONDS) return phoneTestHangupTwiml();
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="10" timeLimit="' +
    String(seconds) +
    '" callerId="' +
    xml(input.from) +
    '"><Sip>' +
    xml(buildOpenAIOutboundSipUri(input.token)) +
    "</Sip></Dial><Hangup/></Response>"
  );
}
export type PhoneTestCarrierInput = {
  token: string;
  callSid: string;
  to: string;
  from: string;
  status?: string;
  duration?: string;
  digits?: string;
  attempt?: number;
  errorCode?: string;
};
async function callbackLead(input: PhoneTestCarrierInput): Promise<Lead> {
  const verified = verifyOpenAIOutboundToken(input.token);
  if (!verified.ok || !CALL_SID.test(input.callSid))
    throw AppError.unauthorized("Invalid phone test callback.");
  const [lead] = await drizzle
    .select()
    .from(schema.outboundLeads)
    .where(eq(schema.outboundLeads.id, BigInt(verified.claims.leadId)))
    .limit(1);
  if (
    !lead ||
    !openAIOutboundPlacementMatches(native(lead), verified.claims) ||
    input.to !== lead.customerNumber ||
    input.from !== native(lead).outbound_line_number
  )
    throw AppError.forbidden("The phone test callback does not match its request.");
  testOf(lead);
  return lead;
}
export async function handlePhoneTestAnswer(
  input: PhoneTestCarrierInput,
  gather = false,
): Promise<string> {
  const found = await callbackLead(input);
  return tenantStore.run(found.userId, async () => {
    // A signed answer/Gather request already proves the carrier connected.
    // Persist this before policy/network awaits; DELETE must not erase it by
    // replacing the public "verifying" status with "ending".
    const answerRecorded = await drizzle.transaction(async (tx) => {
      const row = await lockedTest(tx, found.userId, testOf(found).request_id);
      if (!row) return false;
      const lead = await bindCarrier(tx, row, input.callSid);
      const test = testOf(lead);
      if (phoneTestIsTerminal(test.status)) return false;
      if (!test.answered_at) await updateTest(tx, lead, { answered_at: new Date().toISOString() });
      return true;
    });
    if (!answerRecorded) return phoneTestHangupTwiml();
    try {
      await assertLiveExternalActionAllowed(found.userId, "phone_test_bridge");
    } catch {
      return phoneTestHangupTwiml();
    }
    return drizzle.transaction(async (tx) => {
      const row = await lockedTest(tx, found.userId, testOf(found).request_id);
      if (!row) return phoneTestHangupTwiml();
      const lead = await bindCarrier(tx, row, input.callSid);
      const test = testOf(lead);
      if (
        phoneTestIsTerminal(test.status) ||
        test.cancel_requested ||
        Date.parse(test.expires_at) <= Date.now()
      )
        return phoneTestHangupTwiml();
      if (test.verified_at) {
        if (native(lead).openai_call_id) return phoneTestHangupTwiml();
        return phoneTestBridgeTwiml({
          token: input.token,
          from: input.from,
          remainingSeconds: Math.floor((Date.parse(test.expires_at) - Date.now()) / 1000),
        });
      }
      if (!gather) {
        await updateTest(tx, lead, { status: "verifying" });
        return phoneTestGatherTwiml(input.token, test.attempts + 1);
      }
      // Twilio may retry a lost Gather response. Replaying attempt 1 must not
      // consume attempt 2, and a caller cannot jump ahead to a new challenge.
      if (!Number.isSafeInteger(input.attempt) || input.attempt! < 1 || input.attempt! > 2)
        return phoneTestHangupTwiml();
      if (input.attempt! <= test.attempts)
        return phoneTestGatherTwiml(input.token, test.attempts + 1);
      if (input.attempt !== test.attempts + 1) return phoneTestHangupTwiml();
      const code = phoneTestCode({
        userId: lead.userId,
        agentId: lead.agentId!,
        requestKey: test.request_id,
        phone: lead.customerNumber!,
      });
      if (!codeMatches(input.digits || "", code)) {
        const attempts = test.attempts + 1;
        await updateTest(tx, lead, {
          attempts,
          status: attempts >= 2 ? "ending" : "verifying",
          ...(attempts >= 2
            ? { cancel_requested: true, error: "The verification code was not confirmed." }
            : {}),
        });
        return attempts >= 2
          ? phoneTestHangupTwiml()
          : phoneTestGatherTwiml(input.token, attempts + 1);
      }
      const canonical = phoneTestFundingId(test.request_id);
      const proofKey = `voice_phone_test_verified:${canonical}`;
      if (!(await readVoiceIdentityReceipt(tx, lead.userId, proofKey))) {
        await appendVoiceIdentityReceipt(tx, {
          userId: lead.userId,
          key: proofKey,
          type: "voice_phone_test_verified",
          refId: canonical,
          metadata: {
            version: 1,
            agent_id: lead.agentId,
            phone_fingerprint: voicePhoneFingerprint(lead.customerNumber!),
            call_sid: input.callSid,
            verified_at: new Date().toISOString(),
            purpose: "self_phone_test",
          },
        });
        await tx.insert(schema.consentLog).values({
          userId: lead.userId,
          callId: canonical,
          customerNumber: lead.customerNumber,
          event: "self_phone_test_dtmf_confirmed",
          ruleVersion: "phone-test-v1",
          metadata: {
            agent_id: lead.agentId,
            request_id: test.request_id,
            call_sid: input.callSid,
            requested_ai_call: true,
            transcription_notice_accepted: true,
          },
        });
      }
      await updateTest(
        tx,
        lead,
        { status: "creating", verified_at: new Date().toISOString() },
        { state: "bridging" },
      );
      return phoneTestBridgeTwiml({
        token: input.token,
        from: input.from,
        remainingSeconds: Math.floor((Date.parse(test.expires_at) - Date.now()) / 1000),
      });
    });
  });
}

async function settlePhoneTest(
  lead: Lead,
  status: string,
  rawDuration: string | undefined,
  rawErrorCode?: string,
): Promise<void> {
  if (!TERMINAL_CARRIER.has(status)) throw AppError.conflict("The carrier call is still active.");
  const suppliedDuration = rawDuration !== undefined && rawDuration !== "";
  const seconds = suppliedDuration ? Number(rawDuration) : 0;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > 86_400 ||
    ((status === "completed" || suppliedDuration) && !/^\d+$/.test(rawDuration || ""))
  )
    throw AppError.serviceUnavailable("The carrier's final duration is not yet available.");
  if (status !== "completed" && seconds !== 0)
    throw AppError.conflict("An unanswered carrier result conflicts with its connected duration.");
  const requestKey = testOf(lead).request_id;
  const canonical = phoneTestFundingId(requestKey);
  const errorCode = normalizePhoneTestCarrierErrorCode(rawErrorCode);
  const shouldMeter = await drizzle.transaction(async (tx) => {
    const row = await lockedTest(tx, lead.userId, requestKey);
    if (!row || row.callId !== lead.callId || !row.callId)
      throw AppError.conflict("The phone test carrier receipt changed.");
    const state = testOf(row);
    const sipPhase = await readVoiceIdentityReceipt(
      tx,
      row.userId,
      `voice_funding_phase:${canonical}:sip`,
    );
    const verified = await readVoiceIdentityReceipt(
      tx,
      row.userId,
      `voice_phone_test_verified:${canonical}`,
    );
    const answered = Boolean(
      state.answered_at ||
      state.verified_at ||
      state.attempts > 0 ||
      state.status === "verifying" ||
      verified ||
      sipPhase ||
      native(row).openai_call_id ||
      ["bridging", "connected", "customer_answered", "transferred"].includes(
        String(native(row).state),
      ),
    );
    if (status !== "completed" && answered)
      throw AppError.conflict(
        "An unanswered carrier result conflicts with confirmed answer evidence.",
      );
    const unanswered =
      status !== "completed" && state.unanswered_release_version === 1 && !answered;
    const key = `voice_phone_test_terminal:${canonical}`;
    const prior = await readVoiceIdentityReceipt(tx, row.userId, key);
    if (prior) {
      const proof = record(prior.metadata);
      if (
        proof.call_sid !== row.callId ||
        proof.duration_seconds !== seconds ||
        proof.carrier_status !== status
      )
        throw AppError.conflict("The carrier returned conflicting terminal evidence.");
    } else
      await appendVoiceIdentityReceipt(tx, {
        userId: row.userId,
        key,
        type: "voice_phone_test_terminal",
        refId: canonical,
        metadata: {
          version: 1,
          call_sid: row.callId,
          carrier_status: status,
          duration_seconds: seconds,
          ...(unanswered ? { unanswered_confirmed: true } : {}),
          ...(errorCode ? { carrier_error_code: errorCode } : {}),
        },
      });
    const terminalError =
      carrierFailureMessage(status, errorCode ?? state.carrier_error_code) ??
      (state.verified_at && status === "completed" && !sipPhase
        ? "Your phone was verified, but the bot could not connect. Try again."
        : (state.error ??
          (!state.verified_at
            ? "The test ended before the verification code was confirmed."
            : undefined)));
    if (!sipPhase) {
      // A requested test that never reached SIP is still a real carrier attempt.
      // Keep it in Calls without inventing a recording, transcript or AI session.
      await tx
        .insert(schema.callLogs)
        .values({
          userId: row.userId,
          agentId: row.agentId,
          vapiCallId: canonical,
          direction: "outbound",
          customerNumber: row.customerNumber,
          durationSeconds: seconds,
          summary:
            carrierFailureMessage(status, errorCode) ??
            (state.cancel_requested
              ? "Phone test ended at your request before a conversation connected."
              : state.verified_at
                ? "Phone test verified, but the bot conversation did not connect."
                : status === "no-answer" || status === "busy"
                  ? "Phone test was not answered."
                  : "Phone test ended before the verification code was confirmed."),
          endedReason: state.cancel_requested ? "phone-test-cancelled" : "phone-test-not-connected",
          outcomeTag: "unreachable",
          recordingUrl: null,
          transcript: null,
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId });
    }
    await updateTest(
      tx,
      row,
      {
        status: state.cancel_requested
          ? "cancelled"
          : state.verified_at && sipPhase && status === "completed"
            ? "completed"
            : "failed",
        carrier_status: status,
        ...(errorCode ? { carrier_error_code: errorCode } : {}),
        ...(terminalError ? { error: terminalError } : {}),
      },
      { state: "completed" },
    );
    // Only newly recorded explicit proof can release an accepted carrier
    // intent. Older terminal receipts and already-posted usage are not repaired
    // or reinterpreted by a callback/deadline replay.
    const proof = record(prior?.metadata);
    if (prior ? proof.unanswered_confirmed === true : unanswered) {
      const released = await readVoiceIdentityReceipt(
        tx,
        row.userId,
        `voice_admission_release:${canonical}`,
      );
      if (!released)
        await releaseVoiceCallFundingInTransaction(tx, {
          userId: row.userId,
          providerCallId: canonical,
          disposition: "confirmed_unanswered",
        });
      if (
        released ||
        (await readVoiceIdentityReceipt(tx, row.userId, `voice_admission_release:${canonical}`))
      )
        return false;
      // An older usage claim can own an unfinished Runtime settlement. The
      // release helper intentionally defers to it: resume that exact claim,
      // never strand the hold or create new usage from an unexplained no-op.
      const [usage] = await tx
        .select({ providerCallId: schema.voiceUsageEvents.providerCallId })
        .from(schema.voiceUsageEvents)
        .where(
          and(
            eq(schema.voiceUsageEvents.userId, row.userId),
            eq(schema.voiceUsageEvents.providerCallId, canonical),
          ),
        )
        .limit(1);
      if (!usage)
        throw AppError.serviceUnavailable("Phone test funding release could not be confirmed.");
      return true;
    }
    return true;
  });
  // Connected verification/conversation retains the existing rounding rule.
  // Confirmed unanswered self-tests retain history without consuming minutes.
  if (shouldMeter)
    await trackVoiceMinutes({
      userId: lead.userId,
      vapiCallId: canonical,
      durationSeconds: seconds,
    });
}
export async function handlePhoneTestStatus(input: PhoneTestCarrierInput): Promise<void> {
  const found = await callbackLead(input);
  await tenantStore.run(found.userId, async () => {
    const lead = await drizzle.transaction(async (tx) => {
      const row = await lockedTest(tx, found.userId, testOf(found).request_id);
      if (!row) throw AppError.notFound("Phone test not found.");
      const bound = await bindCarrier(tx, row, input.callSid);
      const state = testOf(bound);
      if (
        !phoneTestIsTerminal(state.status) &&
        ["in-progress", "answered"].includes(input.status || "")
      )
        return updateTest(tx, bound, {
          answered_at: state.answered_at ?? new Date().toISOString(),
        });
      if (
        ["creating", "ringing"].includes(state.status) &&
        !state.verified_at &&
        !state.cancel_requested &&
        ["initiated", "ringing"].includes(input.status || "")
      )
        return updateTest(tx, bound, { status: "ringing" });
      return bound;
    });
    if (TERMINAL_CARRIER.has(input.status || ""))
      await settlePhoneTest(lead, input.status!, input.duration, input.errorCode);
  });
}

/** Read authoritative parent state. GET never calls this or performs provider work. */
export async function reconcilePhoneTest(
  userId: string,
  agentId: string,
  requestKey: string,
  end = false,
): Promise<void> {
  const lead = await findTest(drizzle, userId, requestKey);
  if (!lead || lead.agentId !== agentId) throw AppError.notFound("Phone test not found.");
  const test = testOf(lead);
  if (!lead.callId) {
    if (phoneTestIsTerminal(test.status)) {
      const release = await readVoiceIdentityReceipt(
        drizzle,
        userId,
        `voice_admission_release:${phoneTestFundingId(requestKey)}`,
      );
      if (record(release?.metadata).disposition === "definite_preaccept") return;
    }
    if (!test.provider_attempted_at) {
      if (!phoneTestIsTerminal(test.status))
        await failBeforeCarrier(lead, "The phone test ended before a carrier call was placed.");
      return;
    }
    if (test.status !== "uncertain" && test.status !== "ending")
      await drizzle.transaction(async (tx) => {
        const row = await lockedTest(tx, userId, requestKey);
        if (row && !row.callId)
          await updateTest(tx, row, {
            status: "uncertain",
            error: "The carrier outcome is still unconfirmed. This request will not redial.",
          });
      });
    throw AppError.serviceUnavailable(
      "The phone test needs carrier reconciliation; its funding remains reserved.",
    );
  }
  const client = getTwilioClient();
  if (!client)
    throw AppError.serviceUnavailable("Carrier confirmation is temporarily unavailable.");
  const resource = client.calls(lead.callId);
  let call = await resource.fetch();
  const matches = () =>
    call.sid === lead.callId &&
    call.accountSid === client.accountSid &&
    call.to === lead.customerNumber &&
    call.from === native(lead).outbound_line_number &&
    call.direction === "outbound-api";
  if (!matches()) throw AppError.conflict("Carrier history does not match this phone test.");
  if (!TERMINAL_CARRIER.has(call.status)) {
    if (!end && !test.cancel_requested && Date.parse(test.expires_at) > Date.now())
      throw AppError.serviceUnavailable("This phone test is still in progress.");
    await resource.update({
      status: ["queued", "ringing"].includes(call.status) ? "canceled" : "completed",
    });
    call = await resource.fetch();
    if (!matches() || !TERMINAL_CARRIER.has(call.status))
      throw AppError.serviceUnavailable("The carrier has not confirmed the call ended.");
  }
  await settlePhoneTest(lead, call.status, call.duration);
}
export async function endPhoneTest(
  userId: string,
  agentId: string,
  requestKey: string,
): Promise<PhoneTestReceipt> {
  phoneTestFundingId(requestKey);
  await assertPhoneTestAgentOwned(drizzle, userId, agentId);
  const lead = await drizzle.transaction(async (tx) => {
    const row = await lockedTest(tx, userId, requestKey);
    if (row && row.agentId !== agentId) throw AppError.notFound("Phone test not found.");
    const key = `phone_test_cancel:${requestKey}`;
    const prior = await readVoiceIdentityReceipt(tx, userId, key);
    if (prior && record(prior.metadata).agent_id !== agentId)
      throw AppError.notFound("Phone test not found.");
    if (!prior)
      await appendVoiceIdentityReceipt(tx, {
        userId,
        key,
        type: "phone_test_cancel",
        refId: requestKey,
        metadata: { version: 1, agent_id: agentId, created_at: new Date().toISOString() },
      });
    if (!row || phoneTestIsTerminal(testOf(row).status)) return row;
    const attempted = Boolean(testOf(row).provider_attempted_at);
    const updated = await updateTest(tx, row, {
      cancel_requested: true,
      status: attempted ? "ending" : "cancelled",
    });
    if (!attempted)
      await releaseVoiceCallFundingInTransaction(tx, {
        userId,
        providerCallId: phoneTestFundingId(requestKey),
      });
    return updated;
  });
  if (!lead) return (await cancelledReceipt(userId, agentId, requestKey))!;
  if (!phoneTestIsTerminal(testOf(lead).status)) {
    try {
      await reconcilePhoneTest(userId, agentId, requestKey, true);
    } catch {
      /* Keep ending until a signed callback or durable recovery confirms it. */
    }
  }
  return getPhoneTest(userId, agentId, requestKey);
}

export async function reconcilePhoneTestJob(job: {
  userId?: string;
  user_id?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const userId = job.userId ?? job.user_id;
  const { requestKey, agentId } = job.payload;
  if (
    !userId ||
    (job.userId && job.user_id && job.userId !== job.user_id) ||
    typeof requestKey !== "string" ||
    !PHONE_TEST_ID.test(requestKey) ||
    typeof agentId !== "string" ||
    !agentId
  )
    throw new Error("Invalid phone test recovery identity.");
  await tenantStore.run(userId, () => reconcilePhoneTest(userId, agentId, requestKey));
}
