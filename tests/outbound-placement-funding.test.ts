import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  db: null as any,
  reserve: vi.fn(),
  funding: vi.fn(),
  release: vi.fn(),
  track: vi.fn(),
  permission: vi.fn(),
  enqueue: vi.fn(),
  fetch: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  tenantStore: { run: (_u: string, fn: () => unknown) => fn() },
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/voice-call-funding", () => ({
  reserveVoiceCallFunding: h.reserve,
  getVoiceCallFundingInTransaction: h.funding,
  releaseVoiceCallFundingInTransaction: h.release,
}));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: h.track }));
vi.mock("../src/lib/job-queue", () => ({ enqueue: h.enqueue }));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  assertOutboundRecipientPermission: h.permission,
  assertOutboundRecipientPermissionInTransaction: (_tx: unknown, input: unknown) =>
    h.permission(input),
}));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({
    accountSid: "ACowned",
    calls: () => ({ fetch: h.fetch, update: h.update }),
  }),
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({
  resolveOpenAISipSessionMaxSeconds: () => 120,
  normalizeOpenAIPhoneNumber: (value: unknown) =>
    typeof value === "string" && /^\+1\d{10}$/.test(value) ? value : null,
}));
import {
  prepareOutboundPlacementFunding,
  markOutboundProviderAttempted,
  bindOutboundCarrierCall,
  adoptOutboundPlacementSipFunding,
  handleFundedOutboundCarrierEvent,
  reconcileOutboundPlacementJob,
  assertOutboundPlacementResolved,
  failOutboundBeforeAcceptance,
  assertOutboundBridgePermission,
  endOutboundPlacementsForPermission,
} from "../src/lib/voice/outbound-placement-funding";
import { voicePhoneFingerprint } from "../src/lib/voice-call-identity";
import {
  claimNativeOutboundPlacement,
  readNativeOutboundRequestReplay,
  readNativeOutboundRequestStatus,
  cancelMissingNativeOutboundRequest,
} from "../src/lib/voice/openai-outbound-placement";

const userId = "tenant-a",
  agentId = "bot-a",
  leadId = 7n;
const placementId = "12345678-1234-4234-8234-123456789012",
  canonical = `outbound:${placementId}`;
const sid = `CA${"1".repeat(32)}`,
  otherSid = `CA${"2".repeat(32)}`;
const phone = "+13125550101",
  from = "+13125550102";
