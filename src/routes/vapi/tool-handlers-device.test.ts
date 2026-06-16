import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolCallContext } from "./types";

const notifyDeviceAction = vi.fn(async () => ({ sent: 0, devices: 0 }));
vi.mock("../../lib/mobile-push", () => ({
  notifyDeviceAction: (...a: unknown[]) => notifyDeviceAction(...a),
}));

import { handleDeviceToolCall } from "./tool-handlers-device";

const ctx = (userId: string | undefined = "user-1"): ToolCallContext => ({
  toolCallId: "t1",
  payload: {},
  message: {},
  agent: { id: "agent-1", user_id: userId as string },
  webhookAgentId: "agent-1",
  drizzle: {},
  log: {},
});

describe("handleDeviceToolCall", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches navigate_to and confirms", async () => {
    const res = await handleDeviceToolCall("navigate_to", { destination: "SFO airport" }, ctx());
    expect(res?.result).toMatch(/directions to SFO airport/i);
    expect(notifyDeviceAction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ action: "navigate", args: { destination: "SFO airport" } }),
    );
  });

  it("dispatches add_reminder and play_music", async () => {
    await handleDeviceToolCall("add_reminder", { title: "call the dentist" }, ctx());
    await handleDeviceToolCall("play_music", { query: "lo-fi beats" }, ctx());
    expect(notifyDeviceAction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ action: "reminder" }),
    );
    expect(notifyDeviceAction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ action: "play_music" }),
    );
  });

  it("asks for the destination instead of dispatching when missing", async () => {
    const res = await handleDeviceToolCall("navigate_to", {}, ctx());
    expect(res?.result).toMatch(/where would you like to go/i);
    expect(notifyDeviceAction).not.toHaveBeenCalled();
  });

  it("returns null for an unrelated tool so the dispatch chain continues", async () => {
    const res = await handleDeviceToolCall("send_email", { to_email: "a@b.com" }, ctx());
    expect(res).toBeNull();
  });

  it("degrades gracefully when there's no user", async () => {
    const noUser = { ...ctx(), agent: { id: "agent-1", user_id: undefined as unknown as string } };
    const res = await handleDeviceToolCall("navigate_to", { destination: "home" }, noUser);
    expect(res?.result).toMatch(/can't reach your phone/i);
    expect(notifyDeviceAction).not.toHaveBeenCalled();
  });
});
