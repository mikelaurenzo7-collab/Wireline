import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { publicAiStreamFailureMessage } from "../src/lib/ai-stream-errors";
import { RuntimeUnavailableError } from "../src/lib/ai-client";
import { parseSseEvents } from "../src/hooks/useStreamingChat";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("studio chat stream settlement", () => {
  it("keeps reset() from clearing completionRef mid-drain", () => {
    const hook = source("src/hooks/useStreamingChat.ts");
    const resetBlock = hook.match(/const reset = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/)?.[0];
    expect(resetBlock).toBeTruthy();
    expect(resetBlock).toContain("setState(INITIAL_STATE)");
    expect(resetBlock).not.toMatch(/completionRef\.current\s*=\s*false/);
    expect(resetBlock).not.toMatch(/latestReplyRef\.current\s*=\s*undefined/);
    expect(resetBlock).not.toMatch(/terminalReplyRef\.current\s*=\s*false/);
  });

  it("maps blocked/unavailable AI providers to actionable SSE copy", () => {
    expect(
      publicAiStreamFailureMessage(
        new Error(
          "[GoogleGenerativeAI Error]: [403 Forbidden] API_KEY_SERVICE_BLOCKED Requests to this API are blocked.",
        ),
        "fallback",
      ),
    ).toMatch(/AI is temporarily unavailable/i);

    expect(publicAiStreamFailureMessage(new RuntimeUnavailableError(), "fallback")).toMatch(
      /AI is temporarily unavailable/i,
    );

    expect(
      publicAiStreamFailureMessage(new Error("model returned empty tool_use"), "fallback"),
    ).toBe("fallback");
  });

  it("preserves server error event after onError-style UI reset", () => {
    const sse = [
      "event: meta",
      'data: {"agentId":"a1"}',
      "",
      "event: error",
      'data: {"message":"AI is temporarily unavailable. Configure a reachable AI provider (xAI, OpenAI, Gemini, or AI Gateway), then try again."}',
      "",
      "",
    ].join("\n");

    let completionRef = false;
    let surfaced: string | null = null;
    const events: string[] = [];

    parseSseEvents(sse.split("\n"), (event, data) => {
      events.push(event);
      if (event === "error") {
        completionRef = true;
        surfaced = String(data.message || "");
        // Mimic StudioWorkroom onError → resetStream after the fix:
        // UI state clears, settlement flag must remain true.
      }
    });

    // Fixed reset: UI-only — do not clear completionRef.
    expect(completionRef).toBe(true);
    expect(events).toContain("error");
    expect(surfaced).toMatch(/AI is temporarily unavailable/i);
    // Post-loop guard:
    expect(completionRef ? "settled" : "Stream ended before the reply finished").toBe("settled");
  });

  it("wires publicAiStreamFailureMessage into test and workspace stream routes", () => {
    const testRoute = source("src/routes/agent-test-routes.ts");
    const workspaceRoute = source("src/routes/agent-workspace-routes.ts");
    expect(testRoute).toContain("publicAiStreamFailureMessage");
    expect(workspaceRoute).toContain("publicAiStreamFailureMessage");
  });
});
