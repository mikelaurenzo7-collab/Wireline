import { describe, it, expect } from "vitest";
import {
  STATE_CONSENT_RULES,
  CONSENT_RULE_VERSION,
  extractAreaCode,
  inferStateFromPhone,
  getConsentRuleForPhone,
  buildConsentDisclosure,
  evaluateOutboundConsent,
  listTwoPartyStates,
  buildConsentLedgerRow,
  detectOptOut,
} from "./tcpa-consent";

describe("tcpa-consent · area code parsing", () => {
  it("strips leading +1", () => {
    expect(extractAreaCode("+14155551234")).toBe("415");
  });
  it("strips leading 1", () => {
    expect(extractAreaCode("14155551234")).toBe("415");
  });
  it("handles formatted numbers", () => {
    expect(extractAreaCode("(415) 555-1234")).toBe("415");
    expect(extractAreaCode("415-555-1234")).toBe("415");
    expect(extractAreaCode("415.555.1234")).toBe("415");
  });
  it("returns null for non-NANP-shaped numbers", () => {
    expect(extractAreaCode("+44 20 7946 0958")).toBeNull();
    expect(extractAreaCode("")).toBeNull();
    expect(extractAreaCode(null)).toBeNull();
    expect(extractAreaCode(undefined)).toBeNull();
  });
});

describe("tcpa-consent · jurisdiction inference", () => {
  it("maps known area codes to states", () => {
    expect(inferStateFromPhone("+14155551234")).toBe("CA");
    expect(inferStateFromPhone("+12127701234")).toBe("NY");
    expect(inferStateFromPhone("+13125551234")).toBe("IL");
  });
  it("returns null for unknown area codes", () => {
    expect(inferStateFromPhone("+19995551234")).toBeNull();
  });
  it("classifies CA as two-party (Penal Code §632)", () => {
    expect(STATE_CONSENT_RULES.CA).toBe("two_party");
  });
  it("classifies IL, FL, MA, MD, MI, MT, NH, NV, OR, PA, WA, CT as two-party", () => {
    for (const s of ["IL", "FL", "MA", "MD", "MI", "MT", "NH", "NV", "OR", "PA", "WA", "CT"]) {
      expect(STATE_CONSENT_RULES[s]).toBe("two_party");
    }
  });
  it("classifies TX, NY, GA, OH, NC as one-party", () => {
    for (const s of ["TX", "NY", "GA", "OH", "NC"]) {
      expect(STATE_CONSENT_RULES[s]).toBe("one_party");
    }
  });
});

describe("tcpa-consent · rule resolution", () => {
  it("returns inferred=true when state was identified", () => {
    const r = getConsentRuleForPhone("+14155551234");
    expect(r).toEqual({ rule: "two_party", state: "CA", inferred: true });
  });
  it("falls back to safer two_party when state unknown", () => {
    const r = getConsentRuleForPhone("+19995551234");
    expect(r.rule).toBe("two_party");
    expect(r.inferred).toBe(false);
  });
  it("respects override default rule", () => {
    const r = getConsentRuleForPhone("+19995551234", "one_party");
    expect(r.rule).toBe("one_party");
  });
});

describe("tcpa-consent · disclosure script", () => {
  it("two-party disclosure offers an opt-out path", () => {
    const text = buildConsentDisclosure({ rule: "two_party", businessName: "Acme Co" });
    expect(text.toLowerCase()).toContain("recorded");
    expect(text.toLowerCase()).toMatch(/prefer not|opt[- ]out|stop the recording/i);
    expect(text).toContain("Acme Co");
  });
  it("one-party disclosure is a notice, not a request", () => {
    const text = buildConsentDisclosure({ rule: "one_party", businessName: "Acme Co" });
    expect(text.toLowerCase()).toContain("recorded");
    expect(text).toContain("Acme Co");
  });
  it("falls back to a generic business name when missing", () => {
    const text = buildConsentDisclosure({ rule: "two_party" });
    expect(text).toContain("this business");
  });
});

