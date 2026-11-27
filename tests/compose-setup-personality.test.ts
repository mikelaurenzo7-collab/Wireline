import { describe, expect, it } from "vitest";
import {
  composeSetupPersonality,
  personalityForPrompt,
  readSetupDeliveryTone,
  resolveDeliveryToneLabel,
} from "../src/lib/compose-setup-personality";
import { composeAgentPersonality } from "../src/lib/agent-personality";
import {
  isSavedRuntimeReviewRequired,
  removesRegulatedTemplateProvenance,
} from "../src/lib/runtime-template-personality";

describe("the tone an owner chose reaches the prompt", () => {
  it("leads with the chosen tone when the role text alone overflows the cut", () => {
    // A Bot whose saved role text is long: the tone is written after it.
    const role =
      `You are an elite receptionist. ${"Handle the call completely. ".repeat(70)}`.trim();
    const saved = composeSetupPersonality(role, "Warm");
    expect(saved.indexOf("## DELIVERY TONE")).toBeGreaterThan(1_500);
    // Cutting the document from the front is what dropped the tone.
    expect(saved.slice(0, 1_500)).not.toContain("Warm. Concise, useful, and discreet.");
    const prompt = personalityForPrompt(saved, 1_500);
    expect(prompt.startsWith("Delivery tone: Warm. Concise, useful, and discreet.")).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(1_500);
    // The heading is not repeated, and the role text follows as far as it fits.
    expect(prompt).not.toContain("## DELIVERY TONE");
    expect(prompt).toContain(role.slice(0, 200));
  });

  it("fits a new Bot's whole brief and its tone, and never names the platform as the Bot", () => {
    for (const isBusinessAgent of [true, false]) {
      const saved = composeSetupPersonality(composeAgentPersonality({ isBusinessAgent }), "Warm");
      const prompt = personalityForPrompt(saved, 1_500);
      // Nothing is cut: the tone and the last line of the brief are both there.
      expect(prompt.startsWith("Delivery tone: Warm.")).toBe(true);
      expect(prompt).toContain("a clear message for the owner.");
      expect(prompt.length).toBeLessThan(1_500);
      // The Bot is the business's, by the name its owner gave it.
      expect(prompt).not.toMatch(/BotBound|Operator/);
    }
  });

  it("keeps later sections and passes a document with no chosen tone through", () => {
    const withTail =
      "Front desk role.\n\n## DELIVERY TONE\nPolished. Concise, useful, and discreet.\n\n## ACCOUNT HOLDER INSTRUCTIONS\nAsk before booking.";
    expect(personalityForPrompt(withTail, 1_500)).toBe(
      "Delivery tone: Polished. Concise, useful, and discreet.\n\nFront desk role.\n\n## ACCOUNT HOLDER INSTRUCTIONS\nAsk before booking.",
    );
    expect(personalityForPrompt("Warm. Concise. Useful. Business-ready.", 1_500)).toBe(
      "Warm. Concise. Useful. Business-ready.",
    );
    expect(personalityForPrompt("x".repeat(3_000), 1_500)).toHaveLength(1_500);
    expect(personalityForPrompt(null, 1_500)).toBe("");
    expect(personalityForPrompt("  ", 1_500)).toBe("");
    // A tone-only document is just the tone.
    expect(
      personalityForPrompt("## DELIVERY TONE\nEnergetic. Concise, useful, and discreet.", 1_500),
    ).toBe("Delivery tone: Energetic. Concise, useful, and discreet.");
    // A tight budget still carries the tone before anything else.
    expect(personalityForPrompt(withTail, 30)).toBe("Delivery tone: Polished. Conci");
  });
});

describe("delivery-tone section replacement", () => {
  it("makes a new Bot's first selected tone visible on every surface", () => {
    const result = composeSetupPersonality(null, "Warm");
    expect(resolveDeliveryToneLabel(result)).toBe("Warm and natural");
  });

  it("renders the unmarked tone saved by older Studio versions", () => {
    expect(resolveDeliveryToneLabel("Warm. Concise, useful, and discreet.")).toBe(
      "Warm and natural",
    );
    expect(resolveDeliveryToneLabel("Warm support role. Ask for a model number.")).toBe("Not set");
  });

  it("preserves every later custom section while replacing only the old tone", () => {
    const tail =
      "## ACCOUNT HOLDER INSTRUCTIONS\nAsk before booking.\n\n### Escalation\nNever promise availability.";
    const existing = `Warm support role.\n\n## DELIVERY TONE\nClear.\nKeep sentences short.\n\n${tail}`;
    const result = composeSetupPersonality(existing, "Polished");
    expect(result).toBe(
      `Warm support role.\n\n## DELIVERY TONE\nPolished. Concise, useful, and discreet.\n\n${tail}`,
    );
    expect(readSetupDeliveryTone(result)).toBe("Polished. Concise, useful, and discreet.");
    expect(composeSetupPersonality(result, "Polished")).toBe(result);
  });

  it("preserves regulated provenance when it follows the delivery tone", () => {
    const existing =
      "Saved role\n\n## DELIVERY TONE\nClear.\n\n## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.";
    const result = composeSetupPersonality(existing, "Warm");
    expect(removesRegulatedTemplateProvenance(existing, result)).toBe(false);
    expect(isSavedRuntimeReviewRequired(result, "scheduler")).toBe(true);
    expect(result).toContain("## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.");
  });

  it("recognizes legacy casing and CRLF without discarding later headings", () => {
    const existing =
      "Role\r\n\r\n## delivery tone\r\nClear.\r\n\r\n# Business policy\r\nKeep this exact instruction.";
    const result = composeSetupPersonality(existing, "Warm");
    expect(result).toContain("# Business policy\r\nKeep this exact instruction.");
    expect(result).toContain("## DELIVERY TONE\nWarm. Concise, useful, and discreet.");
    expect(result).not.toContain("Clear.");
  });

  it("handles a tone-only document without introducing leading blank lines", () => {
    expect(composeSetupPersonality("## DELIVERY TONE\nOld tone.", "Warm")).toBe(
      "## DELIVERY TONE\nWarm. Concise, useful, and discreet.",
    );
  });
});
