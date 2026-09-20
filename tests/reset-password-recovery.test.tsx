import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPassword from "../src/pages/ResetPassword";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  fetch: vi.fn(),
  signIn: vi.fn(),
  navigate: vi.fn(),
  schedule: vi.fn(),
}));

// Exercise the real reset handler and controls with persistent component state.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useLayoutEffect: () => {},
}));
vi.mock("react-router", () => ({ Link: "a", useNavigate: () => h.navigate }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ signIn: h.signIn }) }));
vi.mock("../src/lib/auth-redirect", () => ({
  readStoredWorkspaceMode: () => "personal",
  resolvePostAuthDestination: () => "/studio",
}));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Input: "input" }));
vi.mock("../src/components/molecules", () => ({
  FormField: "form-field",
  StatusNotice: "status-notice",
}));
vi.mock("../src/components/marketing/MarketingChrome", () => ({ default: "marketing-chrome" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({
  WirelineLockup: "brand-lockup",
  WirelineWordmark: "brand-wordmark",
}));

type Props = {
  children?: ReactNode;
  id?: string;
  title?: string;
  value?: string;
  disabled?: boolean;
  type?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
};
type Element = ReactElement<Props>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

let tree: ReactNode;
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  tree = ResetPassword();
}
function control(id: string): Element {
  const input = elements(tree).find((node) => node.type === "input" && node.props.id === id);
  if (!input) throw new Error(`Missing control: ${id}`);
  return input;
}
function submit() {
  const form = elements(tree).find((node) => node.type === "form");
  if (!form?.props.onSubmit) throw new Error("Missing reset form");
  return form.props.onSubmit({ preventDefault() {} });
}
function success() {
  return elements(tree).find((node) => node.props.title === "Password Updated");
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.fetch.mockReset();
  h.signIn.mockReset();
  h.navigate.mockReset();
  h.schedule.mockReset();
  vi.stubGlobal("fetch", h.fetch);
  vi.stubGlobal("window", {
    location: { hash: "#token=test-reset-token", search: "", pathname: "/reset-password" },
    setTimeout: h.schedule,
  });
  render();
  control("reset-password").props.onChange?.({ target: { value: "NewPassword123" } });
  render();
  control("reset-password-confirm").props.onChange?.({ target: { value: "NewPassword123" } });
  render();
});
afterEach(() => vi.unstubAllGlobals());

describe("password reset response recovery", () => {
  it.each([
    ["HTML response", "<html>Unavailable</html>"],
    ["empty response", ""],
    ["missing user", JSON.stringify({ ok: true })],
    ["incomplete user", JSON.stringify({ user: { id: "user-1" } })],
    ["blank identity", JSON.stringify({ user: { id: " ", email: "owner@example.com" } })],
  ])("preserves a usable form after an unconfirmed %s", async (_name, body) => {
    h.fetch.mockResolvedValueOnce(new Response(body, { status: 200 }));
    await submit();
    render();

    expect(success()).toBeUndefined();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.schedule).not.toHaveBeenCalled();
    expect(control("reset-password").props.value).toBe("NewPassword123");
    expect(control("reset-password-confirm").props.value).toBe("NewPassword123");
    expect(control("reset-password").props.disabled).toBe(false);
    expect(
      elements(tree).find((node) => node.props.title === "Password Reset Was Not Completed")?.props
        .children,
    ).toBe("Password update wasn't confirmed. Try again or return to sign in.");
  });

  it("can retry the preserved form and finish confirmed account recovery", async () => {
    h.fetch.mockResolvedValueOnce(new Response("", { status: 200 }));
    await submit();
    render();
    const user = { id: "user-1", email: "owner@example.com" };
    h.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ user }), { status: 200 }));
    await submit();
    render();

    expect(success()).toBeDefined();
    expect(h.signIn).toHaveBeenCalledExactlyOnceWith({ user });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.schedule).toHaveBeenCalledWith(expect.any(Function), 900);
    h.schedule.mock.calls[0][0]();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith("/studio", { replace: true });
  });
});
