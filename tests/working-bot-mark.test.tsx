import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BotMark from "../src/components/BotMark";
import StudioTaskChat from "../src/components/StudioTaskChat";

const state = vi.hoisted(() => ({ task: null as Record<string, unknown> | null }));
vi.mock("../src/contexts/ComputerWorkspaceContext", () => ({
  ACTIVE_COMPUTER_TASKS: ["running", "needs_input"],
  useComputerWorkspace: () => ({
    activeTask: state.task,
    selected: state.task,
    tasks: state.task ? [state.task] : [],
    status: { available: true },
  }),
}));
vi.mock("../src/contexts/StudioSessionContext", () => ({
  useStudioSessionState: () => ({ drafts: new Map() }),
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [{ id: "bot-a", name: "Nora", mark_key: "spark-rose" }] }),
}));

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "task-1",
  agentId: "bot-a",
  goal: "Research a topic",
  status: "running",
  events: [],
  sources: [],
  actionCount: 0,
  ownerControl: false,
  stopping: false,
  ...overrides,
});
const renderTask = () =>
  renderToStaticMarkup(
    <StudioTaskChat agentId="bot-a" agentName="Nora" onShowBrowser={() => {}} />,
  );

describe("compact working Bot identity", () => {
  beforeEach(() => {
    state.task = task();
  });

  it("uses the selected Bot mark only while the Bot is doing Computer work", () => {
    const running = renderTask();
    expect(running).toContain('data-mark-key="spark-rose"');
    expect(running).toContain('data-working="true"');
    expect(running).toContain("Opening the browser");
    expect(running).toContain('aria-hidden="true"');

    state.task = task({ ownerControl: true });
    expect(renderTask()).toContain('data-working="false"');
    expect(renderTask()).toContain("You control the browser.");
    state.task = task({ stopping: true });
    expect(renderTask()).toContain('data-working="false"');
    expect(renderTask()).toContain("Stopping after the current step");
    state.task = task({ status: "needs_input", question: "What should I do?" });
    expect(renderTask()).not.toContain('data-working="true"');
    state.task = task({ status: "completed", summary: "Finished." });
    expect(renderTask()).not.toContain('data-working="true"');
  });

  it("keeps working and speaking states separate and respects reduced motion", () => {
    const identity = renderToStaticMarkup(<BotMark seed="bot-a" active />);
    expect(identity).toContain('data-active="true"');
    expect(identity).toContain('data-working="false"');
    const css = readFileSync("src/styles/bot-mark.css", "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.wl-bot-mark\[data-working="true"\]/,
    );
    const imageMark = renderToStaticMarkup(
      <BotMark seed="bot-a" imageUrl="/bot.png" working decorative />,
    );
    expect(imageMark).toMatch(
      /data-working="true"[^>]*>\s*<span class="wl-bot-mark__core">\s*<img[^>]*src="\/bot\.png"/,
    );
    expect(css).toMatch(/\[data-working="true"\] \.wl-bot-mark__core\s*\{\s*animation:/);
  });
});
