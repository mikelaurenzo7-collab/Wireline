import { describe, expect, it } from "vitest";
import {
  VOICE_PERMISSION_ASSURANCE,
  VOICE_PERMISSION_REQUEST_MS,
  VOICE_PERMISSION_TERM_MS,
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
  type VoicePermissionGrant,
  type VoicePermissionRequest,
} from "../src/lib/recipient-voice-permission";
import {
  resolveCallingHoursForPhone,
  resolvePermissionCallingHours,
} from "../src/lib/tcpa-calling-hours";

const env = { INTERNAL_JWT_SECRET: "test-voice-permission-secret-at-least-thirty-two-characters" };
const now = Date.parse("2026-10-17T15:00:00Z");
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const artifactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fixture() {
  const request: VoicePermissionRequest = {
    kind: "request",
    version: VOICE_PERMISSION_VERSION,
    artifactId,
    userId,
    requestKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    agentId: "bot-one",
    botName: "Front Desk",
    phone: "+13125550100",
    sellerName: "Example LLC",
    sellerIdentityHash: "seller-snapshot",
    purpose: "marketing_or_sales",
    callerState: "IL",
    recipientState: "IL",
    timeZone: "America/Chicago",
    requestedAt: new Date(now - 60_000).toISOString(),
    requestExpiresAt: new Date(now + VOICE_PERMISSION_REQUEST_MS - 60_000).toISOString(),
    expiresAt: new Date(now + VOICE_PERMISSION_TERM_MS - 60_000).toISOString(),
    disclosure: "Exact reviewed permission.",
    tokenHash: "token-hash",
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
    ipHash: "hashed-ip",
    userAgentHash: "hashed-user-agent",
  };
  return {
    request,
    grant,
    userId,
    agentId: request.agentId,
    phone: request.phone,
    purpose: request.purpose,
    sellerIdentityHash: request.sellerIdentityHash,
    revoked: false,
    nowMs: now,
  };
}

describe("recipient voice permission integrity", () => {
  it("signs exact domain, kind, version and immutable scope, independent of JSON key order", () => {
    const { request } = fixture();
    const signed = signVoicePermissionRecord(request, env);
    expect(verifyVoicePermissionRecord(signed, "request", env)).toEqual(request);
    expect(voicePermissionHash({ a: 1, b: 2 })).toBe(voicePermissionHash({ b: 2, a: 1 }));
    for (const patch of [
      { phone: "+13125550101" },
      { userId: "another-owner" },
      { agentId: "another-bot" },
      { purpose: "service_or_requested" },
      { expiresAt: new Date(now + 9e9).toISOString() },
      { kind: "grant" },
      { version: "new-version" },
    ]) {
      expect(
        verifyVoicePermissionRecord(
          { ...signed, record: { ...request, ...patch } },
          "request",
          env,
        ),
      ).toBeNull();
    }
    expect(verifyVoicePermissionRecord(signed, "grant", env)).toBeNull();
    expect(verifyVoicePermissionRecord({ ...signed, signature: "x" }, "request", env)).toBeNull();
    expect(
      verifyVoicePermissionRecord(signed, "request", {
        INTERNAL_JWT_SECRET: "another-key-that-is-long-enough-to-sign-these-records",
      }),
    ).toBeNull();
  });

  it("fails closed without a configured signing key", () => {
    expect(() => signVoicePermissionRecord(fixture().request, {})).toThrow(
      "signing is unavailable",
    );
    expect(() =>
      voicePermissionToken(userId, artifactId, { INTERNAL_JWT_SECRET: "short" }),
    ).toThrow();
  });

  it("derives an opaque, stable capture token without disclosing tenant or recipient", () => {
    const token = voicePermissionToken(userId, artifactId, env);
    expect(token).toBe(voicePermissionToken(userId, artifactId, env));
    expect(voicePermissionTokenId(token)).toBe(artifactId);
    expect(token).not.toContain(userId);
    expect(token).not.toContain("3125550100");
    expect(voicePermissionToken("different-tenant", artifactId, env)).not.toBe(token);
    expect(voicePermissionTokenId(`${token}.extra`)).toBeNull();
    expect(voicePermissionTokenId("not-a-token")).toBeNull();
    expect(voicePermissionTokenId("x".repeat(101))).toBeNull();
  });

  it("normalizes only valid NANP numbers and masks public context", () => {
    expect(normalizeVoicePermissionPhone("(312) 555-0100")).toBe("+13125550100");
    expect(normalizeVoicePermissionPhone("+1 312 555 0100")).toBe("+13125550100");
    for (const phone of ["+442071838750", "123", "+10125550100", "1111111111"])
      expect(normalizeVoicePermissionPhone(phone)).toBeNull();
    expect(maskedVoicePermissionPhone("+13125550100")).toBe("••• ••• 0100");
  });

  it.each(["marketing_or_sales", "service_or_requested", "callback"] as const)(
    "discloses exact %s scope and identity limits",
    (purpose) => {
      const copy = buildVoicePermissionDisclosure({
        sellerName: "Example LLC",
        purpose,
        phone: "+13125550100",
        expiresAt: new Date(now).toISOString(),
        timeZone: "America/Chicago",
      });
      expect(copy).toContain("Example LLC");
      expect(copy).toContain("AI-generated voice");
      expect(copy).toContain("not a condition of buying");
      expect(copy).toContain("do not verify my identity or possession");
      expect(copy).toContain(
        purpose === "marketing_or_sales" ? "marketing and sales" : "non-marketing",
      );
      if (purpose === "callback") expect(copy).toContain("one non-marketing callback");
    },
  );
});

