import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CallDeliverySettings, {
  type CallDeliveryView,
} from "../src/components/voice/CallDeliverySettings";

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
    useId: () => "id",
    useEffect,
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

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

const nothing: CallDeliveryView = { speakingRate: 1.1, pronunciations: [], recognizedNames: [] };
const onSaved = vi.fn();
let initial = nothing;
let sample: { playing: boolean; loading: boolean; toggle: () => void } | null = null;
let otherVoiceAnswers = false;
function render() {
  h.cursor = 0;
  const nodes = elements(
    CallDeliverySettings({
      agentId: "bot a",
      agentName: "Front Desk",
      initial,
      onSaved,
      sample,
      otherVoiceAnswers,
    }),
  );
  h.effects.splice(0).forEach((effect) => effect());
  return nodes;
}
const radios = (nodes: Element[]) => nodes.filter((node) => node.props.role === "radio");
const checkedPace = (nodes: Element[]) =>
  text(radios(nodes).find((node) => node.props["aria-checked"] === true)!);
const inputs = (nodes: Element[]) => nodes.filter((node) => node.type === "input");
const forms = (nodes: Element[]) => nodes.filter((node) => node.type === "form");
const notices = (nodes: Element[]) =>
  nodes.filter((node) => node.type === "notice").map((node) => text(node));
const button = (nodes: Element[], label: string) =>
  nodes.find(
    (node) => node.type === "button" && (node.props["aria-label"] ?? text(node)) === label,
  )!;
const type = (nodes: Element[], index: number, value: string) =>
  inputs(nodes)[index].props.onChange({ target: { value } });
const submit = (nodes: Element[], index: number) =>
  forms(nodes)[index].props.onSubmit({ preventDefault: vi.fn() });
const answers = (delivery: Partial<CallDeliveryView>) =>
  h.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, delivery: { ...nothing, ...delivery } }),
  });
const lastSave = () => {
  const [url, init] = h.fetch.mock.calls.at(-1)!;
  return { url, method: init.method, body: JSON.parse(init.body) };
};
const settled = () => vi.waitFor(() => expect(notices(render())).toHaveLength(1));

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset();
  onSaved.mockReset();
  initial = nothing;
  sample = null;
  otherVoiceAnswers = false;
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
});

