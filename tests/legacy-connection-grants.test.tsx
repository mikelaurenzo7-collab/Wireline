import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, fetch: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = value;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Skeleton: "span" }));
vi.mock("../src/components/molecules", () => ({
  StatusNotice: ({ children, action }: { children: ReactNode; action: ReactNode }) => (
    <div>
      {children}
      {action}
    </div>
  ),
}));

import LegacyConnectionGrants from "../src/components/LegacyConnectionGrants";

type Props = { children?: ReactNode; onClick?: () => unknown; "aria-label"?: string };
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function render() {
  h.cursor = 0;
  return nodes(LegacyConnectionGrants());
}

beforeEach(() => {
  h.states = [null, false, null, null];
  h.fetch.mockReset();
});

describe("saved tool connections", () => {
  it("does not offer unconnected tools", () => {
    h.states[0] = { slack: { connected: false }, microsoft_teams: { connected: false } };
    expect(render()).toEqual([]);
  });

  it("keeps a saved grant visible for disconnect even if platform credentials are unavailable", () => {
    h.states[0] = { slack: { connected: true, configured: false, team: "Example" } };
    const buttons = render().filter((node) => node.type === "button");
    expect(buttons.map((node) => node.props["aria-label"])).toEqual(["Disconnect Slack"]);
    expect(JSON.stringify(render())).not.toContain("Beta");
    expect(JSON.stringify(render())).not.toContain("Connect Slack");
  });

  it("keeps an inactive saved grant available for disconnect", () => {
    h.states[0] = {
      google_sheets: { connected: false, configured: true },
      saved_grants: { google_sheets: true },
    };
    const buttons = render().filter((node) => node.type === "button");
    expect(buttons.map((node) => node.props["aria-label"])).toEqual(["Disconnect Google Sheets"]);
  });

  it("uses the existing disconnect route after explicit confirmation", async () => {
    h.states[0] = { slack: { connected: true } };
    vi.stubGlobal("window", { confirm: () => true });
    h.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    h.fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await render()
      .find((node) => node.props["aria-label"] === "Disconnect Slack")
      ?.props.onClick?.();
    await vi.waitFor(() =>
      expect(h.fetch).toHaveBeenCalledWith("/api/oauth/slack/disconnect", { method: "POST" }),
    );
    vi.unstubAllGlobals();
  });
});
