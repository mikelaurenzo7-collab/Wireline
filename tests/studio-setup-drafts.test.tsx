import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioAgentWorkspacePanel from "../src/components/StudioAgentWorkspacePanel";
import StudioAgentReviewPanel from "../src/components/StudioAgentReviewPanel";
import { createStudioSetupDrafts, type StudioSetupDrafts } from "../src/lib/studio-setup-drafts";
import { defaultBotMarkKey } from "../src/lib/bot-mark";
import { setCreateBriefRecoveryOwner } from "../src/lib/create-brief-recovery";

vi.mock("../src/hooks/useChannelEntitlements", () => ({
  useChannelEntitlements: () => ({
    status: "ready",
    data: { channels: ["voice", "email", "sms"] },
    includes: () => true,
    retry: vi.fn(),
  }),
}));
const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  dependencies: [] as Array<readonly unknown[]>,
  surface: "setup" as "setup" | "review",
  effects: [] as Array<() => unknown>,
  cleanups: [] as Array<() => void>,
  mounting: true,
  fetch: vi.fn(),
  userId: "owner-a",
  botId: "bot-a",
  compact: true,
  config: {
    personality: "Clear. Keep the repair shop policy.",
    directives: [] as Array<{ content: string }>,
    mark_key: "spark-rose",
    openingGreeting: undefined as string | undefined,
    firstMessage: undefined as string | undefined,
  },
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
  useEffect: (effect: () => unknown, dependencies: readonly unknown[]) => {
    const index = h.effectCursor++;
    const previous = h.dependencies[index];
    h.dependencies[index] = dependencies;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      h.effects.push(effect);
    }
  },
  useLayoutEffect: (effect: () => unknown) => {
    if (h.mounting) h.effects.push(effect);
  },
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.userId } }) }));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [{ id: h.botId, mark_key: h.config.mark_key }] }),
  AGENTS_CHANGED_EVENT: "agents-changed",
}));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Skeleton: "skeleton" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/BotMark", () => ({ default: "mark" }));
vi.mock("../src/components/BotMarkPicker", () => ({ default: "mark-picker" }));
vi.mock("../src/components/voice/SimpleVoicePicker", () => ({ default: "voice-picker" }));
vi.mock("../src/components/AgentToolPermissions", () => ({ default: "tool-permissions" }));

type Props = {
  id?: string;
  to?: string;
  title?: string;
  value?: string;
  children?: ReactNode;
  action?: ReactNode;
  disabled?: boolean;
  markKey?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onClick?: () => unknown;
  "aria-pressed"?: boolean;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let drafts: StudioSetupDrafts;
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effectCursor = 0;
  const tree =
    h.surface === "review"
      ? StudioAgentReviewPanel({
          agentId: h.botId,
          agentName: "Repair Bot",
          onEdit: vi.fn(),
          onRehearse: vi.fn(),
        })
      : StudioAgentWorkspacePanel({
          agentId: h.botId,
          agentName: "Repair Bot",
          compact: h.compact,
          drafts,
          onRehearseVoiceInChat: vi.fn(),
        });
  if (!h.mounting) flushEffects();
  return tree;
}
function flushEffects() {
  h.effects.splice(0).forEach((effect) => {
    const cleanup = effect();
    if (typeof cleanup === "function") h.cleanups.push(cleanup as () => void);
  });
}
function unmount() {
  h.cleanups.splice(0).forEach((cleanup) => cleanup());
}
async function mount(waitForSetup = true) {
  unmount();
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.dependencies = [];
  h.mounting = true;
  render();
  h.mounting = false;
  flushEffects();
  if (waitForSetup && h.surface === "setup")
    await vi.waitFor(() => expect(field("setup-greeting")).toBeDefined());
}
function field(id: string) {
  return elements(render()).find((element) => element.props.id === id);
}
function change(id: string, value: string) {
  field(id)!.props.onChange!({ target: { value } });
}
function button(label: string) {
  return elements(render()).find(
    (element) => element.type === "button" && text(element) === label,
  )!;
}
async function save() {
  button("Save Changes").props.onClick!();
  await vi.waitFor(() => expect(drafts.read(h.botId).saving).toBe(false));
}
beforeEach(() => {
  vi.clearAllMocks();
  h.userId = "owner-a";
  h.botId = "bot-a";
  h.compact = true;
  h.surface = "setup";
  drafts = createStudioSetupDrafts(h.userId);
  h.config = {
    personality: "Clear. Keep the repair shop policy.",
    directives: [],
    mark_key: "spark-rose",
    openingGreeting: undefined,
    firstMessage: undefined,
  };
  setCreateBriefRecoveryOwner(h.userId);
  const events = new EventTarget();
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn((event: Event) => events.dispatchEvent(event)),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  h.fetch.mockReset().mockImplementation(async (path: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    if (path === "/api/emails/accounts") return json({ accounts: [] });
    if (!options?.method) return json(h.config);
    if (path.endsWith("/mark")) h.config.mark_key = body.mark_key;
    if (path.endsWith("/manual") && body.type === "personality")
      h.config.personality = body.content;
    if (path.endsWith("/manual") && body.type === "directive")
      h.config.directives = [{ content: body.content }];
    return json({ readiness: { rules: 1, facts: 0, tone: false } });
  });
});
afterEach(() => {
  unmount();
  setCreateBriefRecoveryOwner(null);
  vi.unstubAllGlobals();
});

