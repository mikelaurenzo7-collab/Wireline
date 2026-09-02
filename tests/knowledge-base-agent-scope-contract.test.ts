import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/KnowledgeBaseClaude.tsx"),
  "utf8",
);

function section(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Knowledge Base Bot-scope fencing", () => {
  it("invalidates pending operations and visible data before a Bot switch paints", () => {
    const scope = section("useLayoutEffect(() => {", "const startAgentOperation");
    expect(scope).toContain("activeAgentIdRef.current = agentId");
    expect(scope).toContain("agentScopeRevisionRef.current += 1");
    expect(scope).toContain("controller.abort()");
    expect(scope).toContain("setConfig(null)");
    expect(scope).toContain("setUploading(false)");
    expect(scope).toContain("setKnowledgeBusyId(null)");
  });

  it("binds load, upload, edit, and delete completions to the initiating Bot scope", () => {
    const operation = section("const startAgentOperation", "useEffect(() => {");
    expect(operation).toContain("requestedAgentId = agentId");
    expect(operation).toContain("activeAgentIdRef.current === requestedAgentId");
    expect(operation).toContain("agentScopeRevisionRef.current === scopeRevision");

    for (const [start, end] of [
      ["useEffect(() => {", "async function ingest"],
      ["async function ingest", "function onFilePick"],
      ["async function saveKnowledgeEntry", "async function removeKnowledgeEntry"],
      ["async function removeKnowledgeEntry", "const knowledge ="],
    ] as const) {
      const block = section(start, end);
      expect(block, start).toContain("operation.controller.signal");
      expect(block, start).toContain("operation.isCurrent()");
      expect(block, start).toContain("operation.finish()");
    }
  });
});