describe("recipient permission scope and freshness", () => {
  it("accepts the exact unrevoked business, Bot, phone, purpose and current signed record", () => {
    expect(() => assertVoicePermissionScope(fixture())).not.toThrow();
  });
  it.each([
    { userId: "another-tenant" },
    { agentId: "another-bot" },
    { phone: "+13125550101" },
    { purpose: "callback" as const },
    { sellerIdentityHash: "changed-business" },
  ])("rejects a scope substitution %j", (patch) => {
    expect(() => assertVoicePermissionScope({ ...fixture(), ...patch })).toThrow("does not match");
  });
  it("does not let matching scope or a current signature override revocation", () => {
    expect(() => assertVoicePermissionScope({ ...fixture(), revoked: true })).toThrow("withdrew");
  });
  it.each(["requestHash", "disclosureHash", "identityAssurance"] as const)(
    "rejects mismatched grant %s",
    (field) => {
      const input = fixture();
      expect(() =>
        assertVoicePermissionScope({ ...input, grant: { ...input.grant, [field]: "different" } }),
      ).toThrow("does not match");
    },
  );
  it("rejects expiry, future signatures and confirmation after request expiry", () => {
    const input = fixture();
    expect(() =>
      assertVoicePermissionScope({ ...input, nowMs: Date.parse(input.request.expiresAt) }),
    ).toThrow("expired");
    expect(() =>
      assertVoicePermissionScope({
        ...input,
        grant: { ...input.grant, acceptedAt: new Date(now + 1).toISOString() },
      }),
    ).toThrow("expired");
    expect(() =>
      assertVoicePermissionScope({
        ...input,
        grant: {
          ...input.grant,
          acceptedAt: new Date(now + VOICE_PERMISSION_REQUEST_MS).toISOString(),
        },
        nowMs: now + VOICE_PERMISSION_REQUEST_MS + 1,
      }),
    ).toThrow("expired");
  });
  it("rejects a callback scope that outlives the one-day product limit", () => {
    const input = fixture();
    const request = { ...input.request, purpose: "callback" as const };
    const grant = { ...input.grant, requestHash: voicePermissionHash(request) };
    expect(() =>
      assertVoicePermissionScope({ ...input, request, grant, purpose: "callback" }),
    ).toThrow("expired");
  });
});

describe("explicit US jurisdiction policy", () => {
  const jurisdiction = { callerState: "IL", recipientState: "IL", timeZone: "America/Chicago" };
  it.each([
    { callerState: "PR" },
    { recipientState: "CA", timeZone: "America/Chicago" },
    { recipientState: "" },
    { timeZone: "America/New_York" },
    { timeZone: "" },
  ])("does not silently infer or clear unsupported jurisdiction %j", (patch) => {
    expect(() => assertVoicePermissionJurisdiction({ ...jurisdiction, ...patch })).toThrow(
      "not cleared",
    );
    expect(
      resolvePermissionCallingHours({ ...jurisdiction, ...patch }, new Date(now)).allowed,
    ).toBe(false);
  });
  it("accepts a caller and recipient in different US states when the signed zone matches", () => {
    const national = { callerState: "CA", recipientState: "NY", timeZone: "America/New_York" };
    expect(() => assertVoicePermissionJurisdiction(national)).not.toThrow();
    expect(resolvePermissionCallingHours(national, new Date(now))).toMatchObject({
      allowed: true,
      state: "NY",
      timeZone: "America/New_York",
      startHour: 8,
    });
    expect(
      resolvePermissionCallingHours(
        { callerState: "IL", recipientState: "CA", timeZone: "America/Los_Angeles" },
        new Date("2026-10-17T14:59:59Z"),
      ).allowed,
    ).toBe(false);
    expect(
      resolvePermissionCallingHours(
        { callerState: "TX", recipientState: "TX", timeZone: "America/Denver" },
        new Date(now),
      ).allowed,
    ).toBe(true);
  });
  it("enforces Illinois 9am in both daylight and standard time and rejects 9pm exactly", () => {
    for (const [stamp, allowed] of [
      ["2026-10-17T13:59:59Z", false],
      ["2026-10-17T14:00:00Z", true],
      ["2026-10-18T01:59:59Z", true],
      ["2026-10-18T02:00:00Z", false],
      ["2026-12-17T14:59:59Z", false],
      ["2026-12-17T15:00:00Z", true],
    ] as const)
      expect(resolvePermissionCallingHours(jurisdiction, new Date(stamp)).allowed, stamp).toBe(
        allowed,
      );
    expect(resolvePermissionCallingHours(jurisdiction, new Date(now)).inferred).toBe(false);
  });
  it("uses the stricter Illinois start for legacy phone inference without changing other states", () => {
    expect(
      resolveCallingHoursForPhone("+13125550100", new Date("2026-10-17T13:30:00Z")),
    ).toMatchObject({ allowed: false, startHour: 9, localHour: 8 });
    expect(
      resolveCallingHoursForPhone("+13125550100", new Date("2026-10-17T14:00:00Z")),
    ).toMatchObject({ allowed: true, startHour: 9 });
    expect(
      resolveCallingHoursForPhone("+14155550100", new Date("2026-10-17T15:00:00Z")),
    ).toMatchObject({ allowed: true, startHour: 8 });
  });
});
