/**
 * SSE helpers for long-running Director / workspace streams.
 *
 * Mobile browsers and proxies often drop idle connections. We emit an early
 * `meta` event, periodic keepalive comments, and flush after each write so
 * `done` reaches the client before post-processing (DB, artifacts).
 */
import type { Request, Response } from "express";

const KEEPALIVE_MS = 12_000;

function flushSse(res: Response): void {
  const flush = (res as Response & { flush?: () => void }).flush;
  flush?.();
}

export function setSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Content-Encoding", "none");
  res.setHeader("X-Accel-Buffering", "no");
}

export interface SseStreamHandle {
  /** True when the HTTP socket closed (client navigated away, etc.). */
  readonly clientDisconnected: boolean;
  write: (event: string, data: unknown) => boolean;
  comment: (line?: string) => void;
  end: () => void;
  onClientDisconnect: (handler: () => void) => void;
}

/**
 * Initialize an SSE response with keepalive pings until `end()` is called.
 */
export function createSseStream(req: Request, res: Response): SseStreamHandle {
  setSseHeaders(res);

  let clientDisconnected = false;
  let ended = false;
  const disconnectHandlers: Array<() => void> = [];

  const keepalive = setInterval(() => {
    if (ended || res.writableEnded) return;
    try {
      res.write(": keepalive\n\n");
      flushSse(res);
    } catch {
      clientDisconnected = true;
    }
  }, KEEPALIVE_MS);

  req.on("close", () => {
    if (clientDisconnected) return;
    clientDisconnected = true;
    for (const handler of disconnectHandlers) handler();
  });

  const write = (event: string, data: unknown): boolean => {
    if (ended || res.writableEnded) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      flushSse(res);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  };

  return {
    get clientDisconnected() {
      return clientDisconnected;
    },
    write,
    comment(line = "ping") {
      if (ended || res.writableEnded) return;
      try {
        res.write(`: ${line}\n\n`);
        flushSse(res);
      } catch {
        clientDisconnected = true;
      }
    },
    end() {
      if (ended) return;
      ended = true;
      clearInterval(keepalive);
      if (!res.writableEnded) res.end();
    },
    onClientDisconnect(handler) {
      disconnectHandlers.push(handler);
    },
  };
}

/** First byte to the client — opens the stream before slow DB / LLM work. */
export function writeSseBootstrap(
  sse: SseStreamHandle,
  meta: Record<string, unknown> = { status: "connecting" },
): void {
  sse.write("meta", meta);
}
