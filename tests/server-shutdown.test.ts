import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({ log: { error: vi.fn() } }));
vi.mock("../src/lib/error-reporter", () => ({ reportError: vi.fn() }));

import {
  activeBackgroundWorkCount,
  drainBackgroundWork,
  runInBackground,
} from "../src/lib/background-work";
import { closeServerAndDrain, serverShutdownGraceMs } from "../src/lib/server-shutdown";

let server: Server | null = null;
const releaseWork: Array<() => void> = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releaseWork.push(resolve);
  return { promise, resolve };
}

async function serve(handler: RequestListener) {
  server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const release of releaseWork.splice(0)) release();
  await drainBackgroundWork();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

describe("persistent API shutdown", () => {
  it("waits for acknowledged post-response work before reporting a clean drain", async () => {
    const work = deferred();
    let stored = false;
    const url = await serve((_req, res) => {
      runInBackground("acknowledged webhook", async () => {
        await work.promise;
        stored = true;
      });
      res.end("accepted");
    });
    expect(await (await fetch(url)).text()).toBe("accepted");
    expect(activeBackgroundWorkCount()).toBe(1);

    let finished = false;
    const stopped = closeServerAndDrain(server, 1_000).then((result) => {
      finished = true;
      return result;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server!.listening).toBe(false);
    expect(finished).toBe(false);
    expect(stored).toBe(false);
    work.resolve();
    expect(await stopped).toBe("drained");
    expect(stored).toBe(true);
    expect(activeBackgroundWorkCount()).toBe(0);
  });

  it("bounds shutdown when acknowledged work never settles", async () => {
    const work = deferred();
    const url = await serve((_req, res) => {
      runInBackground("stalled webhook", () => work.promise);
      res.end("accepted");
    });
    expect(await (await fetch(url)).text()).toBe("accepted");
    expect(await closeServerAndDrain(server, 25)).toBe("timed_out");
    expect(server!.listening).toBe(false);
    expect(activeBackgroundWorkCount()).toBe(1);
  });

  it("also drains work enqueued by a request still finishing during shutdown", async () => {
    const request = deferred();
    const work = deferred();
    const admitted = deferred();
    const url = await serve((_req, res) => {
      admitted.resolve();
      void request.promise.then(() => {
        runInBackground("late post-response work", () => work.promise);
        res.end("accepted");
      });
    });
    const response = fetch(url);
    await admitted.promise;
    let finished = false;
    const stopped = closeServerAndDrain(server, 1_000).then((result) => {
      finished = true;
      return result;
    });
    request.resolve();
    expect(await (await response).text()).toBe("accepted");
    expect(finished).toBe(false);
    expect(activeBackgroundWorkCount()).toBe(1);
    work.resolve();
    expect(await stopped).toBe("drained");
  });

  it("allows 250 seconds on Render and keeps the local 30-second default", () => {
    expect(serverShutdownGraceMs({ RENDER: "true" })).toBe(250_000);
    expect(serverShutdownGraceMs({ RENDER_SERVICE_ID: "srv-id" })).toBe(250_000);
    expect(serverShutdownGraceMs({ RENDER: "true", VERCEL: "1" })).toBe(250_000);
    expect(serverShutdownGraceMs({ NODE_ENV: "development" })).toBe(30_000);
  });
});
