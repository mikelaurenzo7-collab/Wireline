import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { readCompanyIdentityPreferences } from "./company-identity";
import { dncPhoneCandidates, normalizeDncPhone } from "./compliance";
import { isDncFailsafeBlocked } from "./dnc-failsafe";
import { enqueue } from "./job-queue";
import { assertJobPayloadOwner } from "./job-owner";
import type { OutboundCallPurpose } from "./outbound-call-purpose";
import { drizzle, log } from "./server-context";
import { tenantStore } from "./tenant-context-store";
import { resolvePermissionCallingHours } from "./tcpa-calling-hours";
import { parseUsCallingStateFromAddress } from "./us-calling-jurisdiction";
import type {
  VoicePermissionPublicView,
  VoicePermissionSummary,
} from "./recipient-voice-permission-contract";
import {
  VOICE_PERMISSION_ASSURANCE,
  VOICE_PERMISSION_EVENTS,
  VOICE_PERMISSION_REQUEST_MS,
  VOICE_PERMISSION_TERM_MS,
  VOICE_PERMISSION_UUID,
  VOICE_PERMISSION_VERSION,
  assertVoicePermissionJurisdiction,
  assertVoicePermissionScope,
  buildVoicePermissionDisclosure,
  maskedVoicePermissionPhone,
  normalizeVoicePermissionPhone,
  signVoicePermissionRecord,
  verifyVoicePermissionRecord,
  voicePermissionHash,
  voicePermissionToken,
  voicePermissionTokenId,
  type VoicePermissionClaim,
  type VoicePermissionGrant,
  type VoicePermissionRecord,
  type VoicePermissionRequest,
  type VoicePermissionRevocation,
} from "./recipient-voice-permission";

type PermissionDb = Pick<typeof drizzle, "select" | "insert" | "execute">;
type PermissionTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];
type ConsentRow = typeof schema.consentLog.$inferSelect;
type PermissionState = {
  request: VoicePermissionRequest;
  grant: VoicePermissionGrant | null;
  revoked: boolean;
  claims: VoicePermissionClaim[];
};

