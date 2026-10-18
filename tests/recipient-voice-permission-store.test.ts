import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tenantStore } from "../src/lib/tenant-context-store";
import {
  VOICE_PERMISSION_ASSURANCE,
  VOICE_PERMISSION_EVENTS,
  VOICE_PERMISSION_VERSION,
  signVoicePermissionRecord,
  voicePermissionHash,
  voicePermissionToken,
  type VoicePermissionClaim,
  type VoicePermissionGrant,
  type VoicePermissionRequest,
  type VoicePermissionRevocation,
} from "../src/lib/recipient-voice-permission";

const fake = vi.hoisted(() => ({
  reads: [] as unknown[][],
  inserted: [] as Array<Record<string, unknown>>,
  scopes: [] as Array<string | undefined>,
  statements: [] as unknown[],
  noReceipt: false,
  failDnc: false,
  end: vi.fn(),
  lockHook: undefined as undefined | ((ordinal: number) => Promise<void>),
}));

vi.mock("../src/lib/dnc-failsafe", () => ({
  isDncFailsafeBlocked: vi.fn(async () => fake.failDnc),
}));
vi.mock("../src/lib/voice/outbound-placement-funding", () => ({
  endOutboundPlacementsForPermission: fake.end,
}));
vi.mock("../src/lib/server-context", async () => {
  const { tenantStore: context } = await import("../src/lib/tenant-context-store");
  const db = {
    select: vi.fn(() => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: async () => {
          fake.scopes.push(context.getStore());
          return fake.reads.shift() || [];
        },
      };
      return query;
    }),
    insert: vi.fn(() => ({
      values: (row: Record<string, unknown>) => {
        fake.scopes.push(context.getStore());
        fake.inserted.push(row);
        return {
          returning: async () => (fake.noReceipt ? [] : [{ id: BigInt(fake.inserted.length) }]),
        };
      },
    })),
    execute: vi.fn(async (query: unknown) => {
      fake.statements.push(query);
      await fake.lockHook?.(fake.statements.length);
    }),
    transaction: async <T>(operation: (tx: unknown) => Promise<T>): Promise<T> => operation(db),
  };
  return { drizzle: db, log: { warn: vi.fn() } };
});

import {
  assertOutboundRecipientPermission,
  createRecipientVoicePermission,
  grantRecipientVoicePermission,
  assertOutboundRecipientPermissionInTransaction,
  inspectOutboundRecipientPermission,
  listRecipientVoicePermissions,
  recipientVoicePermissionLink,
  revokePublicRecipientVoicePermission,
  revokeRecipientVoicePermission,
} from "../src/lib/recipient-voice-permission-store";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const artifactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestKey = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const attemptId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = Date.parse("2026-10-17T15:00:00Z");
const sellerName = "Example LLC";
const address = "123 Example Street, Chicago IL 60601";
const phone = "+13125550100";
const identityHash = voicePermissionHash({ sellerName, address });

function identityRows() {
  return [
    [{ name: sellerName }],
    [{ preferences: { company_identity: { physicalPostalAddress: address } } }],
    [{ id: "bot-one", name: "Front Desk" }],
  ];
}

function fixtures(purpose: VoicePermissionRequest["purpose"] = "callback") {
  const token = voicePermissionToken(userId, artifactId);
  const request: VoicePermissionRequest = {
    kind: "request",
    version: VOICE_PERMISSION_VERSION,
    artifactId,
    userId,
    requestKey,
    agentId: "bot-one",
    botName: "Front Desk",
    phone,
    sellerName,
    sellerIdentityHash: identityHash,
    purpose,
    callerState: "IL",
    recipientState: "IL",
    timeZone: "America/Chicago",
    requestedAt: new Date(now - 60_000).toISOString(),
    requestExpiresAt: new Date(now + 3600_000).toISOString(),
    expiresAt: new Date(now + 3600_000).toISOString(),
    disclosure: "Exact permission to call.",
    tokenHash: voicePermissionHash(token),
  };
  const grant: VoicePermissionGrant = {
    kind: "grant",
    version: VOICE_PERMISSION_VERSION,
    artifactId,
    userId,
    requestHash: voicePermissionHash(request),
    signerName: "Taylor Example",
    acceptedAt: new Date(now - 30_000).toISOString(),
    disclosureHash: voicePermissionHash(request.disclosure),
    identityAssurance: VOICE_PERMISSION_ASSURANCE,
    ipHash: "hash",
    userAgentHash: "hash",
  };
  return { token, request, grant };
}

