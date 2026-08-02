import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * The label tier — eyebrows, overlines, KPI captions — has exactly one origin:
 * the `overline` entry in `design-tokens/wireline.tokens.json`, surfaced as
 * `--wireline-typography-overline-letterSpacing`.
 *
 * It did not. Measuring the rendered DOM across seven marketing routes and
 * twelve authenticated routes found the same eyebrow classes resolving to four
 * different trackings — 0.045em, 0.09em, 0.1em, and 0.14em — because three
 * places claimed ownership of the value:
 *
 *   - `.wl-eyebrow` and `.wl-metric-tile__label` hardcoded 0.14em
 *   - `uppercase-system.css` declared its own `--wl-caps-label-tracking: 0.12em`
 *   - the token itself, read correctly by seven other stylesheets
 *
 * On top of that, the marketing eyebrow rule was written with `:where()`, which
 * contributes no specificity — so the cased body-copy rule above it won for
 * every eyebrow authored as `<p class="wl-eyebrow">`, and forty-three of them
 * rendered at body tracking instead of the label tier.
 *
 * With the token as the sole source, the tier now measures one value
 * everywhere. This contract keeps it that way.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const TOKEN = "var(--wireline-typography-overline-letterSpacing)";

/**
 * Rules whose selector is specifically about the label tier. Matched on class
 * and custom-property names only: a bare `label` element in a selector list, or
 * a `:not(.wl-eyebrow)` exclusion, is not a label-tier definition — the mobile
 * reset for Studio and Settings contains both and is deliberately a reset.
 */
const LABEL_SELECTOR =
  /(^|[\s,>+~])\.[\w-]*(eyebrow|overline|stitch-label|tile__label|wl-label|insight-label|micro-badge)[\w-]*/i;

