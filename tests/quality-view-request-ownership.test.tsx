import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QualityView from "../src/components/insights/QualityView";
import type { InsightsQaStatsResponse } from "../src/types/api-insights";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  insight: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = (h.slots[h.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) h.dirty = true;
        slot.value = value;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.cursor++] ??= { value: { current: initial } }).value;
  },
  useCallback(value: unknown, deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (!slot.deps || deps.some((dep, i) => !Object.is(dep, slot.deps?.[i]))) {
      slot.value = value;
      slot.deps = deps;
    }
    return slot.value;
  },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (!slot.deps || deps.some((dep, i) => !Object.is(dep, slot.deps?.[i]))) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
  },
}));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  authFetch: h.fetch,
}));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: h.success, error: h.error, warning: h.warning }),
}));
vi.mock("../src/components/insights/shared", () => ({
  fetchInsight: h.insight,
  InsightSkeleton: "skeleton",
  ErrCard: "error-card",
  InsightEmpty: "empty-state",
  qaColor: () => "green",
}));

type Props = {
  children?: ReactNode;
  error?: string;
  onRetry?: () => void;
  onClick?: () => Promise<void>;
};
let days: number;
let tree: ReactNode;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

function render() {
  h.cursor = 0;
  h.dirty = false;
  tree = QualityView({ days });
}

async function settle() {
  for (let pass = 0; pass < 12; pass++) {
    if (h.dirty) render();
    h.effects.splice(0).forEach((effect) => effect());
    await Promise.resolve();
  }
}

async function mount() {
  render();
  await settle();
}

async function changeDays(value: number) {
  days = value;
  render();
  await settle();
}

function scoredCalls() {
  return textOf(elements(tree).find((node) => node.key === "Scored Calls"));
}

const stats = (count: number): InsightsQaStatsResponse => ({ count, avgScore: 85 });
const json = (body: unknown) => new Response(JSON.stringify(body));

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  h.insight.mockReset();
  h.success.mockReset();
  h.error.mockReset();
  h.warning.mockReset();
  days = 30;
  tree = null;
});

afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
});

describe("scorecard date-range ownership", () => {
  it.each(["success", "failure"])(
    "ignores a previous date range's late %s after the current results arrive",
    async (outcome) => {
      const old = deferred<InsightsQaStatsResponse>();
      const current = deferred<InsightsQaStatsResponse>();
      h.insight.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      await mount();
      await changeDays(7);
      expect(h.insight.mock.calls.map(([url]) => url)).toEqual([
        "/api/qa/stats?days=30",
        "/api/qa/stats?days=7",
      ]);
      current.resolve(stats(7));
      await settle();
      expect(scoredCalls()).toContain("Scored Calls 7");

      if (outcome === "success") old.resolve(stats(30));
      else old.reject(new Error("Old request failed"));
      await settle();
      expect(scoredCalls()).toContain("Scored Calls 7");
      expect(elements(tree).some((node) => node.type === "error-card")).toBe(false);
    },
  );

  it("keeps the current range loading when a retired request settles first", async () => {
    const old = deferred<InsightsQaStatsResponse>();
    const current = deferred<InsightsQaStatsResponse>();
    h.insight.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await mount();
    await changeDays(7);
    old.resolve(stats(30));
    await settle();
    expect(elements(tree).some((node) => node.type === "skeleton")).toBe(true);
    expect(scoredCalls()).toBe("");

    current.resolve(stats(7));
    await settle();
    expect(scoredCalls()).toContain("Scored Calls 7");
  });

  it("keeps current-request failures retryable", async () => {
    h.insight.mockRejectedValueOnce(new Error("Current request failed"));
    h.insight.mockResolvedValueOnce(stats(30));
    await mount();
    const error = elements(tree).find((node) => node.type === "error-card")!;
    expect(error.props.error).toBe("Current request failed");
    error.props.onRetry!();
    await settle();
    expect(scoredCalls()).toContain("Scored Calls 30");
  });

  it("does not let an old batch completion restart the previous range's read", async () => {
    const batch = deferred<Response>();
    h.insight.mockResolvedValueOnce(stats(30)).mockResolvedValueOnce(stats(7));
    h.insight.mockResolvedValue(stats(31));
    h.fetch.mockReturnValue(batch.promise);
    await mount();
    const score = elements(tree).find(
      (node) => node.type === "button" && textOf(node).includes("Score All Unscored"),
    )!;
    const pending = score.props.onClick!();
    await changeDays(7);
    expect(scoredCalls()).toContain("Scored Calls 7");
    batch.resolve(json({ scored: 1, total: 1, failed: 0 }));
    await pending;
    await settle();

    expect(h.insight).toHaveBeenCalledTimes(2);
    expect(scoredCalls()).toContain("Scored Calls 7");
    expect(h.success).toHaveBeenCalledWith("Batch QA complete", "Scored 1 call.");
  });

  it("still refreshes the current range after a completed batch", async () => {
    h.insight.mockResolvedValueOnce(stats(30)).mockResolvedValueOnce(stats(31));
    h.fetch.mockResolvedValue(json({ scored: 1, total: 1, failed: 0 }));
    await mount();
    const score = elements(tree).find(
      (node) => node.type === "button" && textOf(node).includes("Score All Unscored"),
    )!;
    await score.props.onClick!();
    await settle();
    expect(h.insight).toHaveBeenCalledTimes(2);
    expect(scoredCalls()).toContain("Scored Calls 31");
  });
});
