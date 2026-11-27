import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateAgentDialog from "../src/components/CreateAgentDialog";
import StudioAgentWorkspacePanel from "../src/components/StudioAgentWorkspacePanel";
import {
  isCreateBriefTraining,
  readCreateBrief,
  rememberCreateBrief,
  setCreateBriefRecoveryOwner,
} from "../src/lib/create-brief-recovery";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  cleanups: [] as Array<() => void>,
  mounting: true,
  fetch: vi.fn(),
  event: vi.fn(),
  navigate: vi.fn(),
  setParams: vi.fn(),
  onClose: vi.fn(),
  onCreated: vi.fn(),
  userId: "founder",
  botId: "bot",
  businessName: "",
  starter: null as string | null,
  updateBranding: vi.fn(),
  toast: vi.fn(),
  sequence: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
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
  useEffect: (effect: () => unknown) => {
    if (h.mounting) h.effects.push(effect);
  },
  useLayoutEffect: (effect: () => unknown) => {
    if (h.mounting) h.effects.push(effect);
  },
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("react-router", () => ({
  Link: "a",
  useNavigate: () => h.navigate,
  useSearchParams: () => [new URLSearchParams(), h.setParams],
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [], rememberCreatedAgent: vi.fn() }),
  AGENTS_CHANGED_EVENT: "agents-changed",
}));
vi.mock("../src/contexts/BrandingContext", () => ({
  useBranding: () => ({
    branding: { business_name: h.businessName },
    updateBranding: h.updateBranding,
  }),
}));
vi.mock("../src/contexts/ToastContext", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("../src/lib/api", () => ({
  authFetch: (...args: unknown[]) => h.fetch(...args),
  safeJson: (response: Response) => response.json(),
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: h.event }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: vi.fn() }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("../src/lib/post-signup-onboarding", () => ({ setPostSignupFlowActive: vi.fn() }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  NativeSelect: "select",
  Textarea: "textarea",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/BotMark", () => ({ default: "span" }));
vi.mock("../src/components/BotMarkPicker", () => ({ default: "mark-picker" }));
vi.mock("../src/components/voice/SimpleVoicePicker", () => ({ default: "voice-picker" }));
vi.mock("../src/components/AgentToolPermissions", () => ({ default: "tool-permissions" }));

type Props = {
  id?: string;
  value?: string;
  children?: ReactNode;
  disabled?: boolean;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
  onClick?: () => unknown;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const brief = "Our repair shop opens at 7am. Ask for the appliance model before booking.";
let surface: "create" | "setup";
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return surface === "create"
    ? CreateAgentDialog({
        open: true,
        onClose: h.onClose,
        onCreated: h.onCreated,
        initialBrief: brief,
        initialTemplateKey: h.starter,
      })
    : StudioAgentWorkspacePanel({
        agentId: h.botId,
        agentName: "My Bot",
        onRehearseVoiceInChat: vi.fn(),
      });
}
function unmount() {
  h.cleanups.splice(0).forEach((cleanup) => cleanup());
}
async function mount(next: typeof surface) {
  unmount();
  surface = next;
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.mounting = true;
  render();
  h.mounting = false;
  h.effects.forEach((effect) => {
    const cleanup = effect();
    if (typeof cleanup === "function") h.cleanups.push(cleanup as () => void);
  });
  if (surface === "setup") {
    await vi.waitFor(() =>
      expect(elements(render()).some((element) => element.props.id === "setup-knowledge")).toBe(
        true,
      ),
    );
  }
}
function knowledge() {
  return elements(render()).find((element) => element.props.id === "setup-knowledge")!;
}
async function create() {
  await mount("create");
  await elements(render()).find((element) => element.type === "form")!.props.onSubmit!({
    preventDefault: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.userId = "founder";
  h.botId = `bot-${++h.sequence}`;
  h.businessName = "";
  h.starter = null;
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  setCreateBriefRecoveryOwner(null);
  setCreateBriefRecoveryOwner(h.userId);
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  h.fetch.mockReset();
  h.fetch.mockImplementation(async (path: string) => {
    if (path === "/api/agents") return json({ id: h.botId, mark_key: "spark-rose" });
    if (path.startsWith("/api/agent-config/") && !path.endsWith("/manual")) {
      return json({ personality: "Clear", directives: [], mark_key: "spark-rose" });
    }
    return json({ readiness: { rules: 1, facts: 0, tone: false } });
  });
});
afterEach(() => {
  unmount();
  setCreateBriefRecoveryOwner(null);
  vi.unstubAllGlobals();
});

describe("first-brief recovery after Bot creation", () => {
  it.each(["empty", "unavailable"] as const)(
    "retains the brief after %s extraction and retries on the same Bot",
    async (failure) => {
      const usualFetch = h.fetch.getMockImplementation()!;
      h.fetch.mockImplementation((path: string) =>
        path === "/api/train/extract"
          ? Promise.resolve(
              failure === "empty"
                ? json({ readiness: { rules: 0, facts: 0, tone: false } })
                : json({ error: "Unavailable" }, 503),
            )
          : usualFetch(path),
      );
      await create();
      expect(h.onCreated).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(isCreateBriefTraining(h.userId, h.botId)).toBe(false));
      expect(
        h.event.mock.calls.some(
          ([event]) =>
            event.event === "training_asset_added" || event.event === "launch_readiness_reached",
        ),
      ).toBe(false);
      await mount("setup");
      expect(knowledge().props.value).toBe(brief);
      expect(text(render())).toContain("starting brief");
      h.fetch.mockImplementation(usualFetch);
      elements(render()).find(
        (element) => element.type === "button" && text(element) === "Save Changes",
      )!.props.onClick!();
      await vi.waitFor(() => expect(knowledge().props.value).toBe(""));
      await mount("setup");
      expect(knowledge().props.value).toBe("");
      expect(h.fetch.mock.calls.filter(([path]) => path === "/api/agents")).toHaveLength(1);
    },
  );

  it("does not restore a successfully applied brief", async () => {
    await create();
    await vi.waitFor(() =>
      expect(h.event.mock.calls.some(([event]) => event.event === "training_asset_added")).toBe(
        true,
      ),
    );
    await mount("setup");
    expect(knowledge().props.value).toBe("");
  });
});

describe("Bot limit", () => {
  it("closes for the account-wide limit dialog instead of staying open beneath its Studio link", async () => {
    // The server states the workspace's real cap; this form must not restate it.
    h.fetch.mockImplementation(async () =>
      json(
        {
          code: "AGENT_CAPACITY_REACHED",
          error:
            "Your plan includes up to 2 Bots. Edit an existing Bot in Studio to change what it does.",
        },
        402,
      ),
    );
    await create();
    expect(h.onClose).toHaveBeenCalledOnce();
    const [update] = h.setParams.mock.calls[0];
    expect(update(new URLSearchParams("create=1&brief=x&agent=a")).toString()).toBe("agent=a");
    expect(text(render())).not.toContain("Could Not Create Bot");
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/train/extract")).toHaveLength(0);
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("pending brief ownership", () => {
  it("finishes an already submitted create after navigation and preserves an unapplied brief without updating the departed screen", async () => {
    const pending = deferredResponse();
    h.fetch.mockImplementation((path: string) =>
      path === "/api/agents"
        ? pending.promise
        : Promise.resolve(json({ error: "Training unavailable" }, 503)),
    );
    await mount("create");
    const creating = elements(render()).find((element) => element.type === "form")!.props.onSubmit!(
      { preventDefault: vi.fn() },
    );
    expect(h.fetch).toHaveBeenCalledOnce();
    unmount();
    pending.resolve(json({ id: h.botId, mark_key: "spark-rose" }));
    await creating;
    expect(readCreateBrief(h.userId, h.botId)).toBe(brief);
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/agents")).toHaveLength(1);
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/train/extract")).toHaveLength(1);
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(h.event).not.toHaveBeenCalled();
  });

  it("does not restore or train an old account's brief when its create response arrives after switching accounts", async () => {
    const pending = deferredResponse();
    h.fetch.mockReturnValue(pending.promise);
    await mount("create");
    const creating = elements(render()).find((element) => element.type === "form")!.props.onSubmit!(
      { preventDefault: vi.fn() },
    );
    const previousUser = h.userId;
    setCreateBriefRecoveryOwner("other-owner");
    h.userId = "other-owner";
    unmount();
    pending.resolve(json({ id: h.botId, mark_key: "spark-rose" }));
    await creating;
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/train/extract")).toHaveLength(0);
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    setCreateBriefRecoveryOwner(previousUser);
    expect(readCreateBrief(previousUser, h.botId)).toBe("");
  });

  it("does not announce or restore training whose response arrives after logout", async () => {
    const pending = deferredResponse();
    const usualFetch = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string) =>
      path === "/api/train/extract" ? pending.promise : usualFetch(path),
    );
    await create();
    expect(h.onCreated).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledOnce();
    expect(readCreateBrief(h.userId, h.botId)).toBe(brief);
    h.event.mockClear();
    setCreateBriefRecoveryOwner(null);
    pending.resolve(json({ readiness: { rules: 1, facts: 0, tone: false } }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(h.event).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    setCreateBriefRecoveryOwner(h.userId);
    expect(readCreateBrief(h.userId, h.botId)).toBe("");
  });

  it("stops a Setup retry before training if the account changes during its first write", async () => {
    rememberCreateBrief(h.userId, h.botId, brief);
    await mount("setup");
    const pending = deferredResponse();
    const usualFetch = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string) =>
      path.endsWith("/manual") ? pending.promise : usualFetch(path),
    );
    elements(render()).find((element) => element.type === "button" && text(element) === "Warm")!
      .props.onClick!();
    elements(render()).find(
      (element) => element.type === "button" && text(element) === "Save Changes",
    )!.props.onClick!();
    expect(h.fetch.mock.calls.filter(([path]) => path.endsWith("/manual"))).toHaveLength(1);
    setCreateBriefRecoveryOwner("other-owner");
    pending.resolve(json({ ok: true }));
    await vi.waitFor(() => expect(text(render())).toContain("Save Changes"));
    expect(h.fetch.mock.calls.some(([path]) => path === "/api/train/extract")).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(text(render())).not.toContain("Saved. Run a test");
  });
});

/**
 * Creating the first Bot is the owner's first conversation about it. It is
 * called Bo, nothing is picked from a list, and the one thing asked besides
 * the job is the business name, because callers hear it in Bo's first sentence.
 */
describe("creating the first Bot", () => {
  type Field = ReactElement<{
    placeholder?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }>;
  const businessField = () =>
    (elements(render()) as unknown as Field[]).find(
      (element) => element.type === "input" && element.props.placeholder === "Ridge Dental",
    );
  const submit = () =>
    elements(render()).find((element) => element.type === "form")!.props.onSubmit!({
      preventDefault: vi.fn(),
    });
  const sentTo = (path: string) =>
    h.fetch.mock.calls
      .filter(([called]) => called === path)
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  it("says the Bot is called Bo, and offers no starter to pick", async () => {
    await mount("create");
    const screen = text(render());
    expect(screen).toContain("Your Bot is called Bo. You can rename it any time.");
    for (const starter of ["Sales Rep", "Appointment Setter", "Customer Support", "Recruiter"]) {
      expect(screen).not.toContain(starter);
    }
  });

  it("saves the business name in the workspace's business profile and tells the Bot", async () => {
    await mount("create");
    businessField()!.props.onChange!({ target: { value: "  Ridge Dental  " } });
    await submit();
    expect(sentTo("/api/company-identity")).toEqual([{ business_name: "Ridge Dental" }]);
    expect(h.updateBranding).toHaveBeenCalledWith({ business_name: "Ridge Dental" });
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(sentTo("/api/train/extract")).toHaveLength(1));
    expect(sentTo("/api/train/extract")[0].message).toContain("Business name: Ridge Dental.");
  });

  it("opens the new Bot and says so when the business name could not be saved", async () => {
    const usualFetch = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string) =>
      path === "/api/company-identity"
        ? Promise.resolve(json({ error: "Unavailable" }, 503))
        : usualFetch(path),
    );
    await mount("create");
    businessField()!.props.onChange!({ target: { value: "Ridge Dental" } });
    await submit();
    expect(h.updateBranding).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning", title: "Business Name Not Confirmed" }),
    );
    expect(h.onCreated).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledOnce();
  });

  it("sends nothing about the business when the field is left empty", async () => {
    await create();
    expect(sentTo("/api/company-identity")).toEqual([]);
    await vi.waitFor(() => expect(sentTo("/api/train/extract")).toHaveLength(1));
    expect(sentTo("/api/train/extract")[0].message).not.toContain("Business name:");
  });

  it("does not ask a workspace that already has a business name", async () => {
    h.businessName = "Ridge Dental";
    await mount("create");
    expect(businessField()).toBeUndefined();
    await submit();
    expect(sentTo("/api/company-identity")).toEqual([]);
  });

  it("does not ask for a business name when the Bot is for personal use", async () => {
    // A signup link for everyday use carries this starter; there is no business.
    h.starter = "personal-assistant";
    await mount("create");
    expect(businessField()).toBeUndefined();
    await submit();
    expect(sentTo("/api/company-identity")).toEqual([]);
    expect(sentTo("/api/agents")[0]).toMatchObject({ is_business_agent: false });
  });
});
