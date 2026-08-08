import { describe, expect, it } from "vitest";
import { complianceDisclosure, complianceFirstMessagePrefix } from "../src/lib/agent-runtime";
import { ComplianceModeSchema } from "../src/lib/form-validators";

/**
 * The `tcpa` compliance preset encodes the FCC's Feb 8, 2024 Declaratory Ruling
 * (FCC 24-17): AI-generated voices are "artificial or prerecorded voice" under the
 * TCPA, there is no carve-out for tech that mimics a live agent, and the responsible
 * entity must be identified/disclosed (with an up-front AI disclosure per the FCC
 * 24-84 NPRM). This test executes the previously-untested runtime function so the
 * required disclosures can't silently regress.
 */
describe("complianceDisclosure", () => {
  it("returns an empty block for none / unknown / default modes", () => {
    expect(complianceDisclosure("none")).toBe("");
    expect(complianceDisclosure(null)).toBe("");
    expect(complianceDisclosure(undefined)).toBe("");
    // The DB column defaults to "standard", which is not an enum member — must be inert.
    expect(complianceDisclosure("standard")).toBe("");
  });

  it("emits a non-empty block for each real preset", () => {
    for (const mode of ["hipaa", "pci", "gdpr", "financial", "legal", "tcpa"] as const) {
      expect(complianceDisclosure(mode).length).toBeGreaterThan(0);
    }
  });

  describe("tcpa (AI-voice disclosure)", () => {
    const block = complianceDisclosure("tcpa");
    it("requires an up-front automated/AI disclosure", () => {
      expect(block).toContain("automated AI assistant");
      expect(block.toLowerCase()).toContain("at the start of the call");
    });
    it("requires identifying the responsible business/entity", () => {
      expect(block).toContain("the name of the business you are calling on behalf of");
    });
    it("requires immediate opt-out / do-not-call handling", () => {
      expect(block.toLowerCase()).toContain("do not call");
      expect(block.toLowerCase()).toContain("opt-out");
    });
    it("requires honoring speak-to-a-human requests", () => {
      expect(block.toLowerCase()).toContain("speak to a human");
    });
    it("bars marketing calls without prior express written consent", () => {
      expect(block).toContain("prior express written consent");
    });
  });

  describe("complianceFirstMessagePrefix (spoken opening disclosure)", () => {
    it("prepends an AI disclosure that names the business for tcpa mode", () => {
      const prefix = complianceFirstMessagePrefix("tcpa", "Acme Plumbing");
      expect(prefix).toContain("automated AI assistant");
      expect(prefix).toContain("on behalf of Acme Plumbing");
      expect(prefix.endsWith(" ")).toBe(true); // safe to concatenate before the greeting
    });
    it("still discloses AI when the business name is missing/blank", () => {
      const prefix = complianceFirstMessagePrefix("tcpa", "  ");
      expect(prefix).toContain("automated AI assistant");
      expect(prefix).not.toContain("on behalf of");
    });
    it("returns an empty prefix when no spoken disclosure reason applies", () => {
      for (const mode of [
        "none",
        "hipaa",
        "pci",
        "gdpr",
        "financial",
        "legal",
        null,
        undefined,
      ] as const) {
        expect(complianceFirstMessagePrefix(mode, "Acme")).toBe("");
      }
    });

    it("discloses AI and the responsible business on every outbound AI call", () => {
      const prefix = complianceFirstMessagePrefix("none", "Acme Plumbing", {
        outboundAiCall: true,
      });
      expect(prefix).toContain("automated AI assistant");
      expect(prefix).toContain("on behalf of Acme Plumbing");
    });

    it("adds a recording notice whenever Wireline records the call", () => {
      const prefix = complianceFirstMessagePrefix("none", "Acme Plumbing", {
        recordingEnabled: true,
      });
      expect(prefix).toContain("may be recorded");
      expect(prefix).not.toContain("automated AI assistant");
    });

    it("combines AI and recording disclosures without duplicating the greeting", () => {
      const prefix = complianceFirstMessagePrefix("none", "Acme Plumbing", {
        outboundAiCall: true,
        recordingEnabled: true,
      });
      expect(prefix.match(/automated AI assistant/g)).toHaveLength(1);
      expect(prefix.match(/may be recorded/g)).toHaveLength(1);
      expect(prefix.endsWith(" ")).toBe(true);
    });

    it("announces the opt-out mechanism on telemarketing calls, right after the identity sentence", () => {
      // 47 CFR 64.1200(b)(3) requires telemarketing artificial/prerecorded
      // calls to explain the automated opt-out mechanism within two seconds of
      // the (b)(1) identification — so the announcement must directly follow
      // the identity sentence, ahead of the recording notice.
      const prefix = complianceFirstMessagePrefix("none", "Acme Plumbing", {
        outboundAiCall: true,
        recordingEnabled: true,
        telemarketing: true,
      });
      expect(prefix).toContain("stop calling");
      expect(prefix).toContain("do not call list");
      const identity = prefix.indexOf("automated AI assistant");
      const optOut = prefix.indexOf("stop calling");
      const recording = prefix.indexOf("may be recorded");
      expect(identity).toBeGreaterThan(-1);
      expect(optOut).toBeGreaterThan(identity);
      expect(recording).toBeGreaterThan(optOut);
    });

    it("keeps non-telemarketing outbound calls free of the opt-out announcement", () => {
      const prefix = complianceFirstMessagePrefix("none", "Acme Plumbing", {
        outboundAiCall: true,
        recordingEnabled: true,
      });
      expect(prefix).not.toContain("stop calling");
    });
  });

  it("ComplianceModeSchema accepts tcpa and rejects unknown modes", () => {
    expect(ComplianceModeSchema.safeParse("tcpa").success).toBe(true);
    expect(ComplianceModeSchema.safeParse("hipaa").success).toBe(true);
    expect(ComplianceModeSchema.safeParse("bogus").success).toBe(false);
  });
});
