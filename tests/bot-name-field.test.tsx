import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BotNameField from "../src/components/studio/BotNameField";

type Slot = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

// The component is called as a function with these hooks, so a test can read
// what it would render and use its controls without a browser.
vi.mock("react", async (original) => {
  function useEffect(callback: () => void | (() => void), dependencies: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (
      !slot.dependencies ||
      dependencies.some((value, index) => !Object.is(value, slot.dependencies![index]))
    ) {
      slot.dependencies = dependencies;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  }
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= { value: initial });
      return [
        slot.value,
        (value: unknown) => {
          slot.value = typeof value === "function" ? value(slot.value) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= { value: { current: initial } });
      return slot.value;
    },
    useEffect,
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/contexts/AgentsContext", () => ({ AGENTS_CHANGED_EVENT: "agents-changed" }));

type Props = Record<string, any> & { children?: ReactNode };
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

let bot = { agentId: "bot a", agentName: "Michael" };
const dispatched: string[] = [];
function render() {
  h.cursor = 0;
  const nodes = elements(BotNameField(bot));
  h.effects.splice(0).forEach((effect) => effect());
  return nodes;
}
const field = (nodes: Element[]) => nodes.find((node) => node.type === "input")!;
const saveButton = (nodes: Element[]) => nodes.find((node) => node.type === "button")!;
const notices = (nodes: Element[]) =>
  nodes.filter((node) => node.type === "notice").map((node) => text(node));
const type = (value: string) => field(render()).props.onChange({ target: { value } });
const submit = () =>
  render()
    .find((node) => node.type === "form")!
    .props.onSubmit({ preventDefault: vi.fn() });
const lastSave = () => {
  const [url, init] = h.fetch.mock.calls.at(-1)!;
  return { url, method: init.method, body: JSON.parse(init.body) };
};

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset();
  bot = { agentId: "bot a", agentName: "Michael" };
  dispatched.length = 0;
  vi.stubGlobal("window", {
    dispatchEvent: (event: { type: string }) => dispatched.push(event.type),
  });
  vi.stubGlobal(
    "Event",
    class {
      constructor(public type: string) {}
    },
  );
});

describe("the name field in Set Up", () => {
  it("shows the Bot's name, says every Bot starts as Bo, and has nothing to save yet", () => {
    const nodes = render();
    expect(field(nodes).props.value).toBe("Michael");
    expect(field(nodes).props.placeholder).toBe("Bo");
    expect(field(nodes).props.maxLength).toBe(100);
    expect(text(nodes[0])).toContain("Every Bot starts as Bo.");
    expect(saveButton(nodes).props.disabled).toBe(true);
    expect(text(saveButton(nodes))).toBe("Save Name");
  });

  it("saves a new name once, tells the rest of the app, and says when callers hear it", async () => {
    type("  Bo  ");
    expect(saveButton(render()).props.disabled).toBe(false);
    h.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "bot a", name: "Bo" }) });
    const saving = submit();
    // A second press while the first is in flight sends nothing more.
    submit();
    await saving;
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(lastSave()).toEqual({
      url: "/api/agents/bot%20a/name",
      method: "PATCH",
      body: { name: "Bo" },
    });
    expect(dispatched).toEqual(["agents-changed"]);
    expect(notices(render())).toEqual(["Saved. Your Bot is Bo from the next call."]);

    // The saved name arrives from the Bot list, and the notice stays.
    bot = { ...bot, agentName: "Bo" };
    render();
    const nodes = render();
    expect(field(nodes).props.value).toBe("Bo");
    expect(saveButton(nodes).props.disabled).toBe(true);
    expect(notices(render())).toEqual(["Saved. Your Bot is Bo from the next call."]);
  });

  it("does not save an empty name or the name it already has", async () => {
    for (const value of ["", "   ", " Michael "]) {
      type(value);
      expect(saveButton(render()).props.disabled).toBe(true);
      await submit();
    }
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("keeps what was typed and says so when the save fails", async () => {
    type("Bo");
    h.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Give your Bot a name." }),
    });
    await submit();
    let nodes = render();
    expect(field(nodes).props.value).toBe("Bo");
    expect(notices(nodes)).toEqual(["Give your Bot a name."]);
    expect(dispatched).toEqual([]);

    h.fetch.mockRejectedValueOnce(new Error("offline"));
    await submit();
    nodes = render();
    expect(notices(nodes)).toEqual(["offline"]);
    expect(saveButton(nodes).props.disabled).toBe(false);
  });

  it("starts clean on another Bot, and a save still in flight does not report there", async () => {
    type("Bo");
    let finish!: (value: unknown) => void;
    h.fetch.mockReturnValueOnce(new Promise((resolvePromise) => (finish = resolvePromise)));
    const saving = submit();
    bot = { agentId: "bot b", agentName: "Riley" };
    let nodes = render();
    nodes = render();
    expect(field(nodes).props.value).toBe("Riley");
    expect(saveButton(nodes).props.disabled).toBe(true);
    finish({ ok: true, json: async () => ({ name: "Bo" }) });
    await saving;
    expect(notices(render())).toEqual([]);
    expect(dispatched).toEqual([]);
  });
});