function permissionError(code: string, message: string, status = 403): AppError {
  return new AppError(status, code, message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function lockRecipient(db: PermissionDb, userId: string, phone: string): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('recipient-voice-permission'), hashtext(${`${userId}:${phone}`}))`,
  );
}

async function sellerIdentity(db: PermissionDb, userId: string, agentId: string) {
  const [settings] = await db
    .select({ name: schema.settings.businessName })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  const [preferences] = await db
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);
  const [agent] = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, agentId)))
    .limit(1);
  if (!agent) throw AppError.notFound("Bot not found.");
  const identity = readCompanyIdentityPreferences(
    asRecord(preferences?.preferences).company_identity,
  );
  const sellerName = settings?.name?.trim();
  const address = identity.physicalPostalAddress?.trim();
  const callerState = address ? parseUsCallingStateFromAddress(address) : null;
  if (!sellerName || sellerName.length > 120 || !address || !callerState) {
    throw new AppError(
      409,
      "CALLER_IDENTITY_REQUIRED",
      "Save your full name or legal business name and United States mailing address in Caller Identity before requesting permission.",
      { settings_path: "/phone?tab=setup#company-identity" },
    );
  }
  const botName = agent.name?.trim() || "Bot";
  return {
    sellerName,
    botName,
    callerState,
    sellerIdentityHash: voicePermissionHash({ sellerName, address, botName }),
  };
}

async function append(
  db: PermissionDb,
  record: VoicePermissionRecord,
  phone: string,
  state: string,
): Promise<void> {
  const event =
    record.kind === "request"
      ? VOICE_PERMISSION_EVENTS.requested
      : record.kind === "grant"
        ? VOICE_PERMISSION_EVENTS.granted
        : record.kind === "revocation"
          ? VOICE_PERMISSION_EVENTS.revoked
          : VOICE_PERMISSION_EVENTS.claimed;
  const [row] = await db
    .insert(schema.consentLog)
    .values({
      userId: record.userId,
      customerNumber: phone,
      event,
      ruleVersion: VOICE_PERMISSION_VERSION,
      rule: "two_party",
      state,
      metadata: signVoicePermissionRecord(record),
    })
    .returning({ id: schema.consentLog.id });
  if (!row) throw AppError.serviceUnavailable("Recipient permission could not be saved.");
}

function recordOf(
  row: ConsentRow,
  kind: VoicePermissionRecord["kind"],
): VoicePermissionRecord | null {
  const record = verifyVoicePermissionRecord(row.metadata, kind);
  return record?.userId === row.userId && row.ruleVersion === VOICE_PERMISSION_VERSION
    ? record
    : null;
}

async function readRequest(
  db: PermissionDb,
  userId: string,
  artifactId: string,
): Promise<VoicePermissionRequest> {
  if (!VOICE_PERMISSION_UUID.test(artifactId)) throw AppError.notFound("Permission not found.");
  const rows = await db
    .select()
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.userId, userId),
        eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.requested),
        sql`${schema.consentLog.metadata}->'record'->>'artifactId' = ${artifactId}`,
      ),
    )
    .limit(2);
  const request =
    rows.length === 1 ? (recordOf(rows[0], "request") as VoicePermissionRequest | null) : null;
  if (!request || request.artifactId !== artifactId || rows[0].customerNumber !== request.phone)
    throw AppError.notFound("Permission not found or cannot be evidenced.");
  return request;
}

async function readState(
  db: PermissionDb,
  request: VoicePermissionRequest,
): Promise<PermissionState> {
  const rows = await db
    .select()
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.userId, request.userId),
        inArray(schema.consentLog.event, [
          VOICE_PERMISSION_EVENTS.granted,
          VOICE_PERMISSION_EVENTS.revoked,
          VOICE_PERMISSION_EVENTS.claimed,
        ]),
        sql`${schema.consentLog.metadata}->'record'->>'artifactId' = ${request.artifactId}`,
      ),
    )
    .orderBy(desc(schema.consentLog.id))
    .limit(1000);
  if (rows.length === 1000)
    throw AppError.serviceUnavailable("Permission history needs review before another call.");
  let grant: VoicePermissionGrant | null = null;
  let revoked = false;
  const claims: VoicePermissionClaim[] = [];
  for (const row of rows) {
    const kind =
      row.event === VOICE_PERMISSION_EVENTS.granted
        ? "grant"
        : row.event === VOICE_PERMISSION_EVENTS.revoked
          ? "revocation"
          : "claim";
    const record = recordOf(row, kind);
    if (!record || record.artifactId !== request.artifactId || row.customerNumber !== request.phone)
      throw AppError.serviceUnavailable(
        "Permission history cannot be evidenced. Request a review.",
      );
    if (record.kind === "grant") {
      if (
        grant ||
        record.requestHash !== voicePermissionHash(request) ||
        record.disclosureHash !== voicePermissionHash(request.disclosure)
      )
        throw AppError.serviceUnavailable("Permission has conflicting grants and needs review.");
      grant = record;
    } else if (record.kind === "revocation") revoked = true;
    else if (record.kind === "claim") claims.push(record);
  }
  return { request, grant, revoked, claims };
}

function summaryPurpose(purpose: OutboundCallPurpose): VoicePermissionSummary["purpose"] {
  if (purpose === "callback") return "callback";
  if (purpose === "sales" || purpose === "marketing_or_sales") return "marketing_or_sales";
  return "service_or_requested";
}

function summary(state: PermissionState, now = Date.now()): VoicePermissionSummary {
  const { request, grant, revoked, claims } = state;
  const status = revoked
    ? "revoked"
    : request.purpose === "callback" && claims.length
      ? "used"
      : now >= Date.parse(grant ? request.expiresAt : request.requestExpiresAt)
        ? "expired"
        : grant
          ? "granted"
          : "pending";
  return {
    id: request.artifactId,
    agent_id: request.agentId,
    bot_name: request.botName,
    recipient_phone_masked: maskedVoicePermissionPhone(request.phone),
    purpose: summaryPurpose(request.purpose),
    status,
    request_expires_at: request.requestExpiresAt,
    expires_at: request.expiresAt,
    created_at: request.requestedAt,
    identity_assurance: VOICE_PERMISSION_ASSURANCE,
  };
}

export async function createRecipientVoicePermission(input: {
  userId: string;
  requestKey: string;
  agentId: string;
  phone: string;
  callPurpose: OutboundCallPurpose;
  recipientState: string;
  timeZone: string;
}): Promise<{ permission: VoicePermissionSummary; token: string }> {
  const phone = normalizeVoicePermissionPhone(input.phone);
  if (!phone || !VOICE_PERMISSION_UUID.test(input.requestKey))
    throw AppError.badRequest("Use a valid US phone number and request key.");
  return tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('voice-permission-request'), hashtext(${`${input.userId}:${input.requestKey}`}))`,
      );
      const existing = await tx
        .select()
        .from(schema.consentLog)
        .where(
          and(
            eq(schema.consentLog.userId, input.userId),
            eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.requested),
            sql`${schema.consentLog.metadata}->'record'->>'requestKey' = ${input.requestKey}`,
          ),
        )
        .limit(2);
      const identity = await sellerIdentity(tx, input.userId, input.agentId);
      const jurisdiction = {
        callerState: identity.callerState,
        recipientState: input.recipientState,
        timeZone: input.timeZone,
      };
      assertVoicePermissionJurisdiction(jurisdiction);
      if (existing.length) {
        const request =
          existing.length === 1
            ? (recordOf(existing[0], "request") as VoicePermissionRequest | null)
            : null;
        if (
          !request ||
          request.phone !== phone ||
          request.agentId !== input.agentId ||
          request.purpose !== input.callPurpose ||
          request.sellerIdentityHash !== identity.sellerIdentityHash ||
          request.recipientState !== jurisdiction.recipientState ||
          request.timeZone !== jurisdiction.timeZone ||
          request.callerState !== jurisdiction.callerState
        )
          throw AppError.conflict(
            "This request key already belongs to different permission details. Start a new request.",
          );
        const state = await readState(tx, request);
        if (summary(state).status !== "pending")
          throw AppError.conflict("This permission request is no longer pending.");
        return {
          permission: summary(state),
          token: voicePermissionToken(input.userId, request.artifactId),
        };
      }
      const artifactId = randomUUID();
      const token = voicePermissionToken(input.userId, artifactId);
      const now = Date.now();
      const expiresAt = new Date(
        now +
          (input.callPurpose === "callback"
            ? VOICE_PERMISSION_REQUEST_MS
            : VOICE_PERMISSION_TERM_MS),
      ).toISOString();
      const request: VoicePermissionRequest = {
        kind: "request",
        version: VOICE_PERMISSION_VERSION,
        artifactId,
        userId: input.userId,
        requestKey: input.requestKey,
        agentId: input.agentId,
        botName: identity.botName,
        phone,
        sellerName: identity.sellerName,
        sellerIdentityHash: identity.sellerIdentityHash,
        purpose: input.callPurpose,
        callerState: jurisdiction.callerState,
        recipientState: jurisdiction.recipientState,
        timeZone: jurisdiction.timeZone,
        requestedAt: new Date(now).toISOString(),
        requestExpiresAt: new Date(now + VOICE_PERMISSION_REQUEST_MS).toISOString(),
        expiresAt,
        disclosure: buildVoicePermissionDisclosure({
          sellerName: identity.sellerName,
          purpose: input.callPurpose,
          phone,
          expiresAt,
          timeZone: jurisdiction.timeZone,
        }),
        tokenHash: voicePermissionHash(token),
      };
      await lockRecipient(tx, input.userId, phone);
      await append(tx, request, phone, request.recipientState);
      return { permission: summary({ request, grant: null, revoked: false, claims: [] }), token };
    }),
  );
}

