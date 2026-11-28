import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").split("\r\n").join("\n");

let bot: {
  agentId: string;
  agentName: string;
  onPendingSave?: (save: (() => Promise<boolean>) | null) => void;
} = { agentId: "bot a", agentName: "Michael" };
const dispatched: string[] = [];
function render() {
  h.cursor = 0;
  const nodes = elements(BotNameField(bot));
  h.effects.splice(0).forEach((effect) => effect());
  return nodes;
}
const field = (nodes: Element[]) => nodes.find((node) => node.type === "input")!;
const saveButton = (nodes: Element[]) => nodes.find((node) => node.type === "button")!;
const noticeNodes = (nodes: Element[]) => nodes.filter((node) => node.type === "notice");
const notices = (nodes: Element[]) => noticeNodes(nodes).map((node) => text(node));
// The component holds the field through a ref; a browser would fill it in.
const focus = vi.fn();
function attachField() {
  (field(render()).props as { ref: { current: unknown } }).ref.current = { focus };
}
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
  focus.mockReset();
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
    // Named by its label, described by its help, and not marked wrong.
    const label = nodes.find((node) => node.type === "label")!;
    expect(label.props.htmlFor).toBe(field(nodes).props.id);
    const help = nodes.find((node) => node.props.id === "setup-bot-name-help")!;
    expect(text(help)).toContain("What your Bot calls itself with callers.");
    expect(field(nodes).props["aria-describedby"]).toBe("setup-bot-name-help");
    expect(field(nodes).props["aria-invalid"]).toBeUndefined();
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
    expect(noticeNodes(render())[0].props.tone).toBe("success");
    // Nothing is left to save, before the Bot list has even answered.
    expect(saveButton(render()).props.disabled).toBe(true);

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
      status: 400,
      json: async () => ({ error: "Give your Bot a name." }),
    });
    await submit();
    let nodes = render();
    expect(field(nodes).props.value).toBe("Bo");
    expect(notices(nodes)).toEqual(["Give your Bot a name."]);
    expect(dispatched).toEqual([]);
    // Said as an error, and tied to the field it is about.
    const problem = noticeNodes(nodes)[0];
    expect(problem.props.tone).toBe("destructive");
    expect(field(nodes).props["aria-invalid"]).toBe(true);
    expect(field(nodes).props["aria-describedby"]).toBe(`setup-bot-name-help ${problem.props.id}`);

    h.fetch.mockRejectedValueOnce(new Error("offline"));
    await submit();
    nodes = render();
    expect(notices(nodes)).toEqual(["offline"]);
    expect(saveButton(nodes).props.disabled).toBe(false);
    // A dropped connection says nothing is wrong with the name itself.
    expect(field(nodes).props["aria-invalid"]).toBeUndefined();
  });

  it("lets Set Up's Save Changes save a typed name, and says when there is none to save", async () => {
    const pending: Array<(() => Promise<boolean>) | null> = [];
    bot = { ...bot, onPendingSave: (save) => pending.push(save) };
    render();
    expect(pending.at(-1)).toBeNull();
    type("Nora");
    render();
    const saveTyped = pending.at(-1);
    expect(saveTyped).toEqual(expect.any(Function));
    h.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Nora" }) });
    await expect(saveTyped!()).resolves.toBe(true);
    expect(lastSave()).toEqual({
      url: "/api/agents/bot%20a/name",
      method: "PATCH",
      body: { name: "Nora" },
    });
    render();
    expect(pending.at(-1)).toBeNull();
    // A save started from Save Changes leaves keyboard focus where it was.
    expect(focus).not.toHaveBeenCalled();
    // Nothing typed: nothing to save, and no request.
    await expect(saveTyped!()).resolves.toBe(false);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("is saved by Set Up's Save Changes and counted as an unsaved change there", () => {
    const panel = read("src/components/StudioAgentWorkspacePanel.tsx");
    expect(panel).toContain("onPendingSave={(save) => {");
    expect(panel).toContain("const nameSave = pendingNameSave.current;");
    expect(panel).toContain("snapshot.dirty || namePending");
    expect(panel).toContain("!(snapshot.dirty || namePending)");
  });

  it("announces a saved name once", async () => {
    type("Bo");
    h.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Bo" }) });
    await submit();
    // The live region speaks; the notice inside it is not a second status.
    expect(noticeNodes(render())[0].props.role).toBe("none");
  });

  it("keeps keyboard focus through a save", async () => {
    attachField();
    type("Bo");
    let finish!: (value: unknown) => void;
    h.fetch.mockReturnValueOnce(new Promise((resolvePromise) => (finish = resolvePromise)));
    const saving = submit();
    // While it saves, neither control is disabled: a disabled control drops focus.
    let nodes = render();
    expect(field(nodes).props.disabled).toBeUndefined();
    expect(field(nodes).props.readOnly).toBe(true);
    expect(saveButton(nodes).props.disabled).toBe(false);
    expect(text(saveButton(nodes))).toBe("Saving…");
    finish({ ok: true, json: async () => ({ name: "Bo" }) });
    await saving;
    // Save Name is now disabled, so focus is put back in the field.
    nodes = render();
    expect(saveButton(nodes).props.disabled).toBe(true);
    expect(field(nodes).props.readOnly).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not take back what the owner is typing when the Bot list catches up", async () => {
    type("Nora");
    h.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Nora" }) });
    await submit();
    // They correct it before the list has reloaded.
    type("Norah");
    bot = { ...bot, agentName: "Nora" };
    render();
    const nodes = render();
    expect(field(nodes).props.value).toBe("Norah");
    expect(saveButton(nodes).props.disabled).toBe(false);
  });

  it("shows a name saved somewhere else when the owner has typed nothing", () => {
    render();
    // Renamed through chat beside this field.
    bot = { ...bot, agentName: "Riley" };
    render();
    const nodes = render();
    expect(field(nodes).props.value).toBe("Riley");
    expect(saveButton(nodes).props.disabled).toBe(true);
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
