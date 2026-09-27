import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ channel: vi.fn(), carrier: vi.fn(), claim: vi.fn() }));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: h.channel }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({ perform }: any) => ({
    performed: true,
    result: await perform(),
  }),
}));
vi.mock("../src/lib/twilio-service", () => ({ getTwilioClient: h.carrier }));
vi.mock("../src/lib/voice/openai-outbound-placement", () => ({
  claimNativeOutboundPlacement: h.claim,
  markNativeOutboundPlacementAccepted: vi.fn(),
  markNativeOutboundPlacementFailure: vi.fn(),
}));
import { placeOutboundCall } from "../src/lib/voice/outbound-call-service";
beforeEach(() => {
  vi.clearAllMocks();
});
describe("modular outbound admission funding guard", () => {
  it.each(["voice", "voice-email", "voice-sms", "omnichannel"])(
    "blocks %s before provider setup or placement even if other launch flags change",
    async (planId) => {
      h.channel.mockResolvedValue({ planId, channels: ["voice"] });
      await expect(
        placeOutboundCall({
          userId: "tenant",
          agentId: "bot",
          customerNumber: "+13125550101",
          callPurpose: "service_or_requested",
        }),
      ).resolves.toMatchObject({ ok: false, status: 503, code: "OUTBOUND_FUNDING_NOT_READY" });
      expect(h.carrier).not.toHaveBeenCalled();
      expect(h.claim).not.toHaveBeenCalled();
    },
  );
});
