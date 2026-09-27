import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeamSettings from "../src/pages/TeamSettings";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  mounted: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  user: { id: "account-a", email: "person@example.test" },
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useMemo: (compute: () => unknown) => compute(),
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect(effect: () => void) {
    if (!h.mounted) h.effects.push(effect);
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: () => undefined }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: () => undefined }));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "tabs" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "frame",
  WorkspacePageIntro: "intro",
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  NativeSelect: "select",
}));
vi.mock("../src/components/molecules", () => ({
  FormField: "field",
  StatusNotice: "notice",
}));
vi.mock("../src/components/ui/EmptyState", () => ({ EmptyState: "empty-state" }));

type Props = {
  children?: ReactNode;
  title?: string;
  disabled?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
};
let tree: ReactNode;

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}

function render() {
  h.cursor = 0;
  tree = TeamSettings();
  h.mounted = true;
  h.effects.splice(0).forEach((effect) => effect());
  return elements(tree);
}

async function load(body: unknown, status = 200) {
  h.fetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  render();
  await vi.waitFor(() => {
    render();
    expect(text(tree)).not.toContain("Loading team");
  });
  expect(h.fetch).toHaveBeenCalledExactlyOnceWith("/api/team");
}

function invite() {
  const button = elements(tree).find((node) => node.type === "button" && text(node) === "Invite");
  expect(button).toBeDefined();
  return button!.props;
}

beforeEach(() => {
  h.states = [];
  h.cursor = 0;
  h.mounted = false;
  h.effects = [];
  h.fetch.mockReset();
  tree = null;
});

describe("team access status", () => {
  it("treats 403 as denied permission without recommending billing or inventing ownership", async () => {
    await load({ code: "FORBIDDEN", error: "Forbidden: insufficient permissions" }, 403);
    expect(text(tree)).toContain("You do not have permission to manage this team.");
    expect(text(tree)).toContain(h.user.email);
    expect(elements(tree).some((node) => node.type === "p" && text(node) === "You")).toBe(true);
    expect(text(tree)).not.toMatch(/Owner|Starter Plus|Pro plans|Review billing|add seats/);
    expect(
      elements(tree).some((node) => [node.props.to, node.props.href].includes("/settings/billing")),
    ).toBe(false);
    expect(invite().disabled).toBe(true);
    invite().onClick!();
    expect(text(render())).not.toContain("Invite Teammate");
  });

  it("uses the short availability notice for uncertified workspaces without a future promise", async () => {
    await load(
      { code: "SHARED_WORKSPACES_NOT_CERTIFIED", error: "Internal certification details" },
      503,
    );
    expect(text(tree)).toContain("Team invitations are currently unavailable.");
    expect(text(tree)).not.toMatch(/certification|will open|Owner/);
    expect(invite().title).toBe("Team invitations are currently unavailable.");
    expect(invite().disabled).toBe(true);
  });

  it("keeps self identity without an assumed role after a failed team lookup", async () => {
    await load({ error: "Unavailable" }, 500);
    expect(text(tree)).toContain(h.user.email);
    expect(text(tree)).not.toContain("Owner");
    expect(elements(tree).some((node) => node.type === "p" && text(node) === "You")).toBe(true);
    expect(invite().disabled).toBe(true);
  });

  it("retains confirmed roles from a successful member response", async () => {
    await load({
      members: [
        { id: h.user.id, email: h.user.email, role: "viewer" },
        { id: "owner-account", email: "owner@example.test", role: "owner" },
      ],
    });
    expect(text(tree)).toContain("Viewer · You");
    expect(text(tree)).toContain("Owner");
    expect(invite().disabled).toBe(false);
  });
});
