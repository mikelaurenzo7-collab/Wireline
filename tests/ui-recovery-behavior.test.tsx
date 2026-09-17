// Component-level hook harness: no browser or provider access.
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as any[],
  callbacks: [] as any[],
  effects: [] as any[],
  pending: [] as any[],
  stateCursor: 0,
  refCursor: 0,
  callbackCursor: 0,
  effectCursor: 0,
  success: vi.fn(),
  error: vi.fn(),
  fetch: vi.fn(),
  navigate: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshAgents: vi.fn(),
  user: { id: "owner", email: "owner@example.com" } as any,
  authLoading: false,
  params: new URLSearchParams(),
  routeParams: {} as Record<string, string>,
  location: { pathname: "/accept-invite", search: "", hash: "#token=invitation" },
  agents: [{ id: "bot-a", name: "Front desk" }],
  agentsLoading: false,
  degraded: false,
}));
function effect(callback: () => any, deps: any[]) {
  const index = h.effectCursor++;
  const previous = h.effects[index];
  if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
    h.pending.push(() => {
      previous?.cleanup?.();
      h.effects[index] = { deps, cleanup: callback() };
    });
  }
}
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (value: any) => {
        h.states[index] = typeof value === "function" ? value(h.states[index]) : value;
      },
    ];
  },
  useRef: (initial: any) => (h.refs[h.refCursor++] ??= { current: initial }),
  useEffect: (callback: () => any, deps: any[]) => effect(callback, deps),
  useLayoutEffect: (callback: () => any, deps: any[]) => effect(callback, deps),
  useCallback: (callback: any, deps: any[]) => {
    const index = h.callbackCursor++;
    const previous = h.callbacks[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      h.callbacks[index] = { callback, deps };
    return h.callbacks[index].callback;
  },
  useMemo: (callback: () => any) => callback(),
}));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => h.location,
  useNavigate: () => h.navigate,
  useSearchParams: () => [h.params, vi.fn()],
  useParams: () => h.routeParams,
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading, signIn: h.signIn, signOut: h.signOut }),
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({
    agents: h.agents,
    loading: h.agentsLoading,
    degraded: h.degraded,
    refresh: h.refreshAgents,
  }),
}));
vi.mock("../src/lib/api", () => ({
  AUTH_SESSION_EXPIRED_EVENT: "session-expired",
  refreshSessionIfNeeded: vi.fn(),
  authFetch: h.fetch,
  safeJson: (response: Response) => response.json(),
  readApiJson: async (response: Response) => {
    const data = await response.json();
    return response.ok
      ? { ok: true, data }
      : { ok: false, status: response.status, error: data.error };
  },
}));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "meta" }));
vi.mock("../src/lib/auth-redirect", () => ({
  readStoredWorkspaceMode: () => "personal",
  resolvePostAuthDestination: () => "/studio",
}));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  NativeSelect: "select",
  EmptyState: "empty-state",
  Badge: "badge",
  Skeleton: "skeleton",
  Switch: "switch",
}));
vi.mock("../src/components/molecules", () => ({ FormField: "label", StatusNotice: "notice" }));
vi.mock("../src/components/molecules/StatusNotice", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/EmptyState", () => ({ EmptyState: "empty-state" }));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({ default: "marketing-frame" }));
vi.mock("../src/components/marketing/MarketingChrome", () => ({ default: "marketing-chrome" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({
  WirelineLockup: "brand",
  WirelineWordmark: "wordmark",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace-shell" }));
vi.mock("../src/components/WorkspaceRecovery", () => ({ default: "workspace-recovery" }));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "settings-tabs" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "workspace-frame",
  WorkspacePageIntro: "workspace-intro",
}));
vi.mock("../src/components/layout/WorkspaceControlBand", () => ({ default: "controls" }));
vi.mock("../src/components/layout/WorkspaceTabStrip", () => ({ WorkspaceTabStrip: "tabs" }));
vi.mock("../src/components/KnowledgeBaseClaude", () => ({ default: "knowledge-editor" }));
vi.mock("../src/components/training/WebsiteKnowledgeImport", () => ({ default: "website-import" }));
vi.mock("../src/components/training/ReportingPreferences", () => ({
  default: "report-preferences",
}));
vi.mock("../src/components/training/RecentCallArtifactRequests", () => ({
  default: "recent-reports",
}));

vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: h.success, error: h.error }),
}));
vi.mock("../src/contexts/BrandingContext", () => ({
  useBranding: () => ({ updateBranding: vi.fn() }),
}));
vi.mock("../src/components/ConfirmModal", () => ({ default: "confirm-modal" }));
vi.mock("../src/components/IntegrationHealthBanner", () => ({ default: "integration-health" }));
vi.mock("../src/components/layout/AdminHubViewport", () => ({ default: "admin-viewport" }));
vi.mock("../src/components/layout/ClientRouteLoading", () => ({ default: "route-loading" }));
vi.mock("../src/components/atoms/skeleton-presets", () => ({ PanelSkeleton: "panel-skeleton" }));
vi.mock("../src/components/admin/ComplianceChecklist", () => ({ default: "compliance-checklist" }));
vi.mock("../src/components/admin/AccountsPanel", () => ({ AccountsPanel: "AccountsPanel" }));
vi.mock("../src/components/admin/BrandingPanel", () => ({ BrandingPanel: "BrandingPanel" }));
vi.mock("../src/components/admin/CarrierPanel", () => ({ CarrierPanel: "CarrierPanel" }));
vi.mock("../src/components/admin/SubscriptionPanel", () => ({
  SubscriptionPanel: "SubscriptionPanel",
}));
vi.mock("../src/components/admin/TeamPanel", () => ({ TeamPanel: "TeamPanel" }));
vi.mock("../src/components/admin/GrowthPanel", () => ({ GrowthPanel: "GrowthPanel" }));

vi.mock("../src/components/settings/CompanyIdentityPack", () => ({ default: "company-identity" }));
vi.mock("../src/components/ui/shadcn/Select", () => ({
  Select: "select",
  SelectContent: "options",
  SelectItem: "option",
  SelectTrigger: "select-trigger",
  SelectValue: "select-value",
}));
vi.mock("../src/components/EmailInbox", () => ({ default: "email-inbox" }));
vi.mock("../src/components/SmsThreads", () => ({ default: "sms-inbox" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/components/RoleplaySandbox", () => ({ default: "roleplay" }));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEvent: vi.fn(),
  emitProductEventOnce: vi.fn(),
}));
vi.mock("../src/lib/post-signup-onboarding", () => ({ setPostSignupFlowActive: vi.fn() }));
vi.mock("../src/lib/wireline-create-flow", () => ({
  clearPostCreateWizard: vi.fn(),
  readPostCreateWizardStep: () => "launch",
  stashPostCreateWizardStep: vi.fn(),
}));
vi.mock("../src/lib/signup-intent", async (original) => ({
  ...(await original<typeof import("../src/lib/signup-intent")>()),
  activationBillingHref: () => "/settings/billing",
  getStoredSignupIntent: () => "starter",
}));
import PhoneNumberPicker from "../src/components/PhoneNumberPicker";
import PostCreateActivationWizard from "../src/components/onboarding/PostCreateActivationWizard";
import EmailPage from "../src/pages/EmailPage";
import PhoneSetupPanel from "../src/components/PhoneSetupPanel";
import RouteChangeA11y from "../src/components/RouteChangeA11y";
import AdminSettings from "../src/components/AdminSettings";
import { SupportPage } from "../src/components/SupportPage";
import { ContactPage } from "../src/components/ContactPage";
import AcceptInvite from "../src/pages/AcceptInvite";
import ResetPassword from "../src/pages/ResetPassword";
import KnowledgePage from "../src/pages/KnowledgePage";
import SolutionsPage from "../src/pages/SolutionsPage";
import TrustPackPage from "../src/components/TrustPackPage";
import Developers from "../src/pages/Developers";
import TeamSettings from "../src/pages/TeamSettings";
import AppointmentsPanel from "../src/components/AppointmentsPanel";
import SalesforceIntegrationPage from "../src/pages/SalesforceIntegrationPage";
import CrmConnectionCard from "../src/components/CrmConnectionCard";
import MailboxConnectionCard from "../src/components/MailboxConnectionCard";
vi.mock("../src/components/IntegrationCapabilityPanel", () => ({ default: "capabilities" }));
vi.mock("../src/components/layout/IntegrationLogos", () => ({ getIntegrationLogo: () => null }));