export async function listRecipientVoicePermissions(
  userId: string,
): Promise<VoicePermissionSummary[]> {
  return tenantStore.run(userId, async () => {
    const rows = await drizzle
      .select()
      .from(schema.consentLog)
      .where(
        and(
          eq(schema.consentLog.userId, userId),
          eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.requested),
        ),
      )
      .orderBy(desc(schema.consentLog.id))
      .limit(100);
    const result: VoicePermissionSummary[] = [];
    for (const row of rows) {
      const request = recordOf(row, "request") as VoicePermissionRequest | null;
      if (!request || row.customerNumber !== request.phone) continue;
      result.push(summary(await readState(drizzle, request)));
    }
    return result;
  });
}

export async function recipientVoicePermissionLink(
  userId: string,
  artifactId: string,
): Promise<string> {
  return tenantStore.run(userId, () =>
    drizzle.transaction(async (tx) => {
      const request = await readRequest(tx, userId, artifactId);
      await lockRecipient(tx, userId, request.phone);
      const state = await readState(tx, request);
      if (summary(state).status !== "pending")
        throw AppError.conflict("Only a pending, unexpired request has a capture link.");
      const identity = await sellerIdentity(tx, userId, request.agentId);
      if (identity.sellerIdentityHash !== request.sellerIdentityHash)
        throw AppError.conflict("Caller Identity changed. Create a new permission request.");
      return voicePermissionToken(userId, artifactId);
    }),
  );
}

