import { describe, expect, it } from "vitest";
import {
  extractAreaCode,
  inferStateFromPhone,
  getConsentRuleForPhone,
  buildConsentDisclosure,
  evaluateOutboundConsent,
  listTwoPartyStates,
  buildConsentLedgerRow,
  detectOptOut,
  detectRecordingDisclosure,
} from "./tcpa-consent";

describe("TCPA Consent Compliance", () => {
  describe("extractAreaCode", () => {
    it("extracts 3-digit area code from various phone formats", () => {
      expect(extractAreaCode("+1 (206) 555-0199")).toBe("206");
      expect(extractAreaCode("206-555-0199")).toBe("206");
      expect(extractAreaCode("12065550199")).toBe("206");
      expect(extractAreaCode("2065550199")).toBe("206");
      expect(extractAreaCode(null)).toBeNull();
      expect(extractAreaCode(undefined)).toBeNull();
      expect(extractAreaCode("123")).toBeNull();
    });
  });

  describe("inferStateFromPhone", () => {
    it("identifies state for known area codes", () => {
      expect(inferStateFromPhone("2065550199")).toBe("WA");
      expect(inferStateFromPhone("+1 (212) 555-1212")).toBe("NY");
      expect(inferStateFromPhone("9995551212")).toBeNull(); // Unknown area code
      expect(inferStateFromPhone("")).toBeNull();
    });
  });

  describe("getConsentRuleForPhone", () => {
    it("returns correct consent rule and state mapping", () => {
      // CA is two-party state
      expect(getConsentRuleForPhone("+1 (213) 555-1111")).toEqual({
        rule: "two_party",
        state: "CA",
        inferred: true,
      });

      // NY is one-party state
      expect(getConsentRuleForPhone("+1 (212) 555-1111")).toEqual({
        rule: "one_party",
        state: "NY",
        inferred: true,
      });

      // Unknown state should fall back to default (default is two_party)
      expect(getConsentRuleForPhone("+1 (999) 555-1111")).toEqual({
        rule: "two_party",
        state: null,
        inferred: false,
      });

      // Override default rule for unknown state
      expect(getConsentRuleForPhone("+1 (999) 555-1111", "one_party")).toEqual({
        rule: "one_party",
        state: null,
        inferred: false,
      });
    });
  });

  describe("buildConsentDisclosure", () => {
    it("generates correct disclosure script for one-party and two-party rules", () => {
      const onePartyScript = buildConsentDisclosure({
        rule: "one_party",
        businessName: "Wireline LLC",
      });
      expect(onePartyScript).toContain("may be recorded");
      expect(onePartyScript).toContain("Wireline LLC");

      const twoPartyScript = buildConsentDisclosure({
        rule: "two_party",
        businessName: "Wireline LLC",
      });
      expect(twoPartyScript).toContain("is being recorded");
      expect(twoPartyScript).toContain("Wireline LLC");
      expect(twoPartyScript).toContain("prefer not to be recorded");

      // Default business name fallback
      const defaultScript = buildConsentDisclosure({ rule: "one_party" });
      expect(defaultScript).toContain("this business");
    });
  });

  describe("evaluateOutboundConsent", () => {
    it("denies dialing if number is on internal DNC list", () => {
      const decision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_internal_dnc: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.abort_reason).toBe("dnc_internal");
    });

    it("denies dialing if number is on federal DNC list for marketing calls", () => {
      const decision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_federal_dnc: true,
        is_marketing_call: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.abort_reason).toBe("dnc_federal");
    });

    it("allows dialing if number is on federal DNC but call is service-related", () => {
      const decision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_federal_dnc: true,
        is_marketing_call: false,
      });
      expect(decision.allowed).toBe(true);
      expect(decision.disclosure_script).toBeDefined();
    });

    it("denies dialing for marketing call if no express written consent exists", () => {
      const decision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_marketing_call: true,
        has_express_written_consent: false,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.abort_reason).toBe("no_express_consent_required");
    });

    it("allows dialing when marketing consent is valid or it is not marketing", () => {
      const mktDecision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_marketing_call: true,
        has_express_written_consent: true,
      });
      expect(mktDecision.allowed).toBe(true);

      const serviceDecision = evaluateOutboundConsent({
        phone: "+1 (206) 555-0199",
        is_marketing_call: false,
      });
      expect(serviceDecision.allowed).toBe(true);
    });

    it("determines correct recording consent flags and disclosure scripts", () => {
      // CA is two-party, should require opt-out
      const caDecision = evaluateOutboundConsent({ phone: "+1 (213) 555-1111" });
      expect(caDecision.allowed).toBe(true);
      expect(caDecision.rule).toBe("two_party");
      expect(caDecision.must_disclose_recording).toBe(true);
      expect(caDecision.must_offer_opt_out).toBe(true);
      expect(caDecision.disclosure_script).toContain("prefer not to be recorded");

      // NY is one-party, should not require opt-out
      const nyDecision = evaluateOutboundConsent({ phone: "+1 (212) 555-1111" });
      expect(nyDecision.allowed).toBe(true);
      expect(nyDecision.rule).toBe("one_party");
      expect(nyDecision.must_disclose_recording).toBe(true);
      expect(nyDecision.must_offer_opt_out).toBe(false);
      expect(nyDecision.disclosure_script).not.toContain("prefer not to be recorded");
    });
  });

  describe("listTwoPartyStates", () => {
    it("returns sorted list of two-party states", () => {
      const states = listTwoPartyStates();
      expect(states).toContain("CA");
      expect(states).toContain("FL");
      expect(states).toContain("MA");
      // Check sorting
      const sorted = [...states].sort();
      expect(states).toEqual(sorted);
    });
  });

  describe("buildConsentLedgerRow", () => {
    it("correctly builds consent ledger row record", () => {
      const entry = {
        user_id: "user-123",
        call_id: "call-456",
        customer_number: "+12065550199",
        event: "disclosure_played" as const,
        rule_version: "2025.1",
        rule: "two_party" as const,
        state: "WA",
        metadata: { source: "outbound-campaign" },
      };

      const row = buildConsentLedgerRow(entry);
      expect(row.user_id).toBe("user-123");
      expect(row.call_id).toBe("call-456");
      expect(row.customer_number).toBe("+12065550199");
      expect(row.event).toBe("disclosure_played");
      expect(row.rule_version).toBe("2025.1");
      expect(row.rule).toBe("two_party");
      expect(row.state).toBe("WA");
      expect(row.metadata).toEqual({ source: "outbound-campaign" });
      expect(row.created_at).toBeDefined();
    });
  });

  describe("detectOptOut", () => {
    it("detects explicit recording opt-out request phrases", () => {
      expect(detectOptOut("please do not record this call").found).toBe(true);
      expect(detectOptOut("stop recording now please").found).toBe(true);
      expect(detectOptOut("don't record me").found).toBe(true);
      expect(detectOptOut("turn off the recording").found).toBe(true);
      expect(detectOptOut("remove me from your call list").found).toBe(true);
      expect(detectOptOut("put me on your do not call list").found).toBe(true);
      expect(detectOptOut("i do not consent to recording").found).toBe(true);

      // Negatives / unrelated phrases
      expect(detectOptOut("I'm not interested").found).toBe(false);
      expect(detectOptOut("hello who is this?").found).toBe(false);
      expect(detectOptOut("").found).toBe(false);
      expect(detectOptOut(null).found).toBe(false);
    });
  });

  describe("detectRecordingDisclosure", () => {
    it("matches the disclosure language the agent actually says", () => {
      // The exact phrasings buildConsentDisclosure() generates:
      const twoParty = buildConsentDisclosure({ rule: "two_party", businessName: "Acme" });
      const oneParty = buildConsentDisclosure({ rule: "one_party", businessName: "Acme" });
      expect(detectRecordingDisclosure(twoParty).found).toBe(true);
      expect(detectRecordingDisclosure(oneParty).found).toBe(true);
    });

    it("matches inside a fuller transcript and returns an evidence excerpt", () => {
      const transcript =
        "Agent: Hi there! Quick note before we begin: this call is being recorded " +
        "for quality, training, and compliance purposes by Acme. Customer: sure, go ahead.";
      const r = detectRecordingDisclosure(transcript);
      expect(r.found).toBe(true);
      expect(r.excerpt).toContain("recorded");
      expect((r.excerpt || "").length).toBeLessThanOrEqual(120);
    });

    it("matches common paraphrases an LLM agent may use", () => {
      expect(detectRecordingDisclosure("just so you know, this call may be recorded").found).toBe(
        true,
      );
      expect(detectRecordingDisclosure("your call is being recorded today").found).toBe(true);
      expect(detectRecordingDisclosure("everything here is recorded for quality").found).toBe(true);
    });

    it("does NOT treat a generic mention of recording as a disclosure", () => {
      // A caller asking about recording is not the agent disclosing it.
      expect(detectRecordingDisclosure("are you guys recording right now?").found).toBe(false);
      expect(detectRecordingDisclosure("I record all my own calls too").found).toBe(false);
      expect(detectRecordingDisclosure("hello, how can I help?").found).toBe(false);
      expect(detectRecordingDisclosure("").found).toBe(false);
      expect(detectRecordingDisclosure(null).found).toBe(false);
      expect(detectRecordingDisclosure(undefined).found).toBe(false);
    });
  });
});