describe("Studio inspector draft lifecycle", () => {
  it("names the saved Knowledge and rules destination and preserves the active Bot", async () => {
    await mount();
    const link = elements(render()).find(
      (element) => element.type === "a" && text(element) === "Manage Knowledge",
    );
    expect(link?.props.to).toBe(`/knowledge?agent=${h.botId}`);
  });

  it("refreshes approved Build changes on the event without overwriting a dirty greeting", async () => {
    await mount();
    change("setup-greeting", "My unsaved greeting");
    h.config.openingGreeting = "Approved server greeting";
    h.config.personality = "Clear role.\n\n## DELIVERY TONE\nWarm. Concise and useful.";
    window.dispatchEvent(new Event("agents-changed"));
    await vi.waitFor(() => expect(button("Warm").props["aria-pressed"]).toBe(true));
    expect(field("setup-greeting")!.props.value).toBe("My unsaved greeting");
    expect(h.fetch.mock.calls.filter(([, options]) => !options?.method)).toHaveLength(2);
  });

  it("refreshes Review with the effective greeting and newest delivery tone", async () => {
    h.surface = "review";
    h.config.openingGreeting = "First saved greeting";
    await mount(false);
    await vi.waitFor(() => expect(text(render())).toContain("First saved greeting"));
    h.config.openingGreeting = "New approved greeting";
    h.config.personality =
      "Clear support policy.\n\n## DELIVERY TONE\nWarm. Concise, useful, and discreet.";
    window.dispatchEvent(new Event("agents-changed"));
    await vi.waitFor(() => expect(text(render())).toContain("New approved greeting"));
    expect(text(render())).toContain("Warm and natural");
    expect(text(render())).not.toContain("Clear support policy");
  });

  it("keeps mailbox read failures distinct from missing setup and ignores setup completion after switching Bots", async () => {
    h.surface = "review";
    const setup = deferred();
    let readFailed = true;
    h.fetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/api/emails/accounts") {
        if (readFailed) return json({ error: "Unavailable" }, 503);
        return json({
          accounts:
            h.botId === "bot-b"
              ? [
                  {
                    id: "mailbox-b",
                    provider: "agentmail",
                    agentId: "bot-b",
                    emailAddress: "bravo@botbound.app",
                  },
                ]
              : [],
        });
      }
      if (options?.method === "POST") return setup.promise;
      return json(h.config);
    });
    await mount(false);
    await vi.waitFor(() =>
      expect(
        elements(render()).some((element) => element.props.title === "Email Status Unavailable"),
      ).toBe(true),
    );
    expect(button("Set up email")).toBeUndefined();
    expect(h.fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);

    readFailed = false;
    button("Retry").props.onClick!();
    await vi.waitFor(() => expect(button("Set up email")).toBeDefined());
    button("Set up email").props.onClick!();
    await vi.waitFor(() =>
      expect(h.fetch).toHaveBeenCalledWith(
        "/api/agents/bot-a/managed-mailbox",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    h.botId = "bot-b";
    render();
    await vi.waitFor(() => expect(text(render())).toContain("bravo@botbound.app"));
    const lateResponse = json({ ok: true, email: "alpha@botbound.app" });
    setup.resolve(lateResponse);
    await vi.waitFor(() => expect(lateResponse.bodyUsed).toBe(true));
    expect(text(render())).toContain("bravo@botbound.app");
    expect(text(render())).not.toContain("alpha@botbound.app");
    const inbox = elements(render()).find(
      (element) => element.type === "a" && text(element) === "Open Inbox",
    );
    expect(inbox?.props.to).toBe("/inbox?tab=email&agent=bot-b");
  });

  it("reconciles a reserved mailbox after a failed setup and remount", async () => {
    h.surface = "review";
    let reserved = false;
    let setupAttempts = 0;
    h.fetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/api/emails/accounts") {
        return json({
          accounts: reserved
            ? [
                {
                  id: "mailbox-a",
                  provider: "agentmail",
                  agentId: "bot-a",
                  emailAddress: "alpha@botbound.app",
                },
              ]
            : [],
        });
      }
      if (path === "/api/agents/bot-a/managed-mailbox" && options?.method === "POST") {
        reserved = true;
        setupAttempts += 1;
        return setupAttempts === 1
          ? json({ error: "Managed email is temporarily unavailable." }, 503)
          : json({ ok: true, email: "alpha@botbound.app", reused: true });
      }
      return json(h.config);
    });
    await mount(false);
    await vi.waitFor(() => expect(button("Set up email")).toBeDefined());
    button("Set up email").props.onClick!();
    await vi.waitFor(() =>
      expect(
        elements(render()).some((element) => element.props.title === "Email Setup Not Finished"),
      ).toBe(true),
    );

    await mount(false);
    await vi.waitFor(() => expect(text(render())).toContain("alpha@botbound.app"));
    expect(button("Check setup")).toBeDefined();
    expect(setupAttempts).toBe(1);
    button("Check setup").props.onClick!();
    await vi.waitFor(() => expect(button("Check setup")?.props.disabled).toBe(false));
    expect(setupAttempts).toBe(2);
    expect(text(render())).toContain("alpha@botbound.app");
    expect(elements(render()).some((element) => element.props.title === "Email address")).toBe(
      true,
    );
    const inbox = elements(render()).find(
      (element) => element.type === "a" && text(element) === "Open Inbox",
    );
    expect(inbox?.props.to).toBe("/inbox?tab=email&agent=bot-a");
  });

  it("shows the resolved runtime greeting and prioritizes the saved delivery tone", async () => {
    h.config.openingGreeting = "Welcome to Acme.";
    h.config.firstMessage = "Stale creation greeting";
    h.config.personality =
      "Clear, warm support role.\n\n## DELIVERY TONE\nAuthoritative. Concise, useful, and discreet.";
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("Welcome to Acme.");
    expect(button("Authoritative").props["aria-pressed"]).toBe(true);
    expect(button("Clear").props["aria-pressed"]).toBe(false);
  });

  it.each([
    [{ provider: "xai", voice: "eve" }, true, "Eve"],
    [{ provider: "xai", voice: "eve" }, false, "Standard voice while registration finishes"],
    [null, null, "Marin · Natural & Expressive"],
  ])(
    "shows the effective phone voice in the setup summary (%j, %s)",
    async (phoneCall, phoneCallReady, label) => {
      h.surface = "review";
      h.fetch.mockImplementation(async (path: string) =>
        path === "/api/emails/accounts"
          ? json({ accounts: [] })
          : json({
              ...h.config,
              voice: { provider: "openai", voiceId: "marin", phoneCall, phoneCallReady },
            }),
      );
      await mount();
      await vi.waitFor(() => {
        const row = elements(render()).find(
          (element) => element.type === "div" && text(element).startsWith("Phone voice"),
        );
        expect(row && text(row)).toBe(`Phone voice${label}`);
      });
    },
  );

  it("falls back to a saved firstMessage from compatible config responses", async () => {
    h.config.firstMessage = "Welcome from the original setup.";
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("Welcome from the original setup.");
  });

  it("notifies listeners only after the confirmed greeting is written", async () => {
    await mount();
    change("setup-greeting", "Confirmed greeting");
    vi.mocked(window.dispatchEvent).mockImplementation(() => {
      expect(h.config.directives).toEqual([{ content: "Opening greeting: Confirmed greeting" }]);
      return true;
    });
    await save();
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("keeps voice preview on the saved Bot identity until a mark draft is confirmed", async () => {
    await mount();
    const preview = () => elements(render()).find((element) => element.type === "voice-picker")!;
    expect(preview().props.markKey).toBe("spark-rose");
    const nextMark = defaultBotMarkKey("different-mark");
    const picker = elements(render()).find((element) => element.type === "mark-picker")!;
    (picker.props.onChange as unknown as (value: string) => void)(nextMark);
    expect(drafts.read(h.botId).values.markKey).toBe(nextMark);
    expect(preview().props.markKey).toBe("spark-rose");
    await save();
    expect(preview().props.markKey).toBe(nextMark);
  });

  it("retains every edited setup field through close, review, layout remounts and Bot changes", async () => {
    await mount();
    change("setup-greeting", "Welcome to our repair shop.");
    change("setup-knowledge", "Ask for the appliance model.");
    button("Warm").props.onClick!();
    const nextMark = defaultBotMarkKey("different-mark");
    const picker = elements(render()).find((element) => element.type === "mark-picker")!;
    (picker.props.onChange as unknown as (value: string) => void)(nextMark);
    expect(text(render())).toContain("Unsaved changes");
    await mount();
    h.compact = false;
    await mount();
    h.botId = "bot-b";
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("");
    h.botId = "bot-a";
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("Welcome to our repair shop.");
    expect(field("setup-knowledge")!.props.value).toBe("Ask for the appliance model.");
    expect(button("Warm").props["aria-pressed"]).toBe(true);
    expect(drafts.read("bot-a").values.markKey).toBe(nextMark);
    expect(h.fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  it("refreshes untouched fields from the server without replacing a local greeting", async () => {
    await mount();
    change("setup-greeting", "My edited greeting");
    h.config.personality = "Polished. New approved company policy.";
    h.config.directives = [{ content: "Opening greeting: Server greeting" }];
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("My edited greeting");
    expect(button("Polished").props["aria-pressed"]).toBe(true);
  });

  it("clears confirmed edits after saving and preserves the full existing playbook", async () => {
    await mount();
    change("setup-greeting", "Welcome");
    change("setup-knowledge", "Open at 7am.");
    button("Warm").props.onClick!();
    await save();
    expect(drafts.read(h.botId).dirty).toBe(false);
    expect(h.config.personality).toContain("Keep the repair shop policy.");
    expect(text(render())).not.toContain("Unsaved changes");
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("Welcome");
    expect(field("setup-knowledge")!.props.value).toBe("");
  });

  it.each(["empty", "failed"])("retains knowledge after %s extraction", async (result) => {
    await mount();
    change("setup-knowledge", "Open at 7am.");
    const usual = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string, options?: RequestInit) =>
      path === "/api/train/extract"
        ? Promise.resolve(
            result === "empty"
              ? json({ readiness: { rules: 0, facts: 0, tone: false } })
              : json({}, 503),
          )
        : usual(path, options),
    );
    await save();
    await mount();
    expect(field("setup-knowledge")!.props.value).toBe("Open at 7am.");
    expect(drafts.read(h.botId).dirty).toBe(true);
  });

  it.each([
    [402, "Monthly usage limit reached. Open Billing to review your allowance."],
    [503, "Open Billing and refresh your subscription before starting new work."],
  ])(
    "preserves the actionable training refusal (%s) and confirmed manual setup",
    async (status, error) => {
      await mount();
      change("setup-greeting", "Welcome to the repair shop.");
      change("setup-knowledge", "Open at 7am.");
      button("Warm").props.onClick!();
      const usual = h.fetch.getMockImplementation()!;
      h.fetch.mockImplementation((path: string, options?: RequestInit) =>
        path === "/api/train/extract"
          ? Promise.resolve(json({ error }, status as number))
          : usual(path, options),
      );
      await save();
      const content = text(render());
      expect(content).toContain(error);
      expect(content).toContain("Tone and greeting were saved.");
      // Confirmed manual changes trigger the normal configuration refresh.
      await vi.waitFor(() => expect(field("setup-knowledge")).toBeDefined());
      expect(field("setup-knowledge")!.props.value).toBe("Open at 7am.");
      expect(drafts.read(h.botId).values.greeting).toBe("Welcome to the repair shop.");
      expect(drafts.read(h.botId).values.tone).toBe("Warm");
      expect(drafts.read(h.botId).dirty).toBe(true);
      await mount();
      expect(field("setup-knowledge")!.props.value).toBe("Open at 7am.");
      expect(field("setup-greeting")!.props.value).toBe("Welcome to the repair shop.");
    },
  );

  it("does not resubmit knowledge whose save finished while the inspector was closed", async () => {
    await mount();
    change("setup-knowledge", "Open at 7am.");
    const pending = deferred();
    const usual = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((path: string, options?: RequestInit) =>
      path === "/api/train/extract" ? pending.promise : usual(path, options),
    );
    button("Save Changes").props.onClick!();
    await vi.waitFor(() =>
      expect(h.fetch.mock.calls.some(([path]) => path === "/api/train/extract")).toBe(true),
    );
    unmount();
    pending.resolve(json({ readiness: { rules: 1, facts: 0, tone: false } }));
    await vi.waitFor(() => expect(drafts.read(h.botId).saving).toBe(false));
    await mount();
    expect(field("setup-knowledge")!.props.value).toBe("");
    await save();
    expect(h.fetch.mock.calls.filter(([path]) => path === "/api/train/extract")).toHaveLength(1);
  });

  it("rejects another account's draft store even when the same Bot id is supplied", async () => {
    await mount();
    change("setup-greeting", "Private draft");
    h.userId = "owner-b";
    setCreateBriefRecoveryOwner(h.userId);
    await mount();
    expect(field("setup-greeting")!.props.value).toBe("");
    expect(text(render())).not.toContain("Private draft");
  });

  it("keeps newly confirmed fields ahead of stale configuration responses", () => {
    const initial = drafts.read("bot-a").values;
    const startedRevision = drafts.revision();
    drafts.edit("bot-a", "greeting", "First edit");
    drafts.confirm("bot-a", { greeting: "First edit" }, { greeting: "First edit" });
    drafts.load("bot-a", initial, startedRevision);
    expect(drafts.read("bot-a").values.greeting).toBe("First edit");
    expect(drafts.read("bot-a").dirty).toBe(false);
    drafts.edit("bot-a", "greeting", "Newer edit");
    drafts.confirm("bot-a", { greeting: "First edit" }, { greeting: "First edit" });
    expect(drafts.read("bot-a").values.greeting).toBe("Newer edit");
    expect(drafts.read("bot-a").dirty).toBe(true);
  });
});