function row(
  record:
    | VoicePermissionRequest
    | VoicePermissionGrant
    | VoicePermissionClaim
    | VoicePermissionRevocation,
) {
  return {
    id: 1n,
    userId: record.userId,
    customerNumber: phone,
    event:
      record.kind === "request"
        ? VOICE_PERMISSION_EVENTS.requested
        : record.kind === "grant"
          ? VOICE_PERMISSION_EVENTS.granted
          : record.kind === "revocation"
            ? VOICE_PERMISSION_EVENTS.revoked
            : VOICE_PERMISSION_EVENTS.claimed,
    ruleVersion: VOICE_PERMISSION_VERSION,
    metadata: signVoicePermissionRecord(record),
  };
}

beforeEach(() => {
  vi.stubEnv("INTERNAL_JWT_SECRET", "test-voice-permission-secret-at-least-thirty-two-characters");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fake.reads = [];
  fake.inserted = [];
  fake.scopes = [];
  fake.statements = [];
  fake.noReceipt = false;
  fake.failDnc = false;
  fake.end.mockReset();
  fake.lockHook = undefined;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("canonical recipient permission storage", () => {
  it("creates only a request, using saved seller and owned Bot, and stores no bearer token", async () => {
    fake.reads.push([], ...identityRows());
    const result = await createRecipientVoicePermission({
      userId,
      requestKey,
      agentId: "bot-one",
      phone,
      callPurpose: "callback",
      recipientState: "IL",
      timeZone: "America/Chicago",
    });
    expect(result.permission.status).toBe("pending");
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({
      userId,
      event: VOICE_PERMISSION_EVENTS.requested,
      ruleVersion: VOICE_PERMISSION_VERSION,
    });
    expect(JSON.stringify(fake.inserted)).not.toContain(result.token);
    expect(fake.scopes.every((scope) => scope === userId)).toBe(true);
    expect(fake.end).not.toHaveBeenCalled();
  });

  it("reuses the same request and derived link for exact uncertain retries", async () => {
    const { request, token } = fixtures();
    fake.reads.push([row(request)], ...identityRows(), []);
    const result = await createRecipientVoicePermission({
      userId,
      requestKey,
      agentId: "bot-one",
      phone,
      callPurpose: "callback",
      recipientState: "IL",
      timeZone: "America/Chicago",
    });
    expect(result.token).toBe(token);
    expect(fake.inserted).toHaveLength(0);
  });

  it("rejects changed request-key scope rather than silently replacing an earlier request", async () => {
    const { request } = fixtures();
    fake.reads.push([row(request)], ...identityRows());
    await expect(
      createRecipientVoicePermission({
        userId,
        requestKey,
        agentId: "bot-one",
        phone: "+13125550101",
        callPurpose: "callback",
        recipientState: "IL",
        timeZone: "America/Chicago",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fake.inserted).toHaveLength(0);
  });

  it("rejects missing Caller Identity and does not mint a permission from an owner checkbox", async () => {
    fake.reads.push([], [{ name: sellerName }], [], [{ id: "bot-one", name: "Front Desk" }]);
    await expect(
      createRecipientVoicePermission({
        userId,
        requestKey,
        agentId: "bot-one",
        phone,
        callPurpose: "callback",
        recipientState: "IL",
        timeZone: "America/Chicago",
      }),
    ).rejects.toMatchObject({ code: "CALLER_IDENTITY_REQUIRED" });
    expect(fake.inserted).toHaveLength(0);
  });

  it("captures the recipient signature with original disclosure, separate system lookup and tenant write", async () => {
    const { request, token } = fixtures();
    fake.reads.push([row(request)], [row(request)], [], ...identityRows());
    const result = await grantRecipientVoicePermission({
      token,
      signerName: "Taylor Example",
      phone,
      accepted: true,
      disclosureHash: voicePermissionHash(request.disclosure),
      recipientState: "IL",
      timeZone: "America/Chicago",
      ip: "192.0.2.1",
      userAgent: "test-recipient-browser",
    });
    expect(result.permission.status).toBe("granted");
    expect(fake.scopes[0]).toBe("");
    expect(fake.scopes.slice(1).every((scope) => scope === userId)).toBe(true);
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({
      event: VOICE_PERMISSION_EVENTS.granted,
      metadata: {
        record: {
          signerName: "Taylor Example",
          identityAssurance: VOICE_PERMISSION_ASSURANCE,
          requestHash: voicePermissionHash(request),
        },
      },
    });
    expect(JSON.stringify(fake.inserted)).not.toContain(token);
    expect(JSON.stringify(fake.inserted)).not.toContain("192.0.2.1");
    expect(JSON.stringify(fake.inserted)).not.toContain("test-recipient-browser");
  });

  it("does not rewrite an already captured signature during an exact confirmation retry", async () => {
    const { request, grant, token } = fixtures();
    fake.reads.push([row(request)], [row(request)], [row(grant)], ...identityRows());
    const result = await grantRecipientVoicePermission({
      token,
      signerName: "Taylor Example",
      phone,
      accepted: true,
      disclosureHash: voicePermissionHash(request.disclosure),
      recipientState: "IL",
      timeZone: "America/Chicago",
    });
    expect(result.permission.status).toBe("granted");
    expect(fake.inserted).toHaveLength(0);
  });

  it.each(["phone", "disclosure"] as const)(
    "rejects substituted recipient confirmation %s",
    async (field) => {
      const { request, token } = fixtures();
      fake.reads.push([row(request)], [row(request)], []);
      await expect(
        grantRecipientVoicePermission({
          token,
          signerName: "Taylor Example",
          phone: field === "phone" ? "+13125550101" : phone,
          accepted: true,
          disclosureHash:
            field === "disclosure" ? "f".repeat(64) : voicePermissionHash(request.disclosure),
          recipientState: "IL",
          timeZone: "America/Chicago",
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(fake.inserted).toHaveLength(0);
    },
  );

  it("never reports a grant saved without an actual insert receipt", async () => {
    const { request, token } = fixtures();
    fake.reads.push([row(request)], [row(request)], [], ...identityRows());
    fake.noReceipt = true;
    await expect(
      grantRecipientVoicePermission({
        token,
        signerName: "Taylor Example",
        phone,
        accepted: true,
        disclosureHash: voicePermissionHash(request.disclosure),
        recipientState: "IL",
        timeZone: "America/Chicago",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("lists only masked summaries, not tokens, raw destination, signer or signatures", async () => {
    const { request, grant, token } = fixtures();
    fake.reads.push([row(request)], [row(grant)]);
    const result = await listRecipientVoicePermissions(userId);
    expect(result[0]).toMatchObject({ status: "granted", recipient_phone_masked: "••• ••• 0100" });
    for (const privateValue of [phone, token, grant.signerName, request.tokenHash])
      expect(JSON.stringify(result)).not.toContain(privateValue);
  });

  it("allows explicit pending-link retrieval but refuses completed signatures", async () => {
    const { request, grant, token } = fixtures();
    fake.reads.push([row(request)], [], ...identityRows());
    expect(await recipientVoicePermissionLink(userId, artifactId)).toBe(token);
    fake.reads.push([row(request)], [row(grant)]);
    await expect(recipientVoicePermissionLink(userId, artifactId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("commits revocation and canonical suppression before best-effort carrier cleanup", async () => {
    const { request, grant } = fixtures();
    fake.reads.push([row(request)], [row(grant)], []);
    fake.end.mockImplementation(async () => {
      expect(tenantStore.getStore()).toBe(userId);
      expect(fake.inserted[0].event).toBe(VOICE_PERMISSION_EVENTS.revoked);
      expect(fake.inserted[1].phone).toBe("13125550100");
      throw new Error("temporary carrier outage");
    });
    const result = await revokeRecipientVoicePermission({ userId, artifactId });
    expect(result.status).toBe("revoked");
    expect(fake.end).toHaveBeenCalledWith(userId, artifactId, phone);
    expect(fake.scopes.every((scope) => scope === userId)).toBe(true);
  });

  it("rechecks the public capability and scopes its revocation to the stored owner", async () => {
    const { request, token } = fixtures();
    fake.reads.push([row(request)], [row(request)], [], []);
    fake.end.mockImplementation(async () => {
      expect(tenantStore.getStore()).toBe(userId);
    });
    const result = await revokePublicRecipientVoicePermission(token);
    expect(result.status).toBe("revoked");
    expect(fake.end).toHaveBeenCalledWith(userId, artifactId, phone);
    expect(fake.scopes[0]).toBe("");
    expect(fake.scopes.slice(1).every((scope) => scope === userId)).toBe(true);
  });
});

describe("fresh dispatch permission receipt", () => {
  function admissionRows(
    request: VoicePermissionRequest,
    grant: VoicePermissionGrant,
    prior: unknown[] = [],
    history: unknown[] = [row(grant)],
  ) {
    fake.reads.push([row(request)], history, ...identityRows(), [], prior);
  }
  const dispatch = {
    userId,
    agentId: "bot-one",
    phone,
    callPurpose: "callback" as const,
    artifactId,
    attemptId,
  };

  it("does not consume a callback during preflight before funding and policy admission", async () => {
    const { request, grant } = fixtures();
    admissionRows(request, grant);
    expect(await inspectOutboundRecipientPermission(dispatch)).toEqual({
      artifactId,
      grantHash: voicePermissionHash(grant),
      effectiveCallPurpose: "callback",
      expiresAt: request.expiresAt,
      jurisdiction: { callerState: "IL", recipientState: "IL", timeZone: "America/Chicago" },
    });
    expect(fake.inserted).toHaveLength(0);
    // A refused funding admission leaves this permission unused. Only the
    // same-transaction provider dispatch fence subsequently appends its claim.
    admissionRows(request, grant);
    const { drizzle: db } = await import("../src/lib/server-context");
    await tenantStore.run(userId, () =>
      assertOutboundRecipientPermissionInTransaction(db, dispatch),
    );
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0].event).toBe(VOICE_PERMISSION_EVENTS.claimed);
  });

  it("mints a signed immutable receipt only after current scope, identity, hours and suppression checks", async () => {
    const { request, grant } = fixtures();
    admissionRows(request, grant);
    const receipt = await assertOutboundRecipientPermission(dispatch);
    expect(receipt).toMatchObject({
      artifactId,
      effectiveCallPurpose: "callback",
      expiresAt: request.expiresAt,
      jurisdiction: { callerState: "IL", recipientState: "IL", timeZone: "America/Chicago" },
    });
    expect(fake.inserted[0]).toMatchObject({
      event: VOICE_PERMISSION_EVENTS.claimed,
      metadata: {
        record: { attemptId, grantHash: voicePermissionHash(grant), phone, agentId: "bot-one" },
      },
    });
    expect(fake.scopes.every((scope) => scope === userId)).toBe(true);
  });

  it("reuses the exact canonical claim on same-attempt retries without a second write", async () => {
    const { request, grant } = fixtures();
    const claim: VoicePermissionClaim = {
      kind: "claim",
      version: VOICE_PERMISSION_VERSION,
      userId,
      artifactId,
      attemptId,
      receiptId: requestKey,
      phone,
      agentId: "bot-one",
      purpose: "callback",
      grantHash: voicePermissionHash(grant),
      claimedAt: new Date(now - 1000).toISOString(),
    };
    admissionRows(request, grant, [row(claim)], [row(grant), row(claim)]);
    expect(await assertOutboundRecipientPermission(dispatch)).toMatchObject({
      receiptId: requestKey,
      receiptHash: voicePermissionHash(claim),
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("does not reuse a callback grant for a different dispatch attempt", async () => {
    const { request, grant } = fixtures();
    const claim: VoicePermissionClaim = {
      kind: "claim",
      version: VOICE_PERMISSION_VERSION,
      userId,
      artifactId,
      attemptId: requestKey,
      receiptId: requestKey,
      phone,
      agentId: "bot-one",
      purpose: "callback",
      grantHash: voicePermissionHash(grant),
      claimedAt: new Date(now - 1000).toISOString(),
    };
    admissionRows(request, grant, [], [row(grant), row(claim)]);
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      code: "VOICE_PERMISSION_ALREADY_USED",
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("will not authorize a different grant with an already-used canonical attempt identity", async () => {
    const { request, grant } = fixtures();
    const claim = {
      kind: "claim" as const,
      version: VOICE_PERMISSION_VERSION,
      userId,
      artifactId: requestKey,
      attemptId,
      receiptId: requestKey,
      phone,
      agentId: "bot-one",
      purpose: "callback" as const,
      grantHash: voicePermissionHash(grant),
      claimedAt: new Date(now - 1000).toISOString(),
    };
    admissionRows(request, grant, [row(claim)]);
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      status: 409,
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("rejects stale saved seller identity before claiming", async () => {
    const { request, grant } = fixtures();
    fake.reads.push(
      [row(request)],
      [row(grant)],
      [{ name: "Different Seller LLC" }],
      identityRows()[1],
      identityRows()[2],
    );
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      code: "VOICE_PERMISSION_SCOPE_MISMATCH",
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("fails closed on failsafe suppression, DB suppression and quiet hours", async () => {
    fake.failDnc = true;
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      code: "VOICE_PERMISSION_SUPPRESSED",
    });
    expect(fake.reads).toHaveLength(0);
    fake.failDnc = false;
    const { request, grant } = fixtures();
    fake.reads.push([row(request)], [row(grant)], ...identityRows(), [{ id: "suppressed" }]);
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      code: "VOICE_PERMISSION_SUPPRESSED",
    });
    vi.setSystemTime("2026-10-17T13:30:00Z");
    const earlyRequest = {
      ...request,
      requestedAt: "2026-10-17T11:00:00Z",
      requestExpiresAt: "2026-10-18T11:00:00Z",
    };
    const earlyGrant = {
      ...grant,
      requestHash: voicePermissionHash(earlyRequest),
      acceptedAt: "2026-10-17T12:00:00Z",
    };
    fake.reads.push([row(earlyRequest)], [row(earlyGrant)], ...identityRows());
    await expect(assertOutboundRecipientPermission(dispatch)).rejects.toMatchObject({
      code: "OUTSIDE_PERMITTED_CALLING_HOURS",
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("does not upgrade a legacy marker or an arbitrary source label to permission", async () => {
    await expect(
      assertOutboundRecipientPermission({ ...dispatch, artifactId: undefined }),
    ).rejects.toMatchObject({ code: "RECIPIENT_PERMISSION_REQUIRED" });
    expect(fake.inserted).toHaveLength(0);
    expect(tenantStore.getStore()).toBeUndefined();
  });

  it("reads a revocation committed while waiting for the shared recipient dispatch lock", async () => {
    const { request, grant } = fixtures();
    const revocation: VoicePermissionRevocation = {
      kind: "revocation",
      version: VOICE_PERMISSION_VERSION,
      artifactId,
      userId,
      actor: "recipient",
      revokedAt: new Date(now).toISOString(),
    };
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    fake.lockHook = async (ordinal) => {
      if (ordinal === 2) {
        reached();
        await held;
      }
    };
    fake.reads.push([row(request)], [row(grant)], ...identityRows());
    const admission = assertOutboundRecipientPermission(dispatch);
    const rejected = expect(admission).rejects.toMatchObject({ code: "VOICE_PERMISSION_REVOKED" });
    await waiting;
    // The committed ledger changes before this transaction obtains its lock.
    fake.reads[0] = [row(grant), row(revocation)];
    release();
    await rejected;
    expect(fake.inserted).toHaveLength(0);
  });

  it("requires exact tenant scope for the same-transaction marker helper", async () => {
    const { drizzle: db } = await import("../src/lib/server-context");
    await expect(
      assertOutboundRecipientPermissionInTransaction(db, dispatch),
    ).rejects.toMatchObject({ status: 403 });
    expect(fake.statements).toHaveLength(0);
    await expect(
      tenantStore.run("another-owner", () =>
        assertOutboundRecipientPermissionInTransaction(db, dispatch),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
