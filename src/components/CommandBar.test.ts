import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTextEntryTarget, resolveCommandSelectionIndex } from "./CommandBar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "CommandBar.tsx"), "utf8");

describe("CommandBar keyboard helpers", () => {
  it("ignores global shortcuts while the operator is typing", () => {
    expect(
      isTextEntryTarget({ tagName: "INPUT", isContentEditable: false, getAttribute: () => null }),
    ).toBe(true);
    expect(
      isTextEntryTarget({ tagName: "DIV", isContentEditable: true, getAttribute: () => null }),
    ).toBe(true);
    expect(
      isTextEntryTarget({
        tagName: "DIV",
        isContentEditable: false,
        getAttribute: () => "textbox",
      }),
    ).toBe(true);
    expect(
      isTextEntryTarget({ tagName: "BUTTON", isContentEditable: false, getAttribute: () => null }),
    ).toBe(false);
  });

  it("wraps list navigation for arrow keys and supports Home/End", () => {
    expect(resolveCommandSelectionIndex(0, "ArrowDown", 3)).toBe(1);
    expect(resolveCommandSelectionIndex(0, "ArrowUp", 3)).toBe(2);
    expect(resolveCommandSelectionIndex(1, "Home", 3)).toBe(0);
    expect(resolveCommandSelectionIndex(1, "End", 3)).toBe(2);
  });
});

describe("CommandBar structure", () => {
  it("uses reduced-motion fallbacks for palette transitions", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("reduceMotion ? { opacity: 1 }");
  });

  it("exposes combobox/listbox semantics for screen readers", () => {
    expect(src).toContain('role="combobox"');
    expect(src).toContain('role="listbox"');
    expect(src).toContain('role="option"');
    expect(src).toContain("aria-activedescendant");
  });
});
