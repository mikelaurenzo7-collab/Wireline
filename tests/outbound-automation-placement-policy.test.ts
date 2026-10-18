import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { AppError } from "../src/lib/api-error";

const h = vi.hoisted(() => ({
  lead: {} as any,
  writes: [] as any[],
  evidence: [] as any[],
  inspect: vi.fn(),
  gate: vi.fn(),
  place: vi.fn(),
  sms: vi.fn(),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  externalEntityActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  inspectOutboundRecipientPermission: h.inspect,
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({
  evaluateOutboundDialGate: h.gate,
  mergeLeadMetadata: (x: any, y: any) => ({ ...x, ...y }),
}));
vi.mock("../src/lib/federal-dnc-service", () => ({
  assertFederalDncForMarketing: () => ({ allowed: true }),
}));
vi.mock("../src/lib/job-queue", () => ({ enqueue: async () => ({ ok: true }) }));
vi.mock("../src/lib/voice-spend-control", () => ({ assertOutboundVoiceAllowed: async () => {} }));
vi.mock("../src/lib/voice/outbound-call-service", () => ({ placeOutboundCall: h.place }));
vi.mock("../src/lib/twilio-service", () => ({ sendTenantMessage: h.sms }));
vi.mock("../src/lib/integrations", () => ({ IntegrationService: class {} }));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({ perform }: any) => ({
    performed: true,
    result: await perform(),
  }),
}));
vi.mock("../src/lib/server-context", () => {
  const db: any = {
    transaction: (fn: any) => fn(db),
    execute: async () => [],
    select: () => {
      const q: any = {
        from: () => q,
        where: () => q,
        limit: async () => [h.lead],
        then: (resolve: any) => Promise.resolve([h.lead]).then(resolve),
      };
      return q;
    },
    update: (table: any) => {
      let patch: any;
      const apply = () => {
        h.writes.push(patch);
        if (getTableName(table) === "wireline_outbound_leads") Object.assign(h.lead, patch);
        return [{ id: h.lead.id }];
      };
      const q: any = {
        set: (value: any) => {
          patch = value;
          return q;
        },
        where: () => q,
        returning: async () => apply(),
        then: (resolve: any) => Promise.resolve().then(apply).then(resolve),
      };
      return q;
    },
    insert: () => ({
      values: async (value: any) => {
        h.evidence.push(value);
        return [];
      },
    }),
  };
  return { drizzle: db, log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } };
});
import { CampaignDialerService } from "../src/services/campaign-dialer";
import { executeStep } from "../src/lib/cadence-engine";

const campaign = {
  id: "campaign",
  userId: "tenant",
  agentId: "bot",
  name: "Follow Up",
  maxAttempts: 1,
};
const cadence = { id: "cadence", userId: "tenant", agentId: "bot", name: "Follow Up", steps: [] };
const dialCampaignLead = () =>
  (new CampaignDialerService() as any).dialLead({ ...h.lead }, campaign);
beforeEach(() => {
  vi.clearAllMocks();
  h.writes = [];
  h.evidence = [];
  h.lead = {
    id: 1n,
    userId: "tenant",
    agentId: "bot",
    customerNumber: "+13125550101",
    customerName: "Contact",
    status: "Queued",
    attempts: 0,
    lastCalledAt: null,
    metadata: {},
    email: null,
  };
  h.inspect.mockResolvedValue({
    artifactId: "signed-permission",
    effectiveCallPurpose: "marketing_or_sales",
  });
  h.gate.mockResolvedValue({ allowed: true });
  h.sms.mockResolvedValue({ ok: true });
  h.place.mockImplementation(async () => {
    // The shared dispatcher committed attempt1, then its signed terminal
    // callback beat the delayed Calls.create/placement return.
    h.lead.attempts = 1;
    h.lead.status = "Max-Attempts";
    h.lead.metadata = { native_voice: { placement_id: "new-placement", state: "carrier_failed" } };
    return { ok: true, callId: "CAaccepted", leadId: "1" };
  });
});
describe("automation respects canonical outbound placement ownership", () => {
  it("does not double-count or overwrite an early terminal campaign outcome after placement returns", async () => {
    await dialCampaignLead();
    expect(h.lead).toMatchObject({ status: "Max-Attempts", attempts: 1 });
    expect(h.writes.filter((patch) => "attempts" in patch)).toEqual([]);
    expect(h.place).toHaveBeenCalledWith(
      expect.objectContaining({
        priorLeadStatus: "Queued",
        consentArtifactId: "signed-permission",
      }),
    );
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({ hasExpressWrittenConsent: true }),
    );
  });
  it("does not double-count or overwrite an early terminal cadence outcome", async () => {
    await executeStep({ type: "call", delayHours: 0 }, cadence, h.lead);
    expect(h.lead).toMatchObject({ status: "Max-Attempts", attempts: 1 });
    expect(h.writes).toEqual([]);
    expect(h.place).toHaveBeenCalledWith(
      expect.objectContaining({ consentArtifactId: "signed-permission" }),
    );
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({ hasExpressWrittenConsent: true }),
    );
  });
  it("restores a campaign's processable state when signed permission is missing before service admission", async () => {
    h.inspect.mockRejectedValue(new Error("No signed permission"));
    await dialCampaignLead();
    expect(h.lead).toMatchObject({ status: "Queued", attempts: 0 });
    expect(h.gate).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
  });
  it("restores the outer campaign claim when an early service gate rejects before a placement receipt exists", async () => {
    h.place.mockResolvedValue({ ok: false, status: 503, error: "temporarily unavailable" });
    await dialCampaignLead();
    expect(h.lead).toMatchObject({ status: "Queued", attempts: 0 });
    expect(h.writes.filter((patch) => "attempts" in patch)).toEqual([]);
  });
  it("preserves a newer uncertain placement instead of restoring a stale campaign snapshot", async () => {
    h.place.mockImplementation(async () => {
      h.lead.attempts = 1;
      h.lead.status = "Error";
      h.lead.metadata = {
        native_voice: {
          placement_id: "new-placement",
          state: "outcome_ambiguous",
          do_not_retry: true,
        },
      };
      return { ok: false, providerOutcomeAmbiguous: true, doNotRetry: true };
    });
    await dialCampaignLead();
    expect(h.lead).toMatchObject({ status: "Error", attempts: 1 });
    expect(h.lead.metadata.native_voice.do_not_retry).toBe(true);
  });
  it("keeps cadence quiet-hours deferral recoverable without authorizing any call", async () => {
    h.inspect.mockRejectedValue(
      new AppError(403, "OUTSIDE_PERMITTED_CALLING_HOURS", "quiet hours"),
    );
    expect(await executeStep({ type: "call", delayHours: 0 }, cadence, h.lead)).toMatchObject({
      ok: false,
      defer: true,
    });
    expect(h.gate).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
  });
  it("never treats a voice grant as consent for a cadence SMS", async () => {
    await executeStep({ type: "sms", delayHours: 0 }, cadence, h.lead);
    expect(h.inspect).not.toHaveBeenCalled();
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({ hasExpressWrittenConsent: false }),
    );
    expect(h.place).not.toHaveBeenCalled();
  });
});