function descendants(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<any>;
  return [element, ...descendants(element.props.children), ...descendants(element.props.secondary)];
}
function render(page: () => ReactNode) {
  h.stateCursor = h.refCursor = h.effectCursor = h.callbackCursor = 0;
  const elements = descendants(page());
  h.pending.splice(0).forEach((callback) => callback());
  return elements;
}
function content(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(content).join(" ");
  if (node && typeof node === "object" && "props" in node)
    return content((node as ReactElement<any>).props.children);
  return "";
}
function click(page: () => ReactNode, label: string) {
  const button = render(page).find(
    (e) => e.type === "button" && content(e.props.children) === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button.props.onClick();
}
const submit = (page: () => ReactNode) =>
  render(page)
    .find((e) => e.type === "form")!
    .props.onSubmit({ preventDefault() {} });
function fill(page: () => ReactNode, values: string[]) {
  render(page)
    .filter((e) => e.type === "input" || e.type === "textarea")
    .forEach((e, index) => e.props.onChange({ target: { value: values[index] } }));
}
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
function unmount() {
  h.effects.forEach((entry) => entry?.cleanup?.());
}

beforeEach(() => {
  vi.clearAllMocks();
  h.states = [];
  h.refs = [];
  h.callbacks = [];
  h.effects = [];
  h.pending = [];
  h.user = { id: "owner", email: "owner@example.com" };
  h.authLoading = false;
  h.params = new URLSearchParams();
  h.routeParams = {};
  h.location = { pathname: "/accept-invite", search: "", hash: "#token=invitation" };
  h.agents = [{ id: "bot-a", name: "Front desk" }];
  h.agentsLoading = false;
  h.degraded = false;
  h.fetch.mockReset().mockResolvedValue(Response.json({ sent: true }));
  h.signIn.mockReset();
  h.signOut.mockReset().mockResolvedValue(undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
    removeItem: vi.fn((key) => storage.delete(key)),
  });
  vi.stubGlobal("window", {
    location: {
      pathname: "/reset-password",
      search: "",
      hash: "#token=reset",
      origin: "https://botbound.me",
      href: "",
      assign: vi.fn(),
    },
    history: { state: null, replaceState: vi.fn() },
    setTimeout,
    clearTimeout,
    plausible: vi.fn(),
  });
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  ["support", SupportPage],
  ["contact", ContactPage],
] as const)("%s delivery recovery", (_name, page) => {
  function draft() {
    fill(
      page,
      page === SupportPage
        ? ["sender@example.com", "Help please", "Please help with this request."]
        : ["sender@example.com", "Example", "123", "Help please", "Please help with this request."],
    );
  }
  it("keeps confirmed delivery successful when analytics throws", async () => {
    draft();
    (window as any).plausible.mockImplementation(() => {
      throw new Error("network analytics failed");
    });
    await submit(page);
    expect(render(page).some((e) => e.props.role === "status")).toBe(true);
    expect(window.location.href).toBe("");
    expect(h.states).not.toContain("network analytics failed");
  });
  it("retains the draft and offers an explicit email action after an outage", async () => {
    draft();
    h.fetch.mockResolvedValue(Response.json({ error: "Temporary outage" }, { status: 503 }));
    await submit(page);
    const elements = render(page);
    expect(window.location.href).toBe("");
    expect(elements.find((e) => e.type === "textarea")?.props.value).toContain("Please help");
    expect(
      elements.find(
        (e) => e.type === "a" && content(e.props.children) === "Open draft in email app",
      )?.props.href,
    ).toContain("mailto:support@botbound.me?");
    expect(elements.some((e) => e.props.role === "status")).toBe(false);
  });
  it("admits one delivery before the next render", async () => {
    draft();
    let resolve!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const handler = render(page).find((e) => e.type === "form")!.props.onSubmit;
    const first = handler({ preventDefault() {} });
    const second = handler({ preventDefault() {} });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    resolve(Response.json({ sent: true }));
    await Promise.all([first, second]);
  });
  it("requires delivery confirmation before showing success", async () => {
    draft();
    h.fetch.mockResolvedValue(Response.json({ sent: false }));
    await submit(page);
    expect(render(page).some((e) => e.props.role === "status")).toBe(false);
  });
});

describe("invitation recovery", () => {
  it("keeps the invitation across a transient failure and retries it", async () => {
    h.fetch.mockRejectedValueOnce(new Error("Network unavailable"));
    render(AcceptInvite);
    await settle();
    expect(sessionStorage.getItem("wireline_pending_invitation")).toBe("invitation");
    h.fetch.mockResolvedValue(Response.json({ success: true }));
    click(AcceptInvite, "Try again");
    render(AcceptInvite);
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem("wireline_pending_invitation")).toBeNull();
    expect(render(AcceptInvite).some((e) => content(e.props.children) === "Open workspace")).toBe(
      true,
    );
  });
  it("signs out before switching accounts and retains the invitation redirect", async () => {
    h.fetch.mockResolvedValue(Response.json({ error: "Wrong email" }, { status: 400 }));
    render(AcceptInvite);
    await settle();
    click(AcceptInvite, "Sign in with another email");
    await settle();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith("/signin?redirect=%2Faccept-invite", { replace: true });
    expect(sessionStorage.getItem("wireline_pending_invitation")).toBe("invitation");
  });
  it("does not crash when storage is blocked", async () => {
    h.user = null;
    (sessionStorage.setItem as any).mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(() => render(AcceptInvite)).not.toThrow();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.states).toContain(
      "Allow session storage in your browser, then reopen your invitation to sign in.",
    );
  });
  it("does not clear a retry credential on malformed success", async () => {
    h.fetch.mockResolvedValue(Response.json({}));
    render(AcceptInvite);
    await settle();
    expect(sessionStorage.getItem("wireline_pending_invitation")).toBe("invitation");
    expect(h.states).toContain("error");
  });
});

