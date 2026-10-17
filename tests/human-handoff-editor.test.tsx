import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HumanHandoffEditor from "../src/components/HumanHandoffEditor";
import type { HumanHandoffDraft } from "../src/lib/human-handoff-settings";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  dependencies: [] as Array<readonly unknown[]>,
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  callbackCursor: 0,
  callbacks: [] as Array<{ value: unknown; dependencies: readonly unknown[] }>,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback(callback: unknown, dependencies: readonly unknown[]) {
    const index = h.callbackCursor++;
    const previous = h.callbacks[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
      h.callbacks[index] = { value: callback, dependencies };
    return h.callbacks[index].value;
  },
  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = h.effectCursor++;
    const previous = h.dependencies[index];
    h.dependencies[index] = dependencies;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i])))
      h.effects.push(effect);
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  Switch: "switch",
  Textarea: "textarea",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/contexts/AgentsContext", () => ({ AGENTS_CHANGED_EVENT: "agents-changed" }));

type Props = {
  children?: ReactNode;
  id?: string;
  disabled?: boolean;
  value?: string;
  checked?: boolean;
  onClick?: () => unknown;
  onChange?: (event: { target: { value: string } }) => void;
  onCheckedChange?: (checked: boolean) => void;
  onSubmit?: (event: { preventDefault(): void }) => Promise<void>;
};
function nodes(node: ReactNode): Array<ReactElement<Props>> {
  return Array.isArray(node)
    ? node.flatMap(nodes)
    : isValidElement<Props>(node)
      ? [node, ...nodes(node.props.children)]
      : [];
}
function text(node: ReactNode): string {
  return typeof node === "string"
    ? node
    : Array.isArray(node)
      ? node.map(text).join(" ")
      : isValidElement<Props>(node)
        ? text(node.props.children)
        : "";
}
let drafts = new Map<string, HumanHandoffDraft>();
let ownerId = "owner-a";
function render() {
  h.stateCursor = h.refCursor = h.effectCursor = h.callbackCursor = 0;
  h.effects = [];
  const tree = HumanHandoffEditor({ agentId: "bot-a", ownerId, botPhone: "+13125550124", drafts });
  for (const effect of h.effects) {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  }
  return tree;
}
function field(id: string) {
  return nodes(render()).find((node) => node.props.id === id)!;
}
function submit() {
  return nodes(render()).find((node) => node.type === "form")!.props.onSubmit!({
    preventDefault() {},
  });
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const profile = {
  escalation_phone: null,
  transfer_phone: null,
  escalation_email: "team@example.com",
  escalation_handoff_enabled: false,
  escalation_keywords: [],
};
async function open() {
  nodes(render()).find((node) => node.type === "button")!.props.onClick!();
  render();
  await flush();
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.dependencies = [];
  h.callbacks = [];
  h.cleanups = [];
  h.fetch.mockReset();
  drafts = new Map();
  ownerId = "owner-a";
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});

