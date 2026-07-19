import { describe, expect, it } from "vitest";

import {
  MIN_ACCENT_CONTRAST_ON_LIGHT,
  MIN_ACCENT_CONTRAST_ON_OBSIDIAN,
  WIRELINE_LETTERPRESS_PALETTE,
  isValidAccentHex,
} from "../src/lib/shareable-artifact/design";

describe("shareable-artifact accent validator", () => {
  it("accepts each theme's own default action against its own canvas", () => {
    expect(isValidAccentHex(WIRELINE_LETTERPRESS_PALETTE.obsidian.actionPrimary, "obsidian")).toBe(
      true,
    );
    expect(
      isValidAccentHex(WIRELINE_LETTERPRESS_PALETTE.coolLight.actionPrimary, "coolLight"),
    ).toBe(true);
  });

  it("rejects colors that fail contrast against the chosen ground", () => {
    // Deep obsidian shade — invisible on obsidian.
    expect(isValidAccentHex("#0A0A0F", "obsidian")).toBe(false);
    // Pale ivory — invisible on light ground.
    expect(isValidAccentHex("#F5F4F0", "coolLight")).toBe(false);
  });

  it("rejects malformed hex strings without throwing", () => {
    expect(isValidAccentHex("#ABC", "obsidian")).toBe(false);
    expect(isValidAccentHex("rgb(255,0,0)", "obsidian")).toBe(false);
    expect(isValidAccentHex(null, "obsidian")).toBe(false);
    expect(isValidAccentHex(undefined, "obsidian")).toBe(false);
    expect(isValidAccentHex("", "obsidian")).toBe(false);
  });

  it("pins the contrast floor so a future edit cannot silently loosen it", () => {
    expect(MIN_ACCENT_CONTRAST_ON_OBSIDIAN).toBeGreaterThanOrEqual(3.0);
    expect(MIN_ACCENT_CONTRAST_ON_LIGHT).toBeGreaterThanOrEqual(3.0);
  });
});
