import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runnerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "director-stream-runner.ts"),
  "utf8",
);

describe("director-stream-runner", () => {
  it("does not mark volatile Director system prompts for Anthropic prompt caching", () => {
    expect(runnerSource).not.toContain("cacheSystem: true");
  });
});
