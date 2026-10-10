import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallLogsClaude from "../src/components/CallLogsClaude";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  layoutEffects: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

vi.mock("react", async (original) => {
  const changed = (before?: readonly unknown[], after?: readonly unknown[]) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((value, i) => !Object.is(value, before[i]));
  const memo = (factory: () => unknown, dependencies?: readonly unknown[]) => {
    const index = h.cursor++;
    if (!h.slots[index] || changed(h.slots[index].dependencies, dependencies)) {
      h.slots[index] = { value: factory(), dependencies };
    }
    return h.slots[index].value;
  };
  const effect = (
    callback: () => void | (() => void),
    dependencies: readonly unknown[] | undefined,
    queue: Array<() => void>,
  ) => {
    const index = h.cursor++;
    const slot = h.slots[index] ?? {};
    if (changed(slot.dependencies, dependencies)) {
      slot.dependencies = dependencies;
      queue.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
    h.slots[index] = slot;
  };
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        h.slots[index].value,
        (next: unknown) => {
          const value = typeof next === "function" ? next(h.slots[index].value) : next;
          if (!Object.is(value, h.slots[index].value)) {
            h.slots[index].value = value;
            h.dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: { current: initial } };
      return h.slots[index].value;
    },
    useMemo: memo,
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      memo(() => callback, dependencies),
    useEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, h.effects),
    useLayoutEffect: (callback: () => void | (() => void), dependencies?: readonly unknown[]) =>
      effect(callback, dependencies, h.layoutEffects),
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  EmptyState: "empty-state",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({ SearchField: "input", StatusNotice: "notice" }));
vi.mock("../src/components/OutboundDialDialog", () => ({ default: "dialog" }));
vi.mock("../src/components/layout/WorkspaceResizablePanel", () => ({ default: "panel" }));
type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => void;
};
let tree: ReactNode;
let agentId = "first";
const json = (calls: Array<{ id: string }>, total = 3, status = 200) =>
  new Response(JSON.stringify({ calls, total, hasMore: calls.length < total }), { status });
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("Render did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.effects = [];
    tree = CallLogsClaude({ agentId });
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(label: string) {
  const b = elements(tree).find(
    (n) => n.type === "button" && (n.props["aria-label"] === label || text(n) === label),
  );
  if (!b) throw new Error(`Missing ${label}`);
  return b;
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.fetch.mockReset();
  agentId = "first";
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));
describe("call history request ordering", () => {
  it("blocks overlapping refresh and duplicate pagination, then retains all loaded calls", async () => {
    const page = deferred();
    h.fetch
      .mockResolvedValueOnce(json([{ id: "one" }, { id: "two" }]))
      .mockReturnValueOnce(page.promise);
    await settle();
    const refresh = button("Refresh calls");
    const more = button("Load More Calls");
    more.props.onClick!();
    more.props.onClick!();
    refresh.props.onClick!();
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(button("Refresh calls").props.disabled).toBe(true);
    page.resolve(json([{ id: "three" }], 3));
    await settle();
    expect(text(tree)).toContain("3 for this Bot");
    expect(button("Refresh calls").props.disabled).toBe(false);
  });
  it("ignores a previous Bot's late page without unlocking the current Bot's request", async () => {
    const oldPage = deferred();
    const newPage = deferred();
    h.fetch
      .mockResolvedValueOnce(json([{ id: "old" }], 2))
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce(json([{ id: "new" }], 2))
      .mockReturnValueOnce(newPage.promise);
    await settle();
    button("Load More Calls").props.onClick!();
    await settle();
    agentId = "second";
    await settle();
    button("Load More Calls").props.onClick!();
    await settle();
    oldPage.resolve(json([{ id: "stale" }], 2));
    await settle();
    expect(text(tree)).toContain("1 of 2 calls");
    expect(button("Refresh calls").props.disabled).toBe(true);
    newPage.resolve(json([{ id: "current" }], 2));
    await settle();
    expect(text(tree)).toContain("2 for this Bot");
  });
  it("keeps existing calls after a page error and lets the same page retry", async () => {
    h.fetch
      .mockResolvedValueOnce(json([{ id: "one" }], 2))
      .mockResolvedValueOnce(json([], 2, 503))
      .mockResolvedValueOnce(json([{ id: "two" }], 2));
    await settle();
    button("Load More Calls").props.onClick!();
    await settle();
    expect(text(tree)).toContain("1 of 2 calls");
    expect(elements(tree).some((n) => n.props.title === "More Calls Unavailable")).toBe(true);
    button("Try Again").props.onClick!();
    await settle();
    expect(h.fetch.mock.calls[1][0]).toEqual(h.fetch.mock.calls[2][0]);
    expect(text(tree)).toContain("2 for this Bot");
  });
});