function database() {
  const rows: Record<string, any[]> = {
    wireline_credit_ledger: [],
    wireline_call_logs: [],
    wireline_outbound_leads: [
      {
        id: leadId,
        userId,
        agentId,
        customerNumber: phone,
        callId: null,
        status: "Dialing",
        metadata: {
          native_voice: {
            placement_id: placementId,
            outbound_line_number: from,
            state: "creating",
          },
        },
      },
    ],
  };
  const dialect = new PgDialect(),
    locks: string[] = [];
  const query = (operation: string, selection?: any, source?: any) => {
    let table = source ? getTableName(source) : "",
      predicate = { sql: "", params: [] as any[] },
      value: any;
    const q: any = {
      from: (s: any) => {
        table = getTableName(s);
        return q;
      },
      where: (p: any) => {
        predicate = dialect.sqlToQuery(p);
        return q;
      },
      limit: () => q,
      returning: () => q,
      onConflictDoNothing: () => q,
      values: (v: any) => {
        value = v;
        return q;
      },
      set: (v: any) => {
        value = v;
        return q;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve()
          .then(() => {
            if (!rows[table]) throw new Error(`Unexpected table ${table}`);
            if (selection?.balance) return [{ balance: "0" }];
            let matched = rows[table].filter((row) => {
              if (typeof predicate.params[0] === "bigint")
                return row.id === predicate.params[0] && row.userId === predicate.params[1];
              if (row.userId !== predicate.params[0]) return false;
              if (table === "wireline_credit_ledger") {
                if (predicate.sql.includes("permission_artifact_id"))
                  return (
                    row.refType === predicate.params[1] &&
                    row.metadata.permission_artifact_id === predicate.params[2]
                  );
                return row.idempotencyKey === predicate.params[1];
              }
              if (
                table === "wireline_outbound_leads" &&
                predicate.sql.includes('"idempotency_key"')
              )
                return row.idempotencyKey === predicate.params[1];
              if (table === "wireline_outbound_leads" && predicate.sql.includes("regexp_replace"))
                return (
                  row.agentId === predicate.params[1] &&
                  row.customerNumber.replace(/\D/g, "") === predicate.params[2]
                );
              return predicate.params[1] === undefined || row.id === predicate.params[1];
            });
            if (operation === "insert") {
              if (
                table === "wireline_credit_ledger" &&
                rows[table].some(
                  (r) => r.idempotencyKey === value.idempotencyKey && r.userId === value.userId,
                )
              )
                throw new Error("duplicate receipt");
              if (
                table === "wireline_call_logs" &&
                rows[table].some((r) => r.vapiCallId === value.vapiCallId)
              )
                return [];
              const row = {
                id:
                  table === "wireline_outbound_leads"
                    ? BigInt(rows[table].length + 1)
                    : String(rows[table].length),
                ...value,
              };
              rows[table].push(row);
              return [row];
            }
            if (operation === "update") {
              matched.forEach((row) => Object.assign(row, value));
              return matched;
            }
            return matched;
          })
          .then(resolve, reject),
    };
    return q;
  };
  const db: any = {
    select: (s: any) => query("select", s),
    insert: (t: any) => query("insert", undefined, t),
    update: (t: any) => query("update", undefined, t),
    transaction: (fn: any) => fn(db),
    execute: async (q: any) => {
      locks.push(String(dialect.sqlToQuery(q).params[0]));
      return [];
    },
  };
  h.db = db;
  const receipt = (
    key: string,
    metadata: Record<string, unknown>,
    type = key.slice(0, key.indexOf(":")),
  ) =>
    rows.wireline_credit_ledger.push({
      userId,
      idempotencyKey: key,
      refType: type,
      deltaUsd: "0",
      metadata,
    });
  return {
    db,
    rows,
    locks,
    receipt,
    lead: rows.wireline_outbound_leads[0],
    ledger: rows.wireline_credit_ledger,
  };
}
const permission = {
  artifactId: "permission-a",
  receiptId: "claim-a",
  receiptHash: "hash-a",
  grantHash: "grant-a",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
async function admitted(db: ReturnType<typeof database>, dispatch = true) {
  const admission = await prepareOutboundPlacementFunding({
    userId,
    agentId,
    leadId,
    placementId,
    phone,
    from,
    callPurpose: "service_or_requested",
    permission,
    permissionAttemptId: placementId,
  });
  if (dispatch) await markOutboundProviderAttempted(userId, leadId, placementId, 80);
  return admission;
}
const event = (status: string, duration?: string) => ({
  userId,
  leadId,
  placementId,
  callSid: sid,
  to: phone,
  from,
  status,
  duration,
});
beforeEach(() => {
  vi.clearAllMocks();
  h.reserve.mockResolvedValue(null);
  h.funding.mockResolvedValue(null);
  h.enqueue.mockResolvedValue({ ok: true });
  h.permission.mockResolvedValue({ ...permission, effectiveCallPurpose: "service_or_requested" });
});

describe("durable ordinary outbound carrier admission", () => {
  it("durably cancels an absent request so a late POST can never dial", async () => {
    database();
    await expect(readNativeOutboundRequestStatus(userId, placementId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(cancelMissingNativeOutboundRequest(userId, placementId)).resolves.toMatchObject({
      status: "failed",
      terminal: true,
    });
    await expect(
      claimNativeOutboundPlacement({
        userId,
        agentId,
        requestKey: placementId,
        customerNumber: phone,
        outboundLineNumber: from,
        callPurpose: "service_or_requested",
      }),
    ).resolves.toMatchObject({ ok: false, status: 409 });
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("cleans up a crash between durable claim and financial admission without permitting a late provider dispatch", async () => {
    const db = database();
    const claim = await claimNativeOutboundPlacement({
      userId,
      agentId,
      requestKey: placementId,
      customerNumber: phone,
      outboundLineNumber: from,
      callPurpose: "service_or_requested",
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    await expect(cancelMissingNativeOutboundRequest(userId, placementId)).rejects.toMatchObject({
      status: 409,
    });
    expect(h.enqueue).toHaveBeenCalledWith(
      db.db,
      expect.objectContaining({ payload: expect.objectContaining({ preAdmission: true }) }),
    );
    await reconcileOutboundPlacementJob({
      userId,
      payload: {
        placementId: claim.placementId,
        leadId: String(claim.lead.id),
        preAdmission: true,
      },
    });
    await expect(readNativeOutboundRequestStatus(userId, placementId)).resolves.toMatchObject({
      status: "failed",
      terminal: true,
    });
    await expect(
      prepareOutboundPlacementFunding({
        userId,
        agentId,
        leadId: claim.lead.id,
        placementId: claim.placementId,
        phone,
        from,
        callPurpose: "service_or_requested",
        permission,
        permissionAttemptId: placementId,
      }),
    ).rejects.toThrow(/already been admitted/);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("rechecks revocation in the dispatch transaction after preflight and funding", async () => {
    const db = database();
    await admitted(db, false);
    h.permission.mockRejectedValueOnce(new Error("permission revoked"));
    await expect(markOutboundProviderAttempted(userId, leadId, placementId, 80)).rejects.toThrow(
      "permission revoked",
    );
    expect(db.ledger.some((row) => row.refType === "voice_outbound_dispatched")).toBe(false);
    expect(db.ledger.some((row) => row.refType === "voice_outbound_permission")).toBe(false);
    await failOutboundBeforeAcceptance(userId, leadId, placementId);
    expect(h.release).toHaveBeenCalled();
  });
  it("dedupes direct request payloads without letting clients select the global funding identity", async () => {
    const db = database();
    const request = {
      userId,
      agentId,
      requestKey: placementId,
      customerNumber: phone,
      outboundLineNumber: from,
      callPurpose: "service_or_requested" as const,
      consentArtifactId: "permission-a",
    };
    const first = await claimNativeOutboundPlacement(request);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.placementId).not.toBe(placementId);
    await expect(readNativeOutboundRequestStatus(userId, placementId)).resolves.toMatchObject({
      requestKey: placementId,
      agentId,
      status: "preparing",
      terminal: false,
    });
    await expect(
      claimNativeOutboundPlacement({
        ...request,
        requestKey: "87654321-1234-4234-8234-123456789012",
      }),
    ).rejects.toThrow(/active/);
    const replay = await claimNativeOutboundPlacement(request);
    expect(replay).toMatchObject({ ok: true, replayed: true, placementId: first.placementId });
    await expect(
      readNativeOutboundRequestReplay({ ...request, context: "different" }),
    ).resolves.toMatchObject({ status: 409, doNotRetry: true });
    const index = db.rows.wireline_outbound_leads.findIndex((row) => row.id === first.lead.id);
    db.rows.wireline_outbound_leads.splice(index, 1);
    await expect(claimNativeOutboundPlacement(request)).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    await expect(readNativeOutboundRequestReplay(request)).resolves.toMatchObject({
      status: 409,
      doNotRetry: true,
    });
  });
  it("funds before dispatch and binds immutable recipient, permission and deadline receipts", async () => {
    const db = database();
    const result = await admitted(db);
    expect(result.maxSeconds).toBe(120);
    expect(h.reserve).toHaveBeenCalledWith(
      db.db,
      expect.objectContaining({
        providerCallId: canonical,
        outboundPlacement: { agentId, leadId: "7", phone, from },
      }),
    );
    const attempt = db.ledger.find((r) => r.refType === "voice_outbound_attempt");
    expect(attempt.metadata).toMatchObject({
      phone_fingerprint: voicePhoneFingerprint(phone),
      permission_grant_hash: "grant-a",
      lead_id: "7",
    });
    expect(JSON.stringify(attempt.metadata)).not.toContain(phone);
    expect(h.enqueue).toHaveBeenCalledWith(
      db.db,
      expect.objectContaining({
        type: "outbound_placement_reconcile",
        payload: { leadId: "7", placementId },
      }),
    );
    expect(db.locks.slice(0, 2)).toEqual([userId, "openai-outbound:7"]);
    await expect(markOutboundProviderAttempted(userId, leadId, placementId, 80)).rejects.toThrow(
      /again/,
    );
  });
  it("retains unresolved attempts beyond expired metadata leases", async () => {
    const db = database();
    await admitted(db);
    db.lead.metadata.native_voice.placement_claimed_at = "2020-01-01";
    await expect(assertOutboundPlacementResolved(db.db, userId, placementId)).rejects.toThrow(
      /reconciliation/,
    );
    await expect(
      assertOutboundPlacementResolved(db.db, "tenant-b", placementId),
    ).resolves.toBeUndefined();
  });
  it("binds exact carrier once, rejects other recipient/SID, and adopts SIP without another hold", async () => {
    const db = database();
    await admitted(db);
    h.reserve.mockClear();
    await expect(bindOutboundCarrierCall(event("ringing"))).resolves.toBe(true);
    await expect(
      bindOutboundCarrierCall({ ...event("ringing"), callSid: otherSid }),
    ).rejects.toThrow(/match/);
    await expect(
      bindOutboundCarrierCall({ ...event("ringing"), to: "+13125550999" }),
    ).rejects.toThrow(/match/);
    await adoptOutboundPlacementSipFunding(db.db, {
      userId,
      agentId,
      leadId,
      outboundPlacementId: placementId,
      direction: "outbound",
      callerNumber: phone,
      calledNumber: from,
      callId: "sip-one",
    });
    expect(h.reserve).not.toHaveBeenCalled();
    expect(db.ledger.filter((r) => r.refType === "voice_funding_phase")).toHaveLength(2);
    await expect(
      adoptOutboundPlacementSipFunding(db.db, {
        userId,
        agentId: "other",
        leadId,
        outboundPlacementId: placementId,
        direction: "outbound",
        callerNumber: phone,
        calledNumber: from,
        callId: "sip-two",
      }),
    ).rejects.toThrow(/no longer active/);
  });
  it.each(["busy", "no-answer", "failed", "canceled"])(
    "records %s only with exact zero/unanswered proof",
    async (status) => {
      const db = database();
      await admitted(db);
      await handleFundedOutboundCarrierEvent(event(status, "0"));
      expect(db.ledger.find((r) => r.refType === "voice_outbound_terminal").metadata).toMatchObject(
        { carrier_status: status, duration_seconds: 0, unanswered_confirmed: true },
      );
      expect(h.release).toHaveBeenCalledWith(db.db, {
        userId,
        providerCallId: canonical,
        disposition: "confirmed_unanswered",
      });
      expect(db.rows.wireline_call_logs[0]).toMatchObject({
        vapiCallId: `twilio:${sid}`,
        transcript: null,
        recordingUrl: null,
      });
      await handleFundedOutboundCarrierEvent(event(status, "0"));
      expect(db.ledger.filter((r) => r.refType === "voice_outbound_terminal")).toHaveLength(1);
    },
  );
  it("never releases missing duration, AMD-answer, SIP-answer or conflicting carrier evidence", async () => {
    const db = database();
    await admitted(db);
    await expect(handleFundedOutboundCarrierEvent(event("busy"))).rejects.toThrow(/duration/);
    await handleFundedOutboundCarrierEvent({ ...event("answered"), answeredBy: "machine_start" });
    await expect(handleFundedOutboundCarrierEvent(event("busy", "0"))).rejects.toThrow(
      /answer evidence/,
    );
    expect(h.release).not.toHaveBeenCalled();
    await handleFundedOutboundCarrierEvent(event("completed", "61"));
    expect(h.track).toHaveBeenLastCalledWith({
      userId,
      vapiCallId: canonical,
      durationSeconds: 61,
    });
    expect(
      db.ledger.find((r) => r.refType === "voice_outbound_terminal").metadata.unanswered_confirmed,
    ).toBeUndefined();
    await expect(handleFundedOutboundCarrierEvent(event("completed", "62"))).rejects.toThrow(
      /conflicting/,
    );
  });
  it("keeps an ambiguous dispatched SID-less attempt reserved and never redials", async () => {
    const db = database();
    await admitted(db);
    await expect(
      reconcileOutboundPlacementJob({ userId, payload: { placementId, leadId: "7" } }),
    ).rejects.toThrow(/uncertain/);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("releases definite preaccept failure, but not a bound accepted call", async () => {
    const db = database();
    await admitted(db, false);
    await failOutboundBeforeAcceptance(userId, leadId, placementId);
    expect(h.release).toHaveBeenCalledWith(db.db, {
      userId,
      providerCallId: canonical,
      disposition: "definite_preaccept",
    });
    expect(
      db.ledger.find((r) => r.refType === "voice_outbound_terminal").metadata.carrier_status,
    ).toBe("not_placed");
    h.release.mockClear();
    await expect(markOutboundProviderAttempted(userId, leadId, placementId, 80)).rejects.toThrow(
      /again/,
    );
  });
  it("fresh-checks the exact grant before bridge and keeps revoked calls closed", async () => {
    const db = database();
    await admitted(db);
    await assertOutboundBridgePermission(userId, leadId, placementId);
    expect(h.permission).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: "permission-a", attemptId: placementId }),
    );
    h.permission.mockRejectedValueOnce(new Error("revoked"));
    await expect(assertOutboundBridgePermission(userId, leadId, placementId)).rejects.toThrow(
      "revoked",
    );
    expect(h.track).not.toHaveBeenCalled();
  });
  it("revokes durably and terminates only the exact bound parent before deadline", async () => {
    const db = database();
    await admitted(db);
    await bindOutboundCarrierCall(event("ringing"));
    h.fetch
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACowned",
        to: phone,
        from,
        direction: "outbound-api",
        status: "ringing",
        duration: "0",
      })
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACowned",
        to: phone,
        from,
        direction: "outbound-api",
        status: "canceled",
        duration: "0",
      });
    await endOutboundPlacementsForPermission(userId, "permission-a");
    expect(h.update).toHaveBeenCalledWith({ status: "canceled" });
    expect(db.ledger.some((r) => r.refType === "voice_outbound_cancel")).toBe(true);
    await expect(assertOutboundBridgePermission(userId, leadId, placementId)).rejects.toThrow(
      /withdrawn/,
    );
  });
  it("retains a matched in-progress provider observation before a contradictory unanswered refetch", async () => {
    const db = database();
    await admitted(db);
    await bindOutboundCarrierCall(event("ringing"));
    db.receipt(`voice_outbound_cancel:${canonical}`, { version: 1 });
    h.fetch
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACowned",
        to: phone,
        from,
        direction: "outbound-api",
        status: "in-progress",
        duration: "1",
      })
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACowned",
        to: phone,
        from,
        direction: "outbound-api",
        status: "busy",
        duration: "0",
      });
    await expect(
      reconcileOutboundPlacementJob({ userId, payload: { placementId, leadId: "7" } }),
    ).rejects.toThrow(/answer evidence/);
    expect(db.ledger.some((row) => row.refType === "voice_outbound_answered")).toBe(true);
    expect(h.release).not.toHaveBeenCalled();
  });
});
