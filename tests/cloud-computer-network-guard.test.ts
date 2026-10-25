import type { CDPSession } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserNetworkGuard } from "../src/lib/cloud-computer/browser-network-guard";

function fixture(allowed = vi.fn(async (_url: string) => true), pageClosed = () => false) {
  const events = new Map<string, (event: Record<string, unknown>) => void>();
  const send = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({}));
  const cdp = {
    send,
    on: (name: string, fn: (event: Record<string, unknown>) => void) => events.set(name, fn),
  };
  const blocked = vi.fn();
  const failed = vi.fn();
  const guard = new BrowserNetworkGuard(
    cdp as unknown as CDPSession,
    allowed,
    blocked,
    failed,
    pageClosed,
  );
  const pause = (url: string, requestId = "request-1") =>
    events.get("Fetch.requestPaused")!({ requestId, request: { url } });
  return { guard, send, allowed, failed, blocked, pause, events };
}

afterEach(() => vi.useRealTimers());

describe("Chromium request-stage network guard", () => {
  it("does not close other pages when an owned page closes during guard setup", async () => {
    let closed = false;
    const f = fixture(undefined, () => closed);
    f.send.mockImplementation(async () => {
      closed = true;
      throw new Error("Target page closed");
    });
    await expect(f.guard.start()).rejects.toThrow("cannot enforce safe network");
    expect(f.failed).not.toHaveBeenCalled();
    f.pause("https://example.com/");
    expect(f.allowed).not.toHaveBeenCalled();
  });
  it("requires interception and child-target pause support before reporting ready", async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error("unsupported"));
    await expect(f.guard.start()).rejects.toThrow("cannot enforce safe network");
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
  });

  it("keeps each request paused until its own DNS verdict and blocks a redirect", async () => {
    let resolve!: (value: boolean) => void;
    const allowed = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const f = fixture(allowed);
    await f.guard.start();
    f.pause("https://example.com/");
    expect(f.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
    resolve(true);
    await vi.waitFor(() =>
      expect(f.send).toHaveBeenCalledWith("Fetch.continueRequest", { requestId: "request-1" }),
    );
    f.pause("http://127.0.0.1/private", "redirect-1");
    resolve(false);
    await vi.waitFor(() =>
      expect(f.send).toHaveBeenCalledWith("Fetch.failRequest", {
        requestId: "redirect-1",
        errorReason: "BlockedByClient",
      }),
    );
    expect(f.blocked).toHaveBeenCalledOnce();
    expect(f.failed).not.toHaveBeenCalled();
  });

  it("fails closed on a hung DNS verdict and never continues a late result", async () => {
    vi.useFakeTimers();
    let resolve!: (value: boolean) => void;
    const f = fixture(
      vi.fn(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      ),
    );
    await f.guard.start();
    f.pause("https://example.com/");
    await vi.advanceTimersByTimeAsync(5_001);
    expect(f.failed).toHaveBeenCalledOnce();
    resolve(true);
    await Promise.resolve();
    expect(f.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
  });

  it("bounds paused-request accumulation and does not resume requests after close", async () => {
    const f = fixture(vi.fn(() => new Promise<boolean>(() => undefined)));
    await f.guard.start();
    for (let i = 0; i < 129; i += 1) f.pause("https://example.com/", `request-${i}`);
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.allowed).toHaveBeenCalledTimes(128);
    f.pause("https://example.com/", "after-close");
    expect(f.allowed).toHaveBeenCalledTimes(128);
    expect(f.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
    f.guard.stop();
  });

  it("closes the context on unexpected root CDP loss", async () => {
    const f = fixture();
    await f.guard.start();
    f.events.get("close")!({});
    expect(f.failed).toHaveBeenCalledOnce();
    f.pause("https://example.com/");
    expect(f.allowed).not.toHaveBeenCalled();
  });

  it.each(["command", "DNS"])(
    "cancels removed child %s work without failing remaining guarded pages",
    async (pendingKind) => {
      vi.useFakeTimers();
      let resolveDns!: (value: boolean) => void;
      const f = fixture(
        vi.fn((url) =>
          url.endsWith("/pending")
            ? new Promise<boolean>((resolve) => {
                resolveDns = resolve;
              })
            : Promise.resolve(true),
        ),
      );
      f.send.mockImplementation(async (method, params) => {
        if (method === "Target.getTargetInfo") throw new Error("No target with given id found");
        if (method === "Target.sendMessageToTarget" && pendingKind !== "command") {
          const command = JSON.parse(params!.message as string) as { id: number };
          queueMicrotask(() =>
            f.events.get("Target.receivedMessageFromTarget")!({
              sessionId: "frame-session",
              message: JSON.stringify({ id: command.id, result: {} }),
            }),
          );
        }
        return {};
      });
      await f.guard.start();
      f.events.get("Target.attachedToTarget")!({
        sessionId: "frame-session",
        targetInfo: { type: "iframe", targetId: "owned-frame" },
      });
      await vi.advanceTimersByTimeAsync(0);
      if (pendingKind === "DNS") {
        f.events.get("Target.receivedMessageFromTarget")!({
          sessionId: "frame-session",
          message: JSON.stringify({
            method: "Fetch.requestPaused",
            params: { requestId: "child-pending", request: { url: "https://example.org/pending" } },
          }),
        });
        expect(resolveDns).toBeTypeOf("function");
      }
      f.events.get("Target.detachedFromTarget")!({
        sessionId: "frame-session",
        targetId: "owned-frame",
      });
      await vi.advanceTimersByTimeAsync(5_001);
      resolveDns?.(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.failed).not.toHaveBeenCalled();
      expect(
        f.send.mock.calls.some(
          ([, params]) =>
            typeof params?.message === "string" && params.message.includes("child-pending"),
        ),
      ).toBe(false);
      f.pause("https://example.com/remaining", "still-guarded");
      await vi.advanceTimersByTimeAsync(0);
      expect(f.send).toHaveBeenCalledWith("Fetch.continueRequest", { requestId: "still-guarded" });
      f.guard.stop();
    },
  );

  it("fails closed on a worker target instead of resuming unguarded worker traffic", async () => {
    const f = fixture();
    await f.guard.start();
    f.events.get("Target.attachedToTarget")!({
      sessionId: "worker-session",
      targetInfo: { type: "worker" },
    });
    expect(f.failed).toHaveBeenCalledOnce();
    expect(f.send).not.toHaveBeenCalledWith("Runtime.runIfWaitingForDebugger", expect.anything());
  });
});
