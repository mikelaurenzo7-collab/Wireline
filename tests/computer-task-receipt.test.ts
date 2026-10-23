import { describe, expect, it } from "vitest";
import {
  readComputerStatusReceipt,
  readComputerTaskListReceipt,
  readComputerTaskReceipt,
} from "../src/lib/computer-task-receipt";

const task = () => ({
  id: "task-1",
  agentId: "bot-1",
  goal: "Read the public page.",
  status: "completed",
  summary: "Done.",
  question: null,
  sources: ["https://example.com/"],
  events: [{ at: "2026-10-23T10:00:00Z", kind: "result", text: "Page read." }],
  turnCount: 1,
  actionCount: 2,
  startedAt: "2026-10-23T10:00:00Z",
  finishedAt: "2026-10-23T10:01:00Z",
  updatedAt: "2026-10-23T10:01:00Z",
  liveView: false,
});

describe("Computer task receipts", () => {
  it("accepts historical task rows without ephemeral browser metadata", () => {
    const receipt = readComputerTaskReceipt(task(), { taskId: "task-1", agentId: "bot-1" });
    expect(receipt).toMatchObject({
      id: "task-1",
      ownerControl: false,
      stopping: false,
      currentUrl: null,
      startUrl: null,
    });
  });
  it("rejects a valid receipt for the wrong task or Bot", () => {
    expect(readComputerTaskReceipt(task(), { taskId: "task-2" })).toBeNull();
    expect(readComputerTaskReceipt(task(), { agentId: "bot-2" })).toBeNull();
  });
  it.each(["tenant:front-desk", "A:B_c-9", "a".repeat(128)])(
    "accepts the server's Bot identifier shape: %s",
    (agentId) => {
      expect(readComputerTaskReceipt({ ...task(), agentId }, { agentId })).toMatchObject({
        agentId,
      });
    },
  );
  it("keeps colon-containing Bot receipts bound to the expected Bot", () => {
    expect(
      readComputerTaskReceipt(
        { ...task(), agentId: "tenant:front-desk" },
        { agentId: "tenant:another-bot" },
      ),
    ).toBeNull();
  });
  it("binds a normal start to the submitted goal as well as its Bot", () => {
    expect(
      readComputerTaskReceipt(task(), { agentId: "bot-1", goal: "A newer owner task." }),
    ).toBeNull();
    expect(
      readComputerTaskReceipt(task(), { agentId: "bot-1", goal: "Read the public page." }),
    ).not.toBeNull();
  });
  it.each([
    { id: "" },
    { id: "../other-task" },
    { id: "task%2Fother" },
    { id: "task:other" },
    { agentId: "" },
    { agentId: "a".repeat(129) },
    { agentId: "tenant/bot" },
    { agentId: "tenant%3Abot" },
    { agentId: "bot-1?other=1" },
    { status: "paid" },
    { actionCount: -1 },
    { actionCount: Number.NaN },
    { turnCount: Number.POSITIVE_INFINITY },
    { updatedAt: "not-a-date" },
    { ownerControl: "true" },
    { events: [{ at: "2026-10-23T10:00:00Z", kind: "unknown", text: "x" }] },
    { events: "not-a-list" },
    { sources: ["javascript:alert(1)"] },
    { ownerTabs: [{}] },
    {
      ownerDownloads: [{ id: "file", name: "test", bytes: -1, createdAt: "2026-10-23T10:00:00Z" }],
    },
    { ownerSavedLogins: [{ origin: "https://user:password@example.com/", label: "site" }] },
  ])("refuses malformed or unsafe state: %j", (patch) => {
    expect(readComputerTaskReceipt({ ...task(), ...patch })).toBeNull();
  });
  it("allows the real empty browser state without allowing other browser schemes", () => {
    expect(
      readComputerTaskReceipt({ ...task(), currentUrl: "about:blank", frameUrl: "about:blank" }),
    ).not.toBeNull();
    expect(readComputerTaskReceipt({ ...task(), currentUrl: "file:///private" })).toBeNull();
  });
  it("rejects incomplete and duplicate lists instead of adopting partial state", () => {
    expect(readComputerTaskListReceipt([task(), { success: true }])).toBeNull();
    expect(readComputerTaskListReceipt([task(), task()])).toBeNull();
    expect(readComputerTaskListReceipt([])).toEqual([]);
  });
  it("accepts mixed Bot identifier shapes without adopting malformed task paths", () => {
    const colonTask = { ...task(), id: "task-2", agentId: "tenant:front-desk" };
    expect(readComputerTaskListReceipt([task(), colonTask])?.map((entry) => entry.agentId)).toEqual(
      ["bot-1", "tenant:front-desk"],
    );
    expect(
      readComputerTaskListReceipt([colonTask, { ...task(), id: "../another-task" }]),
    ).toBeNull();
  });
  it("requires truthful availability and positive finite limits", () => {
    const ready = { available: true, reason: "ready", limits: { maxMinutes: 15, maxSteps: 120 } };
    expect(readComputerStatusReceipt(ready)).toEqual(ready);
    expect(readComputerStatusReceipt({ ...ready, available: false })).toBeNull();
    expect(readComputerStatusReceipt({ ...ready, reason: "plan_required" })).toBeNull();
    expect(
      readComputerStatusReceipt({ ...ready, limits: { maxMinutes: Infinity, maxSteps: 120 } }),
    ).toBeNull();
    expect(
      readComputerStatusReceipt({ ...ready, limits: { maxMinutes: 15, maxSteps: 0 } }),
    ).toBeNull();
  });
});
