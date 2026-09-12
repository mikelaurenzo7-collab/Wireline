import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTabStrip } from "../src/components/layout/WorkspaceTabStrip";

const harness = vi.hoisted(() => ({ navigate: vi.fn() }));

// Exercise the actual selector and tab handlers without a browser. Geometry
// effects are outside this test; responsive visibility requires browser QA.
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useEffect: () => undefined,
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [initial, vi.fn()],
  };
});
vi.mock("react-router", () => ({ Link: "a", useNavigate: () => harness.navigate }));
vi.mock("lucide-react", () => ({ ChevronDown: "svg" }));
vi.mock("../src/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

type ControlProps = {
  children?: ReactNode;
  value?: string;
  to?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => void;
};

function descendants(node: ReactNode): Array<ReactElement<ControlProps>> {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<ControlProps>;
  return [element, ...descendants(element.props.children)];
}

function render(props: Parameters<typeof WorkspaceTabStrip>[0]) {
  return descendants(WorkspaceTabStrip(props));
}

function picker(elements: Array<ReactElement<ControlProps>>) {
  const select = elements.find((element) => element.type === "select");
  if (!select?.props.onChange) throw new Error("Expected a working mobile section picker.");
  return select;
}

beforeEach(() => vi.clearAllMocks());

describe("workspace mobile section picker", () => {
  it("navigates to the desktop link destination without losing its query or anchor", () => {
    const onSelect = vi.fn();
    const href = "/settings/billing?agent=bot%2Fone&returnTo=%2Fphone%3Ftab%3Dlogs#usage";
    const elements = render({
      tabs: [
        { id: "account", label: "Account", href: "/settings" },
        { id: "billing", label: "Billing", href },
      ],
      activeId: "account",
      ariaLabel: "Settings sections",
      mobileSelect: true,
      onSelect,
    });

    picker(elements).props.onChange!({ target: { value: "billing" } });

    expect(elements.some((element) => element.type === "a" && element.props.to === href)).toBe(
      true,
    );
    expect(harness.navigate).toHaveBeenCalledExactlyOnceWith(href);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses the same section callback as desktop tabs and follows the controlled active section", () => {
    const onSelect = vi.fn();
    const props = {
      tabs: [
        { id: "logs", label: "History" },
        { id: "appointments", label: "Appointments", shortLabel: "Appts" },
      ],
      activeId: "logs",
      ariaLabel: "Call sections",
      mobileSelect: true,
      onSelect,
    };
    const elements = render(props);
    picker(elements).props.onChange!({ target: { value: "appointments" } });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("appointments");
    expect(harness.navigate).not.toHaveBeenCalled();

    const updated = render({ ...props, activeId: "appointments" });
    expect(picker(updated).props.value).toBe("appointments");
    const desktopHistory = updated.find((element) => element.type === "button");
    desktopHistory?.props.onClick?.();
    expect(onSelect).toHaveBeenLastCalledWith("logs");
  });

  it("names the picker and uses full accessible option labels on narrow screens", () => {
    const elements = render({
      tabs: [
        { id: "appointments", label: "Appointments", shortLabel: "Appts" },
        { id: "customization", label: "Appearance", ariaLabel: "Appearance and brand" },
      ],
      activeId: "appointments",
      ariaLabel: "Workspace sections",
      mobileSelect: true,
    });
    const label = elements.find((element) => element.type === "label");
    expect(
      descendants(label).some((element) => element.props.children === "Workspace sections"),
    ).toBe(true);
    expect(descendants(label).some((element) => element.type === "select")).toBe(true);
    expect(
      elements
        .filter((element) => element.type === "option")
        .map((element) => element.props.children),
    ).toEqual(["Appointments", "Appearance and brand"]);
  });

  it("ignores a stale selection that is no longer present in the available sections", () => {
    const onSelect = vi.fn();
    const elements = render({
      tabs: [{ id: "logs", label: "History" }],
      activeId: "logs",
      ariaLabel: "Call sections",
      mobileSelect: true,
      onSelect,
    });

    picker(elements).props.onChange!({ target: { value: "removed-section" } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(harness.navigate).not.toHaveBeenCalled();
  });
});