describe("speaking pace", () => {
  it("shows the pace in effect and saves another as soon as it is picked", async () => {
    let nodes = render();
    expect(radios(nodes).map((node) => text(node))).toEqual([
      "Slow",
      "Relaxed",
      "Natural",
      "Brisk",
      "Fast",
    ]);
    expect(checkedPace(nodes)).toBe("Natural");
    // Only the pace in effect is a tab stop; arrows move between the rest.
    expect(radios(nodes).map((node) => node.props.tabIndex)).toEqual([-1, -1, 0, -1, -1]);

    answers({ speakingRate: 1.2 });
    radios(nodes)[3].props.onClick();
    await vi.waitFor(() => expect(checkedPace(render())).toBe("Brisk"));
    expect(lastSave()).toEqual({
      url: "/api/agent-config/bot%20a/voice/delivery",
      method: "PATCH",
      body: { speakingRate: 1.2 },
    });
    nodes = render();
    expect(onSaved).toHaveBeenCalledWith({ ...nothing, speakingRate: 1.2 });
    expect(notices(nodes)).toEqual([
      "Saved. Front Desk speaks at a Brisk pace from the next call.",
    ]);
    expect(text(nodes[0])).toContain("Brisk Pace");
  });

  it("moves with the arrow keys, taking keyboard focus along", async () => {
    const focused: number[] = [];
    const group = {
      querySelectorAll: () =>
        [0, 1, 2, 3, 4].map((index) => ({ focus: () => focused.push(index) })),
    };
    const key = (name: string, index: number) =>
      radios(render())[index].props.onKeyDown({
        key: name,
        preventDefault: vi.fn(),
        currentTarget: { parentElement: group },
      });
    // The pace already in effect, and keys that are not arrows, save and move nothing.
    radios(render())[2].props.onClick();
    key("Home", 0);
    key("Tab", 2);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(focused).toEqual([]);

    answers({ speakingRate: 1 });
    key("ArrowLeft", 2);
    await vi.waitFor(() => expect(checkedPace(render())).toBe("Relaxed"));
    expect(lastSave().body).toEqual({ speakingRate: 1 });
    answers({ speakingRate: 1.3 });
    key("End", 1);
    await vi.waitFor(() => expect(checkedPace(render())).toBe("Fast"));
    expect(lastSave().body).toEqual({ speakingRate: 1.3 });
    expect(focused).toEqual([1, 4]);
  });

  it("keeps the old pace and says why when a save is refused", async () => {
    h.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Choose a speaking pace from the list." }),
    });
    radios(render())[4].props.onClick();
    await vi.waitFor(() =>
      expect(notices(render())).toEqual(["Choose a speaking pace from the list."]),
    );
    expect(checkedPace(render())).toBe("Natural");
    expect(onSaved).not.toHaveBeenCalled();

    // A dropped connection reads as a plain retry, not the browser's own error text.
    h.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    radios(render())[4].props.onClick();
    await vi.waitFor(() =>
      expect(notices(render())).toEqual(["That change could not be saved. Try again."]),
    );
  });

  it("ignores a second change while the first is still saving", async () => {
    let finish!: (value: unknown) => void;
    h.fetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    radios(render())[3].props.onClick();
    const saving = render();
    expect(radios(saving).every((node) => node.props["aria-disabled"] === true)).toBe(true);
    radios(saving)[4].props.onClick();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    finish({ ok: true, json: async () => ({ delivery: { ...nothing, speakingRate: 1.2 } }) });
    await vi.waitFor(() => expect(checkedPace(render())).toBe("Brisk"));
  });

  it("offers a sample only when the built-in voice is what callers hear", () => {
    expect(render().some((node) => text(node) === "Hear It")).toBe(false);
    sample = { playing: false, loading: false, toggle: vi.fn() };
    button(render(), "Hear It").props.onClick();
    expect(sample.toggle).toHaveBeenCalledOnce();
    sample = { ...sample, playing: true };
    expect(button(render(), "Stop").props["aria-pressed"]).toBe(true);
  });
});

