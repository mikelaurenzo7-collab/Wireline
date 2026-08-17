import { describe, expect, it } from "vitest";

import { MCP_COACHING_WRITES_KEY, mcpCoachingWritesEnabled } from "./mcp-coaching-preferences";

describe("mcp coaching write permission", () => {
  it("fails closed unless the owner explicitly enables coaching writes", () => {
    expect(mcpCoachingWritesEnabled(undefined)).toBe(false);
    expect(mcpCoachingWritesEnabled(null)).toBe(false);
    expect(mcpCoachingWritesEnabled({})).toBe(false);
    expect(mcpCoachingWritesEnabled({ [MCP_COACHING_WRITES_KEY]: "true" })).toBe(false);
    expect(mcpCoachingWritesEnabled({ [MCP_COACHING_WRITES_KEY]: true })).toBe(true);
  });
});
