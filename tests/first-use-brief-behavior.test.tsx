import { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateAgentDialog from "../src/components/CreateAgentDialog";
import AgentTemplates from "../src/components/AgentTemplates";
import type { DeployValues } from "../src/components/DeployAgentModal";
import PostCreateActivationWizard from "../src/components/onboarding/PostCreateActivationWizard";
import WireAgentLanding from "../src/components/marketing/WireAgentLanding";
import AuthAccessPanel from "../src/components/auth/AuthAccessPanel";
import { parseSignupIntent, persistSignupIntent } from "../src/lib/signup-intent";
import { resolvePostAuthDestination } from "../src/lib/auth-redirect";
import { markFreshSignupSession } from "../src/lib/post-signup-onboarding";
import {
  readPostCreateWizard,
  readPostCreateWizardForOwner,
  stashPostCreateWizard,
  type PostCreateWizardPayload,
} from "../src/lib/wireline-create-flow";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<() => unknown>,
  stateCursor: 0,
  refCursor: 0,
  mounting: true,
  fetch: vi.fn(),
  navigate: vi.fn(),
  created: vi.fn(),
  close: vi.fn(),
  event: vi.fn(),
  user: { id: "owner-1" } as { id: string } | null,
}));

// Exercise the real component handlers and their session-storage boundary.
// No browser, customer account, or provider requests are involved.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
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
  useRef: (initial: unknown) => (harness.refs[harness.refCursor++] ??= { current: initial }),
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => unknown) => {
    if (harness.mounting) harness.effects.push(effect);
  },
}));
vi.mock("react-router", () => ({
  Link: "a",
  useNavigate: () => harness.navigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  AGENTS_CHANGED_EVENT: "agents-changed",
  useAgents: () => ({ agents: [], refresh: vi.fn() }),
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: harness.user }) }));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../src/components/DeployAgentModal", () => ({ default: "deploy-modal" }));
vi.mock("../src/lib/api", () => ({
  authFetch: (...args: unknown[]) => harness.fetch(...args),
  safeJson: (response: Response) => response.json().catch(() => null),
  isApiErrorBody: (body: unknown) => Boolean(body && typeof body === "object" && "error" in body),
}));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/post-signup-onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/post-signup-onboarding")>()),
  setPostSignupFlowActive: vi.fn(),
}));
vi.mock("../src/lib/product-event-client", () => ({
  emitProductEvent: (...args: unknown[]) => harness.event(...args),
  emitProductEventOnce: vi.fn(),
}));
vi.mock("../src/lib/signup-intent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/signup-intent")>()),
  activationBillingHref: () => "/settings/billing?plan=starter",
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  Textarea: "textarea",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/BotMarkPicker", () => ({ default: "bot-mark-picker" }));
vi.mock("../src/components/RoleplaySandbox", () => ({ default: "roleplay-sandbox" }));

type Props = {
  children?: ReactNode;
  id?: string;
  value?: string;
  disabled?: boolean;
  open?: boolean;
  to?: string;
  defaultTemplateId?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
  onConfirm?: (values: DeployValues) => Promise<void>;
};
type Element = ReactElement<Props>;

