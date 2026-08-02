import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Every `wl-*` class a component wears has to be a class the design system
 * actually declares.
 *
 * This is the hole that let the label tier rot for months. `.wl-label`,
 * `.wl-label-muted`, `.wl-micro-badge` and `.wl-insight-label` were defined by
 * the legacy design system and went out with it in "Remove legacy Wireline
 * design system CSS". The 176 call sites across 80 components stayed. Nothing
 * declared them any more, so every one of them silently fell back to inherited
 * body type — 16px, weight 400, Inter, no tracking, no caps — where an 11px
 * mono uppercase micro-label was intended. A `.wl-label` chip on /templates
 * rendered the word "voice" at full body size inside a pill built for a
 * micro-label.
 *
 * Every case audit before this one read stylesheets and came back clean,
 * because a stylesheet cannot show you the absence of a rule. Only measuring
 * the rendered DOM, or this contract, can: the defect lives in the gap between
 * what the JSX asks for and what the CSS defines, which is a place neither side
 * can see alone.
 *
 * Deleting a rule is therefore never complete on its own — the call sites have
 * to go with it, or the class has to be redeclared.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Class names assembled at runtime (`wl-reveal-${i}`, `wl-chip--${tone}`) leave
 * only their prefix in the source, so a trailing `-` marks a fragment rather
 * than a class. `wl-caps-*` and `wl-font-*` are custom-property names, not
 * classes — they appear in `var(--wl-caps-…)`, never in a `className`.
 */
const isFragmentOrVariable = (name: string) => name.endsWith("-") || /^wl-(caps|font)-/.test(name);

describe("design system class definition contract", () => {
  const declared = (() => {
    let css = "";
    for (const file of globSync("src/**/*.css", { cwd: root })) css += source(file);
    for (const file of globSync("public/*.css", { cwd: root })) css += source(file);
    // Self-contained HTML generators (shareable artifacts, MCP widget shells,
    // the ops design module) ship their own <style> block in a TS template
    // literal. Those declarations are real; they are just not in a .css file.
    for (const file of globSync("src/**/*.{ts,tsx}", { cwd: root })) {
      const text = source(file);
      if (/letter-spacing|font-size:/.test(text)) css += text;
    }
    const names = new Set<string>();
    for (const match of css.matchAll(/\.(wl-[a-zA-Z0-9_-]+)/g)) names.add(match[1]);
    return names;
  })();

  /**
   * A BEM block is live when any of its elements or modifiers is styled:
   * `.wl-wire-step` carries no rule of its own, but `.wl-wire-step__marker` and
   * `.wl-wire-step--settled` both do, so the block name is load-bearing.
   */
  const isDeclared = (name: string) =>
    declared.has(name) ||
    [...declared].some((known) => known.startsWith(`${name}__`) || known.startsWith(`${name}--`));

  it("declares every wl-* class that a component wears", () => {
    const orphans = new Map<string, string[]>();

    for (const file of globSync("src/**/*.tsx", { cwd: root }).sort()) {
      const text = source(file);
      for (const match of text.matchAll(/\b(wl-[a-zA-Z0-9_-]+)/g)) {
        const name = match[1];
        if (isFragmentOrVariable(name) || isDeclared(name)) continue;
        const seen = orphans.get(name) ?? [];
        if (!seen.includes(file)) seen.push(file);
        orphans.set(name, seen);
      }
    }

    const report = [...orphans.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, files]) => `${name} — worn by ${files.length} file(s): ${files.join(", ")}`);

    expect(
      report,
      `wl-* classes worn in JSX that no stylesheet declares.\n` +
        `Either declare the class in the design system or take it off the elements:\n${report.join("\n")}`,
    ).toEqual([]);
  });

  it("declares the label tier the workspace and marketing surfaces both read", () => {
    // Named explicitly because these four carry the most call sites in the
    // product, and because their absence was invisible to every stylesheet-only
    // audit that ran before it was measured in the browser.
    const caps = source("src/styles/uppercase-system.css");
    for (const name of ["wl-label", "wl-label-muted", "wl-micro-badge", "wl-insight-label"]) {
      expect(declared.has(name), `${name} must be declared by the design system`).toBe(true);
    }

    // The tier reads the overline token like every other member of it, rather
    // than restating a value.
    expect(caps).toMatch(
      /\.wl-label,\s*\.wl-label-muted,\s*\.wl-micro-badge,\s*\.wl-insight-label\s*\{[^}]*?letter-spacing: var\(--wl-caps-label-tracking\);/,
    );
    expect(caps).toMatch(
      /\.wl-label,\s*\.wl-label-muted,\s*\.wl-micro-badge,\s*\.wl-insight-label\s*\{[^}]*?text-transform: uppercase;/,
    );

    // Declared inside `@layer components` on purpose. Unlayered rules beat
    // Tailwind utilities in this build, and these call sites carry their own
    // colors and weights (`wl-label text-brand`, `wl-label-muted
    // hover:text-brand`). Unlayered, the tier would silently flatten 176
    // intentional choices; layered, it supplies the floor and the call site
    // keeps what it asked for.
    const layerBody = caps.match(/@layer components\s*\{([\s\S]*)\}/)?.[1] ?? "";
    expect(layerBody, "the label tier must sit in @layer components").toContain(".wl-label,");
  });
});