describe("tcpa-consent · outbound consent gate", () => {
  it("aborts when number is on internal DNC", () => {
    const d = evaluateOutboundConsent({ phone: "+14155551234", is_internal_dnc: true });
    expect(d.allowed).toBe(false);
    expect(d.abort_reason).toBe("dnc_internal");
  });
  it("aborts marketing calls to federal DNC", () => {
    const d = evaluateOutboundConsent({
      phone: "+14155551234",
      is_federal_dnc: true,
      is_marketing_call: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.abort_reason).toBe("dnc_federal");
  });
  it("allows servicing calls to federal DNC", () => {
    const d = evaluateOutboundConsent({
      phone: "+14155551234",
      is_federal_dnc: true,
      is_marketing_call: false,
    });
    expect(d.allowed).toBe(true);
  });
  it("aborts marketing calls without express written consent", () => {
    const d = evaluateOutboundConsent({
      phone: "+14155551234",
      is_marketing_call: true,
      has_express_written_consent: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.abort_reason).toBe("no_express_consent_required");
  });
  it("permits marketing calls when prior express written consent recorded", () => {
    const d = evaluateOutboundConsent({
      phone: "+14155551234",
      is_marketing_call: true,
      has_express_written_consent: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.must_disclose_recording).toBe(true);
    expect(d.must_offer_opt_out).toBe(true); // CA = two-party
    expect(d.disclosure_script).toBeDefined();
  });
  it("does not require opt-out path in one-party state", () => {
    // 212 = NY = one-party
    const d = evaluateOutboundConsent({ phone: "+12125551234", is_marketing_call: false });
    expect(d.must_offer_opt_out).toBe(false);
  });
});

describe("tcpa-consent · ledger row builder", () => {
  it("builds an append-only ledger row with all fields", () => {
    const row = buildConsentLedgerRow({
      user_id: "user-1",
      call_id: "call-1",
      customer_number: "+14155551234",
      event: "disclosure_played",
      rule_version: CONSENT_RULE_VERSION,
      rule: "two_party",
      state: "CA",
      metadata: { agent_id: "agent-1" },
    });
    expect(row.user_id).toBe("user-1");
    expect(row.event).toBe("disclosure_played");
    expect(row.rule).toBe("two_party");
    expect(row.state).toBe("CA");
    expect(row.metadata).toEqual({ agent_id: "agent-1" });
    expect(typeof row.created_at).toBe("string");
  });
  it("defaults metadata to empty object when omitted", () => {
    const row = buildConsentLedgerRow({
      user_id: "u",
      customer_number: "+14155551234",
      event: "consent_granted",
      rule_version: CONSENT_RULE_VERSION,
      rule: "two_party",
      state: "CA",
    });
    expect(row.metadata).toEqual({});
    expect(row.call_id).toBeNull();
  });
});

describe("tcpa-consent · transcript opt-out detection", () => {
  it("matches explicit recording opt-out phrases", () => {
    expect(detectOptOut("Please do not record this call.").found).toBe(true);
    expect(detectOptOut("Stop recording, thank you.").found).toBe(true);
    expect(detectOptOut("I do not consent to this recording.").found).toBe(true);
    expect(detectOptOut("Don't record me.").found).toBe(true);
  });
  it("matches DNC-list requests", () => {
    expect(detectOptOut("Please remove me from your call list.").found).toBe(true);
    expect(detectOptOut("Put me on your do-not-call list.").found).toBe(true);
  });
  it("does NOT match soft objections", () => {
    expect(detectOptOut("I'm not interested, thanks.").found).toBe(false);
    expect(detectOptOut("Please call me back later.").found).toBe(false);
    expect(detectOptOut("").found).toBe(false);
    expect(detectOptOut(null).found).toBe(false);
  });
});

describe("tcpa-consent · two-party state list", () => {
  it("includes the well-known two-party jurisdictions", () => {
    const list = listTwoPartyStates();
    for (const s of ["CA", "FL", "IL", "MA", "MD", "MI", "PA", "WA"]) {
      expect(list).toContain(s);
    }
  });
  it("is sorted", () => {
    const list = listTwoPartyStates();
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
  });
});
