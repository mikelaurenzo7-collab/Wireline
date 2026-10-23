import { spawn, type ChildProcess } from "node:child_process";
import { request, type ClientRequest } from "node:http";
import { deflateSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// Run the parser in a separate process: an unhandled decompressor error must
// fail this probe rather than terminate the test runner. Only loopback is used.
const serverSource = String.raw`
  const express = require("express");
  const app = express();
  const options = { limit: 256 };
  app.post("/json", express.json(options), (req, res) => res.json(req.body));
  app.post("/raw", express.raw({ ...options, type: "application/json" }), (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body), bytes: req.body.toString("base64") });
  });
  app.post("/form", express.urlencoded({ ...options, extended: false, parameterLimit: 2 }),
    (req, res) => res.json(req.body));
  app.post("/late", (req, res, next) => {
    let decoded = false;
    let drained = false;
    const finish = () => {
      if (decoded && drained) res.json({ body: req.body, drained });
    };
    req.once("end", () => { drained = true; finish(); });
    express.json(options)(req, res, (error) => {
      if (error) return next(error);
      decoded = true;
      // Parent withholds the remaining HTTP bytes until decoding has finished.
      process.send({ type: "decoded", id: req.get("x-probe-id") });
      drained = req.readableEnded;
      finish();
    });
  });
  app.get("/health", (_req, res) => res.json({ alive: true }));
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ type: error.type || "unknown" });
  });
  const server = app.listen(0, "127.0.0.1", () => {
    process.send({ type: "ready", port: server.address().port });
  });
  const close = () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.on("message", (message) => { if (message === "close") close(); });
  process.once("disconnect", close);
  setTimeout(() => process.exit(2), 15000).unref();
`;

type ProbeMessage = { type?: string; id?: string; port?: number };
type Reply = { status: number; body: unknown };
let child: ChildProcess | undefined;
let port: number;
let stderr = "";

function messageFromChild(matches: (message: ProbeMessage) => boolean) {
  return new Promise<ProbeMessage>((resolve, reject) => {
    const process = child!;
    const finish = (error?: Error, message?: ProbeMessage) => {
      clearTimeout(timer);
      process.off("message", onMessage);
      process.off("exit", onExit);
      process.off("error", onError);
      if (error) reject(error);
      else resolve(message!);
    };
    const onMessage = (message: unknown) => {
      if (message && typeof message === "object" && matches(message as ProbeMessage)) {
        finish(undefined, message as ProbeMessage);
      }
    };
    const onExit = (code: number | null, signal: string | null) =>
      finish(new Error(`Parser child exited (${code ?? signal}): ${stderr}`));
    const onError = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new Error(`Parser child timed out: ${stderr}`)), 4000);
    process.on("message", onMessage);
    process.once("exit", onExit);
    process.once("error", onError);
  });
}

