import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 2026-Q2 prompt-cache audit (AUDIT_WINS.md §2). Locks in cacheSystem
// on the high-traffic recipe runStructured() call sites so a future edit
// can't silently regress Anthropic prompt caching back to per-call billing.
//
// Each entry is the recipe export name followed by a substring that uniquely
// identifies the corresponding `runStructured({ ... })` call (the tool field
// passed to it).
const REQUIRED_CACHE_RECIPES: ReadonlyArray<{ recipe: string; toolMarker: string }> = [
  { recipe: "brief", toolMarker: "TOOLS.brief" },
  { recipe: "qualify", toolMarker: "TOOLS.qualify" },
  { recipe: "objectionDrill", toolMarker: "TOOLS.objectionDrill" },
  { recipe: "coldEmail", toolMarker: "TOOLS.coldEmail" },
  { recipe: "agentReview", toolMarker: "TOOLS.agentReview" },
  { recipe: "clusterTopics", toolMarker: "TOOLS.topicClusters" },
  { recipe: "clusterFailureModes", toolMarker: "TOOLS.failureModes" },
  { recipe: "findKnowledgeDuplicates", toolMarker: "TOOLS.knowledgeDedupe" },
  { recipe: "qaScore", toolMarker: "TOOLS.qaScore" },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, "claude-recipes.ts"), "utf8");

describe("claude-recipes prompt caching", () => {
  for (const { recipe, toolMarker } of REQUIRED_CACHE_RECIPES) {
    it(`${recipe}: runStructured call wires cacheSystem: true`, () => {
      const idx = SOURCE.indexOf(toolMarker);
      expect(idx, `tool marker ${toolMarker} not found`).toBeGreaterThan(0);
      // Look at the runStructured options object that contains this tool —
      // walk back to the nearest "runStructured" and forward to the closing "})".
      const startCall = SOURCE.lastIndexOf("runStructured", idx);
      const endCall = SOURCE.indexOf("})", idx);
      expect(startCall, "runStructured open not found").toBeGreaterThan(0);
      expect(endCall, "runStructured close not found").toBeGreaterThan(startCall);
      const block = SOURCE.slice(startCall, endCall);
      expect(block, `${recipe} must pass cacheSystem: true (cost saving)`).toMatch(
        /cacheSystem:\s*true/,
      );
    });
  }
});
