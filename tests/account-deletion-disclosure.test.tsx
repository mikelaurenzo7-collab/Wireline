import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../src/pages/SettingsPage";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = typeof value === "function" ? value(h.states[index]) : value;
      },
    ];
  },
  useEffect: (effect: () => void) => h.effects.push(effect),
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("react-router", () => ({ Link: "a", useNavigate: () => vi.fn() }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "owner@example.test" }, signOut: vi.fn() }),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "nav" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "main",
  WorkspacePageIntro: "header",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "div" }));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));

type Props = {
  children?: ReactNode;
  title?: string;
  open?: boolean;
  disabled?: boolean;
  onToggle?: (event: { currentTarget: { open: boolean } }) => void;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => Promise<void>;
};
type Element = ReactElement<Props>;
let renderDangerZone: () => ReactNode;
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}
function render() {
  h.cursor = 0;
  h.effects = [];
  return elements(renderDangerZone());
}
function element(type: string) {
  return render().find((node) => node.type === type)!;
}
function button(label: string) {
  return render().find((node) => node.type === "button" && text(node) === label)!;
}
async function mount(pending = false) {
  h.fetch.mockResolvedValueOnce(response({ pending, scheduled_purge_at: "2026-10-21" }));
  render();
  h.effects.forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  h.states = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset();
  // Render only the real deletion component; unrelated page hooks stay isolated.
  const zone = elements(SettingsPage()).find(
    (node) => typeof node.type === "function" && node.type.name === "DangerZone",
  );
  if (!zone) throw new Error("Account deletion controls not found");
  renderDangerZone = zone.type as () => ReactNode;
  h.states = [];
});

describe("account deletion disclosure recovery", () => {
  it("reveals scheduling and cancellation results even after an in-flight collapse", async () => {
    await mount();
    element("details").props.onToggle!({ currentTarget: { open: true } });
    element("input").props.onChange!({ target: { value: "DELET" } });
    expect(button("Delete Account").props.disabled).toBe(true);
    element("input").props.onChange!({ target: { value: "DELETE" } });
    expect(button("Delete Account").props.disabled).toBe(false);

    let finish!: (result: Response) => void;
    h.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const scheduling = button("Delete Account").props.onClick!();
    expect(text(element("summary"))).toBe("Scheduling Deletion…");
    element("details").props.onToggle!({ currentTarget: { open: false } });
    expect(element("details").props.open).toBe(false);
    finish(response({ scheduled_purge_at: "2026-10-21", renewal_stopped: true }));
    await scheduling;
    expect(element("details").props.open).toBe(true);
    expect(element("aside").props.title).toBe("Deletion Scheduled");
    element("details").props.onToggle!({ currentTarget: { open: false } });
    expect(text(element("summary"))).toBe("Deletion Scheduled");

    element("details").props.onToggle!({ currentTarget: { open: true } });
    h.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const canceling = button("Keep My Account").props.onClick!();
    element("details").props.onToggle!({ currentTarget: { open: false } });
    finish(response({ billing_reactivation_required: true }));
    await canceling;
    expect(element("details").props.open).toBe(true);
    expect(text(element("summary"))).toBe("Delete Account");
    expect(text(element("aside"))).toContain("did not restart billing automatically");
    expect(button("Delete Account").props.disabled).toBe(true);
  });

  it("keeps an existing pending deletion identifiable when collapsed", async () => {
    await mount(true);
    expect(element("details").props.open).toBe(true);
    element("details").props.onToggle!({ currentTarget: { open: false } });
    expect(element("details").props.open).toBe(false);
    expect(text(element("summary"))).toBe("Deletion Scheduled");
    expect(button("Keep My Account")).toBeDefined();
  });

  it("reopens a failed scheduling result and allows retry", async () => {
    await mount();
    element("details").props.onToggle!({ currentTarget: { open: true } });
    element("input").props.onChange!({ target: { value: "DELETE" } });
    let finish!: (result: Response) => void;
    h.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const scheduling = button("Delete Account").props.onClick!();
    element("details").props.onToggle!({ currentTarget: { open: false } });
    finish(response({ error: "Please try again." }, 503));
    await scheduling;
    expect(element("details").props.open).toBe(true);
    expect(element("aside").props.title).toBe("Deletion Unavailable");
    expect(button("Delete Account").props.disabled).toBe(false);
  });
});
