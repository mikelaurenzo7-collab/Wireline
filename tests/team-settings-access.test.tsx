import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeamSettings from "../src/pages/TeamSettings";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  mounted: false,
  effects: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
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
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
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
  type?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void | Promise<void>;
  value?: string;
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
  h.refCursor = 0;
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
  h.refs = [];
  h.refCursor = 0;
  h.fetch.mockReset();
  tree = null;
});

describe("team access status", () => {
  it.each(["network", "unconfirmed receipt"])(
    "retains members after %s removal and recovers without duplicate removal",
    async (failure) => {
      const members = [{ id: "member-1", email: "teammate@example.test", role: "member" }];
      await load({ members });
      let resolve!: (response: Response) => void;
      let reject!: (reason: Error) => void;
      h.fetch.mockReturnValueOnce(
        new Promise<Response>((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      );
      const remove = elements(tree).find(
        (node) => node.type === "button" && text(node) === "Remove",
      )!.props.onClick!;
      remove();
      remove();
      expect(h.fetch).toHaveBeenCalledTimes(2);
      render();
      expect(elements(tree).find((node) => text(node) === "Removing…")?.props.disabled).toBe(true);
      if (failure === "network") reject(new Error("Network unavailable"));
      else resolve(new Response(JSON.stringify({ success: false }), { status: 200 }));
      await vi.waitFor(() => {
        render();
        expect(
          elements(tree).some((node) => node.props.title === "Team Action Needs Attention"),
        ).toBe(true);
      });
      expect(text(tree)).toContain("teammate@example.test");
      expect(
        elements(tree).find((node) => node.type === "button" && text(node) === "Remove")?.props
          .disabled,
      ).toBe(true);
      h.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ members }), { status: 200 }));
      elements(tree).find((node) => node.type === "button" && text(node) === "Refresh Team")!.props
        .onClick!();
      await vi.waitFor(() => {
        render();
        expect(
          elements(tree).find((node) => node.type === "button" && text(node) === "Remove")?.props
            .disabled,
        ).toBe(false);
      });
      h.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
      h.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ members: [] }), { status: 200 }));
      elements(tree).find((node) => node.type === "button" && text(node) === "Remove")!.props
        .onClick!();
      await vi.waitFor(() => {
        render();
        expect(text(tree)).not.toContain("teammate@example.test");
      });
      expect(h.fetch.mock.calls.filter(([path]) => path === "/api/team/member-1")).toHaveLength(2);
    },
  );

  it.each(["missing delivery flag", "wrong recipient", "missing success"])(
    "does not claim invitation delivery after %s",
    async (failure) => {
      await load({ members: [] });
      invite().onClick!();
      render();
      elements(tree).find((node) => node.type === "input")!.props.onChange!({
        target: { value: "teammate@example.test" },
      });
      render();
      const receipt = {
        success: true as boolean | undefined,
        email_sent: true as boolean | undefined,
        invitation: { id: "invite-1", email: "teammate@example.test", role: "member" },
      };
      if (failure === "missing delivery flag") receipt.email_sent = undefined;
      if (failure === "wrong recipient") receipt.invitation.email = "someone-else@example.test";
      if (failure === "missing success") receipt.success = undefined;
      h.fetch.mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }));
      await elements(tree).find((node) => node.type === "form")!.props.onSubmit!({
        preventDefault: vi.fn(),
      });
      render();
      expect(text(tree)).not.toContain("Invitation sent to");
      expect(text(tree)).toContain("The invitation could not be confirmed");
      expect(elements(tree).find((node) => node.type === "input")?.props.value).toBe(
        "teammate@example.test",
      );
      expect(elements(tree).find((node) => node.props.type === "submit")?.props.disabled).toBe(
        true,
      );
      expect(
        elements(tree).some((node) => node.type === "button" && text(node) === "Refresh Team"),
      ).toBe(true);
    },
  );

  it("distinguishes a saved invitation from confirmed email delivery and preserves its draft", async () => {
    await load({ members: [] });
    invite().onClick!();
    render();
    elements(tree).find((node) => node.type === "input")!.props.onChange!({
      target: { value: "teammate@example.test" },
    });
    render();
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          email_sent: false,
          invitation: { id: "invite-1", email: "teammate@example.test", role: "member" },
        }),
        { status: 200 },
      ),
    );
    await elements(tree).find((node) => node.type === "form")!.props.onSubmit!({
      preventDefault: vi.fn(),
    });
    render();
    expect(text(tree)).not.toContain("Invitation sent to");
    expect(text(tree)).toContain("email delivery was not confirmed");
    expect(elements(tree).find((node) => node.type === "input")?.props.value).toBe(
      "teammate@example.test",
    );
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/team/invite")).toHaveLength(1);
  });

  it("announces a matching invitation only after its confirmed delivery receipt", async () => {
    await load({ members: [] });
    invite().onClick!();
    render();
    elements(tree).find((node) => node.type === "input")!.props.onChange!({
      target: { value: "teammate@example.test" },
    });
    render();
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          email_sent: true,
          invitation: { id: "invite-1", email: "teammate@example.test", role: "member" },
        }),
        { status: 200 },
      ),
    );
    await elements(tree).find((node) => node.type === "form")!.props.onSubmit!({
      preventDefault: vi.fn(),
    });
    render();
    expect(text(tree)).toContain("Invitation sent to teammate@example.test.");
    expect(text(tree)).not.toContain("Invite Teammate");
  });

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

  it("disables retry after an invite becomes unavailable while preserving its error and Cancel", async () => {
    await load({ members: [] });
    invite().onClick!();
    render();
    expect(text(tree)).toContain("Invite Teammate");
    const email = elements(tree).find((node) => node.type === "input");
    email!.props.onChange!({ target: { value: "teammate@example.test" } });
    render();
    h.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "SHARED_WORKSPACES_NOT_CERTIFIED",
          error: "Internal certification details",
        }),
        { status: 503 },
      ),
    );
    const form = elements(tree).find((node) => node.type === "form");
    await form!.props.onSubmit!({ preventDefault: vi.fn() });
    render();

    expect(h.fetch).toHaveBeenLastCalledWith("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "teammate@example.test", role: "member" }),
    });
    expect(text(tree)).toContain("Invite Teammate");
    expect(text(tree)).toContain("Team invitations are currently unavailable.");
    expect(text(tree)).not.toContain("Internal certification details");
    const submit = elements(tree).find(
      (node) => node.type === "button" && node.props.type === "submit",
    );
    expect(submit!.props.disabled).toBe(true);
    expect(invite().disabled).toBe(true);
    const cancel = elements(tree).find((node) => node.type === "button" && text(node) === "Cancel");
    expect(cancel!.props.disabled).toBe(false);
    cancel!.props.onClick!();
    render();
    expect(text(tree)).not.toContain("Invite Teammate");
    expect(h.fetch).toHaveBeenCalledTimes(2);
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