describe("pronunciations", () => {
  it("sends only the new entry, shows the list the server returns, and clears the form", async () => {
    // Another screen added Siobhan after this one loaded; this one still shows nothing.
    let nodes = render();
    expect(button(nodes, "Add Pronunciation").props.disabled).toBe(true);
    type(nodes, 0, "  Nguyen ");
    type(render(), 1, "Win");
    nodes = render();
    expect(button(nodes, "Add Pronunciation").props.disabled).toBe(false);

    answers({
      pronunciations: [
        { word: "Siobhan", say: "Shi-vawn" },
        { word: "Nguyen", say: "Win" },
      ],
    });
    submit(nodes, 0);
    await settled();
    // One entry, never the list: a stale screen cannot erase what it has not seen.
    expect(lastSave().body).toEqual({ addPronunciation: { word: "Nguyen", say: "Win" } });
    nodes = render();
    expect(inputs(nodes).map((node) => node.props.value)).toEqual(["", "", ""]);
    expect(notices(nodes)).toEqual(["Saved. Rehearse to hear it."]);
    expect(text(nodes[0])).toContain("Natural Pace · 2 Pronunciations");
    expect(nodes.filter((node) => node.type === "li").map((node) => text(node))).toEqual([
      "Siobhan→ is said as Shi-vawn",
      "Nguyen→ is said as Win",
    ]);
  });

  it("removes one by its word and puts keyboard focus back in the form", async () => {
    initial = { ...nothing, pronunciations: [{ word: "Nguyen", say: "Win" }] };
    const nodes = render();
    const focus = vi.fn();
    inputs(nodes)[0].props.ref.current = { focus };

    answers({ pronunciations: [] });
    button(nodes, "Remove Pronunciation For Nguyen").props.onClick();
    await vi.waitFor(() => expect(render().some((node) => node.type === "li")).toBe(false));
    expect(lastSave().body).toEqual({ removePronunciation: "Nguyen" });
    expect(notices(render())).toEqual(["Removed. Front Desk says Nguyen as written again."]);
    // The button that had focus is gone; focus does not fall back to the page.
    await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce());
  });

  it("explains a spelling that would change nothing, without a request", () => {
    type(render(), 0, "Acme");
    type(render(), 1, "ACME");
    submit(render(), 0);
    const nodes = render();
    expect(notices(nodes)).toEqual(["Spell it the way it sounds, not the way it is written."]);
    expect(h.fetch).not.toHaveBeenCalled();
    // What was typed stays, so it can be corrected rather than retyped.
    expect(inputs(nodes).map((node) => node.props.value)).toEqual(["Acme", "ACME", ""]);
  });

  it("saves a new spelling for a word that is already listed", async () => {
    initial = { ...nothing, pronunciations: [{ word: "Nguyen", say: "Win" }] };
    type(render(), 0, "nguyen");
    type(render(), 1, "Wen");
    answers({ pronunciations: [{ word: "nguyen", say: "Wen" }] });
    submit(render(), 0);
    await settled();
    expect(lastSave().body).toEqual({ addPronunciation: { word: "nguyen", say: "Wen" } });
    expect(text(render().find((node) => node.type === "li")!)).toBe("nguyen→ is said as Wen");
  });

  it("shows the server's reason and keeps what was typed when a save is refused", async () => {
    type(render(), 0, "AI assistant");
    type(render(), 1, "team member");
    const reason =
      "That includes a word from the required call opening, which is always spoken as written. Add only the word that is said wrong.";
    h.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: reason }) });
    submit(render(), 0);
    await settled();
    const nodes = render();
    expect(notices(nodes)).toEqual([reason]);
    expect(inputs(nodes).map((node) => node.props.value)).toEqual([
      "AI assistant",
      "team member",
      "",
    ]);
  });

  it("stops offering the form at the most one Bot can keep", () => {
    initial = {
      ...nothing,
      pronunciations: Array.from({ length: 40 }, (_, index) => ({
        word: `Word${index}`,
        say: `Say${index}`,
      })),
    };
    const nodes = render();
    expect(forms(nodes)).toHaveLength(1);
    expect(text(nodes[0])).toContain("40 is the most one Bot can keep. Remove one to add another.");
  });
});

describe("names to recognize", () => {
  it("adds one name, refuses a repeat without a request, and removes one with a tap", async () => {
    let nodes = render();
    expect(button(nodes, "Add Name").props.disabled).toBe(true);
    type(nodes, 2, " Siobhan ");
    answers({ recognizedNames: ["Siobhan"] });
    submit(render(), 1);
    await settled();
    expect(lastSave().body).toEqual({ addRecognizedName: "Siobhan" });
    nodes = render();
    expect(notices(nodes)).toEqual(["Saved. Front Desk listens for Siobhan from the next call."]);
    expect(inputs(nodes)[2].props.value).toBe("");
    expect(text(nodes[0])).toContain("Natural Pace · 1 Name");

    type(nodes, 2, "SIOBHAN");
    submit(render(), 1);
    expect(notices(render())).toEqual(["SIOBHAN is already on the list."]);
    expect(h.fetch).toHaveBeenCalledTimes(1);

    const focus = vi.fn();
    inputs(render())[2].props.ref.current = { focus };
    answers({ recognizedNames: [] });
    button(render(), "Remove Siobhan").props.onClick();
    await vi.waitFor(() => expect(notices(render())).toEqual(["Removed Siobhan."]));
    expect(lastSave().body).toEqual({ removeRecognizedName: "Siobhan" });
    await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce());
  });

  it("does not promise name recognition on calls another voice answers", async () => {
    otherVoiceAnswers = true;
    const nodes = render();
    expect(text(nodes[0])).toContain("Used when a built-in voice answers calls.");
    type(nodes, 2, "Siobhan");
    answers({ recognizedNames: ["Siobhan"] });
    submit(render(), 1);
    await settled();
    expect(notices(render())).toEqual([
      "Saved. Front Desk listens for Siobhan when a built-in voice answers.",
    ]);
  });
});
