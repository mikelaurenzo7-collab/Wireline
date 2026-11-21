import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("../src/lib/mobile-push", () => ({ notifyDeviceAction: mocks.notify }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: mocks.authorize,
}));

import { handleDeviceToolCall } from "../src/lib/bot-tools/device";
import type { ToolCallContext } from "../src/lib/agent-tool-types";

const context = {
  agent: { user_id: "owner-1" },
  toolCallId: "device-action-1",
} as ToolCallContext;
const actions = [
  ["navigate_to", { destination: "123 Example Street" }],
  ["add_reminder", { title: "Review the estimate" }],
  ["play_music", { query: "Jazz" }],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(undefined);
});

describe("device action receipts", () => {
  it.each(actions)("does not claim %s succeeded without a notification receipt", async (name, args) => {
    mocks.notify.mockResolvedValue({ sent: 0, devices: 0 });
    const result = await handleDeviceToolCall(name, args, context);
    expect(result?.result).toContain("not confirmed");
    expect(result?.result).toContain("before retrying");
    expect(result?.result).not.toMatch(/\bDone\b|\bStarting\b|Sending directions/i);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it.each(actions)("reports an accepted %s request without claiming device execution", async (name, args) => {
    mocks.notify.mockResolvedValue({ sent: 1, devices: 1 });
    const result = await handleDeviceToolCall(name, args, context);
    expect(result?.result).toContain("accepted for delivery");
    expect(result?.result).toContain("not confirmed");
    expect(mocks.notify).toHaveBeenCalledWith("owner-1", expect.objectContaining({ args }));
  });

  it("waits for the notification result before answering", async () => {
    let resolve!: (receipt: { sent: number; devices: number }) => void;
    mocks.notify.mockReturnValue(new Promise((done) => {
      resolve = done;
    }));
    let answered = false;
    const pending = handleDeviceToolCall("add_reminder", { title: "Check the quote" }, context)
      .then((result) => {
        answered = true;
        return result;
      });
    await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
    expect(answered).toBe(false);
    resolve({ sent: 0, devices: 1 });
    expect((await pending)?.result).toContain("not confirmed");
  });

  it("keeps a transport failure uncertain without retrying", async () => {
    mocks.notify.mockRejectedValue(new Error("transport disconnected"));
    await expect(handleDeviceToolCall("add_reminder", { title: "Check" }, context)).resolves.toEqual(
      expect.objectContaining({ result: expect.stringContaining("before retrying") }),
    );
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it("never notifies a device when the workspace cannot perform live actions", async () => {
    mocks.authorize.mockRejectedValue(new Error("disabled"));
    expect((await handleDeviceToolCall("add_reminder", { title: "Check" }, context))?.result)
      .toContain("disabled");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