function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...descendants(element.props.children)];
}
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (node && typeof node === "object" && "props" in node)
    return textContent((node as Element).props.children);
  return "";
}
function render(component: () => ReactNode) {
  harness.stateCursor = 0;
  harness.refCursor = 0;
  return descendants(component());
}
function mount(component: () => ReactNode) {
  render(component);
  harness.mounting = false;
  for (const effect of harness.effects) effect();
}
function find(component: () => ReactNode, predicate: (element: Element) => boolean) {
  const element = render(component).find(predicate);
  if (!element) throw new Error("Expected first-use control was not rendered.");
  return element;
}
function button(component: () => ReactNode, label: string) {
  return find(
    component,
    (element) => element.type === "button" && textContent(element.props.children) === label,
  );
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const saved = { success: true, readiness: { rules: 1, facts: 0, tone: false } };
const empty = { success: true, readiness: { rules: 0, facts: 0, tone: false } };
const brief =
  "We sell bookkeeping to local businesses. Ask about team size and offer a consultation.";
const payload: PostCreateWizardPayload & { ownerId: string } = {
  agentId: "sales-bot-1",
  agentName: "Sales Rep Bot",
  ownerId: "owner-1",
  pendingBrief: brief,
  phoneProvisionRequested: false,
  phoneProvisioned: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.states = [];
  harness.refs = [];
  harness.effects = [];
  harness.mounting = true;
  harness.user = { id: "owner-1" };
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  const local = new Map<string, string>();
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("first-use business brief", () => {
  function create(initialBrief = brief, initialTemplateKey: string | null = "sales-rep") {
    return () =>
      CreateAgentDialog({
        open: true,
        initialBrief,
        initialTemplateKey,
        onClose: harness.close,
        onCreated: harness.created,
      });
  }
  async function submit(component: () => ReactNode) {
    await find(component, (element) => element.type === "form").props.onSubmit?.({
      preventDefault: vi.fn(),
    });
  }

  it.each([
    ["sales-rep", "sales"],
    ["front-desk", "receptionist"],
  ])("carries the landing's %s choice through a fresh signup into Bot creation", async (template, role) => {
    const link = descendants(WireAgentLanding()).find((element) => {
      const destination = element.props.to;
      return destination?.startsWith("/signup?") &&
        new URL(destination, "https://botbound.me").searchParams.get("template") === template;
    });
    expect(link).toBeDefined();
    const search = new URL(link!.props.to!, "https://botbound.me").search;
    persistSignupIntent(parseSignupIntent(search));
    markFreshSignupSession();
    // An OAuth return can arrive without the original campaign query string.
    const destination = new URL(resolvePostAuthDestination("personal", ""), "https://botbound.me");
    expect(destination.pathname).toBe("/studio");
    expect(destination.searchParams.get("create")).toBe("1");
    const component = create(brief, destination.searchParams.get("template"));
    mount(component);
    expect(button(component, "Change role").props["aria-expanded"]).toBe(false);
    expect(find(component, (element) => element.type === "textarea").props.value).toBe(brief);
    harness.fetch.mockResolvedValueOnce(response({ id: "sales-bot-1" }));
    harness.fetch.mockResolvedValueOnce(response(saved));
    await submit(component);
    const createCall = harness.fetch.mock.calls.find(([url]) => url === "/api/agents");
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall![1].body)).toMatchObject({ role });
    expect(readPostCreateWizardForOwner("owner-1")?.agentId).toBe("sales-bot-1");
  });

  it("keeps the embedded homepage signup on the same Sales Rep starter as the campaign", () => {
    const panel = descendants(WireAgentLanding()).find((element) => element.type === AuthAccessPanel);
    expect(panel?.props.defaultTemplateId).toBe("sales-rep");
  });

  it("keeps a chosen role compact and makes identity customization optional", () => {
    const component = create();
    mount(component);
    expect(button(component, "Change role").props["aria-expanded"]).toBe(false);
    expect(
      render(component).some((element) => element.props["aria-label"] === "Bot role starters"),
    ).toBe(false);
    const elements = render(component);
    expect(elements.findIndex((element) => element.type === "textarea")).toBeLessThan(
      elements.findIndex((element) => element.type === "details"),
    );
  });

  it("opens role choices when there is no valid role intent", () => {
    const component = create("", "unknown-role");
    mount(component);
    expect(button(component, "Hide roles").props["aria-expanded"]).toBe(true);
    expect(find(component, (element) => element.type === "textarea").props.value).toBe("");
  });

  it("preserves a handoff brief when the user changes roles", async () => {
    const component = create();
    mount(component);
    await button(component, "Change role").props.onClick?.();
    await find(
      component,
      (element) =>
        element.type === "button" && textContent(element.props.children).startsWith("Front Desk"),
    ).props.onClick?.();
    expect(find(component, (element) => element.type === "textarea").props.value).toBe(brief);
  });

  it("updates untouched starter text but preserves text typed by the user", async () => {
    const component = create("");
    mount(component);
    const starter = find(component, (element) => element.type === "textarea").props.value;
    await button(component, "Change role").props.onClick?.();
    await find(
      component,
      (element) =>
        element.type === "button" && textContent(element.props.children).startsWith("Front Desk"),
    ).props.onClick?.();
    expect(find(component, (element) => element.type === "textarea").props.value).not.toBe(starter);
    find(component, (element) => element.type === "textarea").props.onChange?.({
      target: { value: brief },
    });
    await button(component, "Change role").props.onClick?.();
    await find(
      component,
      (element) =>
        element.type === "button" && textContent(element.props.children).startsWith("Sales Rep"),
    ).props.onClick?.();
    expect(find(component, (element) => element.type === "textarea").props.value).toBe(brief);
  });

  it.each(["empty", "server-error", "malformed"])(
    "keeps the brief when extraction is %s without claiming training success",
    async (kind) => {
      const component = create();
      harness.fetch
        .mockResolvedValueOnce(response({ id: payload.agentId }))
        .mockResolvedValueOnce(
          kind === "empty"
            ? response(empty)
            : kind === "server-error"
              ? response({}, 503)
              : new Response("not-json"),
        );
      mount(component);
      await submit(component);
      expect(harness.created).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: payload.agentId, pendingBrief: brief }),
      );
      expect(readPostCreateWizard()?.pendingBrief).toBe(brief);
      expect(
        harness.event.mock.calls.some(
          ([event]) =>
            event.event === "training_asset_added" || event.event === "launch_readiness_reached",
        ),
      ).toBe(false);
      expect(harness.fetch.mock.calls.filter(([url]) => url === "/api/agents")).toHaveLength(1);
      expect(harness.navigate).toHaveBeenCalledWith(
        `/studio?agent=${payload.agentId}&section=setup`,
        { replace: true },
      );
    },
  );

  it("records training only when the server confirms useful saved content", async () => {
    const component = create();
    harness.fetch
      .mockResolvedValueOnce(response({ id: payload.agentId }))
      .mockResolvedValueOnce(response(saved));
    mount(component);
    await submit(component);
    expect(readPostCreateWizard()?.pendingBrief).toBeUndefined();
    expect(harness.event).toHaveBeenCalledWith(
      expect.objectContaining({ event: "training_asset_added" }),
    );
  });

  it("submits a new Bot only once even before the busy state rerenders", async () => {
    const component = create();
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    harness.fetch.mockReturnValueOnce(pending).mockResolvedValueOnce(response(saved));
    mount(component);
    const handler = find(component, (element) => element.type === "form").props.onSubmit!;
    const first = handler({ preventDefault: vi.fn() });
    const second = handler({ preventDefault: vi.fn() });
    expect(harness.fetch.mock.calls.filter(([url]) => url === "/api/agents")).toHaveLength(1);
    finish(response({ id: payload.agentId }));
    await Promise.all([first, second]);
    expect(harness.created).toHaveBeenCalledOnce();
  });
});

