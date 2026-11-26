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
let focusCallId: string | null = null;
let onFocusSettled: (() => void) | undefined;
const json = <T extends { id: string }>(calls: T[], total = 3, status = 200) =>
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
    tree = CallLogsClaude({ agentId, focusCallId, onFocusSettled });
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
  focusCallId = null;
  onFocusSettled = undefined;
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));
describe("call history links to one call", () => {
  it("opens the call a People link names, loading the next page when it sits past the first", async () => {
    focusCallId = "37";
    h.fetch
      .mockResolvedValueOnce(json([{ id: "40" }, { id: "39" }], 4))
      .mockResolvedValueOnce(json([{ id: "38" }, { id: 37 as unknown as string }], 4));
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(String(h.fetch.mock.calls[1][0])).toContain("offset=2");
    const active = elements(tree).filter(
      (node) => node.type === "button" && node.props["aria-pressed" as keyof Props] === true,
    );
    expect(active).toHaveLength(1);
    const report = elements(tree).find((node) => node.props["aria-label"] === "Call report");
    expect(report).toBeDefined();
  });

  it("stops looking when the named call is not in the history", async () => {
    focusCallId = "missing";
    h.fetch.mockResolvedValueOnce(json([{ id: "one" }], 1));
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(
      elements(tree).filter(
        (node) => node.type === "button" && node.props["aria-pressed" as keyof Props] === true,
      ),
    ).toHaveLength(0);
  });
});

describe("a link to a call that is answered", () => {
  const rows = () =>
    elements(tree).filter(
      (node) => node.type === "button" && node.props["aria-pressed" as keyof Props] !== undefined,
    );

  it("says the named call is not here instead of leaving another call in its place", async () => {
    focusCallId = "missing";
    onFocusSettled = vi.fn();
    h.fetch.mockResolvedValueOnce(json([{ id: "one" }], 1));
    await settle();
    const notice = elements(tree).find(
      (node) => node.type === "notice" && node.props.title === "Call Not in This List",
    );
    expect(notice).toBeDefined();
    expect(text(notice)).toContain("no longer in this history");
    expect(onFocusSettled).toHaveBeenCalledOnce();
    // Opening a call answers the notice.
    rows()[0].props.onClick!();
    await settle();
    expect(elements(tree).some((node) => node.props.title === "Call Not in This List")).toBe(false);
  });

  it("tells the page once the linked call is open, so the link can leave the URL", async () => {
    focusCallId = "39";
    onFocusSettled = vi.fn();
    h.fetch.mockResolvedValueOnce(json([{ id: "40" }, { id: "39" }], 2));
    await settle();
    expect(onFocusSettled).toHaveBeenCalledOnce();
    expect(rows().map((node) => node.props["aria-pressed" as keyof Props])).toEqual([false, true]);
  });

  it("keeps the link when the list fails to load, and opens the call once it loads", async () => {
    focusCallId = "77";
    onFocusSettled = vi.fn();
    h.fetch
      .mockResolvedValueOnce(json([], 0, 503))
      .mockResolvedValueOnce(json([{ id: "78" }, { id: "77" }], 2));
    await settle();
    // Nothing was learned about call 77, so the link stays and nothing is claimed.
    expect(onFocusSettled).not.toHaveBeenCalled();
    expect(elements(tree).some((node) => node.props.title === "Call Not in This List")).toBe(false);

    button("Refresh calls").props.onClick!();
    await settle();
    expect(onFocusSettled).toHaveBeenCalledOnce();
    expect(elements(tree).some((node) => node.props.title === "Call Not in This List")).toBe(false);
    expect(rows().map((node) => node.props["aria-pressed" as keyof Props])).toEqual([false, true]);
  });

  it("keeps the call the owner opened while a deeper page was still loading", async () => {
    focusCallId = "37";
    const second = deferred();
    h.fetch
      .mockResolvedValueOnce(json([{ id: "40" }, { id: "39" }], 4))
      .mockReturnValueOnce(second.promise);
    await settle();
    rows()[0].props.onClick!();
    await settle();
    second.resolve(json([{ id: "38" }, { id: "37" }], 4));
    await settle();
    expect(rows().map((node) => node.props["aria-pressed" as keyof Props])).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("call history request ordering", () => {
  it("shows what the call did instead of a sales score", async () => {
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          calls: [{ id: "one", outcome_tag: "other", lead_score: 30, qa_score: 69 }],
          total: 1,
          hasMore: false,
        }),
      ),
    );
    await settle();
    expect(text(tree)).toContain("No request");
    expect(text(tree)).not.toContain("Completed");
    const call = elements(tree).find(
      (node) => node.type === "button" && text(node).includes("No request"),
    );
    call!.props.onClick!();
    await settle();
    expect(text(tree)).toContain("OutcomeNo request");
    expect(text(tree)).toContain("What happenedThe caller did not ask for a follow-up.");
    expect(text(tree)).not.toContain("Lead score");
    expect(text(tree)).not.toContain("Quality score");
    expect(text(tree)).not.toContain("Intent");
  });

  it("does not present a missed attempt as a completed conversation", async () => {
    h.fetch.mockResolvedValueOnce(
      json(
        [
          {
            id: "missed",
            outcome_tag: "missed",
            duration_seconds: 4,
            summary: "Native voice call completed without a usable transcript.",
          },
        ],
        1,
      ),
    );
    await settle();
    const call = elements(tree).find(
      (node) => node.type === "button" && text(node).includes("Missed"),
    );
    call!.props.onClick!();
    await settle();
    expect(text(tree)).toContain("What happenedThe call was missed.");
    expect(text(tree)).toContain("No transcript is available for this call.");
    expect(text(tree)).not.toContain("completed");
    expect(text(tree)).not.toContain("4s");
  });

  it("shows duration once in a connected report with sequential headings", async () => {
    h.fetch.mockResolvedValueOnce(
      json(
        [
          {
            id: "connected",
            outcome_tag: "other",
            duration_seconds: 65,
            transcript: "Caller: Thanks for your help.",
            recording_url: "https://example.com/recording.mp3",
          },
        ],
        1,
      ),
    );
    await settle();
    const call = elements(tree).find(
      (node) => node.type === "button" && text(node).includes("No request"),
    );
    call!.props.onClick!();
    await settle();
    const report = elements(tree).find((node) => node.props["aria-label"] === "Call report");
    expect(text(report).match(/1m 5s/g)).toHaveLength(1);
    const headings = elements(report).filter((node) => /^h[1-6]$/.test(String(node.type)));
    expect(headings.map((node) => [node.type, text(node)])).toEqual([
      ["h2", "Unknown Caller"],
      ["h3", "Recording"],
      ["h3", "Summary"],
      ["h3", "Transcript"],
    ]);
  });

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
