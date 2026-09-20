import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IntakeKeysManager from "../src/components/IntakeKeysManager";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => unknown>,
  stateCursor: 0,
  refCursor: 0,
  mounting: true,
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
  useEffect: (effect: () => unknown) => {
    if (h.mounting) h.effects.push(effect);
  },
}));
vi.mock("../src/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  authFetch: (...args: unknown[]) => h.fetch(...args),
}));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "select",
  SelectContent: "select-content",
  SelectItem: "option",
  SelectTrigger: "select-trigger",
  SelectValue: "select-value",
}));

type Props = {
  children?: ReactNode;
  role?: string;
  disabled?: boolean;
  onClick?: () => unknown;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return IntakeKeysManager();
}
function button(label: string) {
  const control = elements(render()).find(
    (node) => node.type === "button" && text(node).trim() === label,
  );
  if (!control) throw new Error(`Missing button: ${label}`);
  return control;
}
function alert() {
  return elements(render())
    .filter((node) => node.props.role === "alert")
    .map(text)
    .join(" ");
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const key = {
  id: "key-1",
  name: "Website Form",
  key_prefix: "wlk_example",
  default_agent_id: "bot-1",
  active: true,
  auto_dial: false,
  last_used_at: null,
  use_count: 0,
  created_at: "2026-09-20T00:00:00Z",
};
let inventory: (typeof key)[];
let loadFailure: boolean;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function mount() {
  render();
  h.mounting = false;
  h.effects.forEach((effect) => effect());
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.mounting = true;
  inventory = [key];
  loadFailure = false;
  h.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method) throw new Error("Unexpected mutation");
    return url === "/api/agents"
      ? response({ agents: [{ id: "bot-1", name: "Booking Bot" }] })
      : loadFailure
        ? response({ error: "Keys unavailable" }, 503)
        : response({ keys: inventory });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("intake key recovery", () => {
  it("keeps the confirmed state and supports retry when pausing is rejected", async () => {
    await mount();
    h.fetch.mockResolvedValueOnce(response({ error: "Try again shortly." }, 503));
    await button("Pause").props.onClick?.();
    expect(alert()).toContain("Try again shortly.");
    expect(button("Pause").props.disabled).toBe(false);
    h.fetch.mockResolvedValueOnce(response({ key: { ...key, active: false } }));
    await button("Pause").props.onClick?.();
    expect(button("Resume").props.disabled).toBe(false);
    expect(alert()).toBe("");
  });

  it("catches transport errors without changing auto-dial", async () => {
    await mount();
    h.fetch.mockRejectedValueOnce(new Error("Connection lost. Try again."));
    await button("Auto-dial: OFF").props.onClick?.();
    expect(alert()).toContain("Connection lost");
    expect(button("Auto-dial: OFF").props.disabled).toBe(false);
  });

  it("blocks repeat and conflicting clicks until the change is confirmed", async () => {
    await mount();
    let finish!: (response: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pause = button("Pause").props.onClick!;
    const pending = pause();
    const requestCount = h.fetch.mock.calls.length;
    await pause();
    expect(h.fetch.mock.calls).toHaveLength(requestCount);
    expect(button("Auto-dial: OFF").props.disabled).toBe(true);
    expect(button("Delete").props.disabled).toBe(true);
    finish(response({ key: { ...key, active: false } }));
    await pending;
    expect(button("Resume").props.disabled).toBe(false);
  });

  it.each([
    [403, { error: "Deletion not allowed." }],
    [200, {}],
    [200, { success: false }],
  ])(
    "retains deletion confirmation after an unconfirmed response (%s, %j)",
    async (status, body) => {
      await mount();
      button("Delete").props.onClick?.();
      h.fetch.mockResolvedValueOnce(response(body, status));
      await button("Confirm").props.onClick?.();
      expect(text(render())).toContain("Website Form");
      expect(button("Confirm").props.disabled).toBe(false);
      expect(alert()).not.toBe("");
      h.fetch.mockResolvedValueOnce(response({ success: true }));
      await button("Confirm").props.onClick?.();
      expect(text(render())).not.toContain("Website Form");
      expect(text(render())).toContain("No Intake Keys Yet");
    },
  );

  it("rejects a response for a different key", async () => {
    await mount();
    h.fetch.mockResolvedValueOnce(response({ key: { ...key, id: "another-key", active: false } }));
    await button("Pause").props.onClick?.();
    expect(alert()).toContain("Couldn't confirm the change");
    expect(button("Pause").props.disabled).toBe(false);
  });

  it("does not mistake an initial load error for an empty inventory", async () => {
    loadFailure = true;
    await mount();
    expect(alert()).toContain("Keys unavailable");
    expect(text(render())).not.toContain("No Intake Keys Yet");
    loadFailure = false;
    await button("Retry").props.onClick?.();
    await settle();
    expect(text(render())).toContain("Website Form");
  });

  it("preserves known keys when a later inventory refresh fails", async () => {
    h.fetch.mockResolvedValueOnce(response({ keys: [key] }));
    h.fetch.mockResolvedValueOnce(response({}, 503));
    await mount();
    expect(text(render())).toContain("Website Form");
    loadFailure = true;
    await button("Retry").props.onClick?.();
    await settle();
    expect(alert()).toContain("Keys unavailable");
    expect(text(render())).toContain("Website Form");
    expect(text(render())).not.toContain("No Intake Keys Yet");
  });
});
