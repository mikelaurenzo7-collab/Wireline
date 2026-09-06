import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingChromeBar from "../src/components/marketing/MarketingChromeBar";

const hooks = vi.hoisted(() => ({
  open: false,
  locationKey: "initial",
  setOpen: vi.fn(),
  focus: vi.fn(),
  effects: [] as Array<{ effect: () => void; dependencies: unknown[] }>,
}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useId: () => "sitemap-panel",
    useState: () => [hooks.open, hooks.setOpen],
    useRef: () => ({ current: { focus: hooks.focus } }),
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      hooks.effects.push({ effect, dependencies });
    },
  };
});

vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ key: hooks.locationKey }),
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
  onClick?: () => void;
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

beforeEach(() => {
  hooks.open = false;
  hooks.locationKey = "initial";
  hooks.effects = [];
  vi.clearAllMocks();
});

describe("marketing sitemap disclosure", () => {
  it("keeps the panel hidden and describes the controlled element while closed", () => {
    const elements = descendants(MarketingChromeBar({}));
    expect(elements.find((element) => element.props.id === "sitemap-panel")?.props.hidden).toBe(true);
    expect(elements.find((element) => element.props["aria-controls"] === "sitemap-panel")?.props["aria-expanded"]).toBe(false);
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

  it.each([
    { open: false, key: "Escape", prevented: false },
    { open: true, key: "Enter", prevented: false },
    { open: true, key: "Escape", prevented: true },
  ])("does not steal a key it does not own: $key / $open / $prevented", ({ open, key, prevented }) => {
    hooks.open = open;
    const root = MarketingChromeBar({}) as ReactElement<ElementProps>;
    const event = keyboardEvent(key, prevented);
    root.props.onKeyDown?.(event);
    expect(hooks.setOpen).not.toHaveBeenCalled();
    expect(hooks.focus).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("closes after navigation without moving focus away from the new route", () => {
    hooks.open = true;
    hooks.locationKey = "next-route";
    MarketingChromeBar({});
    expect(hooks.effects).toHaveLength(1);
    expect(hooks.effects[0].dependencies).toEqual(["next-route"]);
    hooks.effects[0].effect();
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it("dismisses when a sitemap link is selected, including the current destination", () => {
    hooks.open = true;
    const elements = descendants(MarketingChromeBar({}));
    const pricing = elements.find((element) => element.props.to === "/pricing");
    expect(pricing).toBeDefined();
    pricing?.props.onClick?.();
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).not.toHaveBeenCalled();
  });
});
