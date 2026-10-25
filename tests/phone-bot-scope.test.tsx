import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PhonePage from "../src/pages/PhonePage";

vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

vi.mock("../src/hooks/useChannelEntitlements", () => ({
  useChannelEntitlements: () => ({
    status: "ready",
    data: { channels: h.channels },
    includes: (channel: string) => h.channels.includes(channel),
    retry: vi.fn(),
  }),
}));
const h = vi.hoisted(() => ({
  channels: ["voice", "email", "sms"] as string[],
  params: new URLSearchParams(),
  agents: [] as Array<{ id: string; name: string }>,
  loading: false,
  degraded: false,
  refresh: vi.fn(),
}));

vi.mock("react-router", () => ({
  Navigate: "navigate",
  useSearchParams: () => [
    h.params,
    (update: (current: URLSearchParams) => URLSearchParams) => {
      h.params = update(new URLSearchParams(h.params));
    },
  ],
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: h.agents,
    loading: h.loading,
    degraded: h.degraded,
    refresh: h.refresh,
  }),
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace-shell" }));
vi.mock("../src/components/PhoneSetupPanel", () => ({ default: "phone-setup" }));
vi.mock("../src/components/PhoneCallHistoryPanel", () => ({ default: "call-history" }));
vi.mock("../src/components/outbound/OutboundHub", () => ({ default: "outbound-hub" }));
vi.mock("../src/components/AppointmentsPanel", () => ({ default: "appointments" }));
vi.mock("../src/components/layout/WorkspaceControlBand", () => ({ default: "control-band" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspaceOperateIntro: "page-intro",
  WorkspacePageFrame: "page-frame",
}));
vi.mock("../src/components/layout/WorkspaceTabStrip", () => ({ WorkspaceTabStrip: "tab-strip" }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "status-notice" }));

type Props = {
  children?: ReactNode;
  tabs?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  action?: ReactNode;
  title?: string;
  value?: string;
  agentId?: string | null;
  initialAgentId?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onSelect?: (id: string) => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [
    node,
    ...["children", "tabs", "primary", "secondary", "action"].flatMap((key) =>
      elements(node.props[key as keyof Props] as ReactNode),
    ),
  ];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const render = () => elements(PhonePage());
const scope = (nodes: Element[]) => nodes.find((node) => node.type === "select");
const history = (nodes: Element[]) => nodes.find((node) => node.type === "call-history");
const button = (nodes: Element[], label: string) =>
  nodes.find((node) => node.type === "button" && text(node) === label);

beforeEach(() => {
  h.channels = ["voice", "email", "sms"];
  h.params = new URLSearchParams({ agent: "bot-b", tab: "logs" });
  h.agents = [{ id: "bot-a", name: "Alpha" }];
  h.loading = false;
  h.degraded = false;
  h.refresh.mockReset();
});

describe("explicit Calls Bot scope", () => {
  it("does not mount all-Bot history when a requested Bot cannot be verified", () => {
    h.degraded = true;
    const nodes = render();
    expect(history(nodes)).toBeUndefined();
    expect(scope(nodes)?.props.value).toBe("bot-b");
    expect(nodes.some((node) => node.props.title === "Selected Bot Unavailable")).toBe(true);
    expect(button(nodes, "Retry")).toBeDefined();
    expect(button(nodes, "All Bots")).toBeDefined();
  });

  it("waits for a cold roster, then mounts only the requested Bot's history", () => {
    h.agents = [];
    h.loading = true;
    expect(history(render())).toBeUndefined();
    expect(scope(render())?.props.value).toBe("bot-b");
    h.agents = [{ id: "bot-b", name: "Bravo" }];
    h.loading = false;
    expect(history(render())?.props.agentId).toBe("bot-b");
  });

  it("retries verification without changing the requested Bot", () => {
    h.degraded = true;
    button(render(), "Retry")?.props.onClick?.();
    expect(h.refresh).toHaveBeenCalledOnce();
    expect(h.params.get("agent")).toBe("bot-b");
    h.agents.push({ id: "bot-b", name: "Bravo" });
    h.degraded = false;
    expect(history(render())?.props.agentId).toBe("bot-b");
  });

  it("requires an explicit All Bots action before widening an unavailable scope", () => {
    expect(history(render())).toBeUndefined();
    button(render(), "All Bots")?.props.onClick?.();
    expect(h.params.has("agent")).toBe(false);
    expect(history(render())?.props.agentId).toBeNull();
  });

  it("allows choosing another known Bot from an unavailable selection", () => {
    scope(render())?.props.onChange?.({ target: { value: "bot-a" } });
    expect(h.params.get("agent")).toBe("bot-a");
    expect(history(render())?.props.agentId).toBe("bot-a");
  });

  it("keeps unscoped history available even when roster metadata fails", () => {
    h.params.delete("agent");
    h.degraded = true;
    expect(history(render())?.props.agentId).toBeNull();
  });

  it("does not replace a Studio-to-Lines Bot request with another Bot", () => {
    h.params.set("tab", "setup");
    expect(render().some((node) => node.type === "phone-setup")).toBe(false);
    h.agents.push({ id: "bot-b", name: "Bravo" });
    expect(render().find((node) => node.type === "phone-setup")?.props.initialAgentId).toBe(
      "bot-b",
    );
  });

  it("keeps the chosen Bot when History opens Reviewed calls", () => {
    h.agents.push({ id: "bot-b", name: "Bravo" });
    const tabs = render().find((node) => node.type === "tab-strip");
    expect(tabs).toBeDefined();
    tabs!.props.onSelect!("outbound");
    expect(h.params.get("agent")).toBe("bot-b");
    const nodes = render();
    expect(nodes.find((node) => node.type === "outbound-hub")?.props.initialAgentId).toBe("bot-b");
    expect(scope(nodes)?.props["aria-label"]).toBe("Choose Bot for Outbound");
    expect(scope(nodes)?.props.value).toBe("bot-b");
  });

  it("blocks Reviewed calls until the requested Bot is verified or deliberately cleared", () => {
    h.params.set("tab", "outbound");
    h.loading = true;
    expect(render().some((node) => node.type === "outbound-hub")).toBe(false);
    h.loading = false;
    expect(render().some((node) => node.type === "outbound-hub")).toBe(false);
    expect(render().some((node) => node.props.title === "Selected Bot Unavailable")).toBe(true);
    expect(h.params.get("agent")).toBe("bot-b");
    const clear = button(render(), "All Bots");
    expect(clear).toBeDefined();
    clear!.props.onClick!();
    expect(h.params.has("agent")).toBe(false);
    expect(render().find((node) => node.type === "outbound-hub")?.props.initialAgentId).toBe("");
  });

  it("forwards the retired Analytics tab to account-wide call analytics in Insights", () => {
    h.params.set("tab", "analytics");
    h.degraded = true;
    const redirect = render().find((node) => node.type === "navigate");
    expect(redirect?.props).toMatchObject({
      to: "/insights?tab=performance&view=calls",
      replace: true,
    });
  });
});

it("an Email package preserves call history but does not mount phone provisioning or outbound controls", () => {
  h.channels = ["email"];
  h.params = new URLSearchParams({ tab: "logs" });
  expect(history(render())).toBeDefined();
  h.params = new URLSearchParams({ tab: "setup" });
  expect(render().some((node) => node.type === "phone-setup")).toBe(false);
  h.params = new URLSearchParams({ tab: "outbound" });
  expect(render().some((node) => node.type === "outbound-hub")).toBe(false);
});
