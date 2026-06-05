import { describe, expect, it } from "vitest";
import { accumulateOpenRouterStreamLine } from "./openrouter-structured";

describe("accumulateOpenRouterStreamLine", () => {
  it("accumulates tool call argument fragments by index", () => {
    const args = new Map<number, string>();
    const chunk1 = {
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"reply":' } }] } }],
    };
    const chunk2 = {
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"ok"}' } }] } }],
    };
    accumulateOpenRouterStreamLine(`data: ${JSON.stringify(chunk1)}`, args);
    accumulateOpenRouterStreamLine(`data: ${JSON.stringify(chunk2)}`, args);
    expect(args.get(0)).toBe('{"reply":"ok"}');
  });

  it("ignores malformed JSON and non-data lines", () => {
    const args = new Map<number, string>();
    expect(accumulateOpenRouterStreamLine("event: ping", args)).toBeUndefined();
    expect(accumulateOpenRouterStreamLine("data: not-json", args)).toBeUndefined();
    expect(args.size).toBe(0);
  });

  it("captures usage from stream chunks", () => {
    const args = new Map<number, string>();
    const usage = accumulateOpenRouterStreamLine(
      `data: ${JSON.stringify({ usage: { prompt_tokens: 12, completion_tokens: 34 } })}`,
      args,
    );
    expect(usage).toEqual({ prompt_tokens: 12, completion_tokens: 34 });
  });
});
