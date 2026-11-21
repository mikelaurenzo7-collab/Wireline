import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioTaskComposer } from "../src/hooks/useStudioTaskComposer";
import { buildWorkHandoffUrl } from "../src/lib/work-handoff";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  drafts: new Map(),
  model: {} as Record<string, any>,
  location: { pathname: "/studio", search: "?agent=bot-a", hash: "" },
  navigate: vi.fn(),
  request: vi.fn(),
  focus: vi.fn(),
  showBrowser: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
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
  useEffect: (effect: () => unknown) => {
    h.effects.push(effect);
  },
  useCallback: (callback: unknown) => callback,
}));
vi.mock("react-router", () => ({
  Link: "a",
  useLocation: () => h.location,
  useNavigate: () => h.navigate,
}));
vi.mock("../src/contexts/ComputerWorkspaceContext", () => ({
  useComputerWorkspace: () => h.model,
}));
vi.mock("../src/contexts/StudioSessionContext", () => ({
  useStudioSessionState: () => ({ drafts: h.drafts }),
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [{ id: "bot-b", name: "Bravo" }] }),
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

const activeTask = (patch: Record<string, unknown> = {}) => ({
  id: "task-1",
  agentId: "bot-a",
  status: "running",
  ownerControl: false,
  preparingBrowser: false,
  stopping: false,
  question: null,
  ...patch,
});
const storeDraft = (text: string, scope = "work", command: string | null = null) =>
  h.drafts.set(`bot-a:${scope}`, { text, command, commandNonce: null });
function StudioTaskComposerHarness(
  patch: Partial<Parameters<typeof useStudioTaskComposer>[0]> = {},
) {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effects = [];
  return useStudioTaskComposer({
    agentId: "bot-a",
    agentName: "Alpha",
    enabled: true,
    autoReply: true,
    requested: true,
    messageDraft: "",
    onRequest: h.request,
    onShowBrowser: h.showBrowser,
    onFocus: h.focus,
    ...patch,
  });
}
const flushEffects = () => h.effects.map((effect) => effect());

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.drafts.clear();
  vi.clearAllMocks();
  h.location = { pathname: "/studio", search: "?agent=bot-a", hash: "" };
  h.model = {
    activeTask: null,
    selected: null,
    tasks: [],
    status: { available: true },
    listFailed: false,
    statusFailed: false,
    refreshRequired: false,
    starting: false,
    startTask: vi.fn().mockResolvedValue(activeTask()),
    taskAction: vi.fn().mockResolvedValue(activeTask()),
    handoffTask: vi.fn().mockResolvedValue(activeTask()),
  };
});

