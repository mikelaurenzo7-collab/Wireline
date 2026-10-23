import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpCoachingPanel from "../src/components/settings/McpCoachingPanel";
import { MCP_SCOPES } from "../src/lib/chatgpt-mcp";

const h = vi.hoisted(() => ({ cursor: 0, scope: "" }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    return [
      index === 0
        ? false
        : index === 5
          ? [
              {
                client: "Cursor",
                scope: h.scope,
                created_at: "2026-09-01T00:00:00Z",
                expires_at: "2026-10-01T00:00:00Z",
              },
            ]
          : initial,
      vi.fn(),
    ];
  },
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Switch: "switch" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  checked?: boolean;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
const labels = {
  "agents.read": "Read Bot Context",
  "agents.write": "Edit Drafts & Training",
  "demo.voice": "Private Rehearsals",
  "calls.prepare": "Prepare Calls for Review",
  "calls.read": "Read Prepared Call Status",
  "computer.plan": "Plan Computer Tasks",
};
beforeEach(() => {
  h.cursor = 0;
  h.scope = "";
});

describe("connected app permission presentation", () => {
  it.each(MCP_SCOPES)("describes the actual OAuth scope %s", (scope) => {
    h.scope = scope;
    const disclosure = elements(McpCoachingPanel()).find((node) => node.type === "details")!;
    expect(text(disclosure)).toContain(labels[scope]);
    expect(text(disclosure)).not.toContain(scope);
  });

  it("preserves unknown scopes and the off-by-default Training permission boundary", () => {
    h.scope = "future.scope";
    const view = McpCoachingPanel();
    const nodes = elements(view);
    expect(text(nodes.find((node) => node.type === "details"))).toContain("future.scope");
    expect(nodes.find((node) => node.type === "switch")?.props).toMatchObject({
      "aria-label": "Allow connected apps to save Training",
      "aria-describedby": "mcp-coaching-writes-help",
      checked: false,
    });
    expect(text(view)).toContain("Off by default. No live calls or Bot activation.");
  });
});