/** Only this opaque capability lookup runs in explicit system scope. */
async function requestForToken(token: string): Promise<VoicePermissionRequest> {
  const artifactId = voicePermissionTokenId(token);
  if (!artifactId) throw AppError.notFound("Permission link is invalid or unavailable.");
  return tenantStore.run("", async () => {
    const rows = await drizzle
      .select()
      .from(schema.consentLog)
      .where(
        and(
          eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.requested),
          sql`${schema.consentLog.metadata}->'record'->>'artifactId' = ${artifactId}`,
        ),
      )
      .limit(2);
    const request =
      rows.length === 1 ? (recordOf(rows[0], "request") as VoicePermissionRequest | null) : null;
    if (
      !request ||
      request.artifactId !== artifactId ||
      rows[0].customerNumber !== request.phone ||
      request.tokenHash !== voicePermissionHash(token)
    )
      throw AppError.notFound("Permission link is invalid or unavailable.");
    return request;
  });
}

async function withPublicPermission<T>(
  token: string,
  operation: (tx: PermissionTransaction, state: PermissionState) => Promise<T>,
): Promise<T> {
  const located = await requestForToken(token);
  return tenantStore.run(located.userId, () =>
    drizzle.transaction(async (tx) => {
      const request = await readRequest(tx, located.userId, located.artifactId);
      if (request.tokenHash !== voicePermissionHash(token))
        throw AppError.notFound("Permission link is invalid or unavailable.");
      await lockRecipient(tx, request.userId, request.phone);
      return operation(tx, await readState(tx, request));
    }),
  );
}

export async function previewRecipientVoicePermission(
  token: string,
): Promise<VoicePermissionPublicView> {
  return withPublicPermission(token, async (_tx, state) => ({
    permission: summary(state),
    seller_name: state.request.sellerName,
    disclosure: state.request.disclosure,
    disclosure_hash: voicePermissionHash(state.request.disclosure),
    jurisdiction: {
      recipient_state: state.request.recipientState,
      time_zone: state.request.timeZone,
    },
  }));
}

export async function grantRecipientVoicePermission(input: {
  token: string;
  signerName: string;
  phone: string;
  accepted: true;
  disclosureHash: string;
  recipientState: string;
  timeZone: string;
  ip?: string;
  userAgent?: string;
}): Promise<VoicePermissionPublicView> {
  return withPublicPermission(input.token, async (tx, state) => {
    const { request } = state;
    const signerName = input.signerName.trim().replace(/\s+/g, " ");
    if (state.revoked)
      throw permissionError(
        "VOICE_PERMISSION_REVOKED",
        "This permission was withdrawn. A new request is needed.",
      );
    if (
      !signerName ||
      signerName.length < 2 ||
      signerName.length > 120 ||
      input.accepted !== true ||
      normalizeVoicePermissionPhone(input.phone) !== request.phone ||
      input.disclosureHash !== voicePermissionHash(request.disclosure) ||
      input.recipientState !== request.recipientState ||
      input.timeZone !== request.timeZone
    )
      throw AppError.badRequest(
        "Review the exact permission, enter the matching phone number and sign your own name.",
      );
    const identity = await sellerIdentity(tx, request.userId, request.agentId);
    if (identity.sellerIdentityHash !== request.sellerIdentityHash)
      throw AppError.conflict("Business details changed. Ask for a new permission link.");
    if (state.grant) {
      if (state.grant.signerName !== signerName)
        throw AppError.conflict("This request was already signed. It cannot be changed.");
    } else {
      if (Date.now() >= Date.parse(request.requestExpiresAt))
        throw new AppError(
          410,
          "VOICE_PERMISSION_EXPIRED",
          "This link expired. Ask the business for a new one.",
        );
      const grant: VoicePermissionGrant = {
        kind: "grant",
        version: VOICE_PERMISSION_VERSION,
        artifactId: request.artifactId,
        userId: request.userId,
        requestHash: voicePermissionHash(request),
        signerName,
        acceptedAt: new Date().toISOString(),
        disclosureHash: input.disclosureHash,
        identityAssurance: VOICE_PERMISSION_ASSURANCE,
        ipHash: voicePermissionHash(input.ip || "unavailable"),
        userAgentHash: voicePermissionHash((input.userAgent || "").slice(0, 500)),
      };
      await append(tx, grant, request.phone, request.recipientState);
      state.grant = grant;
    }
    return {
      permission: summary(state),
      seller_name: request.sellerName,
      disclosure: request.disclosure,
      disclosure_hash: voicePermissionHash(request.disclosure),
      jurisdiction: {
        recipient_state: request.recipientState,
        time_zone: request.timeZone,
      },
    };
  });
}