describe("knowledge target safety", () => {
  it.each(["loading", "degraded", "missing"])("does not mount write controls while %s", (state) => {
    h.agentsLoading = state === "loading";
    h.degraded = state === "degraded";
    if (state === "missing") h.params.set("agent", "deleted-bot");
    expect(
      render(KnowledgePage).some(
        (e) => e.type === "website-import" || e.type === "knowledge-editor",
      ),
    ).toBe(false);
  });
  it("uses a valid explicitly selected Bot", () => {
    h.agents.push({ id: "bot-b", name: "Sales" });
    h.params.set("agent", "bot-b");
    expect(render(KnowledgePage).find((e) => e.type === "knowledge-editor")?.props.agentId).toBe(
      "bot-b",
    );
  });
});

describe("password reset completion", () => {
  function draft() {
    fill(ResetPassword, ["StrongPass123!", "StrongPass123!"]);
  }
  it.each(["missing user", "local sign-in failure"])("offers sign-in after %s", async (reason) => {
    draft();
    h.fetch.mockResolvedValue(Response.json(reason === "missing user" ? {} : { user: h.user }));
    if (reason === "local sign-in failure")
      h.signIn.mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    await submit(ResetPassword);
    expect(
      render(ResetPassword).some(
        (e) =>
          e.type === "a" &&
          e.props.to === "/signin" &&
          content(e.props.children) === "Continue to sign in",
      ),
    ).toBe(true);
  });
  it("offers the workspace after confirmed client sign-in", async () => {
    draft();
    h.fetch.mockResolvedValue(Response.json({ user: h.user }));
    await submit(ResetPassword);
    expect(render(ResetPassword).some((e) => e.type === "a" && e.props.to === "/studio")).toBe(
      true,
    );
  });
  it("does not sign in after leaving the reset screen", async () => {
    draft();
    let resolve!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = submit(ResetPassword);
    unmount();
    resolve(Response.json({ user: h.user }));
    await pending;
    expect(h.signIn).not.toHaveBeenCalled();
  });
});

describe("public route and clipboard recovery", () => {
  it.each(["__proto__", "constructor", "toString"])(
    "handles inherited object key %s in dynamic routes",
    (key) => {
      h.routeParams = { wedge: key, vertical: key };
      expect(() => render(SolutionsPage)).not.toThrow();
      expect(() => render(TrustPackPage)).not.toThrow();
      expect(
        render(TrustPackPage).some(
          (e) => e.type === "h1" && content(e.props.children) === "Trust pack not found",
        ),
      ).toBe(true);
    },
  );
  it("does not report copied when clipboard rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Not allowed")) },
    });
    render(Developers);
    const button = render(Developers).find(
      (e) => e.type === "button" && typeof e.props.onClick === "function",
    );
    await button!.props.onClick();
    expect(render(Developers).some((e) => e.props.role === "alert")).toBe(true);
    expect(h.states[0]).toBe(false);
  });
});

describe("team invitation delivery feedback", () => {
  it("does not offer invites before loading finishes", () => {
    h.fetch.mockImplementation(() => new Promise(() => {}));
    expect(
      render(TeamSettings).find(
        (e) => e.type === "button" && content(e.props.children).includes("Invite"),
      )?.props.disabled,
    ).toBe(true);
  });
  it("distinguishes a saved invitation from delivered email", async () => {
    h.fetch.mockResolvedValue(Response.json({ members: [] }));
    render(TeamSettings);
    await settle();
    click(TeamSettings, " Invite");
    fill(TeamSettings, ["teammate@example.com"]);
    h.fetch
      .mockResolvedValueOnce(Response.json({ success: true, email_sent: false }))
      .mockResolvedValue(Response.json({ members: [] }));
    await submit(TeamSettings);
    const notice = render(TeamSettings).find(
      (e) => e.type === "notice" && e.props.title === "Invitation needs email delivery",
    );
    expect(notice?.props.tone).toBe("warning");
    expect(content(notice?.props.children)).toContain("was saved");
  });
});

describe("admin operation feedback", () => {
  async function ready(tab: string) {
    h.location = { pathname: "/admin", search: `?tab=${tab}`, hash: "" };
    h.fetch.mockImplementation(async (url: string) =>
      Response.json(
        url === "/api/agents"
          ? { agents: [] }
          : url === "/api/team"
            ? { members: [] }
            : url === "/api/phone-numbers"
              ? { numbers: [] }
              : {},
      ),
    );
    render(AdminSettings);
    await settle();
  }
  it("does not report a failed number claim as successful", async () => {
    await ready("carrier");
    const panel = render(AdminSettings).find((e) => e.type === "CarrierPanel")!;
    h.fetch.mockResolvedValue(Response.json({ error: "Number unavailable" }, { status: 409 }));
    await panel.props.onAddNumber("+15555550100");
    expect(h.success).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith("Failed to add number", "Number unavailable");
  });
  it("reports a rejected Bot assignment", async () => {
    await ready("carrier");
    const panel = render(AdminSettings).find((e) => e.type === "CarrierPanel")!;
    h.fetch.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    await panel.props.onUpdateNumberAgent("number-a", "bot-a");
    expect(h.error).toHaveBeenCalledWith(
      "Assignment failed",
      "Could not update the agent for this number.",
    );
  });
  it("does not report undelivered invitations as sent", async () => {
    await ready("team");
    const panel = render(AdminSettings).find((e) => e.type === "TeamPanel")!;
    h.fetch.mockResolvedValueOnce(Response.json({ success: true, email_sent: false }));
    await panel.props.onInvite("teammate@example.com", "member");
    expect(h.success).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith(
      "Invitation needs email delivery",
      expect.stringContaining("was saved"),
    );
  });
  it("withholds editable defaults when loading fails", async () => {
    h.location = { pathname: "/admin", search: "?tab=branding", hash: "" };
    h.fetch.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    render(AdminSettings);
    await settle();
    const elements = render(AdminSettings);
    expect(elements.some((e) => e.type === "BrandingPanel")).toBe(false);
    expect(
      elements.some((e) => e.type === "notice" && e.props.title === "Settings unavailable"),
    ).toBe(true);
  });
  it("preserves confirmed deletion feedback when follow-up sign-out fails", async () => {
    await ready("subscription");
    const panel = render(AdminSettings).find((e) => e.type === "SubscriptionPanel")!;
    h.fetch.mockResolvedValueOnce(Response.json({ success: true }, { status: 202 }));
    h.signOut.mockRejectedValueOnce(new Error("Sign-out unavailable"));
    await panel.props.onDeleteAccount("DELETE MY ACCOUNT");
    expect(h.fetch).toHaveBeenLastCalledWith(
      "/api/user/account",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(h.error).toHaveBeenCalledExactlyOnceWith(
      "Deletion requested; sign-out incomplete",
      "Your account deletion was requested. Retry sign-out from Account settings.",
    );
  });
});

describe("lazy route focus recovery", () => {
  function setup() {
    vi.useFakeTimers();
    const state = { target: null as any, loading: false };
    const focus = vi.fn();
    const scroll = vi.fn();
    const attributes = new Map<string, string>();
    const target = {
      focus,
      scrollIntoView: scroll,
      closest: () => null,
      querySelector: () => null,
      hasAttribute: (key: string) => attributes.has(key),
      getAttribute: (key: string) => attributes.get(key),
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
    };
    let mutation: () => void = () => {};
    const disconnect = vi.fn();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: () => void) {
          mutation = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.stubGlobal("document", {
      body: {},
      querySelector: (selector: string) =>
        selector === "[data-route-loading]" ? state.loading : state.target,
      getElementById: () => state.target,
      addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
      removeEventListener: (event: string) => listeners.delete(event),
    });
    Object.assign(window, { setTimeout, clearTimeout, scrollTo: vi.fn() });
    h.location = { pathname: "/studio", search: "", hash: "" };
    return { state, focus, scroll, target, mutate: () => mutation(), disconnect, listeners };
  }
  it("waits for a lazy page heading, then focuses it once", async () => {
    const t = setup();
    render(RouteChangeA11y);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.focus).not.toHaveBeenCalled();
    t.state.target = t.target;
    t.mutate();
    expect(t.focus).toHaveBeenCalledTimes(1);
    t.mutate();
    expect(t.focus).toHaveBeenCalledTimes(1);
    expect(t.disconnect).toHaveBeenCalled();
  });
  it("does not focus content hidden behind a lazy fallback", async () => {
    const t = setup();
    t.state.target = t.target;
    t.state.loading = true;
    render(RouteChangeA11y);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.focus).not.toHaveBeenCalled();
    t.state.loading = false;
    t.mutate();
    expect(t.focus).toHaveBeenCalledTimes(1);
  });
  it("keeps the user's focus after interaction during loading", async () => {
    const t = setup();
    render(RouteChangeA11y);
    await vi.advanceTimersByTimeAsync(0);
    t.listeners.get("keydown")?.();
    t.state.target = t.target;
    t.mutate();
    expect(t.focus).not.toHaveBeenCalled();
  });
  it("preserves filter focus when only the query changes", async () => {
    const t = setup();
    t.state.target = t.target;
    render(RouteChangeA11y);
    await vi.advanceTimersByTimeAsync(0);
    h.location = { ...h.location, search: "?agent=bot-a" };
    render(RouteChangeA11y);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.focus).toHaveBeenCalledTimes(1);
  });
});

