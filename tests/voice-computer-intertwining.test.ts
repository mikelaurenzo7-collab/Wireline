import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";
import {
  AGENT_TOOL_CATALOG,
  AGENT_TOOL_NAME_VALUES,
  ROLE_TOOL_SETS,
} from "../src/lib/agent-capabilities";
import { AGENT_TOOL_DEFS } from "../src/lib/agent-runtime-helpers";
import type { ToolCallContext } from "../src/lib/agent-tool-types";
import { shouldProxyComputerToBackend } from "../src/lib/cloud-computer/worker-client";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "../src/lib/voice/openai-realtime-tools";

const h = vi.hoisted(() => ({
  startComputerTask: vi.fn(),
  getComputerTaskForOwner: vi.fn(),
  listComputerTasksForOwner: vi.fn(),
  replyToComputerTask: vi.fn(),
  stopComputerTask: vi.fn(),
}));

vi.mock("../src/lib/cloud-computer/task-runner", () => ({
  startComputerTask: h.startComputerTask,
  getComputerTaskForOwner: h.getComputerTaskForOwner,
  listComputerTasksForOwner: h.listComputerTasksForOwner,
  replyToComputerTask: h.replyToComputerTask,
  stopComputerTask: h.stopComputerTask,
  getComputerTask: h.getComputerTaskForOwner,
  listComputerTasks: h.listComputerTasksForOwner,
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dispatchAgentToolCall } from "../src/lib/agent-tool-dispatch";

function buildContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ enabledTools: null }]),
  };
  return {
    toolCallId: "call-computer-1",
    payload: {},
    message: {},
    agent: { id: "bot-alpha", user_id: "owner-1" },
    webhookAgentId: "bot-alpha",
    userId: "owner-1",
    agentId: "bot-alpha",
    drizzle: { select: vi.fn(() => query) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("voice and cloud computer runtime intertwining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers all 4 Cloud Computer tools across AGENT_TOOL_NAME_VALUES, AGENT_TOOL_CATALOG, ROLE_TOOL_SETS, AGENT_TOOL_DEFS, and OPENAI_REALTIME_WIRELINE_TOOLS", () => {
    const computerTools = [
      "start_computer_task",
      "check_computer_task",
      "reply_computer_task",
      "stop_computer_task",
    ] as const;

    for (const toolName of computerTools) {
      expect(AGENT_TOOL_NAME_VALUES).toContain(toolName);
      expect(AGENT_TOOL_CATALOG.some((entry) => entry.name === toolName)).toBe(true);
      expect(AGENT_TOOL_DEFS[toolName]).toBeDefined();
      expect(OPENAI_REALTIME_WIRELINE_TOOLS.some((entry) => entry.name === toolName)).toBe(true);
      for (const [role, tools] of Object.entries(ROLE_TOOL_SETS)) {
        expect(tools, `role ${role} missing ${toolName}`).toContain(toolName);
      }
    }

    const startTool = OPENAI_REALTIME_WIRELINE_TOOLS.find(
      (tool) => tool.name === "start_computer_task",
    );
    const replyTool = OPENAI_REALTIME_WIRELINE_TOOLS.find(
      (tool) => tool.name === "reply_computer_task",
    );
    expect(startTool?.parameters.required).toEqual(["goal"]);
    expect(replyTool?.parameters.required).toEqual(["message"]);
  });

  it("dispatches start_computer_task asynchronously and returns task_id and status immediately", async () => {
    h.startComputerTask.mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      agentId: "bot-alpha",
      goal: "Verify live pricing on the vendor portal",
      startUrl: "https://example.com/pricing",
      status: "running",
      summary: null,
      question: null,
    });

    const outcome = await dispatchAgentToolCall(
      "start_computer_task",
      {
        goal: "Verify live pricing on the vendor portal",
        start_url: "https://example.com/pricing",
      },
      buildContext(),
    );

    expect(h.startComputerTask).toHaveBeenCalledWith("owner-1", "bot-alpha", {
      goal: "Verify live pricing on the vendor portal",
      startUrl: "https://example.com/pricing",
    });
    expect(outcome.toolCallId).toBe("call-computer-1");
    expect(outcome.result).toContain("COMPUTER_TASK_STARTED");
    expect(outcome.result).toContain("task_id=11111111-2222-3333-4444-555555555555");
    expect(outcome.result).toContain("status=running");
  });

  it("dispatches check_computer_task with an explicit task_id or defaults to the latest Bot task", async () => {
    h.getComputerTaskForOwner.mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      agentId: "bot-alpha",
      goal: "Verify live pricing on the vendor portal",
      status: "needs_input",
      summary: null,
      question: "Please confirm the ZIP code on the quote screen.",
      currentUrl: "https://example.com/quote",
      errorCode: null,
    });

    const explicit = await dispatchAgentToolCall(
      "check_computer_task",
      { task_id: "11111111-2222-3333-4444-555555555555" },
      buildContext(),
    );

    expect(h.getComputerTaskForOwner).toHaveBeenCalledWith(
      "owner-1",
      "11111111-2222-3333-4444-555555555555",
    );
    expect(explicit.result).toContain("COMPUTER_TASK_STATUS");
    expect(explicit.result).toContain("status=needs_input");
    expect(explicit.result).toContain(
      "Pending question: Please confirm the ZIP code on the quote screen.",
    );

    h.listComputerTasksForOwner.mockResolvedValue([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        agentId: "bot-alpha",
        goal: "Check order shipment ETA",
        status: "completed",
        summary: "Shipment arrives Tuesday by 5 PM.",
        question: null,
        currentUrl: null,
        errorCode: null,
      },
    ]);

    const latest = await dispatchAgentToolCall("check_computer_task", {}, buildContext());

    expect(h.listComputerTasksForOwner).toHaveBeenCalledWith("owner-1", "bot-alpha");
    expect(latest.result).toContain("task_id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(latest.result).toContain("status=completed");
    expect(latest.result).toContain("Summary: Shipment arrives Tuesday by 5 PM.");
  });

  it("dispatches reply_computer_task and stop_computer_task for interactive caller loops", async () => {
    h.listComputerTasksForOwner.mockResolvedValue([
      {
        id: "11111111-2222-3333-4444-555555555555",
        agentId: "bot-alpha",
        goal: "Check Saturday technician slots",
        status: "needs_input",
        summary: null,
        question: "What service zip code should I enter?",
      },
    ]);
    h.replyToComputerTask.mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      agentId: "bot-alpha",
      goal: "Check Saturday technician slots",
      status: "running",
      summary: null,
      question: null,
    });

    const replied = await dispatchAgentToolCall(
      "reply_computer_task",
      { message: "60302" },
      buildContext(),
    );
    expect(h.replyToComputerTask).toHaveBeenCalledWith(
      "owner-1",
      "11111111-2222-3333-4444-555555555555",
      { message: "60302" },
    );
    expect(replied.result).toContain("COMPUTER_TASK_RESUMED");
    expect(replied.result).toContain("status=running");

    h.stopComputerTask.mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      agentId: "bot-alpha",
      goal: "Check Saturday technician slots",
      status: "stopped",
      summary: "Stopped by the owner.",
      question: null,
    });

    const stopped = await dispatchAgentToolCall(
      "stop_computer_task",
      { task_id: "11111111-2222-3333-4444-555555555555" },
      buildContext(),
    );
    expect(h.stopComputerTask).toHaveBeenCalledWith(
      "owner-1",
      "11111111-2222-3333-4444-555555555555",
    );
    expect(stopped.result).toContain("COMPUTER_TASK_STOPPED");
    expect(stopped.result).toContain("status=stopped");
  });

  it("enables cross-service worker proxy only when WIRELINE_VOICE_WORKER=true and backend origin + secret exist", () => {
    expect(
      shouldProxyComputerToBackend({
        WIRELINE_VOICE_WORKER: "false",
        BOTBOUND_BACKEND_ORIGIN: "https://botbound.app",
        WIRELINE_VOICE_WORKER_SECRET: "s".repeat(40),
      }),
    ).toBe(false);
    expect(
      shouldProxyComputerToBackend({
        WIRELINE_VOICE_WORKER: "true",
        BOTBOUND_BACKEND_ORIGIN: "https://botbound.app",
        WIRELINE_VOICE_WORKER_SECRET: "s".repeat(40),
      }),
    ).toBe(true);
  });

  it("fails closed when userId is missing and reports an unavailable Cloud Computer", async () => {
    const missingUser = await dispatchAgentToolCall(
      "start_computer_task",
      { goal: "Check inventory" },
      buildContext({
        userId: "",
        agent: { id: "bot-alpha", user_id: "" },
      }),
    );

    expect(missingUser.result).toContain("not enabled");
    expect(h.startComputerTask).not.toHaveBeenCalled();

    h.startComputerTask.mockRejectedValueOnce(
      new AppError(
        503,
        "COMPUTER_UNAVAILABLE",
        "The cloud computer is not available yet. It turns on once BotBound finishes setting it up.",
      ),
    );

    const unavailable = await dispatchAgentToolCall(
      "start_computer_task",
      { goal: "Check inventory" },
      buildContext(),
    );

    expect(unavailable.result).toContain("COMPUTER_TASK_UNAVAILABLE (COMPUTER_UNAVAILABLE)");
    expect(unavailable.result).toContain("The cloud computer is not available yet.");
  });
});