async function revoke(
  tx: PermissionTransaction,
  state: PermissionState,
  actor: "owner" | "recipient",
): Promise<VoicePermissionSummary> {
  if (!state.revoked) {
    const record: VoicePermissionRevocation = {
      kind: "revocation",
      version: VOICE_PERMISSION_VERSION,
      artifactId: state.request.artifactId,
      userId: state.request.userId,
      revokedAt: new Date().toISOString(),
      actor,
    };
    await append(tx, record, state.request.phone, state.request.recipientState);
    state.revoked = true;
  }
  // An opt-out also suppresses other grants for the same seller/number. Removing
  // a DNC entry alone never reactivates the immutable revoked artifact.
  const [existing] = await tx
    .select({ id: schema.dncList.id })
    .from(schema.dncList)
    .where(
      and(
        eq(schema.dncList.userId, state.request.userId),
        inArray(schema.dncList.phone, dncPhoneCandidates(state.request.phone)),
      ),
    )
    .limit(1);
  if (!existing)
    await tx.insert(schema.dncList).values({
      userId: state.request.userId,
      phone: normalizeDncPhone(state.request.phone),
      phoneRaw: state.request.phone,
      reason: "Recipient voice permission withdrawn",
      source: "voice_permission_revocation",
    });
  // Recovery is committed atomically with withdrawal. Do not acknowledge an
  // opt-out whose immediate carrier cleanup would otherwise be log-only.
  const cleanup = await enqueue(tx, {
    userId: state.request.userId,
    type: "voice_permission_revocation_cleanup",
    payload: { artifactId: state.request.artifactId },
    runAt: new Date(),
    maxAttempts: 12,
  });
  if (!cleanup.ok)
    throw AppError.serviceUnavailable(
      "Permission withdrawal could not be safely queued. Please retry.",
    );
  return summary(state);
}

/** Durable cleanup derives the target only from the signed tenant-owned request. */
export async function handleVoicePermissionRevocationCleanupJob(job: {
  userId?: string;
  user_id?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const userId = assertJobPayloadOwner(job, job.payload);
  const artifactId = job.payload.artifactId;
  if (typeof artifactId !== "string" || !VOICE_PERMISSION_UUID.test(artifactId))
    throw AppError.badRequest("Invalid permission cleanup identity.");
  const phone = await tenantStore.run(userId, () =>
    drizzle.transaction(async (tx) => {
      const request = await readRequest(tx, userId, artifactId);
      await lockRecipient(tx, userId, request.phone);
      const state = await readState(tx, request);
      if (!state.revoked) throw AppError.conflict("Permission has not been withdrawn.");
      return request.phone;
    }),
  );
  const { endOutboundPlacementsForPermission } = await import("./voice/outbound-placement-funding");
  await tenantStore.run(userId, () =>
    endOutboundPlacementsForPermission(userId, artifactId, phone),
  );
}

export async function revokeRecipientVoicePermission(input: {
  userId: string;
  artifactId: string;
}): Promise<VoicePermissionSummary> {
  const result = await tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      const request = await readRequest(tx, input.userId, input.artifactId);
      await lockRecipient(tx, input.userId, request.phone);
      return {
        permission: await revoke(tx, await readState(tx, request), "owner"),
        phone: request.phone,
      };
    }),
  );
  await endPermissionCalls(input.userId, input.artifactId, result.phone);
  return result.permission;
}

