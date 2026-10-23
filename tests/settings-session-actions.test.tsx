import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "../src/pages/SettingsPage";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  signOut: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
}));
vi.mock("react-router", () => ({ useNavigate: () => h.navigate }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "synthetic-owner", email: "owner@example.test" },
    signOut: h.signOut,
  }),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "nav" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "main",
  WorkspacePageIntro: "header",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "div" }));

type Props = {
  children?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => Promise<void>;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function render() {
  h.stateCursor = h.refCursor = 0;
  return elements(SettingsPage());
}
function signOutButton() {
  return render().find((node) => node.type === "button" && /Sign(?:ing)? Out/.test(text(node)))!;
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.signOut.mockReset();
  h.navigate.mockReset();
});

describe("explicit Settings sign out", () => {
  it("waits for confirmed server signout and prevents duplicate clicks before rendering", async () => {
    let finish!: () => void;
    h.signOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const action = signOutButton().props.onClick!;
    const pending = action();
    await action();
    expect(h.signOut).toHaveBeenCalledExactlyOnceWith({ requireServerConfirmation: true });
    expect(signOutButton().props.disabled).toBe(true);
    expect(h.navigate).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith("/signin", { replace: true });
  });

  it.each(["network rejection", "malformed receipt rejection"])(
    "keeps the account and retry action after %s",
    async (failure) => {
      h.signOut.mockRejectedValueOnce(new Error(failure));
      await signOutButton().props.onClick!();
      expect(h.navigate).not.toHaveBeenCalled();
      const nodes = render();
      expect(
        nodes.find((node) => node.props.title === "Security Action Unavailable"),
      ).toBeDefined();
      expect(
        nodes.some((node) => text(node).includes("Sign-out did not complete. Try again.")),
      ).toBe(true);
      expect(signOutButton().props.disabled).toBe(false);
      h.signOut.mockResolvedValueOnce(undefined);
      await signOutButton().props.onClick!();
      expect(h.signOut).toHaveBeenLastCalledWith({ requireServerConfirmation: true });
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith("/signin", { replace: true });
    },
  );
});
