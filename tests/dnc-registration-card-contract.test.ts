import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(resolve(process.cwd(), "src/components/DncRegistrationCard.tsx"), "utf8");

/**
 * The owner subscribes at the registry to whatever they copy from this card,
 * and BotBound screens against whatever the form saves. Those two lists must
 * be the same list, or marketing calls get blocked on area codes the owner
 * actually paid for.
 */
describe("DNC registration card keeps one area-code list", () => {
  it("copies the form's selected codes, never the whole suggestion list", () => {
    expect(card).toContain("copyAreaCodes(chosenCodes.join(", "))");
    expect(card).not.toMatch(/suggestedCodes/);
    expect(card).toContain("disabled={nationwide || chosenCodes.length === 0}");
  });

  it("offers suggestions as toggles that edit the same field", () => {
    expect(card).toContain("aria-pressed={selected}");
    expect(card).toContain("onClick={() => toggleAreaCode(item.code)}");
    expect(card).toContain("setAreaCodes(next.join(", "))");
    // "all" means the nationwide list; chips cannot narrow it by accident.
    expect(card).toContain('parseAreaCodes(areaCodes) === "all"');
    expect(card).toContain("disabled={nationwide}");
  });

  it("tells the owner how many codes they chose against the free allowance", () => {
    expect(card).toContain("${chosenCodes.length} selected. The first ${FREE_AREA_CODES} are free");
  });
});
