import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";
import type { ToolCallContext } from "../src/lib/agent-tool-types";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "../src/lib/voice/openai-realtime-tools";

const h = vi.hoisted(() => ({
  startComputerTask: vi.fn(),
  getComputerTaskForOwner: vi.fn(),
  listComputerTasksForOwner: vi.fn(),
}));

vi.mock("../src/lib/cloud-computer/task-runner", () => ({
  startComputerTask: h.startComputerTask,
  getComputerTaskForOwner: h.getComputerTaskForOwner,
  listComputerTasksForOwner: h.listComputerTasksForOwner,
  getComputerTask: h.getComputerTaskForOwner,
  listComputerTasks: h.listComputerTasksForOwner,
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dispatchAgentToolCall } from "../src/lib/agent-tool-dispatch";

function buildContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    toolCallId: "call-computer-1",
    payload: {},
    message: {},
    agent: { id: "bot-alpha", user_id: "owner-1" },
    webhookAgentId: "bot-alpha",
    userId: "owner-1",
    agentId: "bot-alpha",
    drizzle: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("voice and cloud computer runtime intertwining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes start_computer_task and check_computer_task on OPENAI_REALTIME_WIRELINE_TOOLS", () => {
    const startTool = OPENAI_REALTIME_WIRELINE_TOOLS.find(
      (tool) => tool.name === "start_computer_task",
    );
    const checkTool = OPENAI_REALTIME_WIRELINE_TOOLS.find(
      (tool) => tool.name === "check_computer_task",
    );

    expect(startTool).toBeDefined();
    expect(startTool?.parameters.required).toEqual(["goal"]);
    expect(startTool?.parameters.properties).toHaveProperty("goal");
    expect(startTool?.parameters.properties).toHaveProperty("start_url");
    expect(startTool?.parameters.additionalProperties).toBe(false);

    expect(checkTool).toBeDefined();
    expect(checkTool?.parameters.properties).toHaveProperty("task_id");
    expect(checkTool?.parameters.additionalProperties).toBe(false);
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

  it("fails gracefully with a clear structured message when userId is missing or Cloud Computer is unavailable", async () => {
    const missingUser = await dispatchAgentToolCall(
      "start_computer_task",
      { goal: "Check inventory" },
      buildContext({
        userId: "",
        agent: { id: "bot-alpha", user_id: "" },
      }),
    );

    expect(missingUser.result).toContain("COMPUTER_TASK_UNAVAILABLE");
    expect(missingUser.result).toContain("userId");
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
