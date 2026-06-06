import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { createSseStream, setSseHeaders, writeSseBootstrap } from "./sse-stream";

function mockRes() {
  const writes: string[] = [];
  let writableEnded = false;
  const res = {
    writableEnded,
    setHeader: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(() => {
      writableEnded = true;
      Object.defineProperty(res, "writableEnded", { value: true, writable: true });
    }),
    flush: vi.fn(),
  } as unknown as Response & { flush: () => void; writableEnded: boolean };
  Object.defineProperty(res, "writableEnded", {
    get: () => writableEnded,
    set: (v: boolean) => {
      writableEnded = v;
    },
  });
  return { res, writes };
}

function mockReq() {
  const closeHandlers: Array<() => void> = [];
  const req = {
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "close") closeHandlers.push(handler);
    }),
  } as unknown as Request;
  return { req, closeHandlers };
}

describe("sse-stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setSseHeaders disables buffering", () => {
    const { res } = mockRes();
    setSseHeaders(res);
    expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
  });

  it("writes events and flushes", () => {
    const { res, writes } = mockRes();
    const { req } = mockReq();
    const sse = createSseStream(req, res);
    sse.write("done", { reply: "ok" });
    expect(writes.join("")).toContain("event: done");
    expect(writes.join("")).toContain('"reply":"ok"');
    expect(res.flush).toHaveBeenCalled();
    sse.end();
  });

  it("emits keepalive comments on interval", () => {
    const { res, writes } = mockRes();
    const { req } = mockReq();
    const sse = createSseStream(req, res);
    vi.advanceTimersByTime(12_000);
    expect(writes.some((w) => w.includes(": keepalive"))).toBe(true);
    sse.end();
  });

  it("writeSseBootstrap sends early meta", () => {
    const { res } = mockRes();
    const { req } = mockReq();
    const sse = createSseStream(req, res);
    writeSseBootstrap(sse, { status: "connecting" });
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("event: meta"));
    sse.end();
  });

  it("marks clientDisconnected on req close without blocking writes", () => {
    const { res } = mockRes();
    const { req, closeHandlers } = mockReq();
    const sse = createSseStream(req, res);
    closeHandlers.forEach((h) => h());
    expect(sse.clientDisconnected).toBe(true);
    expect(sse.write("done", { reply: "late" })).toBe(true);
    sse.end();
  });
});
