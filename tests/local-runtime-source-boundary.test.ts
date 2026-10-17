import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps local model runtimes out of source and application checks", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  expect(read(".gitignore")).toContain("/tmp/");
  expect(read("eslint.config.mjs")).toContain('"tmp/**"');
  expect(read("vitest.config.ts")).toContain('"tmp/**"');
  // Ignored runtime directories must never become a route for unreviewed
  // application code to enter the release: the tracked-file gate rejects them.
  expect(read("scripts/check-source-control-hygiene.mjs")).toContain("/^tmp\\//");
});
