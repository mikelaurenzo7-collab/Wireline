import { describe, it, expect } from "vitest";
import { detectOptOut, evaluateOutboundConsent } from "./tcpa-consent";

describe("tcpa-consent · detectOptOut", () => {
  it("detects recording opt-out phrases", () => {
    expect(detectOptOut("please do not record this conversation").found).toBe(true);
    expect(detectOptOut("Please stop recording now").found).toBe(true);
  });

  it("ignores benign decline-to-buy language", () => {
    expect(detectOptOut("I'm not interested in your services").found).toBe(false);
  });
});

describe("tcpa-consent · evaluateOutboundConsent", () => {
  it("blocks internal DNC flag", () => {
    const d = evaluateOutboundConsent({
      phone: "+14155552671",
      is_internal_dnc: true,
      is_marketing_call: true,
      has_express_written_consent: false,
    });
    expect(d.allowed).toBe(false);
  });

  it("allows informational calls without marketing when not on DNC", () => {
    const d = evaluateOutboundConsent({
      phone: "+13105551234",
      is_internal_dnc: false,
      is_marketing_call: false,
      has_express_written_consent: false,
    });
    expect(d.allowed).toBe(true);
  });
});