describe("starting-brief recovery", () => {
  const component = () => PostCreateActivationWizard({ payload, onClose: harness.close });
  beforeEach(() => {
    stashPostCreateWizard(payload);
    harness.fetch.mockImplementation((url: string) =>
      Promise.resolve(response(url === "/api/phone-numbers" ? { numbers: [] } : saved)),
    );
  });

  it("retries against the existing Bot and clears the saved draft only after confirmation", async () => {
    mount(component);
    expect(button(component, "Continue to test").props.disabled).toBe(true);
    const edited = `${brief} Ask me before offering a discount.`;
    find(component, (element) => element.type === "textarea").props.onChange?.({
      target: { value: edited },
    });
    expect(readPostCreateWizard()?.pendingBrief).toBe(edited);
    await button(component, "Save starting brief").props.onClick?.();
    await vi.waitFor(() => expect(readPostCreateWizard()?.pendingBrief).toBeUndefined());
    const request = harness.fetch.mock.calls.find(([url]) => url === "/api/train/extract");
    expect(JSON.parse(request?.[1].body)).toEqual({ agentId: payload.agentId, message: edited });
    expect(harness.fetch.mock.calls.some(([url]) => url === "/api/agents")).toBe(false);
    expect(button(component, "Continue to test").props.disabled).toBe(false);
  });

  it("retains the draft when the server saves nothing", async () => {
    harness.fetch.mockImplementation((url: string) =>
      Promise.resolve(response(url === "/api/phone-numbers" ? { numbers: [] } : empty)),
    );
    mount(component);
    await button(component, "Save starting brief").props.onClick?.();
    await vi.waitFor(() =>
      expect(textContent(componentWithHooks())).toContain("Add a specific fact"),
    );
    expect(readPostCreateWizard()?.pendingBrief).toBe(brief);
    expect(button(component, "Continue to test").props.disabled).toBe(true);
    expect(harness.event).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "training_asset_added" }),
    );
  });

  function componentWithHooks() {
    harness.stateCursor = 0;
    harness.refCursor = 0;
    return component();
  }

  it("keeps unfinished work when the user skips the guide", async () => {
    mount(component);
    await button(component, "Skip for now").props.onClick?.();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(readPostCreateWizard()?.pendingBrief).toBe(brief);
  });

  it("prevents concurrent retries and preserves an empty edited draft", async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    harness.fetch.mockImplementation((url: string) =>
      url === "/api/phone-numbers" ? Promise.resolve(response({ numbers: [] })) : pending,
    );
    mount(component);
    const save = button(component, "Save starting brief").props.onClick;
    save?.();
    save?.();
    expect(harness.fetch.mock.calls.filter(([url]) => url === "/api/train/extract")).toHaveLength(
      1,
    );
    finish(response(empty));
    await vi.waitFor(() =>
      expect(button(component, "Save starting brief").props.disabled).toBe(false),
    );
    find(component, (element) => element.type === "textarea").props.onChange?.({
      target: { value: "" },
    });
    expect(readPostCreateWizard()?.pendingBrief).toBe("");
    expect(button(component, "Save starting brief").props.disabled).toBe(true);
  });
});