describe("cookie session resilience", () => {
  async function setupAuth() {
    const { AuthProvider } = await vi.importActual<typeof import("../src/contexts/AuthContext")>(
      "../src/contexts/AuthContext",
    );
    const storage = {
      getItem: () => {
        throw new Error("Blocked");
      },
      removeItem: () => {
        throw new Error("Blocked");
      },
      setItem: () => {
        throw new Error("Blocked");
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.assign(window, {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });
    vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.location = { pathname: "/studio", search: "", hash: "" };
    return () => render(() => AuthProvider({ children: null }))[0].props.value;
  }
  it("hydrates a cookie session despite inaccessible legacy storage", async () => {
    const auth = await setupAuth();
    h.fetch.mockResolvedValue(Response.json({ user: h.user }));
    auth();
    await settle();
    expect(auth().user).toEqual(h.user);
  });
  it("signs in and out when preference storage is blocked", async () => {
    const auth = await setupAuth();
    h.fetch.mockResolvedValue(Response.json({ user: null }));
    auth();
    await settle();
    expect(() => auth().signIn({ user: h.user })).not.toThrow();
    expect(auth().user).toEqual(h.user);
    h.fetch.mockResolvedValue(Response.json({ success: true }));
    await auth().signOut();
    expect(auth().user).toBeNull();
  });
  it("reports failed server sign-out instead of claiming the cookie session ended", async () => {
    const auth = await setupAuth();
    h.fetch.mockResolvedValue(Response.json({ user: h.user }));
    auth();
    await settle();
    h.fetch.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    await expect(auth().signOut()).rejects.toThrow("Sign-out did not complete");
    expect(auth().user).toEqual(h.user);
  });
});

describe("phone line status honesty", () => {
  it.each(["outage", "malformed", "degraded"])(
    "does not show an empty setup flow during %s",
    async (kind) => {
      h.fetch.mockResolvedValue(
        Response.json(kind === "degraded" ? { numbers: [], degraded: true } : {}, {
          status: kind === "outage" ? 503 : 200,
        }),
      );
      render(PhoneSetupPanel);
      await settle();
      const elements = render(PhoneSetupPanel);
      expect(
        elements.some((e) => e.type === "empty-state" && e.props.title === "No line yet"),
      ).toBe(false);
      expect(
        elements.some((e) => e.type === "notice" && e.props.title === "Lines need attention"),
      ).toBe(true);
    },
  );
  it("shows a routing failure instead of describing the line as active", async () => {
    h.fetch.mockResolvedValue(
      Response.json({
        numbers: [
          {
            id: "line-a",
            phone_number: "+15555550100",
            agent_id: "bot-a",
            native_voice_status: "degraded",
            native_voice_error: "Routing could not be confirmed",
          },
        ],
      }),
    );
    render(PhoneSetupPanel);
    await settle();
    const elements = render(PhoneSetupPanel);
    expect(
      elements.some((e) => e.type === "p" && content(e.props.children).includes("Needs attention")),
    ).toBe(true);
    expect(
      elements.some(
        (e) =>
          e.type === "notice" &&
          content(e.props.children).includes("Routing could not be confirmed"),
      ),
    ).toBe(true);
  });
});

describe("inbox filter recovery", () => {
  it("does not briefly show every mailbox while a scoped link loads", () => {
    h.params.set("account", "mail-a");
    h.fetch.mockImplementation(() => new Promise(() => {}));
    expect(render(EmailPage).some((e) => e.type === "email-inbox")).toBe(false);
  });
  it("keeps a scoped mailbox failure separate from all conversations", async () => {
    h.params.set("account", "mail-a");
    h.fetch.mockRejectedValue(new Error("Offline"));
    render(EmailPage);
    await settle();
    const elements = render(EmailPage);
    expect(elements.some((e) => e.type === "email-inbox")).toBe(false);
    expect(
      elements.some((e) => e.type === "notice" && e.props.title === "Selected mailbox unavailable"),
    ).toBe(true);
  });
  it("requires an explicit choice when a scoped Bot is missing", async () => {
    h.params.set("agent", "deleted-bot");
    h.fetch.mockResolvedValue(Response.json({ accounts: [] }));
    render(EmailPage);
    await settle();
    const elements = render(EmailPage);
    expect(elements.some((e) => e.type === "email-inbox")).toBe(false);
    expect(
      elements.some((e) => e.type === "notice" && e.props.title === "Choose an available inbox"),
    ).toBe(true);
  });
  it("opens the requested available mailbox", async () => {
    h.params.set("account", "mail-a");
    h.fetch.mockResolvedValue(
      Response.json({
        accounts: [{ id: "mail-a", emailAddress: "bot@example.com", provider: "agentmail" }],
      }),
    );
    render(EmailPage);
    await settle();
    expect(render(EmailPage).find((e) => e.type === "email-inbox")?.props.accountId).toBe("mail-a");
  });
});

describe("second pass: phone setup mutations", () => {
  async function ready() {
    h.agents = [
      { id: "bot-a", name: "Front desk" },
      { id: "bot-b", name: "Appointments" },
    ];
    h.fetch.mockImplementation(async () =>
      Response.json({
        numbers: [{ id: "line-a", phone_number: "+15555550100", agent_id: "bot-a" }],
      }),
    );
    render(PhoneSetupPanel);
    await settle();
    click(PhoneSetupPanel, " Add line");
    render(PhoneSetupPanel);
  }
  const activate = () =>
    render(PhoneSetupPanel).find(
      (e) => e.type === "button" && content(e.props.children) === "Activate",
    )!;
  it("keeps the Bot selected for a new line across rerenders", async () => {
    await ready();
    render(PhoneSetupPanel)
      .find((e) => e.type === "select")!
      .props.onValueChange("bot-b");
    render(PhoneSetupPanel);
    expect(render(PhoneSetupPanel).find((e) => e.type === "select")!.props.value).toBe("bot-b");
    h.fetch.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    activate().props.onClick();
    await settle();
    expect(JSON.parse(h.fetch.mock.lastCall![1].body).agent_id).toBe("bot-b");
  });
  it("submits activation only once before a rerender", async () => {
    await ready();
    let done!: (response: Response) => void;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const action = activate().props.onClick;
    action();
    action();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    done(Response.json({ error: "Unavailable" }, { status: 503 }));
    await settle();
  });
  it("blocks new activation and assignment when the Bot roster is degraded", async () => {
    await ready();
    h.degraded = true;
    h.fetch.mockClear();
    expect(activate().props.disabled).toBe(true);
    activate().props.onClick();
    render(PhoneSetupPanel)
      .find((e) => e.type === "select" && e.props.value === "bot-a")
      ?.props.onValueChange("bot-b");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("does not confirm activation for a malformed success payload", async () => {
    await ready();
    h.fetch.mockImplementation(async () => Response.json({}));
    activate().props.onClick();
    await settle();
    expect(
      render(PhoneSetupPanel).some((e) => e.type === "notice" && e.props.tone === "success"),
    ).toBe(false);
  });
  it("submits an assignment only once before a rerender", async () => {
    await ready();
    const assignment = render(PhoneSetupPanel)
      .filter((e) => e.type === "select")
      .at(-1)!;
    let done!: (response: Response) => void;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    assignment.props.onValueChange("bot-b");
    assignment.props.onValueChange("bot-a");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.fetch.mock.lastCall![1].body)).toEqual({ agent_id: "bot-b" });
    done(Response.json({ error: "Unavailable" }, { status: 503 }));
    await settle();
  });
  it("does not confirm an assignment without an explicit acknowledgement", async () => {
    await ready();
    h.fetch.mockImplementation(async () => Response.json({}));
    render(PhoneSetupPanel)
      .filter((e) => e.type === "select")
      .at(-1)!
      .props.onValueChange("bot-b");
    await settle();
    expect(
      render(PhoneSetupPanel).some((e) => e.type === "notice" && e.props.tone === "success"),
    ).toBe(false);
    expect(
      render(PhoneSetupPanel).some(
        (e) => e.type === "notice" && e.props.title === "Lines need attention",
      ),
    ).toBe(true);
  });
});

describe("second pass: team and scoped inbox uncertainty", () => {
  it.each([403, 503])("does not infer Owner from a %s team response", async (status) => {
    h.fetch.mockImplementation(async () => Response.json({ error: "Unavailable" }, { status }));
    render(TeamSettings);
    await settle();
    const elements = render(TeamSettings);
    expect(elements.some((e) => e.type === "badge" && content(e.props.children) === "Owner")).toBe(
      false,
    );
    expect(
      elements.some(
        (e) => e.type === "notice" && content(e.props.children).includes("Starter Plus"),
      ),
    ).toBe(false);
  });
  it("rejects malformed team data and offers a local retry", async () => {
    h.fetch.mockImplementation(async () => Response.json({}));
    render(TeamSettings);
    await settle();
    expect(
      render(TeamSettings).some(
        (e) => e.type === "notice" && e.props.title === "Team settings could not be loaded",
      ),
    ).toBe(true);
    h.fetch.mockImplementation(async () => Response.json({ members: [] }));
    click(TeamSettings, "Try again");
    await settle();
    expect(
      render(TeamSettings).some(
        (e) => e.type === "notice" && e.props.title === "Team settings could not be loaded",
      ),
    ).toBe(false);
  });
  it.each(["bot-a", "not-cached"])(
    "preserves Bot scope %s when the roster is unavailable",
    async (agentId) => {
      h.params.set("agent", agentId);
      h.degraded = true;
      h.fetch.mockImplementation(async () => Response.json({ accounts: [] }));
      render(EmailPage);
      await settle();
      const elements = render(EmailPage);
      expect(elements.some((e) => e.type === "email-inbox")).toBe(false);
      const notice = elements.find(
        (e) => e.type === "notice" && e.props.title === "Selected Bot unavailable",
      );
      expect(notice).toBeDefined();
      notice!.props.action.props.onClick();
      expect(h.refreshAgents).toHaveBeenCalledOnce();
      expect(h.params.get("agent")).toBe(agentId);
    },
  );
});

describe("second pass: roster response validation", () => {
  async function provider() {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { AgentsProvider } = await vi.importActual<
      typeof import("../src/contexts/AgentsContext")
    >("../src/contexts/AgentsContext");
    return () => render(() => AgentsProvider({ children: null }))[0].props.value;
  }
  it.each([{ numbers: [], degraded: true }, {}])(
    "keeps unknown phone lookup separate from no line: %j",
    async (numbers) => {
      h.fetch.mockImplementation(async (url) =>
        Response.json(url === "/api/agents" ? { agents: h.agents } : numbers),
      );
      const read = await provider();
      read();
      await settle();
      expect(read().phoneLookupDegraded).toBe(true);
    },
  );
  it("retains the last roster if refresh returns malformed data", async () => {
    vi.useFakeTimers();
    h.fetch.mockImplementation(async (url) =>
      Response.json(url === "/api/agents" ? { agents: h.agents } : { numbers: [] }),
    );
    const read = await provider();
    read();
    await settle();
    expect(read().agents).toHaveLength(1);
    h.fetch.mockImplementation(async (url) =>
      Response.json(url === "/api/agents" ? {} : { numbers: [] }),
    );
    read().refresh();
    read();
    await settle();
    await vi.advanceTimersByTimeAsync(500);
    expect(read().agents[0]?.id).toBe("bot-a");
    expect(read().degraded).toBe(true);
  });
});

describe("second pass: setup guide provisioning", () => {
  const payload = {
    agentId: "bot-a",
    agentName: "Front desk",
    phoneProvisioned: false,
    phoneProvisionRequested: false,
  };
  const page = () => PostCreateActivationWizard({ payload, onClose: h.navigate });
  const provision = () =>
    render(page).find(
      (e) => e.type === "button" && content(e.props.children).includes("Get a number"),
    )!;
  async function ready() {
    h.fetch.mockImplementation(async () => Response.json({ numbers: [] }));
    render(page);
    await settle();
  }
  it("waits for the initial line check before provisioning", () => {
    h.fetch.mockImplementation(() => new Promise(() => {}));
    expect(provision().props.disabled).toBe(true);
    provision().props.onClick();
    expect(h.fetch.mock.calls.some((call) => call[0] === "/api/phone-numbers/provision")).toBe(
      false,
    );
  });
  it.each(["malformed", "degraded", "outage"])(
    "offers retry instead of activation after a %s line check",
    async (kind) => {
      h.fetch.mockImplementation(async () =>
        Response.json(kind === "degraded" ? { numbers: [], degraded: true } : {}, {
          status: kind === "outage" ? 503 : 200,
        }),
      );
      render(page);
      await settle();
      expect(provision()?.props.disabled ?? true).toBe(true);
      expect(
        render(page).some(
          (e) => e.type === "button" && content(e.props.children) === "Refresh line status",
        ),
      ).toBe(true);
      expect(
        render(page).some(
          (e) => e.type === "div" && content(e.props.children).includes("No live line yet"),
        ),
      ).toBe(false);
    },
  );
  it("fences duplicate activation and prevents dismissal while it is pending", async () => {
    await ready();
    let done!: (response: Response) => void;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const elements = render(page);
    const action = elements.find(
      (e) => e.type === "button" && content(e.props.children).includes("Get a number"),
    )!.props.onClick;
    action();
    action();
    elements.find((e) => e.props["aria-label"] === "Close setup guide")!.props.onClick();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.navigate).not.toHaveBeenCalled();
    done(Response.json({ error: "Unavailable" }, { status: 503 }));
    await settle();
  });
  it("does not finish setup when activation acknowledgement is missing", async () => {
    await ready();
    h.fetch.mockImplementation(async (url) =>
      Response.json(url === "/api/phone-numbers/provision" ? {} : { numbers: [] }),
    );
    provision().props.onClick();
    await settle();
    expect(h.states[0]).toBe("launch");
  });
  it("requires reconciliation when activation succeeded but no line is returned", async () => {
    await ready();
    h.fetch.mockImplementation(async (url) =>
      Response.json(url === "/api/phone-numbers/provision" ? { ok: true } : { numbers: [] }),
    );
    provision().props.onClick();
    await settle();
    expect(h.states[0]).toBe("launch");
    expect(
      render(page).some(
        (e) => e.type === "button" && content(e.props.children) === "Refresh line status",
      ),
    ).toBe(true);
    expect(provision()?.props.disabled ?? true).toBe(true);
  });
  it("recovers a line check and finishes only after the assigned line is returned", async () => {
    h.fetch.mockImplementation(async () => Response.json({}, { status: 503 }));
    render(page);
    await settle();
    h.fetch.mockImplementation(async () => Response.json({ numbers: [] }));
    click(page, "Refresh line status");
    await settle();
    expect(provision().props.disabled).toBe(false);
    h.fetch.mockImplementation(async (url) =>
      Response.json(
        url.endsWith("provision")
          ? { ok: true, phone_number: "+15555550100" }
          : { numbers: [{ agent_id: "bot-a", phone_number: "+15555550100" }] },
      ),
    );
    provision().props.onClick();
    await settle();
    expect(h.states[0]).toBe("complete");
  });
  it("describes a forbidden activation without claiming the session expired", async () => {
    await ready();
    h.fetch.mockImplementation(async () =>
      Response.json({ code: "PHONE_CAPACITY_REACHED" }, { status: 403 }),
    );
    provision().props.onClick();
    await settle();
    const notices = render(page)
      .filter((e) => e.type === "notice")
      .map((e) => e.props.title)
      .join(" ");
    expect(notices).toContain("workspace access and plan limits");
    expect(notices).not.toContain("session expired");
  });
});

describe("second pass: number picker confirmation", () => {
  const page = () => PhoneNumberPicker({ agentId: "bot-a", onClaim: h.success });
  const inventory = (url: string) =>
    Response.json(
      url.endsWith("area-codes")
        ? { area_codes: [] }
        : { available: [{ phone_number: "+15555550100", area_code: "555", region: "Example" }] },
    );
  async function ready() {
    h.fetch.mockImplementation(async (url) => inventory(url));
    render(page);
    await settle();
  }
  const claim = () =>
    render(page).find(
      (e) => e.props.onClick && content(e.props.children).includes("(555) 555-0100"),
    )!.props.onClick;
  it("submits a number claim only once before a rerender", async () => {
    await ready();
    let done!: (response: Response) => void;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const action = claim();
    const first = action();
    const second = action();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    done(Response.json({ ok: true, phone_number: "+15555550100" }));
    await Promise.all([first, second]);
    expect(h.success).toHaveBeenCalledOnce();
  });
  it("retains the claim error after refreshing inventory", async () => {
    await ready();
    h.fetch.mockImplementation(async (url) =>
      url.endsWith("claim")
        ? Response.json({ error: "Number already taken" }, { status: 409 })
        : inventory(url),
    );
    await claim()();
    expect(
      render(page).some((e) => content(e.props.children).includes("Number already taken")),
    ).toBe(true);
  });
  it("does not confirm a malformed claim response", async () => {
    await ready();
    h.fetch.mockImplementation(async (url) =>
      url.endsWith("claim") ? Response.json({}) : inventory(url),
    );
    await claim()();
    expect(h.success).not.toHaveBeenCalled();
  });
  it("requires an acknowledgement for numbers found by area-code search too", async () => {
    await ready();
    const input = render(page).find((e) => e.type === "input")!;
    input.props.onChange({ target: { value: "555" } });
    await render(page)
      .find((e) => e.type === "button" && content(e.props.children).includes("Find numbers"))!
      .props.onClick();
    h.fetch.mockImplementation(async (url) =>
      url.endsWith("provision") ? Response.json({}) : inventory(url),
    );
    await claim()();
    expect(h.fetch.mock.calls.some((call) => call[0] === "/api/phone-numbers/provision")).toBe(
      true,
    );
    expect(h.success).not.toHaveBeenCalled();
  });
  it("reports the actual returned line when the server reuses an existing number", async () => {
    await ready();
    h.fetch.mockImplementation(async () =>
      Response.json({ ok: true, reused: true, phone_number: "+15555550200" }),
    );
    await claim()();
    expect(h.success).toHaveBeenCalledExactlyOnceWith("+15555550200");
  });
});

describe("appointment and calendar recovery", () => {
  const appointment = {
    id: "appointment-a",
    date: "2030-01-02",
    time: "10:00",
    customer_name: "Example",
    status: "Scheduled",
  };
  const hasAppointment = () =>
    render(AppointmentsPanel).some((e) => e.props.appointment?.id === appointment.id);
  it.each(["offline", "unavailable", "malformed"])(
    "preserves appointments when the calendar is %s",
    async (kind) => {
      h.fetch.mockImplementation(async (url) => {
        if (url.startsWith("/api/appointments"))
          return Response.json({ appointments: [appointment] });
        if (kind === "offline") throw new Error("Offline");
        return Response.json({}, { status: kind === "unavailable" ? 503 : 200 });
      });
      render(AppointmentsPanel);
      await settle();
      expect(hasAppointment()).toBe(true);
      expect(
        render(AppointmentsPanel).some(
          (e) => e.type === "notice" && e.props.title === "Calendar status unavailable",
        ),
      ).toBe(true);
    },
  );
  it("does not recommend reconnecting when calendar status is unknown", async () => {
    h.fetch.mockImplementation(async (url) =>
      url.startsWith("/api/appointments")
        ? Response.json({ appointments: [] })
        : Response.json({}, { status: 503 }),
    );
    render(AppointmentsPanel);
    await settle();
    expect(
      render(AppointmentsPanel).some(
        (e) => e.type === "empty-state" && e.props.title === "Connect a calendar",
      ),
    ).toBe(false);
  });
  it("rejects malformed appointment data instead of showing an empty schedule", async () => {
    h.fetch.mockImplementation(async (url) =>
      Response.json(url.startsWith("/api/appointments") ? {} : { accounts: [] }),
    );
    render(AppointmentsPanel);
    await settle();
    expect(
      render(AppointmentsPanel).some(
        (e) => e.type === "notice" && e.props.title === "Appointments unavailable",
      ),
    ).toBe(true);
  });
  it("shows loaded appointments without waiting for the calendar lookup", async () => {
    h.fetch.mockImplementation((url) =>
      url.startsWith("/api/appointments")
        ? Promise.resolve(Response.json({ appointments: [appointment] }))
        : new Promise(() => {}),
    );
    render(AppointmentsPanel);
    await settle();
    expect(hasAppointment()).toBe(true);
  });
  it("ignores appointment bodies that finish after unmount", async () => {
    let done!: (value: unknown) => void;
    h.fetch.mockImplementation(async (url) =>
      url.startsWith("/api/appointments")
        ? {
            ok: true,
            json: () =>
              new Promise((resolve) => {
                done = resolve;
              }),
          }
        : Response.json({ accounts: [] }),
    );
    render(AppointmentsPanel);
    await settle();
    unmount();
    const before = [...h.states];
    done({ appointments: [appointment] });
    await settle();
    expect(h.states).toEqual(before);
  });
  it("retries calendar status without reloading or hiding appointments", async () => {
    h.fetch.mockImplementation(async (url) =>
      url.startsWith("/api/appointments")
        ? Response.json({ appointments: [appointment] })
        : Response.json({}, { status: 503 }),
    );
    render(AppointmentsPanel);
    await settle();
    const notice = render(AppointmentsPanel).find(
      (e) => e.props.title === "Calendar status unavailable",
    )!;
    h.fetch.mockClear().mockImplementation(async () => Response.json({ accounts: [] }));
    descendants(notice.props.action)
      .find((e) => e.type === "button")!
      .props.onClick();
    render(AppointmentsPanel);
    await settle();
    expect(hasAppointment()).toBe(true);
    expect(h.fetch.mock.calls.map((call) => call[0])).toEqual(["/api/calendar/accounts"]);
    expect(
      render(AppointmentsPanel).some((e) => e.props.title === "Calendar status unavailable"),
    ).toBe(false);
  });
});

describe("Salesforce status and preference ordering", () => {
  const connected = {
    salesforce: {
      connected: true,
      configured: true,
      sync_preferences: { callActivitySyncEnabled: true },
    },
  };
  const toggle = () => render(SalesforceIntegrationPage).find((e) => e.type === "switch")!;
  const refresh = () =>
    descendants(
      render(SalesforceIntegrationPage).find((e) => e.type === "workspace-intro")!.props.action,
    ).find((e) => e.type === "button")!.props.onClick;
  async function ready() {
    h.fetch.mockImplementation(async () => Response.json(connected));
    render(SalesforceIntegrationPage);
    await settle();
  }
  it.each([{}, { salesforce: { connected: "false" } }])(
    "rejects malformed status: %j",
    async (payload) => {
      h.fetch.mockImplementation(async () => Response.json(payload));
      render(SalesforceIntegrationPage);
      await settle();
      const elements = render(SalesforceIntegrationPage);
      expect(
        elements.some(
          (e) => e.type === "notice" && e.props.title === "Connection state unavailable",
        ),
      ).toBe(true);
      expect(toggle().props.disabled).toBe(true);
    },
  );
  it("fences duplicate preference changes before a rerender", async () => {
    await ready();
    let done!: (response: Response) => void;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const change = toggle().props.onCheckedChange;
    change(false);
    change(true);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    done(Response.json({ preferences: { callActivitySyncEnabled: false } }));
    await settle();
    expect(toggle().props.checked).toBe(false);
  });
  it("does not start a preference write while status refresh is pending", async () => {
    await ready();
    const change = toggle().props.onCheckedChange;
    h.fetch.mockClear().mockImplementation(() => new Promise(() => {}));
    refresh()();
    change(false);
    expect(h.fetch.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(false);
  });
  it("does not let refresh overtake a pending preference write", async () => {
    await ready();
    const reload = refresh();
    h.fetch.mockClear().mockImplementation(() => new Promise(() => {}));
    toggle().props.onCheckedChange(false);
    reload();
    expect(h.fetch.mock.calls.filter((call) => call[0] === "/api/oauth/crm/status")).toHaveLength(
      0,
    );
  });
  it("ignores a saved preference after unmount", async () => {
    await ready();
    let done!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    toggle().props.onCheckedChange(false);
    unmount();
    const before = [...h.states];
    done(Response.json({ preferences: { callActivitySyncEnabled: false } }));
    await settle();
    expect(h.states).toEqual(before);
  });
  it("reports a malformed save response and restores the previous preference", async () => {
    await ready();
    h.fetch.mockImplementation(async () => Response.json(null));
    toggle().props.onCheckedChange(false);
    await settle();
    const notice = render(SalesforceIntegrationPage).find(
      (e) => e.type === "notice" && e.props.title === "Call activity sync was not updated",
    );
    expect(content(notice?.props.children)).toBe(
      "Could not update Salesforce call activity delivery.",
    );
    expect(toggle().props.checked).toBe(true);
    h.fetch.mockImplementation(async () =>
      Response.json({ preferences: { callActivitySyncEnabled: false } }),
    );
    toggle().props.onCheckedChange(false);
    await settle();
    expect(toggle().props.checked).toBe(false);
    expect(
      render(SalesforceIntegrationPage).some((e) => e.props.title === "Call activity sync updated"),
    ).toBe(true);
  });
});

describe("integration notification destination recovery", () => {
  const providers = [
    "salesforce",
    "hubspot",
    "slack",
    "x",
    "zoom",
    "apollo",
    "meta",
    "shopify",
    "square",
    "microsoft_teams",
    "microsoft_excel",
    "google_sheets",
  ];
  const status = () =>
    Object.fromEntries(
      providers.map((key) => [
        key,
        {
          configured: true,
          connected: key === "slack" || key === "microsoft_teams",
          ...(key === "slack" ? { default_channel_id: "slack-a" } : {}),
        },
      ]),
    );
  const teams = [
    {
      team_id: "team-a",
      team_name: "Operations",
      channel_id: "19:alerts@thread.tacv2",
      channel_name: "Alerts",
    },
  ];
  const response = (url: string) =>
    Response.json(
      url.endsWith("/status")
        ? status()
        : {
            channels: url.includes("microsoft_teams")
              ? teams
              : [
                  { id: "slack-a", name: "general" },
                  { id: "slack-b", name: "alerts" },
                ],
          },
    );
  const select = (label: string) =>
    render(CrmConnectionCard).find(
      (e) =>
        e.type === "select" &&
        descendants(e.props.children).some((child) => child.props["aria-label"] === label),
    )!;
  async function ready() {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async (url) => response(url));
    render(CrmConnectionCard);
    await settle();
    render(CrmConnectionCard);
    await settle();
  }
  it("keeps colon-containing Teams channel IDs intact", async () => {
    await ready();
    const action = select("Default Teams team and channel").props.onValueChange;
    h.fetch.mockImplementation(async (url) =>
      url.endsWith("notify-target") ? Response.json({ ok: true }) : response(url),
    );
    await action("team-a:19:alerts@thread.tacv2");
    const request = h.fetch.mock.calls.find((call) => call[0].endsWith("notify-target"));
    expect(JSON.parse(request![1].body).channel_id).toBe("19:alerts@thread.tacv2");
    await settle();
    expect(select("Default Teams team and channel").props.value).toBe(
      "team-a:19:alerts@thread.tacv2",
    );
  });
  it.each(["Default Slack channel", "Default Teams team and channel"])(
    "reports a rejected update for %s",
    async (label) => {
      await ready();
      h.fetch.mockImplementation(async (url, options) =>
        options?.method === "POST"
          ? Response.json({ error: "Destination denied" }, { status: 403 })
          : response(url),
      );
      await select(label).props.onValueChange(
        label.includes("Slack") ? "slack-b" : "team-a:19:alerts@thread.tacv2",
      );
      await settle();
      expect(
        render(CrmConnectionCard).some(
          (e) => e.type === "notice" && content(e.props.children).includes("Destination denied"),
        ),
      ).toBe(true);
      expect(select(label).props.value).toBe(label.includes("Slack") ? "slack-a" : "__unset__");
    },
  );
  it("fences simultaneous destination changes", async () => {
    await ready();
    let done!: (response: Response) => void;
    const action = select("Default Slack channel").props.onValueChange;
    h.fetch.mockClear().mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const first = action("slack-b");
    const second = action("slack-a");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    done(Response.json({ ok: true }));
    await Promise.all([first, second]);
    await settle();
    expect(select("Default Slack channel").props.value).toBe("slack-b");
  });
  it("surfaces an unavailable channel list instead of an empty selector", async () => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async (url) =>
      url.endsWith("/status") ? response(url) : Response.json({}, { status: 503 }),
    );
    render(CrmConnectionCard);
    await settle();
    render(CrmConnectionCard);
    await settle();
    const elements = render(CrmConnectionCard);
    expect(
      elements.some((e) => e.type === "notice" && e.props.title === "Slack channels unavailable"),
    ).toBe(true);
    expect(
      elements.some((e) => e.type === "notice" && e.props.title === "Teams channels unavailable"),
    ).toBe(true);
  });
  it.each(["offline", "malformed"])("recovers locally from %s channel lists", async (failure) => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async (url) => {
      if (url.endsWith("/status")) return response(url);
      if (failure === "offline") throw new Error("Offline");
      return Response.json({ channels: null });
    });
    render(CrmConnectionCard);
    await settle();
    render(CrmConnectionCard);
    await settle();
    const notices = render(CrmConnectionCard).filter(
      (e) =>
        e.props.title === "Slack channels unavailable" ||
        e.props.title === "Teams channels unavailable",
    );
    expect(notices).toHaveLength(2);
    h.fetch.mockClear().mockImplementation(async (url) => response(url));
    notices.forEach((notice) =>
      descendants(notice.props.action)
        .find((e) => e.type === "button")!
        .props.onClick(),
    );
    render(CrmConnectionCard);
    await settle();
    expect(select("Default Slack channel")).toBeDefined();
    expect(select("Default Teams team and channel")).toBeDefined();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["offline", "unacknowledged"])(
    "retains the selected channel after an %s save",
    async (failure) => {
      await ready();
      h.fetch.mockImplementation(async () => {
        if (failure === "offline") throw new Error("Offline");
        return Response.json({});
      });
      select("Default Slack channel").props.onValueChange("slack-b");
      await settle();
      expect(select("Default Slack channel").props.value).toBe("slack-a");
      expect(
        render(CrmConnectionCard).some(
          (e) => e.props.title === "Notification destination was not updated",
        ),
      ).toBe(true);
      h.fetch.mockImplementation(async () => Response.json({ ok: true }));
      select("Default Slack channel").props.onValueChange("slack-b");
      await settle();
      expect(select("Default Slack channel").props.value).toBe("slack-b");
    },
  );
  it("ignores a destination save arriving after departure", async () => {
    await ready();
    let done!: (value: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    select("Default Slack channel").props.onValueChange("slack-b");
    unmount();
    const before = [...h.states];
    done(Response.json({ ok: true }));
    await settle();
    expect(h.states).toEqual(before);
  });
  it("rejects malformed integration status instead of treating providers as unavailable", async () => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async () => Response.json({}));
    render(CrmConnectionCard);
    await settle();
    expect(
      render(CrmConnectionCard).some(
        (e) => e.type === "notice" && e.props.title === "Integration connections unavailable",
      ),
    ).toBe(true);
  });
});