describe("label tracking single-source contract", () => {
  it("routes the caps-system label variable at the design token", () => {
    const caps = source("src/styles/uppercase-system.css");
    expect(caps, "--wl-caps-label-tracking must read the overline token").toMatch(
      new RegExp(`--wl-caps-label-tracking:\\s*${TOKEN.replace(/[()-]/g, "\\$&")}`),
    );
  });

  it("declares the label variable exactly once, from the token", () => {
    /*
     * Checking only the base declaration is what let the responsive override
     * survive the unification. `--wl-caps-label-tracking` was re-set to a
     * literal 0.11em inside the <=640px block — written back when the base was
     * 0.12em, so it read as a tightening. Re-pointing the base at the 0.09em
     * token left the literal behind, and mobile silently became *wider* than
     * desktop: the responsive intent inverted exactly where horizontal space is
     * scarcest, and the fourth source of truth the change had just removed came
     * straight back.
     *
     * Deriving the breakpoint value from the token instead fixed the inversion
     * but not the split: only uppercase-system.css reads
     * `--wl-caps-label-tracking`, while the seven stylesheets unified alongside
     * it read the token directly and never see a breakpoint. Measured on a 390px
     * viewport, that came back as 0.08em and 0.09em side by side — two values
     * for one tier again, from the opposite direction.
     *
     * So the variable is declared once, full stop. A responsive override cannot
     * reach the whole tier, which makes any second declaration a split by
     * construction rather than by oversight.
     */
    const declarations: string[] = [];
    for (const file of globSync("src/styles/**/*.css", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      .sort()) {
      const css = source(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of css.matchAll(/--wl-caps-label-tracking:\s*([^;]+);/g)) {
        declarations.push(`${file}: --wl-caps-label-tracking: ${match[1].trim()}`);
      }
    }

    expect(
      declarations,
      `the label-tier variable must be declared exactly once, from the token:\n${declarations.join("\n")}`,
    ).toEqual([`src/styles/uppercase-system.css: --wl-caps-label-tracking: ${TOKEN}`]);
  });

  it("never hardcodes a letter-spacing on a label-tier rule", () => {
    const offenders: string[] = [];
    const files = globSync("src/styles/**/*.css", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      // The generated token file is where a literal value legitimately lives.
      .filter((f) => !f.endsWith("tokens.generated.css"))
      .sort();

    expect(files.length, "no stylesheets found -- the glob changed").toBeGreaterThan(20);

    for (const file of files) {
      // Strip comments first. A comment sits between the previous `}` and the
      // next selector, so leaving them in makes prose like "Eyebrow — mono
      // section labels" read as part of the following rule's selector.
      const css = source(file).replace(/\/\*[\s\S]*?\*\//g, "");
      // Walk rule blocks so a selector is judged with its own declarations.
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, selector, body] = match;
        // `:not(.wl-eyebrow)` names the tier in order to exclude it. Drop the
        // negations so an opt-out rule is not read as a tier definition.
        const positive = selector.replace(/:not\(\s*[^()]*\)/g, "");
        if (!LABEL_SELECTOR.test(positive)) continue;
        const ls = body.match(/letter-spacing:\s*([^;]+);/);
        if (!ls) continue;
        const value = ls[1].trim();
        if (value.startsWith("var(")) continue;
        offenders.push(`${file}: ${selector.trim().slice(0, 60)} -> ${value}`);
      }
    }

    expect(
      offenders,
      `label-tier rules with a hardcoded tracking instead of the token:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("gives the marketing eyebrow rule enough specificity to actually apply", () => {
    const polish = source("src/styles/e2e-design-polish.css");

    // `:where()` here loses to `.marketing-surface :is(p, li, ...)` above it,
    // which is how the rule silently stopped styling `<p class="wl-eyebrow">`.
    expect(polish, "the marketing eyebrow rule must not use :where()").not.toMatch(
      /\.marketing-surface\s+:where\(\s*\.wl-eyebrow/,
    );
    expect(polish, "the marketing eyebrow rule must use :is() to carry specificity").toMatch(
      /\.marketing-surface\s+:is\(\s*\.wl-eyebrow/,
    );
  });

  it("carries the whole eyebrow tier past the marketing body rule, not part of it", () => {
    /*
     * The specificity fix above was applied to the two classes that happened to
     * be measured at the time. The tier has ten members, and the other eight
     * lose the same race for the same reason: one class cannot outrank
     * `.marketing-surface :is(p, li, …)`. Re-measuring the rendered DOM found 88
     * label-tier nodes still at 0.045em body tracking across eight public routes
     * — `.wl-stitch-eyebrow`, `.wl-stitch-label` and `.text-eyebrow` authored as
     * paragraphs.
     *
     * Membership is read from the tier's own definition in uppercase-system.css
     * rather than restated here, so adding a class to the tier and forgetting the
     * marketing surface fails this test instead of shipping.
     */
    const caps = source("src/styles/uppercase-system.css");
    const polish = source("src/styles/e2e-design-polish.css");

    const tierRule = caps
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/((?:\.[\w-]+,\s*)*\.text-eyebrow)\s*\{[^}]*?text-transform: uppercase;[^}]*\}/);
    expect(tierRule, "could not find the eyebrow tier definition").not.toBeNull();

    const members = (tierRule?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.startsWith("."));
    expect(members.length, "the eyebrow tier should list several classes").toBeGreaterThan(5);

    // The eyebrow rule is the `.marketing-surface :is(…)` group that names the
    // tier — not the cased body rule, which shares the same selector shape and
    // is what the tier has to outrank in the first place.
    const eyebrowRule =
      Array.from(
        polish.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.marketing-surface\s+:is\(([^)]*)\)/g),
        (match) => match[1],
      ).find((group) => group.includes(".wl-eyebrow")) ?? "";
    expect(eyebrowRule, "could not find the marketing eyebrow rule").not.toBe("");

    const missing = members.filter((name) => !eyebrowRule.includes(name));

    expect(
      missing,
      `eyebrow-tier classes the marketing surface leaves at body tracking:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