export async function revokePublicRecipientVoicePermission(
  token: string,
): Promise<VoicePermissionSummary> {
  const result = await withPublicPermission(token, async (tx, state) => ({
    permission: await revoke(tx, state, "recipient"),
    userId: state.request.userId,
    phone: state.request.phone,
  }));
  await endPermissionCalls(result.userId, result.permission.id, result.phone);
  return result.permission;
}

async function endPermissionCalls(
  userId: string,
  artifactId: string,
  phone: string,
): Promise<void> {
  // Durable revocation/suppression commits before carrier cleanup. A failure
  // cannot reactivate permission, and the UI never claims a hangup succeeded.
  try {
    const { endOutboundPlacementsForPermission } =
      await import("./voice/outbound-placement-funding");
    await tenantStore.run(userId, () =>
      endOutboundPlacementsForPermission(userId, artifactId, phone),
    );
  } catch (error) {
    log.warn("Revoked voice permission carrier cleanup needs reconciliation", {
      userId,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
  }
}

export type OutboundRecipientPermissionReceipt = {
  artifactId: string;
  receiptId: string;
  receiptHash: string;
  grantHash: string;
  effectiveCallPurpose: OutboundCallPurpose;
  expiresAt: string;
  jurisdiction: {
    recipientState: VoicePermissionRequest["recipientState"];
    timeZone: string;
    callerState: VoicePermissionRequest["callerState"];
  };
};

export type OutboundRecipientPermissionInput = {
  userId: string;
  agentId: string;
  phone: string;
  callPurpose: OutboundCallPurpose;
  leadId?: bigint | string | null;
  artifactId?: string | null;
  attemptId: string;
};

export type OutboundRecipientPermissionInspection = {
  artifactId: string;
  grantHash: string;
  effectiveCallPurpose: OutboundCallPurpose;
  expiresAt: string;
  jurisdiction: OutboundRecipientPermissionReceipt["jurisdiction"];
};

/** Read-only preflight. A funding or policy refusal must not consume a callback. */
export async function inspectOutboundRecipientPermission(
  input: OutboundRecipientPermissionInput,
): Promise<OutboundRecipientPermissionInspection> {
  const phone = normalizeVoicePermissionPhone(input.phone);
  if (!phone || !VOICE_PERMISSION_UUID.test(input.attemptId))
    throw AppError.badRequest("Invalid recipient or dispatch identity.");
  if (await isDncFailsafeBlocked(input.userId, phone))
    throw permissionError(
      "VOICE_PERMISSION_SUPPRESSED",
      "This recipient is on the business's Do Not Call list.",
    );
  return tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      const { request, grant } = await resolvePermissionForDispatch(tx, input, true);
      return {
        artifactId: request.artifactId,
        grantHash: voicePermissionHash(grant),
        effectiveCallPurpose: request.purpose,
        expiresAt: request.expiresAt,
        jurisdiction: {
          recipientState: request.recipientState,
          timeZone: request.timeZone,
          callerState: request.callerState,
        },
      };
    }),
  );
}

/** Fresh dispatch admission: never trusts a checkbox, import label, or legacy callback marker. */
export async function assertOutboundRecipientPermission(
  input: OutboundRecipientPermissionInput,
): Promise<OutboundRecipientPermissionReceipt> {
  const phone = normalizeVoicePermissionPhone(input.phone);
  if (!phone || !VOICE_PERMISSION_UUID.test(input.attemptId))
    throw AppError.badRequest("Invalid recipient or dispatch identity.");
  if (await isDncFailsafeBlocked(input.userId, phone))
    throw permissionError(
      "VOICE_PERMISSION_SUPPRESSED",
      "This recipient is on the business's Do Not Call list.",
    );
  return tenantStore.run(input.userId, () =>
    drizzle.transaction((tx) => assertOutboundRecipientPermissionInTransaction(tx, input)),
  );
}

/** Same-transaction dispatch fence. Caller holds its wallet/lead locks first;
 * revocation takes this same recipient lock, then cleans up carrier work only
 * after commit. No provider or Redis I/O occurs while this transaction is held.
 */
