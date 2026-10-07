import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignsPanel from "../src/components/outbound/CampaignsPanel";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  deps: [] as Array<readonly unknown[]>,
  callbacks: [] as unknown[],
  effects: [] as Array<() => void>,
  cursor: 0,
  refCursor: 0,
  effectCursor: 0,
  callbackCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => (h.callbacks[h.callbackCursor++] ??= callback),
  useEffect(run: () => void, dependencies: readonly unknown[]) {
    const index = h.effectCursor++;
    if (!h.deps[index] || dependencies.some((value, i) => !Object.is(value, h.deps[index][i]))) {
      h.deps[index] = dependencies;
      h.effects.push(run);
    }
  },
}));
vi.mock("../src/lib/api", () => ({
  authFetch: vi.fn(async () => ({ ok: true, json: async () => ({ campaigns: [], agents: [] }) })),
}));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../src/components/outbound/LeadHuntReview", () => ({ LeadHuntReview: "lead-hunt" }));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "select",
  SelectContent: "div",
  SelectItem: "option",
  SelectTrigger: "button",
  SelectValue: "span",
}));

type Props = {
  children?: ReactNode;
  ref?: { current: unknown };
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;
const nameTarget = { focus: vi.fn(), scrollIntoView: vi.fn() };
const createTarget = { focus: vi.fn(), scrollIntoView: vi.fn() };
let domRefs: Array<{ current: unknown }> = [];
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render() {
  h.cursor = h.refCursor = h.effectCursor = h.callbackCursor = 0;
  const tree = elements(CampaignsPanel());
  domRefs.forEach((ref) => {
    ref.current = null;
  });
  domRefs = [];
  for (const node of tree) {
    if (!node.props.ref) continue;
    if (node.props["aria-label"] === "Campaign name") node.props.ref.current = nameTarget;
    if (node.type === "button" && text(node) === "Create Campaign")
      node.props.ref.current = createTarget;
    domRefs.push(node.props.ref);
  }
  h.effects.splice(0).forEach((run) => run());
  return tree;
}
function open() {
  render()
    .find((node) => node.type === "button" && text(node) === "Create Campaign")
    ?.props.onClick?.();
  return render();
}
beforeEach(async () => {
  h.states = [];
  h.refs = [];
  h.deps = [];
  h.callbacks = [];
  h.effects = [];
  domRefs = [];
  vi.clearAllMocks();
  render();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  render();
});

describe("campaign creation focus", () => {
  it("focuses and reveals Campaign name when the inline form opens below Lead Hunt", () => {
    open();
    expect(nameTarget.focus).toHaveBeenCalledOnce();
    expect(nameTarget.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" }),
    );
  });

  it("does not recapture focus while campaign fields are being edited", () => {
    const name = open().find((node) => node.props["aria-label"] === "Campaign name");
    nameTarget.focus.mockClear();
    nameTarget.scrollIntoView.mockClear();
    name?.props.onChange?.({ target: { value: "September Follow-up" } });
    render();
    expect(nameTarget.focus).not.toHaveBeenCalled();
    expect(nameTarget.scrollIntoView).not.toHaveBeenCalled();
  });

  it("restores focus to Create campaign when the inline form is closed", () => {
    open()
      .find((node) => node.props["aria-label"] === "Close campaign form")
      ?.props.onClick?.();
    render();
    expect(createTarget.focus).toHaveBeenCalledOnce();
  });
});
