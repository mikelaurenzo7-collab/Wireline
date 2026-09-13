import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthAccessPanel, { type AuthAccessPanelProps } from "../src/components/auth/AuthAccessPanel";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  panelProps: {} as AuthAccessPanelProps,
  capturedIntent: null as Record<string, unknown> | null,
  persistedIntent: vi.fn(),
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  mounting: true,
  fetch: vi.fn(),
  navigate: vi.fn(),
  signIn: vi.fn(),
}));

// Exercise the real component handlers with persistent hook state, without a
// browser, provider credentials, or a live account.
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: unknown) => {
      const index = harness.stateCursor++;
      if (!(index in harness.states)) {
        harness.states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [
        harness.states[index],
        (next: unknown) => {
          harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = harness.refCursor++;
      return (harness.refs[index] ??= { current: initial });
    },
    useEffect: (effect: () => unknown) => {
      if (harness.mounting) harness.effects.push(effect);
    },
  };
});
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => ({ pathname: "/", search: "" }),
  useNavigate: () => harness.navigate,
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signIn: harness.signIn }),
}));
vi.mock("../src/lib/canonical-browser-origin", () => ({
  canonicalLegacyBrowserHandoff: () => null,
}));
vi.mock("../src/lib/auth-redirect", () => ({
  persistAuthRedirect: vi.fn(),
  persistOAuthReturnFromSearch: vi.fn(),
  persistWorkspaceMode: vi.fn(),
  readRedirectFromSearch: () => null,
  readStoredWorkspaceMode: () => null,
  resolvePostAuthDestination: () => "/studio",
  workspaceFromIntent: () => "personal",
}));
vi.mock("../src/lib/signup-intent", () => ({
  captureSignupIntentFromLocation: () => harness.capturedIntent,
  persistSignupIntent: (intent: unknown) => { harness.persistedIntent(intent); return intent; },
  sanitizeSignupIntent: (intent: unknown) => intent,
  signupTemplateLabel: () => "",
  syncSignupIntent: vi.fn(),
}));
vi.mock("../src/lib/plan-catalog", () => ({ STRIPE_PLANS: [] }));
vi.mock("../src/lib/demo-attribution-client", () => ({
  captureDemoSourceFromLocation: vi.fn(),
  readDemoSourceCookie: () => null,
}));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEventOnce: vi.fn(),
}));
vi.mock("../src/lib/post-signup-onboarding", () => ({
  clearFreshSignupSession: vi.fn(),
  markFreshSignupSession: vi.fn(),
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({
  WirelineLockup: "span",
}));

type Props = {
  children?: ReactNode;
  name?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string; checked: boolean } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
};

function descendants(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Props>;
  return [element, ...descendants(element.props.children)];
}

function render() {
  harness.stateCursor = 0;
  harness.refCursor = 0;
  return descendants(AuthAccessPanel({ embedded: true, initialMode: "signin", ...harness.panelProps }));
}

function find(predicate: (element: ReactElement<Props>) => boolean) {
  const element = render().find(predicate);
  if (!element) throw new Error("Expected account control was not rendered.");
  return element;
}

function control(label: string) {
  return find(
    (element) => element.props["aria-label"] === label || element.props.children === label,
  );
}

function field(name: string, value: string) {
  find((element) => element.props.name === name).props.onChange?.({
    target: { value, checked: false },
  });
}

function form() {
  const submit = find((element) => element.type === "form").props.onSubmit;
  if (!submit) throw new Error("Missing account form handler.");
  return () => submit({ preventDefault: vi.fn() });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function actionRequests() {
  return harness.fetch.mock.calls.filter(([url]) => url !== "/api/auth/providers");
}

async function mount() {
  render();
  harness.mounting = false;
  for (const effect of harness.effects) effect();
  await vi.waitFor(() => {
    expect(render().some((element) => element.props["aria-label"] === "Continue with Google")).toBe(
      true,
    );
  });
  field("email", "qa@example.test");
  field("password", "PrivateTest123");
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  harness.panelProps = {};
  harness.capturedIntent = null;
  harness.states = [];
  harness.refs = [];
  harness.effects = [];
  harness.mounting = true;
  harness.fetch.mockImplementation(async (url: string) => {
    if (url === "/api/auth/providers") {
      return response({
        providers: { google: true, microsoft: false, yahoo: false },
      });
    }
    return response({ error: "Please try again." }, 503);
  });
  vi.stubGlobal("fetch", harness.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("account access pending requests", () => {
  it("does not lock the form when local validation rejects a submission", async () => {
    await mount();
    field("email", "");
    await form()();
    expect(actionRequests()).toHaveLength(0);
    field("email", "qa@example.test");
    await form()();
    expect(actionRequests()).toHaveLength(1);
  });

  it("keeps consent fixed while an agreed signup is pending", async () => {
    await mount();
    await control("Create Account").props.onClick?.();
    find((element) => element.props.name === "termsAccepted").props.onChange?.({
      target: { value: "", checked: true },
    });
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const request = form()();
    expect(find((element) => element.props.name === "termsAccepted").props.disabled).toBe(true);
    expect(actionRequests()[0][0]).toBe("/api/auth/signup");
    expect(JSON.parse(actionRequests()[0][1].body).termsAccepted).toBe(true);
    pending.resolve(response({ error: "Please try again." }, 503));
    await request;
  });

  it("locks account modes, fields, and email submission while OAuth starts", async () => {
    await mount();
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const request = control("Continue with Google").props.onClick?.();

    const mutable = render().filter(
      (element) =>
        element.type === "button" ||
        element.props.name === "email" ||
        element.props.name === "password",
    );
    expect(mutable.length).toBeGreaterThan(5);
    expect(mutable.every((element) => element.props.disabled === true)).toBe(true);

    pending.resolve(response({ error: "Provider unavailable." }, 503));
    await request;
  });

  it("rejects an email submit from the same render after an OAuth request starts", async () => {
    await mount();
    const submit = form();
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const request = control("Continue with Google").props.onClick?.();

    await submit();
    expect(actionRequests().map(([url]) => url)).toEqual(["/api/auth/google/url"]);

    pending.resolve(response({ error: "Provider unavailable." }, 503));
    await request;
  });

  it("keeps the current account mode while email sign-in is pending", async () => {
    await mount();
    const switchMode = control("Create Account").props.onClick;
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const request = form()();

    await switchMode?.();
    expect(control("Create Account").props["aria-pressed"]).toBe(false);
    expect(control("Create Account").props.disabled).toBe(true);

    pending.resolve(response({ error: "Please try again." }, 503));
    await request;
  });

  it("admits only one email request when submit fires twice before a render", async () => {
    await mount();
    const submit = form();
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const first = submit();
    const second = submit();

    expect(actionRequests()).toHaveLength(1);
    pending.resolve(response({ error: "Please try again." }, 503));
    await Promise.all([first, second]);
  });

  it("admits only one provider request from repeated pre-render clicks", async () => {
    await mount();
    const start = control("Continue with Google").props.onClick;
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const first = start?.();
    const second = start?.();

    expect(actionRequests()).toHaveLength(1);
    pending.resolve(response({ error: "Provider unavailable." }, 503));
    await Promise.all([first, second]);
  });

  it("restores email access and account modes after an OAuth failure", async () => {
    await mount();
    await control("Continue with Google").props.onClick?.();
    expect(control("Create Account").props.disabled).not.toBe(true);
    expect(find((element) => element.props.name === "email").props.disabled).not.toBe(true);

    await form()();
    expect(actionRequests().map(([url]) => url)).toEqual([
      "/api/auth/google/url",
      "/api/auth/signin",
    ]);
  });

  it("restores controls and admits a retry after an email failure", async () => {
    await mount();
    await form()();
    expect(control("Create Account").props.disabled).not.toBe(true);
    expect(find((element) => element.props.type === "submit").props.disabled).not.toBe(true);
    await form()();
    expect(actionRequests()).toHaveLength(2);
  });

  it("keeps password recovery in place until its request settles", async () => {
    await mount();
    await control("Forgot?").props.onClick?.();
    const back = find((element) => element.props.className === "wl-access-panel__back");
    const submit = form();
    const pending = deferredResponse();
    harness.fetch.mockReturnValueOnce(pending.promise);
    const request = submit();

    await back.props.onClick?.();
    expect(
      find((element) => element.props.className === "wl-access-panel__back").props.disabled,
    ).toBe(true);
    await submit();
    expect(actionRequests().map(([url]) => url)).toEqual(["/api/auth/forgot-password"]);

    pending.resolve(response({ message: "If registered, a link is on its way." }));
    await request;
    expect(
      find((element) => element.props.className === "wl-access-panel__back").props.disabled,
    ).not.toBe(true);
  });
});


describe("sales landing signup intent", () => {
  async function prepareSignup() {
    harness.panelProps = { initialMode: "signup", defaultTemplateId: "sales-rep" };
    await mount();
    find((element) => element.props.name === "termsAccepted").props.onChange?.({
      target: { value: "", checked: true },
    });
  }

  it("sends a fresh embedded email signup into the Sales Rep setup", async () => {
    await prepareSignup();
    await form()();
    const [url, request] = actionRequests()[0];
    expect(url).toBe("/api/auth/signup");
    expect(JSON.parse(request.body)).toMatchObject({ preferredPlanId: "personal" });
    expect(harness.persistedIntent).toHaveBeenCalledWith(expect.objectContaining({ preferredTemplateId: "sales-rep" }));
  });

  it("persists Sales Rep intent before an OAuth signup leaves the page", async () => {
    await prepareSignup();

    await control("Continue with Google").props.onClick?.();
    expect(harness.persistedIntent).toHaveBeenCalledWith(expect.objectContaining({ preferredTemplateId: "sales-rep" }));
    expect(actionRequests()[0][0]).toBe("/api/auth/google/url");
  });

  it.each([
    { preferredPlanId: "business", preferredBillingInterval: "year", preferredTemplateId: "recruiter" },
    { preferredPlanId: "team", signupWedge: "support" },
  ])("preserves a prior explicit role or wedge: %j", async (choice) => {
    harness.capturedIntent = { ...choice, capturedAt: "2026-09-13T00:00:00Z" };
    await prepareSignup();
    await form()();
    expect(harness.states).toContainEqual(expect.objectContaining(choice));
    const { preferredTemplateId: _template, ...submittedChoice } = choice;
    expect(JSON.parse(actionRequests()[0][1].body)).toMatchObject(submittedChoice);
  });

  it("adds the sales default without replacing paid plan or campaign attribution", async () => {
    harness.capturedIntent = { preferredPlanId: "business", preferredBillingInterval: "year", utmCampaign: "sales_launch", capturedAt: "2026-09-13T00:00:00Z" };
    await prepareSignup();
    expect(harness.persistedIntent).toHaveBeenCalledWith(expect.objectContaining({ ...harness.capturedIntent, preferredTemplateId: "sales-rep" }));
    await form()();
    expect(JSON.parse(actionRequests()[0][1].body)).toMatchObject({ preferredPlanId: "business", preferredBillingInterval: "year", utmCampaign: "sales_launch" });
  });
});
