import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/workspace-shell.css"), "utf8");

describe("workspace disclosure baseline", () => {
  it("lets component utilities win over the shell's summary baseline", () => {
    // (0,0,2): above Tailwind preflight's `summary` (0,0,1), below any utility (0,1,0).
    expect(css).toContain(":where(.wl-workspace-shell) details > summary {");
    expect(css).toContain(":where(.wl-workspace-shell) details:where([open]) > summary {");
    expect(css).toContain(":where(.wl-workspace-shell) details > summary:hover {");
    expect(css).not.toMatch(/^\.wl-workspace-shell details > summary \{/m);
    expect(css).not.toMatch(/^\.wl-workspace-shell details\[open\] > summary \{/m);
  });

  it("keeps the native marker hidden at full strength", () => {
    expect(css).toContain(".wl-workspace-shell details > summary::-webkit-details-marker,");
  });
});