describe("template-gallery setup continuity", () => {
  const component = () => AgentTemplates();
  beforeEach(() => {
    window.location.search = "?template=sales-sdr";
    harness.fetch.mockImplementation((_url: string, options?: { method?: string }) =>
      Promise.resolve(
        response(options?.method === "POST" ? { id: "template-bot-1" } : { agents: [] }),
      ),
    );
  });

  it("binds a template-created guide to its owner before navigating to Studio", async () => {
    mount(component);
    const modal = find(component, (element) => element.type === "deploy-modal");
    expect(modal.props.open).toBe(true);
    await modal.props.onConfirm?.({ name: "My sales Bot", voiceId: "alloy", gender: "female" });
    expect(readPostCreateWizardForOwner("owner-1")).toMatchObject({
      agentId: "template-bot-1",
      ownerId: "owner-1",
      phoneProvisionRequested: false,
      phoneProvisioned: false,
    });
    expect(harness.navigate).toHaveBeenCalledWith("/studio?agent=template-bot-1&section=setup");
  });

  it("does not create an unbound template Bot after the local session is lost", async () => {
    harness.user = null;
    mount(component);
    await find(component, (element) => element.type === "deploy-modal").props.onConfirm?.({
      name: "My sales Bot",
      voiceId: "alloy",
      gender: "female",
    });
    expect(harness.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    expect(readPostCreateWizard()).toBeNull();
    expect(harness.navigate).not.toHaveBeenCalled();
  });
});