export async function assertOutboundRecipientPermissionInTransaction(
  tx: PermissionDb,
  input: OutboundRecipientPermissionInput,
): Promise<OutboundRecipientPermissionReceipt> {
  const { request, grant, priorClaim, phone } = await resolvePermissionForDispatch(tx, input);
  const claim: VoicePermissionClaim = priorClaim || {
    kind: "claim",
    version: VOICE_PERMISSION_VERSION,
    artifactId: request.artifactId,
    userId: input.userId,
    attemptId: input.attemptId,
    receiptId: randomUUID(),
    grantHash: voicePermissionHash(grant),
    phone,
    agentId: input.agentId,
    purpose: input.callPurpose,
    claimedAt: new Date().toISOString(),
  };
  if (!priorClaim) await append(tx, claim, phone, request.recipientState);
  return {
    artifactId: request.artifactId,
    receiptId: claim.receiptId,
    receiptHash: voicePermissionHash(claim),
    grantHash: voicePermissionHash(grant),
    effectiveCallPurpose: request.purpose,
    expiresAt: request.expiresAt,
    jurisdiction: {
      recipientState: request.recipientState,
      timeZone: request.timeZone,
      callerState: request.callerState,
    },
  };
}

async function resolvePermissionForDispatch(
  tx: PermissionDb,
  input: OutboundRecipientPermissionInput,
  allowUnassignedLeadForInspection = false,
): Promise<{
  request: VoicePermissionRequest;
  grant: VoicePermissionGrant;
  priorClaim: VoicePermissionClaim | null;
  phone: string;
}> {
  if (tenantStore.getStore() !== input.userId)
    throw AppError.forbidden("Recipient permission requires the exact tenant transaction scope.");
  const phone = normalizeVoicePermissionPhone(input.phone);
  if (!phone || !VOICE_PERMISSION_UUID.test(input.attemptId))
    throw AppError.badRequest("Invalid recipient or dispatch identity.");
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('voice-permission-attempt'), hashtext(${`${input.userId}:${input.attemptId}`}))`,
  );
  let artifactId = input.artifactId;
  let selectedState: PermissionState | undefined;
  let currentIdentity: Awaited<ReturnType<typeof sellerIdentity>> | undefined;
  if (input.leadId != null) {
    if (!/^\d+$/.test(String(input.leadId))) throw AppError.badRequest("Invalid outbound lead.");
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, input.userId),
          eq(schema.outboundLeads.id, BigInt(input.leadId)),
        ),
      )
      .limit(1);
    if (
      !lead ||
      lead.source === "phone_test" ||
      (lead.agentId !== input.agentId &&
        (!allowUnassignedLeadForInspection || lead.agentId != null)) ||
      normalizeVoicePermissionPhone(lead.customerNumber || lead.phoneNumber || "") !== phone
    )
      throw permissionError(
        "VOICE_PERMISSION_SCOPE_MISMATCH",
        "The outbound lead does not match this permission request.",
      );
    artifactId ||=
      typeof asRecord(lead.metadata).voice_permission_id === "string"
        ? String(asRecord(lead.metadata).voice_permission_id)
        : null;
    if (!artifactId) {
      // Automatic lead callers can resolve only persisted, signed recipient
      // grants. An owner/import checkbox never creates this authority.
      await lockRecipient(tx, input.userId, phone);
      currentIdentity = await sellerIdentity(tx, input.userId, input.agentId);
      selectedState = await selectLeadRecipientPermission(
        tx,
        input,
        phone,
        currentIdentity.sellerIdentityHash,
      );
      artifactId = selectedState.request.artifactId;
    }
  }
  if (!artifactId)
    throw permissionError(
      "RECIPIENT_PERMISSION_REQUIRED",
      "Select a recipient-signed permission record before calling.",
    );
  const request = selectedState?.request ?? (await readRequest(tx, input.userId, artifactId));
  if (!selectedState) await lockRecipient(tx, input.userId, phone);
  const state = selectedState ?? (await readState(tx, request));
  if (!state.grant)
    throw permissionError(
      "RECIPIENT_PERMISSION_REQUIRED",
      "The recipient has not signed this permission.",
    );
  const identity = currentIdentity ?? (await sellerIdentity(tx, input.userId, input.agentId));
  assertVoicePermissionScope({
    request,
    grant: state.grant,
    userId: input.userId,
    agentId: input.agentId,
    phone,
    purpose: input.callPurpose,
    sellerIdentityHash: identity.sellerIdentityHash,
    revoked: state.revoked,
  });
  const callingHours = resolvePermissionCallingHours(request);
  if (!callingHours.allowed)
    throw new AppError(
      403,
      "OUTSIDE_PERMITTED_CALLING_HOURS",
      `This recipient can be called only from ${callingHours.startHour === 9 ? "9am" : "8am"} until 8pm in their signed local time zone.`,
      { calling_hours: callingHours },
    );
  const [blocked] = await tx
    .select({ id: schema.dncList.id })
    .from(schema.dncList)
    .where(
      and(
        eq(schema.dncList.userId, input.userId),
        inArray(schema.dncList.phone, dncPhoneCandidates(phone)),
      ),
    )
    .limit(1);
  if (blocked)
    throw permissionError(
      "VOICE_PERMISSION_SUPPRESSED",
      "This recipient is on the business's Do Not Call list.",
    );
  const priorAttempts = await tx
    .select()
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.userId, input.userId),
        eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.claimed),
        sql`${schema.consentLog.metadata}->'record'->>'attemptId' = ${input.attemptId}`,
      ),
    )
    .limit(2);
  let priorClaim: VoicePermissionClaim | null = null;
  if (priorAttempts.length) {
    const prior =
      priorAttempts.length === 1
        ? (recordOf(priorAttempts[0], "claim") as VoicePermissionClaim | null)
        : null;
    if (
      !prior ||
      prior.artifactId !== request.artifactId ||
      prior.phone !== phone ||
      prior.agentId !== input.agentId ||
      prior.purpose !== input.callPurpose ||
      prior.grantHash !== voicePermissionHash(state.grant)
    )
      throw AppError.conflict(
        "This dispatch identity already belongs to different permission details.",
      );
    priorClaim = prior;
  } else {
    if (request.purpose === "callback" && state.claims.length)
      throw new AppError(
        409,
        "VOICE_PERMISSION_ALREADY_USED",
        "This callback permission already authorized one call. Request new permission before another attempt.",
      );
  }
  return { request, grant: state.grant, priorClaim, phone };
}

/** Called only after owned-lead validation and the recipient lock. Newest exact
 * grant wins; reaching the bounded scan limit requires review, never fallback.
 */
async function selectLeadRecipientPermission(
  tx: PermissionDb,
  input: OutboundRecipientPermissionInput,
  phone: string,
  sellerIdentityHash: string,
): Promise<PermissionState> {
  const rows = await tx
    .select()
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.userId, input.userId),
        eq(schema.consentLog.event, VOICE_PERMISSION_EVENTS.requested),
        eq(schema.consentLog.customerNumber, phone),
        sql`${schema.consentLog.metadata}->'record'->>'agentId' = ${input.agentId}`,
        sql`${schema.consentLog.metadata}->'record'->>'purpose' = ${input.callPurpose}`,
        sql`${schema.consentLog.metadata}->'record'->>'expiresAt' > ${new Date().toISOString()}`,
      ),
    )
    .orderBy(desc(schema.consentLog.id))
    .limit(101);
  if (rows.length > 100)
    throw AppError.serviceUnavailable(
      "Recipient permission history needs review before automatic calling.",
    );
  for (const row of rows) {
    const request = recordOf(row, "request") as VoicePermissionRequest | null;
    if (!request || row.customerNumber !== request.phone)
      throw AppError.serviceUnavailable("Recipient permission history cannot be evidenced.");
    const state = await readState(tx, request);
    if (!state.grant || state.revoked) continue;
    try {
      assertVoicePermissionScope({
        request,
        grant: state.grant,
        userId: input.userId,
        agentId: input.agentId,
        phone,
        purpose: input.callPurpose,
        sellerIdentityHash,
        revoked: state.revoked,
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        ["VOICE_PERMISSION_SCOPE_MISMATCH", "VOICE_PERMISSION_EXPIRED"].includes(error.code)
      )
        continue;
      throw error;
    }
    if (
      request.purpose === "callback" &&
      state.claims.length &&
      !state.claims.some(
        (claim) =>
          claim.attemptId === input.attemptId &&
          claim.phone === phone &&
          claim.agentId === input.agentId &&
          claim.purpose === input.callPurpose &&
          claim.grantHash === voicePermissionHash(state.grant),
      )
    )
      continue;
    return state;
  }
  throw permissionError(
    "RECIPIENT_PERMISSION_REQUIRED",
    "No current recipient-signed permission matches this lead. Request permission before calling.",
  );
}
