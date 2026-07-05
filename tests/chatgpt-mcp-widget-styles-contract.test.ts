import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWirelineMcpWidgetCss,
  WIRELINE_MCP_WIDGET_TOKENS,
} from "../src/lib/wireline-mcp-widget-styles";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("ChatGPT MCP widget Letterpress styling", () => {
  it("exports canonical Wireline Letterpress tokens for MCP HTML widgets", () => {
    expect(WIRELINE_MCP_WIDGET_TOKENS.canvas).toBe("#15130F");
    expect(WIRELINE_MCP_WIDGET_TOKENS.action).toBe("#5BA98A");
    expect(WIRELINE_MCP_WIDGET_TOKENS.shadowCard).toContain("rgba(0, 0, 0");
  });

  it("builds accessible widget CSS with Letterpress surfaces and 44px controls", () => {
    const css = buildWirelineMcpWidgetCss();
    expect(css).toContain("--wl-canvas: #15130F");
    expect(css).toContain("--wl-tertiary:");
    expect(css).toContain("--wl-font-ui");
    expect(css).toContain(".composer");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline: 2px solid var(--wl-action)");
  });

  it("wires shared widget CSS into both MCP HTML builders", () => {
    const launch = read("src/lib/chatgpt-mcp.ts");
    const account = read("src/lib/chatgpt-mcp-account.ts");
    expect(launch).toContain("buildWirelineMcpWidgetCss");
    expect(account).toContain("buildWirelineMcpWidgetCss");
    expect(launch).not.toContain("color-mix(in srgb, CanvasText");
    expect(account).not.toContain("color-mix(in srgb, CanvasText");
  });
});