function beginRequest(path: string, headers: Record<string, string | number> = {}) {
  let client!: ClientRequest;
  const reply = new Promise<Reply>((resolve, reject) => {
    client = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: path === "/health" ? "GET" : "POST",
        agent: false,
        headers,
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.once("error", reject);
        response.once("aborted", () => reject(new Error("Parser response aborted")));
        response.once("end", () => {
          try {
            resolve({ status: response.statusCode!, body: JSON.parse(text) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    client.once("error", reject);
    client.setTimeout(4000, () => client.destroy(new Error("Local parser request timed out")));
  });
  return { client, reply };
}

async function post(path: string, payload: Buffer, contentType: string, encoding = "gzip") {
  const { client, reply } = beginRequest(path, {
    "content-type": contentType,
    "content-encoding": encoding,
    "content-length": payload.length,
  });
  try {
    client.end(payload);
    return await reply;
  } finally {
    client.destroy();
  }
}

describe("patched compressed request lifecycle", () => {
  beforeAll(async () => {
    child = spawn(process.execPath, ["-e", serverSource], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    const ready = await messageFromChild((message) => message.type === "ready");
    port = ready.port!;
  }, 6000);

  afterAll(async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const process = child;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => process.kill(), 1000);
      process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      if (process.connected) process.send("close");
      else process.kill();
    });
  });

  it("preserves compressed JSON, exact raw bytes and flat form fields", async () => {
    const raw = Buffer.from('{ "event": "received" }\n');
    expect(await post("/json", gzipSync(raw), "application/json")).toEqual({
      status: 200,
      body: { event: "received" },
    });
    expect(await post("/raw", gzipSync(raw), "application/json")).toEqual({
      status: 200,
      body: { isBuffer: true, bytes: raw.toString("base64") },
    });
    expect(
      await post(
        "/form",
        gzipSync(Buffer.from("From=%2B15551234567&Body=hello+world")),
        "application/x-www-form-urlencoded",
      ),
    ).toEqual({
      status: 200,
      body: { From: "+15551234567", Body: "hello world" },
    });
  });

  it("retains inflated-body caps and rejects malformed compression without killing the server", async () => {
    expect(
      await post(
        "/json",
        gzipSync(Buffer.from(JSON.stringify({ text: "x".repeat(300) }))),
        "application/json",
      ),
    ).toEqual({
      status: 413,
      body: { type: "entity.too.large" },
    });
    expect(await post("/json", Buffer.from("invalid gzip"), "application/json")).toMatchObject({
      status: 400,
    });
    expect(
      await post(
        "/form",
        gzipSync(Buffer.from("a=1&b=2&c=3")),
        "application/x-www-form-urlencoded",
      ),
    ).toEqual({
      status: 413,
      body: { type: "parameters.too.many" },
    });
  });

  it("drains delayed trailing bytes after decoding, stays alive and serves the next request", async () => {
    // The decoder finishes the frame before the HTTP request ends. Synchronize
    // on that event instead of hoping a sleep reproduces the late-write race.
    const first = Buffer.concat([deflateSync(Buffer.from('{"ok":true}')), Buffer.from([0])]);
    const trailing = Buffer.alloc(128, 0x58);
    const decoded = messageFromChild(
      (message) => message.type === "decoded" && message.id === "late-body",
    );
    const { client, reply } = beginRequest("/late", {
      "content-type": "application/json",
      "content-encoding": "deflate",
      "content-length": first.length + trailing.length,
      "x-probe-id": "late-body",
    });
    try {
      client.write(first);
      const [, response] = await Promise.all([decoded.then(() => client.end(trailing)), reply]);
      expect(response).toEqual({ status: 200, body: { body: { ok: true }, drained: true } });
      const health = beginRequest("/health");
      try {
        health.client.end();
        expect(await health.reply).toEqual({ status: 200, body: { alive: true } });
      } finally {
        health.client.destroy();
      }
      expect(child!.exitCode).toBeNull();
      expect(child!.signalCode).toBeNull();
      expect(stderr).toBe("");
    } finally {
      client.destroy();
    }
  }, 6000);
});

describe("patched constrained-collection compatibility", () => {
  it("rejects max-plus-one without traversing items or later refinements", () => {
    let itemVisits = 0;
    let collectionVisits = 0;
    const schema = z
      .array(
        z.preprocess((value) => {
          itemVisits++;
          return value;
        }, z.string().uuid()),
      )
      .max(2)
      .refine(() => {
        collectionVisits++;
        return true;
      });
    const parsed = schema.safeParse([0, 0, 0]);
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues).toMatchObject([{ code: "too_big", maximum: 2 }]);
    expect(itemVisits).toBe(0);
    expect(collectionVisits).toBe(0);
  });

  it("preserves ordinary defaults, trimming, unknown-key stripping and valid collection transforms", () => {
    const schema = z.object({
      name: z.string().trim(),
      enabled: z.boolean().default(true),
      tags: z
        .array(z.string().transform((value) => value.trim()))
        .max(2)
        .default([]),
    });
    expect(schema.parse({ name: "  Nora  ", ignored: "remove" })).toEqual({
      name: "Nora",
      enabled: true,
      tags: [],
    });
    expect(schema.parse({ name: "Nora", enabled: false, tags: [" work "] })).toEqual({
      name: "Nora",
      enabled: false,
      tags: ["work"],
    });
  });
});
