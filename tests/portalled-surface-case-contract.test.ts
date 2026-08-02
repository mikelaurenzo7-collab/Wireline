import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Every surface Radix portals to `document.body` has to mark itself as cased,
 * because it cannot inherit the marker.
 *
 * The cased tiers are scoped to a marker class that sits on the <App/> root
 * (src/App.tsx). A portal moves its content out to `document.body`, making it a
 * *sibling* of that root rather than a descendant — so no cased tier ever
 * reached a modal, dropdown, select, sheet or tooltip. Every one of them
 * rendered in sentence case with default tracking while the page behind it
 * shouted.
 *
 * Measured directly, same markup in both positions:
 *
 *   [data-slot="dialog-title"]   inside the marker: uppercase   portalled: none
 *   label                        inside the marker: 1.44px      portalled: -0.08px
 *   button                       inside the marker: 0.72px      portalled: -0.08px
 *
 * The rule written for exactly this case — "a sentence-case modal heading
 * sitting above cased labels and buttons was the one place the system visibly
 * broke" — could never fire, because it requires an ancestor a portal
 * guarantees is absent.
 *
 * There are two markers, and the difference is the whole point of this file.
 * `wl-ui-caps` is the application shell: foundation.css gives it layout
 * (`position: relative`, `height: 100%`, `overflow: hidden`). `wl-cased` is
 * presentation only. Reaching for the shell class on portalled content is the
 * obvious move and it breaks the modal — it overrides `fixed`, so the panel
 * leaves the centre of the viewport entirely.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("portalled surface case contract", () => {
  it("marks every portalled surface as cased", () => {
    const unmarked: string[] = [];
    const shellClassed: string[] = [];

    for (const file of globSync("src/components/{atoms,ui}/**/*.tsx", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      .sort()) {
      const text = source(file);
      // A file that mounts a Radix Portal owns at least one detached subtree.
      if (!/<\w*Portal|Primitive\.Portal/.test(text)) continue;
      if (!text.includes("wl-cased")) unmarked.push(file);
      if (/className[\s\S]{0,200}?\bwl-ui-caps\b/.test(text)) shellClassed.push(file);
    }

    expect(
      unmarked,
      "these portal to document.body and so render outside every cased tier:\n" +
        `${unmarked.join("\n")}\n` +
        "Add `wl-cased` to the portalled content root (not the overlay).",
    ).toEqual([]);

    /*
     * The marker must be `wl-cased`, never the shell class.
     *
     * `wl-ui-caps` is the application layout root, not a neutral marker:
     * foundation.css gives it `position: relative`, `height: 100%`,
     * `min-height: 100dvh` and `overflow: hidden`. Putting it on a portalled
     * dialog overrides the `fixed` positioning the modal depends on, stretches
     * the panel to the full viewport, and removes its own scrolling — measured
     * as a dialog landing at y=900 in a 900px viewport, i.e. entirely below the
     * fold, with the overlay dimming an apparently empty screen.
     */
    expect(
      shellClassed,
      "portalled surfaces must not wear the shell layout class:\n" +
        `${shellClassed.join("\n")}\n` +
        "`wl-ui-caps` carries app layout (position/height/overflow); use `wl-cased`.",
    ).toEqual([]);
  });

  it("keeps the case tiers reachable from either marker", () => {
    // The tiers are scoped to `:is(.wl-ui-caps, .wl-cased)` so the shell and a
    // portalled subtree share one definition rather than two that can drift.
    const caps = source("src/styles/uppercase-system.css");
    expect(caps).toMatch(/:is\(\.wl-ui-caps, \.wl-cased\)\s*\{[^}]*--wl-caps-title-tracking/);
    expect(caps.match(/:is\(\.wl-ui-caps, \.wl-cased\)/g)?.length ?? 0).toBeGreaterThan(5);
  });

  it("keeps the dialog-title rule reachable from a portalled dialog", () => {
    // The rule is scoped to a `.wl-ui-caps` ancestor, and the shared Dialog atom
    // is what supplies that ancestor for portalled content. If either half
    // moves, modal headings silently fall out of the title tier again.
    //
    // All three modal-title slots, not just the one: once the portalled roots
    // joined the case system, an unnamed slot took the generic heading rule's
    // weight and line-height while getting none of its case — the side effect
    // without the intent.
    const caps = source("src/styles/uppercase-system.css");
    const titleRule =
      caps
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(
          /:is\(\.wl-ui-caps, \.wl-cased\)\s+:is\(([^)]*data-slot="dialog-title"[^)]*)\)\s*\{[^}]*\}/,
        )?.[0] ?? "";
    expect(titleRule, "the modal-title rule must be present").not.toBe("");
    for (const slot of ["dialog-title", "alert-dialog-title", "sheet-title"]) {
      expect(titleRule, `${slot} must join the cased title tier`).toContain(
        `[data-slot="${slot}"]`,
      );
    }
    expect(titleRule).toContain("text-transform: uppercase");

    const dialog = source("src/components/atoms/Dialog.tsx");
    expect(dialog).toMatch(/data-slot="dialog-content"/);
    expect(dialog, "the dialog content root must mark itself cased").toMatch(/cn\(\s*"wl-cased"/);
  });
});
