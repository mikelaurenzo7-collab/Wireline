import { describe, expect, it } from "vitest";
import { evaluateOutboundConsent } from "../src/lib/tcpa-consent";

describe("outbound consent and opt-out decisions", () => {
  it("requires a marketing opt-out even in a one-party recording state", () => {
    expect(
      evaluateOutboundConsent({
        phone: "+12125550100",
        is_marketing_call: true,
        has_express_written_consent: true,
      }),
    ).toMatchObject({ allowed: true, rule: "one_party", must_offer_opt_out: true });
  });

  it.each(["internal", "federal"] as const)("keeps %s suppression ahead of consent", (list) => {
    expect(
      evaluateOutboundConsent({
        phone: "+12125550100",
        is_marketing_call: true,
        has_express_written_consent: true,
        is_internal_dnc: list === "internal",
        is_federal_dnc: list === "federal",
      }),
    ).toMatchObject({ allowed: false, abort_reason: `dnc_${list}` });
  });
});
