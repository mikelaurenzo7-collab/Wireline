import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Every surface Radix portals to `document.body` has to carry `wl-ui-caps`
 * itself, because it cannot inherit it.
 *
 * The cased tiers are all scoped under `.wl-ui-caps`, which sits on the <App/>
 * root (src/App.tsx). A portal moves its content out to `document.body`, making
 * it a *sibling* of that root rather than a descendant — so no cased tier ever
 * reached a modal, dropdown, select, sheet or tooltip. Every one of them
 * rendered in sentence case with default tracking while the page behind it
 * shouted.
 *
 * Measured directly, same markup in both positions:
 *
 *   [data-slot="dialog-title"]   inside .wl-ui-caps: uppercase   portalled: none
 *   label                        inside .wl-ui-caps: 1.44px      portalled: -0.08px
 *   button                       inside .wl-ui-caps: 0.72px      portalled: -0.08px
 *
 * The rule written for exactly this case — "a sentence-case modal heading
 * sitting above cased labels and buttons was the one place the system visibly
 * broke" — could never fire, because it requires an ancestor a portal
 * guarantees is absent. The class also carries the `--wl-caps-*` custom
 * properties the tiers read, so without it the tracking variables do not even
 * resolve.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("portalled surface case contract", () => {
  it("carries the caps root on every portalled surface", () => {
    const offenders: string[] = [];

    for (const file of globSync("src/components/{atoms,ui}/**/*.tsx", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      .sort()) {
      const text = source(file);
      // A file that mounts a Radix Portal owns at least one detached subtree.
      if (!/<\w*Portal|Primitive\.Portal/.test(text)) continue;
      if (!text.includes("wl-ui-caps")) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      "these portal to document.body and so render outside every cased tier:\n" +
        `${offenders.join("\n")}\n` +
        "Add `wl-ui-caps` to the portalled content root (not the overlay).",
    ).toEqual([]);
  });

  it("keeps the dialog-title rule reachable from a portalled dialog", () => {
    // The rule is scoped to a `.wl-ui-caps` ancestor, and the shared Dialog atom
    // is what supplies that ancestor for portalled content. If either half
    // moves, modal headings silently fall out of the title tier again.
    const caps = source("src/styles/uppercase-system.css");
    expect(caps).toMatch(/\.wl-ui-caps \[data-slot="dialog-title"\]/);

    const dialog = source("src/components/atoms/Dialog.tsx");
    expect(dialog).toMatch(/data-slot="dialog-content"/);
    expect(dialog, "the dialog content root must carry the caps class").toMatch(
      /cn\(\s*"wl-ui-caps"/,
    );
  });
});
