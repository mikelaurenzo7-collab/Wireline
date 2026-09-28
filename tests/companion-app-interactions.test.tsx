import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientAppsPage from "../src/pages/ClientAppsPage";
import BrowserCommandInstallPage from "../src/pages/BrowserCommandInstallPage";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => void | (() => void)>,
  dependencies: [] as Array<readonly unknown[]>,
  cleanups: [] as Array<void | (() => void)>,
  cursor: 0,
  refCursor: 0,
  effectCursor: 0,
  location: { pathname: "/settings/apps", hash: "", key: "first" },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useEffect(run: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = h.effectCursor++;
    if (
      !h.dependencies[index] ||
      dependencies.some((value, i) => !Object.is(value, h.dependencies[index][i]))
    ) {
      h.dependencies[index] = dependencies;
      h.effects.push(() => {
        const cleanup = h.cleanups[index];
        if (cleanup) cleanup();
        h.cleanups[index] = run();
      });
    }
  },
}));
vi.mock("react-router", () => ({ Link: "a", useLocation: () => h.location }));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "frame",
  WorkspacePageIntro: "intro",
}));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "tabs" }));
vi.mock("../src/components/settings/McpCoachingPanel", () => ({ default: "mcp-panel" }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Badge: "badge" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  href?: string;
  to?: string;
  ref?: { current: unknown };
  role?: string;
  download?: boolean;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  onClick?: () => void;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
const focus = vi.fn();
const setup = { open: false, scrollIntoView: vi.fn(), querySelector: vi.fn(() => ({ focus })) };
const writeText = vi.fn();
function render(component = ClientAppsPage) {
  h.cursor = h.refCursor = h.effectCursor = 0;
  const nodes = elements(component());
  nodes.forEach((node) => {
    if (node.type === "details" && node.props.ref) node.props.ref.current = setup;
  });
  h.effects.splice(0).forEach((run) => run());
  return nodes;
}
async function clickCopy() {
  render().find((node) => node.props["aria-label"] === "Copy MCP URL")!.props.onClick!();
  for (let index = 0; index < 4; index++) await Promise.resolve();
  return render();
}
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.dependencies = [];
  h.cleanups = [];
  h.location = { pathname: "/settings/apps", hash: "", key: "first" };
  setup.open = false;
  vi.clearAllMocks();
  writeText.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});
afterEach(() => {
  h.cleanups.forEach((cleanup) => cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("companion app setup interactions", () => {
  it("opens and focuses Connection Setup for an incoming setup hash", () => {
    h.location.hash = "#chatgpt-mcp";
    render();
    vi.runAllTimers();
    expect(setup.open).toBe(true);
    expect(setup.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("reopens a manually closed setup disclosure when the same hash is selected again", () => {
    h.location.hash = "#chatgpt-mcp";
    render();
    vi.runAllTimers();
    setup.open = false;
    h.location = { ...h.location, key: "second" };
    render();
    vi.runAllTimers();
    expect(setup.open).toBe(true);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("leaves setup collapsed on an ordinary Apps visit", () => {
    const nodes = render();
    vi.runAllTimers();
    expect(setup.open).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(nodes.find((node) => node.props["aria-label"] === "Set Up: ChatGPT")?.props.to).toBe(
      "/settings/apps#chatgpt-mcp",
    );
  });

  it("keeps the URL available after clipboard denial and recovers on retry", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    let nodes = await clickCopy();
    expect(
      nodes.some((node) => node.props.role === "alert" && text(node).includes("manually")),
    ).toBe(true);
    expect(
      nodes.some((node) => node.type === "code" && text(node) === "https://botbound.app/mcp"),
    ).toBe(true);
    expect(
      nodes.find((node) => node.props.role === "status") &&
        text(nodes.find((node) => node.props.role === "status")),
    ).toBe("");
    nodes = await clickCopy();
    expect(writeText).toHaveBeenLastCalledWith("https://botbound.app/mcp");
    expect(nodes.some((node) => node.props.role === "alert")).toBe(false);
    expect(text(nodes.find((node) => node.props.role === "status"))).toBe("MCP URL copied.");
  });

  it("offers manual copying when the browser does not expose a clipboard API", async () => {
    vi.stubGlobal("navigator", {});
    expect((await clickCopy()).some((node) => node.props.role === "alert")).toBe(true);
  });

  it("changes the package, instructions, and restart warning with the selected browser", () => {
    let nodes = render(BrowserCommandInstallPage);
    expect(nodes.find((node) => node.props.download)?.props.href).toBe(
      "/downloads/botbound-command-chromium.zip",
    );
    expect(
      nodes.some((node) => node.type === "li" && text(node).includes("brave://extensions")),
    ).toBe(true);
    expect(nodes.some((node) => node.props.role === "note")).toBe(false);
    nodes.find((node) => node.type === "button" && text(node) === "Firefox")!.props.onClick!();
    nodes = render(BrowserCommandInstallPage);
    expect(nodes.find((node) => node.props.download)?.props.href).toBe(
      "/downloads/botbound-command-firefox.zip",
    );
    expect(
      nodes.find((node) => node.type === "button" && text(node) === "Firefox")?.props[
        "aria-pressed"
      ],
    ).toBe(true);
    expect(
      nodes.some((node) => node.type === "li" && text(node).includes("Load Temporary Add-on")),
    ).toBe(true);
    expect(
      nodes.some(
        (node) => node.props.role === "note" && text(node).includes("removes it on restart"),
      ),
    ).toBe(true);
    nodes.find((node) => node.type === "button" && text(node) === "Chrome, Edge, Brave & Opera")!
      .props.onClick!();
    nodes = render(BrowserCommandInstallPage);
    expect(nodes.find((node) => node.props.download)?.props.href).toBe(
      "/downloads/botbound-command-chromium.zip",
    );
    expect(nodes.some((node) => node.props.role === "note")).toBe(false);
  });
});
