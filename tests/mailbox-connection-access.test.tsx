import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MailboxConnectionCard from "../src/components/MailboxConnectionCard";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => unknown>,
  status: "ready" as "ready" | "error" | "loading",
  email: false,
  fetch: vi.fn(),
  retry: vi.fn(),
  listeners: new Map<string, (event: MessageEvent) => void>(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => unknown) => h.effects.push(effect),
}));
vi.mock("../src/hooks/useChannelEntitlements", () => ({
  useChannelEntitlements: () => ({
    status: h.status,
    includes: () => h.status === "ready" && h.email,
    retry: h.retry,
  }),
}));
vi.mock("../src/lib/api", () => ({
  authFetch: h.fetch,
  safeJson: (response: Response) => response.json(),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button", Badge: "span", Skeleton: "span" }));
vi.mock("../src/components/molecules", () => ({
  StatusNotice: ({ action, children, title }: Props) => (
    <div>
      {title}
      {children}
      {action}
    </div>
  ),
}));
vi.mock("../src/components/layout/IntegrationLogos", () => ({ getIntegrationLogo: () => null }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => unknown;
  "aria-label"?: string;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children), ...nodes(node.props.action)];
}
function label(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join("");
  if (isValidElement<Props>(node)) return label(node.props.children);
  return typeof node === "string" ? node : "";
}
function render() {
  h.cursor = 0;
  h.effects = [];
  return nodes(MailboxConnectionCard());
}
function buttons() {
  return render().filter((node) => node.type === "button");
}
beforeEach(() => {
  h.states = [[], false, false, null, null, false, "", ""];
  h.email = false;
  h.status = "ready";
  h.listeners.clear();
  h.fetch
    .mockReset()
    .mockImplementation(async () => new Response(JSON.stringify({ accounts: [] })));
  h.retry.mockReset();
  vi.stubGlobal("window", {
    location: { origin: "https://botbound.app" },
    addEventListener: (name: string, callback: (event: MessageEvent) => void) =>
      h.listeners.set(name, callback),
    removeEventListener: vi.fn(),
    clearInterval: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("connection choices follow purchased channels", () => {
  it("keeps calendar connections and omits unavailable new mail connections", () => {
    expect(buttons().map(label)).toEqual(["Connect Google Calendar", "Connect Outlook Calendar"]);
    expect(label(MailboxConnectionCard())).not.toContain("Mail + calendar");
  });
  it("keeps an existing iCloud account manageable without offering another mailbox", () => {
    h.states[0] = [{ id: "saved", provider: "icloud", emailAddress: "existing@example.com" }];
    const controls = buttons();
    expect(
      controls.some((node) => node.props["aria-label"] === "Disconnect existing@example.com"),
    ).toBe(true);
    expect(
      controls.some((node) => label(node).includes("iCloud") || label(node) === "Connect another"),
    ).toBe(false);
  });
  it("offers Gmail, Outlook and iCloud when Email is included", () => {
    h.email = true;
    expect(buttons().map(label)).toEqual([
      "Connect Gmail",
      "Connect Outlook",
      "Connect iCloud Mail",
    ]);
  });
  it("blocks new connections and offers retry when channel access cannot be verified", () => {
    h.status = "error";
    const controls = buttons();
    expect(
      controls
        .filter((node) => label(node).startsWith("Connect "))
        .every((node) => node.props.disabled),
    ).toBe(true);
    controls.find((node) => label(node) === "Retry")?.props.onClick?.();
    expect(h.retry).toHaveBeenCalledOnce();
  });
  it.each([false, true])("syncs after OAuth only when Email is included: %s", async (email) => {
    h.email = email;
    render();
    h.effects.forEach((effect) => effect());
    h.listeners.get("message")?.({
      origin: "https://botbound.app",
      data: { type: "OAUTH_AUTH_SUCCESS" },
    } as MessageEvent);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(email ? 3 : 2));
    expect(h.fetch.mock.calls.some(([url]) => url === "/api/emails/sync")).toBe(email);
  });
});
