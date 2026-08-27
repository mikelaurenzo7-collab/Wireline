import { describe, expect, it } from "vitest";

import { resetNativeOutboundPlacementMetadata } from "../src/lib/voice/xai-outbound-placement";

describe("native outbound placement retries", () => {
  it("cannot carry accepted-call evidence or TwiML replay into a new attempt", () => {
    const previousCallSid = `CA${"a".repeat(32)}`;
    const metadata = resetNativeOutboundPlacementMetadata(
      {
        campaign_source: "import",
        native_voice: {
          provider: "twilio_xai_sip",
          placement_id: "previous-placement",
          twilio_call_sid: previousCallSid,
          xai_call_id: "xai:previous-call",
          bridge_served_at: "2026-08-26T12:00:00.000Z",
          amd_action: "bridge",
          twiml_replay: { version: 1, call_sid: previousCallSid, kind: "bridge" },
          carrier_status: "completed",
          state: "completed",
          do_not_retry: true,
        },
      },
      {
        callPurpose: "service_or_requested",
        placementId: "new-placement",
        claimedAt: new Date("2026-08-26T13:00:00.000Z"),
        created: false,
      },
    );

    expect(metadata.campaign_source).toBe("import");
    expect(metadata.native_voice).toEqual({
      provider: "twilio_xai_sip",
      call_purpose: "service_or_requested",
      placement_id: "new-placement",
      placement_claimed_at: "2026-08-26T13:00:00.000Z",
      state: "creating",
      do_not_retry: false,
      updated_at: "2026-08-26T13:00:00.000Z",
    });
    expect(JSON.stringify(metadata.native_voice)).not.toContain(previousCallSid);
  });
});
