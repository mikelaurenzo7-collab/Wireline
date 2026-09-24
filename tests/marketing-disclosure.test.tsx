import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingChromeBar from "../src/components/marketing/MarketingChromeBar";

const hooks = vi.hoisted(() => ({
  open: false,
  locationKey: "initial",
  pathname: "/",
  search: "",
  hash: "",
  setOpen: vi.fn(),
  focus: vi.fn(),
  firstLinkFocus: vi.fn(),
  effects: [] as Array<{ effect: () => void; dependencies: unknown[] }>,
}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useId: () => "sitemap-panel",
    useState: () => [hooks.open, hooks.setOpen],
    useRef: () => ({
      current: {
        focus: hooks.focus,
        querySelector: () => ({ focus: hooks.firstLinkFocus, scrollIntoView: vi.fn() }),
      },
    }),
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      hooks.effects.push({ effect, dependencies });
    },
  };
});

vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({
    key: hooks.locationKey,
    pathname: hooks.pathname,
    search: hooks.search,
    hash: hooks.hash,
  }),
}));
vi.mock("../src/components/brand/WirelineBrand", () => ({ WirelineWordmark: "span" }));
vi.mock("lucide-react", () => ({ ChevronUp: "svg" }));

type ElementProps = {
  children?: ReactNode;
  hidden?: boolean;
  id?: string;
  to?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  onClick?: (event: ReturnType<typeof clickEvent>) => void;
  onKeyDown?: (event: ReturnType<typeof keyboardEvent>) => void;
};

function descendants(node: ReactNode): Array<ReactElement<ElementProps>> {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<ElementProps>;
  return [element, ...descendants(element.props.children)];
}

function keyboardEvent(key = "Escape", defaultPrevented = false) {
  return { key, defaultPrevented, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

function clickEvent(
  overrides: Partial<{
    button: number;
    defaultPrevented: boolean;
    metaKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  hooks.open = false;
  hooks.locationKey = "initial";
  hooks.pathname = "/";
  hooks.search = "";
  hooks.hash = "";
  hooks.effects = [];
  vi.clearAllMocks();
});

describe("marketing exploration disclosure", () => {
  it("keeps the panel hidden and describes the controlled element while closed", () => {
    const elements = descendants(MarketingChromeBar({}));
    expect(elements.find((element) => element.props.id === "sitemap-panel")?.props.hidden).toBe(
      true,
    );
    expect(
      elements.find((element) => element.props["aria-controls"] === "sitemap-panel")?.props[
        "aria-expanded"
      ],
    ).toBe(false);
  });

  it("dismisses an open panel with Escape and returns focus to its trigger", () => {
    hooks.open = true;
    const root = MarketingChromeBar({}) as ReactElement<ElementProps>;
    const event = keyboardEvent();
    root.props.onKeyDown?.(event);
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("enters the revealed links when exploration opens", () => {
    hooks.open = true;
    MarketingChromeBar({});
    for (const entry of hooks.effects) entry.effect();
    expect(hooks.firstLinkFocus).toHaveBeenCalledOnce();
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it("keeps focus outside the hidden links while exploration is closed", () => {
    MarketingChromeBar({});
    for (const entry of hooks.effects) entry.effect();
    expect(hooks.firstLinkFocus).not.toHaveBeenCalled();
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it.each([
    { open: false, key: "Escape", prevented: false },
    { open: true, key: "Enter", prevented: false },
    { open: true, key: "Escape", prevented: true },
  ])(
    "does not steal a key it does not own: $key / $open / $prevented",
    ({ open, key, prevented }) => {
      hooks.open = open;
      const root = MarketingChromeBar({}) as ReactElement<ElementProps>;
      const event = keyboardEvent(key, prevented);
      root.props.onKeyDown?.(event);
      expect(hooks.setOpen).not.toHaveBeenCalled();
      expect(hooks.focus).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );

  it("closes after navigation without moving focus away from the new route", () => {
    hooks.open = true;
    hooks.locationKey = "next-route";
    MarketingChromeBar({});
    const navigationEffect = hooks.effects.find(({ dependencies }) =>
      dependencies.includes("next-route"),
    );
    expect(navigationEffect).toBeDefined();
    navigationEffect?.effect();
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).not.toHaveBeenCalled();
    expect(hooks.firstLinkFocus).not.toHaveBeenCalled();
  });

  it("dismisses on a new destination without taking route-owned focus", () => {
    hooks.open = true;
    const elements = descendants(MarketingChromeBar({}));
    const pricing = elements.find((element) => element.props.to === "/pricing");
    expect(pricing).toBeDefined();
    pricing?.props.onClick?.(clickEvent());
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger when the selected destination is already current", () => {
    hooks.open = true;
    hooks.pathname = "/pricing";
    const pricing = descendants(MarketingChromeBar({})).find(
      (element) => element.props.to === "/pricing",
    );
    pricing?.props.onClick?.(clickEvent());
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).toHaveBeenCalledOnce();
  });

  it.each([
    { search: "?plan=pro", hash: "" },
    { search: "", hash: "#plans" },
  ])("leaves focus to navigation when the query or fragment changes", ({ search, hash }) => {
    hooks.open = true;
    hooks.pathname = "/pricing";
    hooks.search = search;
    hooks.hash = hash;
    const pricing = descendants(MarketingChromeBar({})).find(
      (element) => element.props.to === "/pricing",
    );
    pricing?.props.onClick?.(clickEvent());
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
  ])("preserves the panel and focus for modified or handled clicks: %j", (modifiers) => {
    hooks.open = true;
    hooks.pathname = "/pricing";
    const pricing = descendants(MarketingChromeBar({})).find(
      (element) => element.props.to === "/pricing",
    );
    const event = clickEvent(modifiers);
    pricing?.props.onClick?.(event);
    expect(hooks.setOpen).not.toHaveBeenCalled();
    expect(hooks.focus).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
