import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmConnectionCard, { type IntegrationStatus } from "../src/components/CrmConnectionCard";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  callbacks: [] as Array<{ value: unknown; deps: unknown[] }>,
  effects: [] as Array<{ deps: unknown[]; cleanup?: () => void }>,
  pendingEffects: [] as Array<() => void>,
  stateCursor: 0,
  refCursor: 0,
  callbackCursor: 0,
  effectCursor: 0,
  dirty: false,
  fetch: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        const value = typeof next === "function" ? next(h.states[index]) : next;
        if (!Object.is(value, h.states[index])) h.dirty = true;
        h.states[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback(value: unknown, deps: unknown[]) {
    const index = h.callbackCursor++;
    const previous = h.callbacks[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      h.callbacks[index] = { value, deps };
    }
    return h.callbacks[index].value;
  },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = h.effectCursor++;
    const previous = h.effects[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      h.pendingEffects.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        h.effects[index] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    }
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("motion/react", () => ({ motion: { div: "div" }, AnimatePresence: "animation" }));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/components/atoms", () => ({ Skeleton: "skeleton" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "status-notice" }));
vi.mock("../src/components/IntegrationCapabilityPanel", () => ({ default: "capabilities" }));
vi.mock("../src/components/layout/IntegrationLogos", () => ({ getIntegrationLogo: () => null }));
vi.mock("../src/lib/integration-playbooks", () => ({
  toolIntegrationForProvider: () => null,
  PROVIDER_ACCENT: {},
}));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "channel-select",
  SelectTrigger: "select-trigger",
  SelectValue: "select-value",
  SelectContent: "select-options",
  SelectItem: "select-option",
}));

