import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateAgentDialog from "../src/components/CreateAgentDialog";
import StudioAgentWorkspacePanel from "../src/components/StudioAgentWorkspacePanel";
import {
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
  onCreated: vi.fn(),
  userId: "founder",
  botId: "bot",
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
}));
vi.mock("react-router", () => ({
  Link: "a",
  useNavigate: () => h.navigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [], refresh: vi.fn() }),
  AGENTS_CHANGED_EVENT: "agents-changed",
}));
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
        onClose: vi.fn(),
        onCreated: h.onCreated,
        initialBrief: brief,
      })
    : StudioAgentWorkspacePanel({
        agentId: h.botId,
        agentName: "My Bot",
        onTestVoiceInChat: vi.fn(),
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
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
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
        (element) => element.type === "button" && text(element) === "Save changes",
      )!.props.onClick!();
      await vi.waitFor(() => expect(knowledge().props.value).toBe(""));
      await mount("setup");
      expect(knowledge().props.value).toBe("");
      expect(h.fetch.mock.calls.filter(([path]) => path === "/api/agents")).toHaveLength(1);
    },
  );

  it("does not restore a successfully applied brief", async () => {
    await create();
    expect(h.event.mock.calls.some(([event]) => event.event === "training_asset_added")).toBe(true);
    await mount("setup");
    expect(knowledge().props.value).toBe("");
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
    const creating = create();
    await vi.waitFor(() => expect(readCreateBrief(h.userId, h.botId)).toBe(brief));
    setCreateBriefRecoveryOwner(null);
    pending.resolve(json({ readiness: { rules: 1, facts: 0, tone: false } }));
    await creating;
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
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
      path.endsWith("/mark") ? pending.promise : usualFetch(path),
    );
    const saving = elements(render()).find(
      (element) => element.type === "button" && text(element) === "Save changes",
    )!.props.onClick!();
    setCreateBriefRecoveryOwner("other-owner");
    pending.resolve(json({ ok: true }));
    await saving;
    expect(
      h.fetch.mock.calls.some(
        ([path]) => path.endsWith("/manual") || path === "/api/train/extract",
      ),
    ).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(text(render())).not.toContain("Saved. Run a test");
  });
});
