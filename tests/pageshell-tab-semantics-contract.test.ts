import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/PageShell.tsx", "utf8").replace(/\r\n/g, "\n");

describe("PageShell tab semantics and keyboard contract", () => {
  it("gives desktop and mobile tabs unique, viewport-specific identifiers", () => {
    expect(source).toContain('id={`pageshell-tab-desktop-${tab.id}`}');
    expect(source).toContain('id={`pageshell-tab-mobile-${tab.id}`}');
    expect(source).not.toContain('id={`pageshell-tab-${tab.id}`}');
  });

  it("names the active panel without referencing a hidden viewport tab", () => {
    expect(source).toContain('aria-label={activeTab.label}');
    expect(source).not.toContain('aria-labelledby={`pageshell-tab-${activeTab.id}`}');
  });

  it("moves focus and visibility with keyboard tab selection", () => {
    expect(source).toContain("const activateTabFromKeyboard = useCallback(");
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("nextButton?.focus()");
    expect(source).toContain('nextButton?.scrollIntoView({ block: "nearest", inline: "nearest" })');
    expect(source).toContain("activateTabFromKeyboard(event, i, desktopTabListRef.current)");
    expect(source).toContain("activateTabFromKeyboard(event, i, mobileTabListRef.current)");
  });

  it("labels both tablists and keeps action triggers comfortably touchable", () => {
    expect(source.match(/aria-label="Page sub-navigation"/g)).toHaveLength(2);
    expect(source).not.toContain("data-no-min-touch");
    expect(source.match(/aria-label="Page actions"/g)).toHaveLength(4);
    expect(source.match(/w-11 h-11/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("uses bounded transitions on stable tab controls", () => {
    expect(source.match(/transition-\[background-color,border-color,color,box-shadow,transform\]/g)).toHaveLength(
      2,
    );
  });
});