type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  role?: string;
  value?: string;
  disabled?: boolean;
  onClick?: () => unknown;
  onValueChange?: (value: string) => Promise<void>;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.stateCursor = h.refCursor = h.callbackCursor = h.effectCursor = 0;
  h.dirty = false;
  return CrmConnectionCard();
}
async function settle() {
  for (let pass = 0; pass < 16; pass++) {
    if (h.dirty) render();
    const pending = h.pendingEffects.splice(0);
    pending.forEach((effect) => effect());
    await Promise.resolve();
  }
}
function select(label: string) {
  const node = elements(render()).find(
    (element) =>
      element.type === "channel-select" &&
      elements(element.props.children).some((child) => child.props["aria-label"] === label),
  );
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
function button(label: string) {
  const node = elements(render()).find(
    (element) =>
      element.type === "button" &&
      (text(element) === label || element.props["aria-label"] === label),
  );
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const teamsTarget = {
  team_id: "team-1",
  team_name: "Sales",
  channel_id: "19:new:channel@thread.tacv2",
  channel_name: "Bookings",
};
const providers = [
  {
    name: "Slack",
    key: "slack" as const,
    label: "Default Slack channel",
    load: "/api/oauth/slack/channels",
    save: "/api/oauth/slack/default-channel",
    old: "C-OLD",
    next: "C-NEW",
  },
  {
    name: "Teams",
    key: "microsoft_teams" as const,
    label: "Default Teams team and channel",
    load: "/api/oauth/microsoft_teams/channels",
    save: "/api/oauth/microsoft_teams/notify-target",
    old: "team-1:19:old@thread.tacv2",
    next: `${teamsTarget.team_id}:${teamsTarget.channel_id}`,
  },
];
const status = {
  slack: { connected: true, configured: true, default_channel_id: "C-OLD" },
  microsoft_teams: {
    connected: true,
    configured: true,
    team_id: "team-1",
    channel_id: "19:old@thread.tacv2",
  },
};
let serverStatus: Record<"slack" | "microsoft_teams", IntegrationStatus>;
function defaultFetch(url: string, options?: RequestInit) {
  if (url === "/api/oauth/crm/status") return Promise.resolve(response(serverStatus));
  if (url === providers[0].load)
    return Promise.resolve(
      response({
        channels: [
          { id: "C-OLD", name: "General" },
          { id: "C-NEW", name: "Bookings" },
        ],
      }),
    );
  if (url === providers[1].load) return Promise.resolve(response({ channels: [teamsTarget] }));
  if (url === providers[0].save) {
    const body = JSON.parse(String(options?.body));
    serverStatus.slack = { ...serverStatus.slack, default_channel_id: body.channel_id };
  }
  if (url === providers[1].save) {
    serverStatus.microsoft_teams = {
      ...serverStatus.microsoft_teams,
      ...JSON.parse(String(options?.body)),
    };
  }
  return Promise.resolve(response({ ok: true }));
}
async function mount() {
  render();
  await settle();
}
beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.callbacks = [];
  h.effects = [];
  h.pendingEffects = [];
  h.dirty = false;
  serverStatus = structuredClone(status);
  h.fetch.mockReset().mockImplementation(defaultFetch);
  vi.stubGlobal("window", {
    location: { origin: "https://botbound.app" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    clearInterval: vi.fn(),
  });
});
afterEach(() => {
  h.effects.forEach((effect) => effect.cleanup?.());
  vi.unstubAllGlobals();
});

describe("notification channel recovery", () => {
  it("preserves the complete Teams channel ID and labels when saving a selection", async () => {
    await mount();
    await select(providers[1].label).props.onValueChange!(providers[1].next);
    const request = h.fetch.mock.calls.find(([url]) => url === providers[1].save);
    expect(JSON.parse(request![1].body)).toEqual(teamsTarget);
    expect(select(providers[1].label).props.value).toBe(providers[1].next);
  });

  it("keeps the confirmed selection and prevents another save until the request completes", async () => {
    await mount();
    let finish!: (value: Response) => void;
    h.fetch.mockImplementation((url: string) =>
      url === providers[0].save
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : defaultFetch(url),
    );
    const pending = select(providers[0].label).props.onValueChange!(providers[0].next);
    expect(select(providers[0].label).props.value).toBe(providers[0].old);
    expect(select(providers[0].label).props.disabled).toBe(true);
    await select(providers[1].label).props.onValueChange!(providers[1].next);
    expect(h.fetch.mock.calls.filter(([url]) => url === providers[1].save)).toHaveLength(0);
    serverStatus.slack.default_channel_id = providers[0].next;
    finish(response({ ok: true }));
    await pending;
    expect(select(providers[0].label).props.value).toBe(providers[0].next);
    expect(select(providers[0].label).props.disabled).toBe(false);
  });

  for (const provider of providers) {
    it(`shows ${provider.name} as disconnected when a successful write was a no-op`, async () => {
      await mount();
      h.fetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === provider.save) {
          serverStatus[provider.key] = { connected: false, configured: true };
          return Promise.resolve(response({ ok: true }));
        }
        return defaultFetch(url, options);
      });
      await select(provider.label).props.onValueChange!(provider.next);
      expect(() => select(provider.label)).toThrow(`Missing ${provider.label}`);
      expect(text(render())).toContain(
        `${provider.name} connection is unavailable. Refresh or reconnect.`,
      );
      expect(
        button(`Connect ${provider.name === "Teams" ? "Microsoft Teams" : provider.name}`),
      ).toBeDefined();
    });

    it(`retains the authoritative ${provider.name} channel when the write does not change it`, async () => {
      await mount();
      h.fetch.mockImplementation((url: string, options?: RequestInit) =>
        url === provider.save
          ? Promise.resolve(response({ ok: true }))
          : defaultFetch(url, options),
      );
      await select(provider.label).props.onValueChange!(provider.next);
      expect(select(provider.label).props.value).toBe(provider.old);
      expect(text(render())).toContain(
        `Could not confirm the ${provider.name} channel. Refresh to check its status.`,
      );
    });

    it.each(["HTTP", "network"])(
      `preserves the confirmed ${provider.name} channel after a %s save failure and permits retry`,
      async (failure) => {
        await mount();
        h.fetch.mockImplementation((url: string) =>
          url === provider.save
            ? failure === "HTTP"
              ? Promise.resolve(response({ error: "Channel unavailable." }, 503))
              : Promise.reject(new TypeError("Failed to fetch"))
            : defaultFetch(url),
        );
        await select(provider.label).props.onValueChange!(provider.next);
        expect(select(provider.label).props.value).toBe(provider.old);
        expect(select(provider.label).props.disabled).toBe(false);
        expect(elements(render()).some((node) => node.props.role === "alert")).toBe(true);
        h.fetch.mockImplementation(defaultFetch);
        await select(provider.label).props.onValueChange!(provider.next);
        expect(select(provider.label).props.value).toBe(provider.next);
        expect(elements(render()).some((node) => node.props.role === "alert")).toBe(false);
      },
    );

    it.each(["HTTP", "network"])(
      `retries a failed ${provider.name} channel list without reconnecting after a %s failure`,
      async (failure) => {
        h.fetch.mockImplementation((url: string) =>
          url === provider.load
            ? failure === "HTTP"
              ? Promise.resolve(response({ error: "Unavailable" }, 503))
              : Promise.reject(new TypeError("Failed to fetch"))
            : defaultFetch(url),
        );
        await mount();
        expect(text(render())).toContain(`Could not load ${provider.name} channels.`);
        h.fetch.mockImplementation(defaultFetch);
        button(`Retry ${provider.name} channels`).props.onClick!();
        await settle();
        expect(select(provider.label).props.disabled).toBe(false);
        expect(text(render())).not.toContain(`Could not load ${provider.name} channels.`);
      },
    );
  }

  it("does not treat an unconfirmed 2xx channel response as a successful save", async () => {
    await mount();
    h.fetch.mockImplementation((url: string) =>
      url === providers[0].save ? Promise.resolve(response({})) : defaultFetch(url),
    );
    await select(providers[0].label).props.onValueChange!(providers[0].next);
    expect(select(providers[0].label).props.value).toBe(providers[0].old);
    expect(text(render())).toContain("Could not save the Slack channel. Try again.");
  });

  it.each(["HTTP", "network", "missing provider"])(
    "retains the confirmed channel when the post-save status check has a %s failure",
    async (failure) => {
      await mount();
      h.fetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/oauth/crm/status") {
          if (failure === "network") return Promise.reject(new TypeError("Failed to fetch"));
          return Promise.resolve(response({}, failure === "HTTP" ? 503 : 200));
        }
        return defaultFetch(url, options);
      });
      await select(providers[0].label).props.onValueChange!(providers[0].next);
      expect(select(providers[0].label).props.value).toBe(providers[0].old);
      expect(select(providers[0].label).props.disabled).toBe(false);
      expect(text(render())).toContain(
        "Could not confirm the Slack channel. Refresh to check its status.",
      );
      h.fetch.mockImplementation(defaultFetch);
      button("Refresh integration status").props.onClick!();
      await settle();
      expect(select(providers[0].label).props.value).toBe(providers[0].next);
      expect(text(render())).not.toContain("Could not confirm the Slack channel.");
    },
  );

  it("keeps the prior channel visible and controls busy until the status read confirms the write", async () => {
    await mount();
    let finish!: (value: Response) => void;
    h.fetch.mockImplementation((url: string, options?: RequestInit) =>
      url === "/api/oauth/crm/status"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : defaultFetch(url, options),
    );
    const pending = select(providers[0].label).props.onValueChange!(providers[0].next);
    await settle();
    expect(select(providers[0].label).props.value).toBe(providers[0].old);
    expect(select(providers[0].label).props.disabled).toBe(true);
    finish(response(serverStatus));
    await pending;
    expect(select(providers[0].label).props.value).toBe(providers[0].next);
    expect(select(providers[0].label).props.disabled).toBe(false);
  });

  it("refreshes channel lists even when both connection statuses remain connected", async () => {
    await mount();
    h.fetch.mockClear();
    button("Refresh integration status").props.onClick!();
    await settle();
    expect(h.fetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining(providers.map((provider) => provider.load)),
    );
  });

  it("offers channel-list recovery when a successful response has no channel data", async () => {
    h.fetch.mockImplementation((url: string) =>
      providers.some((provider) => provider.load === url)
        ? Promise.resolve(response({}))
        : defaultFetch(url),
    );
    await mount();
    expect(text(render())).toContain("Could not load Slack channels.");
    expect(text(render())).toContain("Could not load Teams channels.");
    expect(button("Retry Slack channels")).toBeDefined();
    expect(button("Retry Teams channels")).toBeDefined();
  });

  it("explains a confirmed empty channel list without treating it as a load failure", async () => {
    h.fetch.mockImplementation((url: string) =>
      providers.some((provider) => provider.load === url)
        ? Promise.resolve(response({ channels: [] }))
        : defaultFetch(url),
    );
    await mount();
    for (const provider of providers) {
      expect(select(provider.label).props.disabled).toBe(true);
      expect(text(render())).toContain(
        `No accessible channels. Check ${provider.name} access, then refresh.`,
      );
    }
    expect(elements(render()).some((node) => node.props.role === "alert")).toBe(false);
  });
});
