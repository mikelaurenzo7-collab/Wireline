import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeBaseClaude from "../src/components/KnowledgeBaseClaude";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  externallyBusy: false,
  interactionChanged: vi.fn(),
}));
vi.mock("react", async (original) => {
  const effect = (callback: () => void | (() => void), deps?: readonly unknown[]) => {
    const slot = (h.slots[h.cursor++] ??= {});
    if (!slot.deps || !deps || deps.some((value, i) => !Object.is(value, slot.deps?.[i]))) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  };
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= {
        value: typeof initial === "function" ? initial() : initial,
      });
      return [
        slot.value,
        (next: unknown) => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) {
            slot.value = value;
            h.dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= { value: { current: initial } });
      return slot.value;
    },
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const slot = (h.slots[h.cursor++] ??= {});
      if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps?.[i]))) {
        slot.value = callback;
        slot.deps = deps;
      }
      return slot.value;
    },
    useEffect: effect,
    useLayoutEffect: effect,
  };
});
vi.mock("../src/lib/api", () => ({
  authFetch: h.fetch,
  safeJson: (response: Response) => response.json().catch(() => null),
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));

type Props = {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => unknown;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let agentId = "bot-a";
const oldRule = "Collect appointment requests for owner confirmation.";
const replacement = "Follow the saved Calendar booking mode.";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const config = (content = oldRule) => ({
  directives: [
    { id: "31", content, priority: 8 },
    { id: "32", content: "Protect private customer details.", priority: 5 },
    { id: "33", content: "Opening greeting: Hello.", priority: 5 },
  ],
  knowledge: [],
});
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  let attempts = 0;
  do {
    if (++attempts > 20) throw new Error("Rule editor did not settle");
    h.cursor = 0;
    h.dirty = false;
    h.effects = [];
    tree = KnowledgeBaseClaude({
      agentId,
      externallyBusy: h.externallyBusy,
      onInteractionChange: h.interactionChanged,
    });
    h.effects.forEach((effect) => effect());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function button(label: string) {
  const found = elements(tree).find(
    (node) =>
      node.type === "button" && (text(node) === label || node.props["aria-label"] === label),
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function input() {
  return elements(tree).find((node) => node.type === "textarea")!;
}
async function edit() {
  await settle();
  button(`Edit rule: ${oldRule}`).props.onClick!();
  render();
  input().props.onChange!({ target: { value: replacement } });
  render();
}
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  h.externallyBusy = false;
  h.interactionChanged.mockReset();
  agentId = "bot-a";
  h.fetch.mockImplementation(async () => response(config()));
});
afterEach(() => vi.unstubAllGlobals());

describe("Active Rules editing", () => {
  it("reports an open draft to the page and locks edits during a website import", async () => {
    await settle();
    expect(h.interactionChanged).toHaveBeenLastCalledWith(false);
    h.externallyBusy = true;
    render();
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(true);
    expect(button("Choose Files").props.disabled).toBe(true);
    button(`Edit rule: ${oldRule}`).props.onClick!();
    render();
    expect(input()).toBeUndefined();
    h.externallyBusy = false;
    render();
    button(`Edit rule: ${oldRule}`).props.onClick!();
    render();
    expect(h.interactionChanged).toHaveBeenLastCalledWith(true);
    button("Cancel").props.onClick!();
    render();
    expect(h.interactionChanged).toHaveBeenLastCalledWith(false);
  });
  it("preserves a fact draft and serializes fact edits, rules, removal, and uploads", async () => {
    const facts = [
      { id: "11", content: "Hours are weekdays.", source: "manual" },
      { id: "12", content: "Located in Chicago.", source: "manual" },
    ];
    h.fetch.mockResolvedValueOnce(response({ ...config(), knowledge: facts }));
    await settle();
    const factButtons = () =>
      elements(tree).filter(
        (node) =>
          node.props["aria-label"]?.startsWith("Edit ") &&
          !node.props["aria-label"]?.startsWith("Edit rule:"),
      );
    factButtons()[0].props.onClick!();
    render();
    input().props.onChange!({ target: { value: "New hours draft" } });
    render();
    expect(button("Choose Files").props.disabled).toBe(true);
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(true);
    expect(factButtons()[0].props.disabled).toBe(true);
    factButtons()[0].props.onClick!();
    render();
    expect(input().props.value).toBe("New hours draft");
    const zone = elements(tree).find((node) => "onDrop" in node.props)! as ReactElement<{
      onDrop: (event: unknown) => void;
    }>;
    zone.props.onDrop({
      preventDefault: vi.fn(),
      dataTransfer: { files: [{ name: "extra.txt" }] },
    });
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(input().props.value).toBe("New hours draft");
    let finish!: (value: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          finish = done;
        }),
    );
    button("Save").props.onClick!();
    render();
    expect(button("Choose Files").props.disabled).toBe(true);
    expect(button("Save").props.disabled).toBe(true);
    button("Save").props.onClick!();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    finish(response({ error: "Please retry." }, 503));
    await settle();
    expect(input().props.value).toBe("New hours draft");
    expect(button("Save").props.disabled).toBe(false);
    h.fetch.mockResolvedValueOnce(
      response({ success: true, knowledge: { ...facts[0], content: "New hours draft" } }),
    );
    button("Save").props.onClick!();
    await settle();
    expect(text(tree)).toContain("Knowledge updated.");
    expect(button("Choose Files").props.disabled).toBe(false);
    const remove = elements(tree).find((node) => node.props["aria-label"]?.startsWith("Remove "))!;
    remove.props.onClick!();
    render();
    expect(button("Choose Files").props.disabled).toBe(true);
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(true);
    button("Cancel").props.onClick!();
    render();
    expect(button("Choose Files").props.disabled).toBe(false);
  });

  it("blocks fact edit and removal until upload and its snapshot refresh both finish", async () => {
    const snapshot = {
      ...config(),
      knowledge: [{ id: "11", content: "Open weekdays.", source: "manual" }],
    };
    h.fetch.mockResolvedValueOnce(response(snapshot));
    await settle();
    let finishUpload!: (value: Response) => void;
    let finishRefresh!: (value: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          finishUpload = done;
        }),
    );
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          finishRefresh = done;
        }),
    );
    const zone = elements(tree).find((node) => "onDrop" in node.props)! as ReactElement<{
      onDrop: (event: unknown) => void;
    }>;
    zone.props.onDrop({
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [{ name: "hours.txt", type: "text/plain", size: 10, text: async () => "New fact" }],
      },
    });
    await settle();
    const edit = elements(tree).find(
      (node) =>
        node.props["aria-label"]?.startsWith("Edit ") &&
        !node.props["aria-label"]?.startsWith("Edit rule:"),
    )!;
    const remove = elements(tree).find((node) => node.props["aria-label"]?.startsWith("Remove "))!;
    expect(edit.props.disabled).toBe(true);
    expect(remove.props.disabled).toBe(true);
    edit.props.onClick!();
    remove.props.onClick!();
    render();
    expect(input()).toBeUndefined();
    finishUpload(response({ summary: "Added fact." }));
    await settle();
    expect(button("Choose Files").props.disabled).toBe(true);
    finishRefresh(response(snapshot));
    await settle();
    expect(button("Choose Files").props.disabled).toBe(false);
  });

  it("saves one rule in place through the owned PATCH without appending training", async () => {
    await edit();
    h.fetch.mockResolvedValueOnce(
      response({ success: true, directive: { id: "31", content: replacement, priority: 8 } }),
    );
    button("Save").props.onClick!();
    await settle();
    expect(h.fetch).toHaveBeenLastCalledWith(
      "/api/agent-config/bot-a/directive/31",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ content: replacement }) }),
    );
    expect(text(tree)).toContain(replacement);
    expect(text(tree)).not.toContain(oldRule);
    expect(text(tree)).toContain("Protect private customer details.");
    expect(text(tree)).toContain("Rule updated.");
    expect(
      elements(tree).filter((node) => node.props["aria-label"]?.startsWith("Edit rule:")),
    ).toHaveLength(2);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["server", "network", "malformed"])(
    "retains the draft and last confirmed rule after %s failure",
    async (kind) => {
      await edit();
      if (kind === "network") h.fetch.mockRejectedValueOnce(new Error("Connection lost"));
      else
        h.fetch.mockResolvedValueOnce(
          kind === "server"
            ? response({ error: "Please retry later." }, 503)
            : response({ success: true }),
        );
      button("Save").props.onClick!();
      await settle();
      expect(input().props.value).toBe(replacement);
      expect(button("Save").props.disabled).toBe(false);
      expect(text(tree)).not.toContain("Rule updated.");
      expect(text(tree)).toContain(
        kind === "server"
          ? "Please retry later."
          : kind === "network"
            ? "Connection lost"
            : "The saved rule could not be confirmed.",
      );
      button("Cancel").props.onClick!();
      render();
      expect(text(tree)).toContain(oldRule);
      expect(text(tree)).not.toContain(replacement);
    },
  );

  it("removes one rule through the owned DELETE after an inline confirm", async () => {
    await settle();
    button(`Remove rule: ${oldRule}`).props.onClick!();
    render();
    expect(text(tree)).toContain("Remove this rule?");
    h.fetch.mockResolvedValueOnce(response({ success: true }));
    button("Remove").props.onClick!();
    await settle();
    expect(h.fetch).toHaveBeenLastCalledWith(
      "/api/agent-config/bot-a/directive/31",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(text(tree)).not.toContain(oldRule);
    expect(text(tree)).toContain("Protect private customer details.");
    expect(text(tree)).toContain("Rule removed.");
    expect(
      elements(tree).some((node) =>
        node.props["aria-label"]?.includes("Remove rule: Opening greeting"),
      ),
    ).toBe(false);
  });

  it("keeps a rule when removal fails or is cancelled", async () => {
    await settle();
    button(`Remove rule: ${oldRule}`).props.onClick!();
    render();
    h.fetch.mockResolvedValueOnce(response({ error: "Please retry later." }, 503));
    button("Remove").props.onClick!();
    await settle();
    expect(text(tree)).toContain(oldRule);
    expect(text(tree)).toContain("Please retry later.");
    button("Cancel").props.onClick!();
    render();
    expect(text(tree)).not.toContain("Remove this rule?");
    expect(text(tree)).toContain(oldRule);
  });

  it("supports cancellation and blocks blank saves without making a request", async () => {
    await edit();
    input().props.onChange!({ target: { value: "  " } });
    render();
    expect(button("Save").props.disabled).toBe(true);
    button("Cancel").props.onClick!();
    render();
    expect(text(tree)).toContain(oldRule);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(
      elements(tree).some((node) =>
        node.props["aria-label"]?.includes("Edit rule: Opening greeting"),
      ),
    ).toBe(false);
  });

  it("fences an old Bot's late save response after switching Bots", async () => {
    await edit();
    let finish!: (value: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    button("Save").props.onClick!();
    render();
    expect(button("Save").props.disabled).toBe(true);
    const patchOptions = h.fetch.mock.calls[1][1] as RequestInit;
    agentId = "bot-b";
    h.fetch.mockResolvedValueOnce(response(config("Other Bot rule")));
    await settle();
    expect(patchOptions.signal?.aborted).toBe(true);
    finish(response({ success: true, directive: { id: "31", content: replacement } }));
    await settle();
    expect(text(tree)).toContain("Other Bot rule");
    expect(text(tree)).not.toContain(replacement);
    expect(text(tree)).not.toContain("Rule updated.");
    expect(input()).toBeUndefined();
  });

  it("keeps upload refreshes and rule edits from overwriting each other's confirmed state", async () => {
    await settle();
    const file = {
      name: "hours.txt",
      type: "text/plain",
      size: 30,
      text: vi.fn().mockResolvedValue("Open weekdays."),
    };
    function drop() {
      const zone = elements(tree).find((node) => "onDrop" in node.props)! as ReactElement<{
        onDrop: (event: unknown) => void;
      }>;
      zone.props.onDrop({ preventDefault: vi.fn(), dataTransfer: { files: [file] } });
    }
    let finishUpload!: (value: Response) => void;
    let finishRefresh!: (value: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishUpload = resolve;
        }),
    );
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    drop();
    await settle();
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(true);
    finishUpload(response({ summary: "Knowledge saved." }));
    await settle();
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(true);
    finishRefresh(response(config()));
    await settle();
    expect(button(`Edit rule: ${oldRule}`).props.disabled).toBe(false);
    button(`Edit rule: ${oldRule}`).props.onClick!();
    render();
    expect(button("Choose Files").props.disabled).toBe(true);
    const requestsBeforeDrop = h.fetch.mock.calls.length;
    drop();
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(requestsBeforeDrop);
    expect(text(tree)).toContain("Finish editing or removing the rule before uploading files.");
    expect(input().props.value).toBe(oldRule);
  });
});