describe("one conversation composer for browser work", () => {
  it("starts only on send, uses existing task admission, and keeps the message draft", async () => {
    storeDraft("Read the public directory");
    const composer = StudioTaskComposerHarness({ messageDraft: "Keep my separate message" });
    expect(h.model.startTask).not.toHaveBeenCalled();
    expect(composer.canSend).toBe(true);
    expect(await composer.send()).toBe(true);
    expect(h.model.startTask).toHaveBeenCalledExactlyOnceWith({
      agentId: "bot-a",
      goal: "Read the public directory",
    });
    expect(StudioTaskComposerHarness().draft).toBe("");
    expect(h.showBrowser).not.toHaveBeenCalled();
  });

  it("fences duplicate clicks until the accepted task receipt arrives", async () => {
    let accept!: (value: unknown) => void;
    h.model.startTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    storeDraft("Find public hours");
    const composer = StudioTaskComposerHarness();
    const first = composer.send();
    expect(await composer.send()).toBe(false);
    expect(StudioTaskComposerHarness().canSend).toBe(false);
    accept(activeTask());
    expect(await first).toBe(true);
    expect(h.model.startTask).toHaveBeenCalledTimes(1);
  });

  it("retains a rejected task draft and reports the failure", async () => {
    h.model.startTask.mockRejectedValue(new Error("The task receipt could not be confirmed."));
    storeDraft("Find public hours");
    expect(await StudioTaskComposerHarness().send()).toBe(false);
    const after = StudioTaskComposerHarness();
    expect(after.draft).toBe("Find public hours");
    expect(renderToStaticMarkup(after.notice)).toContain(
      "The task receipt could not be confirmed.",
    );
  });

  it("does not clear an edited draft when an earlier send completes", async () => {
    let accept!: (value: unknown) => void;
    h.model.startTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    storeDraft("Find public hours");
    const sending = StudioTaskComposerHarness().send();
    storeDraft("Keep this newer draft");
    accept(activeTask());
    await sending;
    expect(StudioTaskComposerHarness().draft).toBe("Keep this newer draft");
  });

  it("sends an answer to the exact waiting task and preserves an unsent new task", async () => {
    h.model.activeTask = activeTask({ status: "needs_input", question: "Which city?" });
    storeDraft("A separate new task");
    storeDraft("Chicago", "work-reply", "task-1");
    const composer = StudioTaskComposerHarness();
    expect(composer.inputLabel).toBe("Reply to Alpha");
    expect(composer.maxLength).toBe(1000);
    expect(await composer.send()).toBe(true);
    expect(h.model.taskAction).toHaveBeenCalledExactlyOnceWith("task-1", "reply", "Chicago");
    expect(h.model.startTask).not.toHaveBeenCalled();
    expect(h.drafts.get("bot-a:work").text).toBe("A separate new task");
  });

  it("never reuses one task's answer for another task", () => {
    h.model.activeTask = activeTask({
      id: "task-2",
      status: "needs_input",
      question: "Which city?",
    });
    storeDraft("Chicago", "work-reply", "task-1");
    expect(StudioTaskComposerHarness().draft).toBe("");
    expect(StudioTaskComposerHarness().canSend).toBe(false);
    expect(h.drafts.get("bot-a:work-reply").command).toBe("task-1");
  });

  it("hands a prepared browser back to the Bot through its current task", async () => {
    h.model.activeTask = activeTask({ ownerControl: true, preparingBrowser: true });
    storeDraft("Read this page and summarize it");
    expect(await StudioTaskComposerHarness().send()).toBe(true);
    expect(h.model.handoffTask).toHaveBeenCalledExactlyOnceWith(
      "task-1",
      "Read this page and summarize it",
    );
    expect(h.model.startTask).not.toHaveBeenCalled();
  });

  it.each([
    { activeTask: activeTask() },
    { activeTask: activeTask({ agentId: "bot-b" }) },
    { activeTask: activeTask({ ownerControl: true }) },
    { tasks: null },
    { listFailed: true },
    { statusFailed: true },
    { refreshRequired: true },
    { starting: true },
    { status: { available: false } },
  ])("keeps drafts and refuses to start when work is unavailable: %j", async (patch) => {
    Object.assign(h.model, patch);
    storeDraft("Read the public directory");
    const composer = StudioTaskComposerHarness();
    expect(composer.canSend).toBe(false);
    expect(await composer.send()).toBe(false);
    expect(h.model.startTask).not.toHaveBeenCalled();
    expect(composer.draft).toBe("Read the public directory");
  });

  it("keeps ordinary messages separate while a task runs", async () => {
    storeDraft("Find public hours");
    const composer = StudioTaskComposerHarness({ requested: false });
    expect(composer.taskMode).toBe(false);
    expect(await composer.send()).toBe(false);
    expect(h.model.startTask).not.toHaveBeenCalled();
  });

  it("offers a waiting question once when the message box is free", () => {
    h.model.activeTask = activeTask({ status: "needs_input", question: "Which city?" });
    StudioTaskComposerHarness({ requested: false });
    flushEffects();
    StudioTaskComposerHarness({ requested: false });
    flushEffects();
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("respects returning to a message after viewing a task's question", () => {
    h.model.activeTask = activeTask({ status: "needs_input", question: "Which city?" });
    StudioTaskComposerHarness({ requested: true, messageDraft: "Keep this message" });
    flushEffects();
    StudioTaskComposerHarness({ requested: false });
    flushEffects();
    expect(h.request).not.toHaveBeenCalled();
  });

  it.each([{ messageDraft: "Keep typing this" }, { autoReply: false }, { enabled: false }])(
    "does not interrupt an owner draft, details view, or rehearsal: %j",
    (patch) => {
      h.model.activeTask = activeTask({ status: "needs_input", question: "Which city?" });
      StudioTaskComposerHarness({ requested: false, ...patch });
      flushEffects();
      expect(h.request).not.toHaveBeenCalled();
    },
  );

  it("stops the active task through the same controller without sending the draft", async () => {
    h.model.activeTask = activeTask();
    storeDraft("Keep this draft");
    await StudioTaskComposerHarness({ requested: false }).stop();
    expect(h.model.taskAction).toHaveBeenCalledExactlyOnceWith("task-1", "stop");
    expect(StudioTaskComposerHarness().draft).toBe("Keep this draft");
    expect(h.model.startTask).not.toHaveBeenCalled();
  });

  it("keeps the latest result available for speech when no task is selected", () => {
    h.model.tasks = [
      activeTask({
        id: "other-result",
        agentId: "bot-b",
        status: "completed",
        summary: "Another Bot's result",
      }),
      activeTask({ id: "own-result", status: "completed", summary: "Alpha's saved result" }),
    ];
    const composer = StudioTaskComposerHarness();
    expect(composer.response).toBe("Alpha's saved result");
    expect(composer.responseKey).toContain("own-result");
  });

  it("adopts a connected task as an inert browser draft and keeps its Bot route", () => {
    const url = new URL(
      buildWorkHandoffUrl("https://botbound.app", "bot-a", "Read the public directory"),
    );
    h.location.hash = url.hash;
    StudioTaskComposerHarness({ requested: false });
    flushEffects();
    expect(StudioTaskComposerHarness().draft).toBe("Read the public directory");
    expect(h.navigate).toHaveBeenCalledWith(
      { pathname: "/studio", search: "agent=bot-a&chat=computer", hash: "" },
      { replace: true },
    );
    expect(h.model.startTask).not.toHaveBeenCalled();
  });

  it("keeps a connected task for review when the owner is already writing", () => {
    const url = new URL(
      buildWorkHandoffUrl("https://botbound.app", "bot-a", "Read the public directory"),
    );
    h.location.hash = url.hash;
    StudioTaskComposerHarness({ messageDraft: "Keep my message" });
    flushEffects();
    const after = StudioTaskComposerHarness({ messageDraft: "Keep my message" });
    expect(after.draft).toBe("");
    expect(renderToStaticMarkup(after.notice)).toContain("Task from a connected assistant");
    expect(h.model.startTask).not.toHaveBeenCalled();
  });
});
