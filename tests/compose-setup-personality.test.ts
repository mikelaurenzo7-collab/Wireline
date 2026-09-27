import { describe, expect, it } from "vitest";
import {
  composeSetupPersonality,
  readSetupDeliveryTone,
} from "../src/lib/compose-setup-personality";
import {
  isSavedRuntimeReviewRequired,
  removesRegulatedTemplateProvenance,
} from "../src/lib/runtime-template-personality";

describe("delivery-tone section replacement", () => {
  it("preserves every later custom section while replacing only the old tone", () => {
    const tail =
      "## ACCOUNT HOLDER INSTRUCTIONS\nAsk before booking.\n\n### Escalation\nNever promise availability.";
    const existing = `Warm support role.\n\n## DELIVERY TONE\nClear.\nKeep sentences short.\n\n${tail}`;
    const result = composeSetupPersonality(existing, "Polished", true);
    expect(result).toBe(
      `Warm support role.\n\n## DELIVERY TONE\nPolished. Concise, useful, and discreet.\n\n${tail}`,
    );
    expect(readSetupDeliveryTone(result)).toBe("Polished. Concise, useful, and discreet.");
    expect(composeSetupPersonality(result, "Polished", true)).toBe(result);
  });

  it("preserves regulated provenance when it follows the delivery tone", () => {
    const existing =
      "Saved role\n\n## DELIVERY TONE\nClear.\n\n## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.";
    const result = composeSetupPersonality(existing, "Warm", true);
    expect(removesRegulatedTemplateProvenance(existing, result)).toBe(false);
    expect(isSavedRuntimeReviewRequired(result, "scheduler")).toBe(true);
    expect(result).toContain("## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.");
  });

  it("recognizes legacy casing and CRLF without discarding later headings", () => {
    const existing =
      "Role\r\n\r\n## delivery tone\r\nClear.\r\n\r\n# Business policy\r\nKeep this exact instruction.";
    const result = composeSetupPersonality(existing, "Warm", false);
    expect(result).toContain("# Business policy\r\nKeep this exact instruction.");
    expect(result).toContain("## DELIVERY TONE\nWarm. Concise, useful, and discreet.");
    expect(result).not.toContain("Clear.");
  });

  it("handles a tone-only document without introducing leading blank lines", () => {
    expect(composeSetupPersonality("## DELIVERY TONE\nOld tone.", "Warm", false)).toBe(
      "## DELIVERY TONE\nWarm. Concise, useful, and discreet.",
    );
  });
});
