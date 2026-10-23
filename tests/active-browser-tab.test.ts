import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<readonly unknown[]>,
  slot: 0,
}));
vi.mock("react", () => ({
  useRef(value: unknown) {
    const index = h.slot++;
    return (h.refs[index] ??= { current: value });
  },
  useCallback: (callback: unknown) => callback,
  useLayoutEffect(effect: () => void, dependencies: readonly unknown[]) {
    const index = h.slot++;
    const previous = h.effects[index];
    if (!previous || dependencies.some((value, dependency) => value !== previous[dependency])) {
      h.effects[index] = [...dependencies];
      effect();
    }
  },
}));

import useActiveBrowserTab from "../src/components/computer/useActiveBrowserTab";

class Resize {
  static all: Resize[] = [];
  observed = new Set<unknown>();
  disconnect = vi.fn(() => this.observed.clear());
  constructor(readonly update: () => void) {
    Resize.all.push(this);
  }
  observe(node: unknown) {
    this.observed.add(node);
  }
}
class Mutation {
  static all: Mutation[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(readonly update: () => void) {
    Mutation.all.push(this);
  }
}

function fixture() {
  const tabs = [
    { id: "tab-1", start: 0, width: 120, active: false },
    { id: "tab-2", start: 130, width: 120, active: false },
    { id: "tab-3", start: 650, width: 120, active: true },
  ].map((tab) => ({
    ...tab,
    scrollIntoView: vi.fn(),
    getBoundingClientRect() {
      return {
        left: 100 + this.start - row.scrollLeft,
        right: 100 + this.start - row.scrollLeft + this.width,
        width: this.width,
      };
    },
  }));
  const row = {
    clientWidth: 300,
    clientLeft: 0,
    scrollWidth: 800,
    scrollLeft: 0,
    scrollTop: 73,
    children: tabs,
    getBoundingClientRect: () => ({ left: 100, right: 400, width: 300 }),
    querySelector: () => tabs.find((tab) => tab.active) ?? null,
    scrollIntoView: vi.fn(),
  };
  return { row, tabs, node: row as unknown as HTMLDivElement };
}
function TabRowFixture(id: string | null, key = "") {
  h.slot = 0;
  return useActiveBrowserTab(id, key);
}

beforeEach(() => {
  h.refs = [];
  h.effects = [];
  Resize.all = [];
  Mutation.all = [];
  vi.stubGlobal("ResizeObserver", Resize);
  vi.stubGlobal("MutationObserver", Mutation);
});
afterEach(() => vi.unstubAllGlobals());

describe("active browser tab visibility", () => {
  it("reveals a late active tab using only the row's horizontal scroll", () => {
    const { row, tabs, node } = fixture();
    TabRowFixture("tab-3")(node);
    expect(row.scrollLeft).toBe(482);
    expect(row.scrollTop).toBe(73);
    expect(row.scrollIntoView).not.toHaveBeenCalled();
    expect(tabs.every((tab) => tab.scrollIntoView.mock.calls.length === 0)).toBe(true);
    expect(Resize.all[0].observed).toEqual(new Set([row, ...tabs]));
  });

  it("preserves manual scroll while the selected tab remains within the row", () => {
    const { row, node } = fixture();
    TabRowFixture("tab-3")(node);
    row.scrollLeft = 495;
    Resize.all[0].update();
    expect(row.scrollLeft).toBe(495);
    expect(row.scrollTop).toBe(73);
  });

  it("keeps a manually scrolled row on unchanged polls, then reveals changed tab labels", () => {
    const { row, tabs, node } = fixture();
    TabRowFixture("tab-3", "original-labels")(node);
    row.scrollLeft = 0;
    TabRowFixture("tab-3", "original-labels");
    expect(row.scrollLeft).toBe(0);
    tabs[2].start = 700;
    row.scrollWidth = 850;
    TabRowFixture("tab-3", "renamed-labels");
    expect(row.scrollLeft).toBe(532);
    expect(row.scrollTop).toBe(73);
  });

  it("reveals a newly selected early tab after the previous row binding is replaced", () => {
    const { row, tabs, node } = fixture();
    const previous = TabRowFixture("tab-3");
    previous(node);
    previous(null);
    tabs[2].active = false;
    tabs[0].active = true;
    TabRowFixture("tab-1")(node);
    expect(row.scrollLeft).toBe(0);
    expect(Resize.all[0].disconnect).toHaveBeenCalledTimes(2);
    expect(Mutation.all[0].disconnect).toHaveBeenCalledOnce();
  });

  it("responds to a smaller row and preceding label/layout changes", () => {
    const { row, tabs, node } = fixture();
    TabRowFixture("tab-3")(node);
    row.clientWidth = 220;
    Resize.all[0].update();
    expect(row.scrollLeft).toBe(562);
    tabs[2].start = 680;
    row.scrollWidth = 850;
    Mutation.all[0].update();
    expect(row.scrollLeft).toBe(592);
    expect(row.scrollTop).toBe(73);
  });

  it("waits for a hidden row to receive width and anchors an oversized tab without oscillation", () => {
    const { row, tabs, node } = fixture();
    row.clientWidth = 0;
    TabRowFixture("tab-3")(node);
    expect(row.scrollLeft).toBe(0);
    row.clientWidth = 100;
    tabs[2].width = 160;
    row.scrollWidth = 900;
    Resize.all[0].update();
    expect(row.scrollLeft).toBe(638);
    Resize.all[0].update();
    expect(row.scrollLeft).toBe(638);
  });

  it("disconnects observers and ignores queued notifications after the row unmounts", () => {
    const { row, tabs, node } = fixture();
    const bind = TabRowFixture("tab-3");
    bind(node);
    bind(null);
    const observedScroll = row.scrollLeft;
    tabs[2].start = 0;
    Resize.all[0].update();
    Mutation.all[0].update();
    expect(row.scrollLeft).toBe(observedScroll);
    expect(Resize.all[0].observed.size).toBe(0);
    expect(Mutation.all[0].disconnect).toHaveBeenCalledOnce();
    bind(null);
    expect(Mutation.all[0].disconnect).toHaveBeenCalledOnce();
  });

  it("still reveals the active tab when browser observers are unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("MutationObserver", undefined);
    const { row, node } = fixture();
    TabRowFixture("tab-3")(node);
    expect(row.scrollLeft).toBe(482);
  });

  it("does not move a row without a selected tab", () => {
    const { row, tabs, node } = fixture();
    for (const tab of tabs) tab.active = false;
    TabRowFixture(null)(node);
    expect(row.scrollLeft).toBe(0);
    expect(Resize.all).toHaveLength(0);
    TabRowFixture("missing")(node);
    expect(row.scrollLeft).toBe(0);
  });
});