describe("mailbox connection status validation", () => {
  it("keeps the newest account refresh when an older request finishes last", async () => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async () => Response.json({}, { status: 503 }));
    render(MailboxConnectionCard);
    await settle();
    const notice = render(MailboxConnectionCard).find(
      (e) => e.props.title === "Inbox connection status unavailable",
    )!;
    const retry = descendants(notice.props.action).find((e) => e.type === "button")!.props.onClick;
    let old!: (response: Response) => void;
    h.fetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            old = resolve;
          }),
      )
      .mockImplementationOnce(async () =>
        Response.json({
          accounts: [{ id: "new", emailAddress: "new@example.com", provider: "google" }],
        }),
      );
    retry();
    retry();
    await settle();
    old(Response.json({ accounts: [] }));
    await settle();
    expect(
      render(MailboxConnectionCard).some((e) =>
        content(e.props.children).includes("new@example.com"),
      ),
    ).toBe(true);
  });
  it("rejects malformed connected-account responses", async () => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    h.fetch.mockImplementation(async () => Response.json({}));
    render(MailboxConnectionCard);
    await settle();
    expect(
      render(MailboxConnectionCard).some(
        (e) => e.type === "notice" && e.props.title === "Inbox connection status unavailable",
      ),
    ).toBe(true);
  });
  it("ignores account data arriving after departure", async () => {
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    let done!: (response: Response) => void;
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    render(MailboxConnectionCard);
    unmount();
    const before = [...h.states];
    done(
      Response.json({
        accounts: [{ id: "mail-a", emailAddress: "example@example.com", provider: "google" }],
      }),
    );
    await settle();
    expect(h.states).toEqual(before);
  });
});
