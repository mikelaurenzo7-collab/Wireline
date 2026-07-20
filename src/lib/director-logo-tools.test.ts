import { describe, expect, it } from "vitest";
import {
  checkCreativePolicy,
  exportBrandPack,
  generateLogoConcepts,
  missingCreativeFields,
  normalizeVectorSvg,
  parseCreativeBriefFromText,
} from "./director-logo-tools";

describe("director-logo-tools", () => {
  it("extracts creative brief fields from text", () => {
    const brief = parseCreativeBriefFromText(
      "make me a logo. style: minimalist. colors: navy + gold. usage: website",
      [],
    );
    expect(brief.style).toMatch(/minimalist/i);
    expect(brief.colors).toMatch(/navy/i);
    expect(brief.usage).toMatch(/website/i);
  });

  it("detects missing brief fields", () => {
    expect(missingCreativeFields({ prompt: "x" })).toEqual(["style", "colors", "usage"]);
  });

  it("extracts creative brief fields from natural language follow-ups", () => {
    const brief = parseCreativeBriefFromText(
      "Minimal geometric mark. Deep blue (#1a3a5c) and electric teal (#00d4aa). Primary use: website header and app icon.",
      [
        {
          role: "operator",
          content: "Design a modern logo for Wireline — an AI voice agent platform.",
        },
      ],
    );
    expect(brief.prompt).toMatch(/modern logo for Wireline/i);
    expect(brief.style).toMatch(/minimal|geometric/i);
    expect(brief.colors).toMatch(/#1a3a5c/i);
    expect(brief.usage).toMatch(/website header|app icon/i);
    expect(missingCreativeFields(brief)).toEqual([]);
  });

  it("blocks trademark-heavy prompts", () => {
    const policy = checkCreativePolicy("Design something like the Nike swoosh for my store");
    expect(policy.allowed).toBe(false);
    expect(policy.trademarkRisk).toBe(true);
  });

  it("generates three concepts by default with self-critique", () => {
    const generated = generateLogoConcepts({
      prompt: "Wireline Labs",
      style: "modern",
      colors: "blue and silver",
      usage: "app icon",
      concepts: 3,
    });
    expect(generated.concepts).toHaveLength(3);
    expect(generated.chosenConceptId.length).toBeGreaterThan(5);
    expect(generated.critique.toLowerCase()).toContain("best concept");
  });

  it("rejects vector svg payloads containing scripts", () => {
    expect(() =>
      normalizeVectorSvg('<svg><script>alert(1)</script><rect width="1" height="1"/></svg>'),
    ).toThrow(/forbidden script/i);
  });

  it("builds a zip brand pack", () => {
    const pack = exportBrandPack({
      conceptId: "c1",
      conceptName: "Concept 1",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      prompt: "Wireline",
      style: "modern",
      colors: "blue",
      usage: "web",
    });
    expect(pack.zip.slice(0, 2).toString("utf8")).toBe("PK");
    expect(pack.metadata.formats).toEqual(["svg", "png", "pdf"]);
  });
});
