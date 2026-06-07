import { describe, expect, it } from "vitest";
import {
  buildStitchClarifyReply,
  buildStitchDesignMarkdown,
  hasConfiguredTenantBranding,
  missingStitchBriefFields,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  stitchClarifyingQuestions,
} from "./director-stitch-brief";

describe("director stitch brief", () => {
  const branding = {
    brandName: "Acme Plumbing",
    brandLogoUrl: null,
    primaryColor: "#C45A11",
    businessName: "Acme Plumbing LLC",
    businessType: "home services",
    primaryProduct: "Emergency drain cleaning",
  };

  it("detects configured tenant branding", () => {
    expect(hasConfiguredTenantBranding(branding)).toBe(true);
    expect(
      hasConfiguredTenantBranding({
        ...branding,
        brandName: "Wireline",
        primaryColor: "#8B3FD6",
        businessName: null,
        businessType: null,
        primaryProduct: null,
        brandLogoUrl: null,
      }),
    ).toBe(false);
  });

  it("defaults account branding on when configured", () => {
    expect(resolveUseAccountBranding(undefined, branding)).toBe(true);
    expect(resolveUseAccountBranding({ useAccountBranding: false }, branding)).toBe(false);
  });

  it("asks clarifying questions when the brief is incomplete", () => {
    const brief = parseStitchDesignBrief("Design a landing page", [], {
      brandName: null,
      brandLogoUrl: null,
      primaryColor: null,
      businessName: null,
      businessType: null,
      primaryProduct: null,
    });
    const missing = missingStitchBriefFields(brief, "generate", false);
    expect(missing).toContain("business");
    expect(missing).toContain("audience");
    expect(missing).toContain("goal");
    expect(stitchClarifyingQuestions(missing).length).toBe(3);
  });

  it("skips clarifiers for edit turns with an existing session", () => {
    const brief = parseStitchDesignBrief("Make the hero darker", [], branding);
    expect(missingStitchBriefFields(brief, "edit", true)).toEqual([]);
  });

  it("builds design.md with account branding when enabled", () => {
    const brief = parseStitchDesignBrief(
      "Design a booking landing page for homeowners",
      [],
      branding,
    );
    const md = buildStitchDesignMarkdown({ brief, branding, useAccountBranding: true });
    expect(md).toContain("# Design brief");
    expect(md).toContain("Acme Plumbing");
    expect(md).toContain("#C45A11");
    expect(md).toContain("homeowners");
  });

  it("clarify reply embeds the draft design brief", () => {
    const md = "# Design brief — Test";
    const reply = buildStitchClarifyReply(["audience"], md, true);
    expect(reply).toContain("account branding");
    expect(reply).toContain("```markdown");
    expect(reply).toContain(md);
  });

  it("infers audience, goal, and pages from a rich landing-page prompt (prod dogfood)", () => {
    const prompt =
      "Design a sleek mobile landing page for Laurenzo Cleaning Company — hero, services, testimonials, book-now CTA. Warm trustworthy palette.";
    const brief = parseStitchDesignBrief(prompt, [], {
      brandName: null,
      brandLogoUrl: null,
      primaryColor: null,
      businessName: null,
      businessType: null,
      primaryProduct: null,
    });
    expect(brief.businessName).toBe("Laurenzo Cleaning Company");
    expect(brief.industry).toMatch(/cleaning/i);
    expect(brief.audience).toBe("homeowners");
    expect(brief.primaryGoal).toBe("bookings");
    expect(brief.pages).toMatch(/hero/i);
    expect(missingStitchBriefFields(brief, "generate", false)).toEqual([]);
  });

  it("skips clarifiers in explicit Design mode for substantive prompts", () => {
    const prompt =
      "Design a minimal mobile onboarding screen for a meditation app called Stillmind — soft teal gradient, welcome headline, Get Started button";
    const brief = parseStitchDesignBrief(prompt, [], {
      brandName: null,
      brandLogoUrl: null,
      primaryColor: null,
      businessName: null,
      businessType: null,
      primaryProduct: null,
    });
    expect(brief.businessName).toBe("Stillmind");
    expect(missingStitchBriefFields(brief, "generate", false, { designMode: true })).toEqual([]);
  });

  it("still clarifies on vague one-liners", () => {
    const brief = parseStitchDesignBrief("Design a landing page", [], {
      brandName: null,
      brandLogoUrl: null,
      primaryColor: null,
      businessName: null,
      businessType: null,
      primaryProduct: null,
    });
    expect(missingStitchBriefFields(brief, "generate", false).length).toBeGreaterThan(0);
  });

  it("omits unsafe logo URLs from design.md", () => {
    const brief = parseStitchDesignBrief("Design for homeowners", [], branding);
    const md = buildStitchDesignMarkdown({
      brief,
      branding: { ...branding, brandLogoUrl: "http://127.0.0.1/logo.png" },
      useAccountBranding: true,
    });
    expect(md).not.toContain("127.0.0.1");
  });
});