describe("human handoff editor", () => {
  it("keeps malformed loads unavailable and recovers on retry without exposing empty editable routing", async () => {
    h.fetch
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ businessProfile: profile }));
    await open();
    expect(text(render())).toContain("settings could not be loaded");
    expect(nodes(render()).some((node) => node.type === "form")).toBe(false);
    const notice = nodes(render()).find((node) => node.type === "aside")!;
    const action = (notice.props as Props & { action: ReactElement<Props> }).action;
    action.props.onClick!();
    render();
    await flush();
    expect(field("human-handoff-email").props.value).toBe("team@example.com");
  });

  it("preserves edits through collapse, failed save, malformed receipt, and retry", async () => {
    let settle!: (response: Response) => void;
    h.fetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            settle = resolve;
          })
        : Promise.resolve(json({ businessProfile: profile })),
    );
    await open();
    field("human-handoff-phone").props.onChange!({ target: { value: "(312) 555-0123" } });
    field("human-handoff-transfer").props.onCheckedChange!(true);
    const button = () => nodes(render()).find((node) => node.type === "button")!;
    button().props.onClick!();
    button().props.onClick!();
    expect(field("human-handoff-phone").props.value).toBe("(312) 555-0123");
    const pending = submit();
    void submit();
    expect(h.fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    const sent = JSON.parse(
      h.fetch.mock.calls.find(([, init]) => init?.method === "PATCH")![1].body,
    );
    expect(sent).toEqual({
      escalation_phone: "+13125550123",
      escalation_email: "team@example.com",
      escalation_handoff_enabled: true,
      escalation_keywords: [],
    });
    settle(json({ error: "Try later" }, 503));
    await pending;
    expect(text(render())).toContain("Try later");
    expect(field("human-handoff-phone").props.value).toBe("(312) 555-0123");
    const retry = submit();
    settle(json({ success: true }));
    await retry;
    expect(text(render())).toContain("save could not be confirmed");
    expect(field("human-handoff-phone").props.value).toBe("(312) 555-0123");
    const confirmed = submit();
    settle(json({ businessProfile: { ...profile, ...sent } }));
    await confirmed;
    expect(text(render())).toContain("Live transfers are on");
    expect(drafts.get("bot-a")?.saving).toBe(false);
  });

  it("rejects its own line and retains an old account's receipt only in its detached draft map", async () => {
    let settle!: (response: Response) => void;
    h.fetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            settle = resolve;
          })
        : Promise.resolve(json({ businessProfile: profile })),
    );
    await open();
    field("human-handoff-phone").props.onChange!({ target: { value: "3125550124" } });
    await submit();
    expect(text(render())).toContain("own line");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    field("human-handoff-phone").props.onChange!({ target: { value: "3125550123" } });
    const pending = submit();
    const oldDrafts = drafts;
    ownerId = "owner-b";
    drafts = new Map();
    render();
    await flush();
    settle(json({ businessProfile: { ...profile, escalation_phone: "+13125550123" } }));
    await pending;
    expect(drafts.get("bot-a")?.values?.phone).not.toBe("+13125550123");
    expect(oldDrafts.get("bot-a")?.saved?.phone).toBe("+13125550123");
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "notifies a reopened editor when its prior mounted save settles successfully=%s",
    async (success) => {
      let settle!: (response: Response) => void;
      h.fetch.mockImplementation((_url: string, init?: RequestInit) =>
        init?.method === "PATCH"
          ? new Promise<Response>((resolve) => {
              settle = resolve;
            })
          : Promise.resolve(json({ businessProfile: profile })),
      );
      await open();
      field("human-handoff-phone").props.onChange!({ target: { value: "3125550123" } });
      const pending = submit();
      // Leaving the settings panel unmounts it; the authenticated session retains its draft.
      h.cleanups.forEach((cleanup) => cleanup());
      h.states = [];
      h.refs = [];
      h.dependencies = [];
      h.callbacks = [];
      h.cleanups = [];
      await open();
      expect(nodes(render()).find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
      const previousRedraw = h.states[6] as number;
      settle(
        success
          ? json({ businessProfile: { ...profile, escalation_phone: "+13125550123" } })
          : json({ error: "Save failed. Retry safely." }, 503),
      );
      await pending;
      // A shared listener schedules a render in the new mounted instance, not only the old one.
      expect(h.states[6] as number).toBeGreaterThan(previousRedraw);
      expect(nodes(render()).find((node) => node.type === "fieldset")?.props.disabled).toBe(false);
      if (success) {
        expect(field("human-handoff-phone").props.value).toBe("+13125550123");
        expect(drafts.get("bot-a")?.saved?.phone).toBe("+13125550123");
      } else {
        expect(field("human-handoff-phone").props.value).toBe("3125550123");
        expect(text(render())).toContain("Save failed. Retry safely.");
      }
    },
  );
});
