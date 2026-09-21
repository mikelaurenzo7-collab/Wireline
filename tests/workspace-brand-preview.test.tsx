import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceBrandEditor from "../src/components/settings/WorkspaceBrandEditor";
import { BRAND } from "../src/constants/brand-colors";

function render(primaryColor: string) {
  return renderToStaticMarkup(
    <WorkspaceBrandEditor
      settings={{ brand_name: "Example", brand_logo_url: "", primary_color: primaryColor }}
      onUpdate={() => {}}
      onSave={() => {}}
    />,
  );
}

describe("workspace brand preview", () => {
  it.each([
    ["#ffffff", "#ffffff", "#000000"],
    ["#000000", "#000000", "#ffffff"],
    ["#7c3aed", "#7c3aed", "#ffffff"],
    ["#A78BFA", "#A78BFA", "#000000"],
    ["#757575", "#757575", "#ffffff"],
    ["#767676", "#767676", "#000000"],
    ["#fff", "#ffffff", "#000000"],
  ])("keeps both preview labels readable on %s", (draft, background, foreground) => {
    const markup = render(draft);
    const styles = [...markup.matchAll(/<span[^>]*style="([^"]*)"[^>]*>(E|Action)<\/span>/g)];
    expect(styles.map((match) => match[2]).sort()).toEqual(["Action", "E"]);
    for (const [, style] of styles) {
      expect(style).toContain(`background:${background}`);
      expect(style).toContain(`color:${foreground}`);
    }
    expect(markup).not.toContain('aria-invalid="true"');
    expect(markup).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it.each(["", "#7c", "#12zz34", "invalid"])(
    "preserves the editable draft %j with a valid preview",
    (draft) => {
      const markup = render(draft);
      expect(markup).toMatch(
        new RegExp(`aria-label="Primary color hex value"[^>]*value="${draft}"`),
      );
      expect(markup).toMatch(new RegExp(`type="color"[^>]*value="${BRAND.colors.primary}"`));
      expect(markup).toContain(`background:${BRAND.colors.primary}`);
      expect(markup).toContain('aria-invalid="true"');
      expect(markup).toContain("Use a hex color, like #7C3AED.");
      expect(markup).toMatch(/<button[^>]*\sdisabled=""/);
    },
  );
});
