import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";
import type { Request, Response } from "express";
import {
  forwardOpenAISipWebhook,
  verifyVoiceWorkerServiceAuth,
  voiceWorkerEndpoint,
  VOICE_WORKER_AUTH_HEADER,
} from "../src/lib/voice/openai-sip-worker-dispatch";
import { isPersistentVoiceWorkerConfigured } from "../src/lib/voice/openai-sip-worker-config";
import {
  resolveOpenAISipSessionMaxSeconds,
  OPENAI_SIP_WEBHOOK_PATH,
} from "../src/lib/voice/openai-sip-config";
import { createVoiceWorkerApp } from "../src/lib/voice/openai-sip-worker-app";

vi.mock("../src/lib/background-work", () => ({ activeBackgroundWorkCount: () => 0 }));
const secret = "worker-test-authorization-secret-at-least-32-bytes";
let server: Server | undefined;
beforeEach(() => {
  vi.stubEnv("WIRELINE_VOICE_WORKER", "");
  vi.stubEnv("WIRELINE_VOICE_WORKER_SECRET", secret);
  vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "https://voice.example.com");
  vi.stubEnv("APP_URL", "https://botbound.me");
  vi.stubEnv("VERCEL", "1");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});
const req = () =>
  ({
    get: (name: string) =>
      ({
        "webhook-id": "message-1",
        "webhook-timestamp": "1234567890",
        "webhook-signature": "v1,signature",
        [VOICE_WORKER_AUTH_HEADER]: secret,
      })[name],
  }) as Request;
const res = () => {
  const value = { status: vi.fn(), json: vi.fn() };
  value.status.mockReturnValue(value);
  return value as unknown as Response;
};
describe("persistent SIP worker dispatch", () => {
  it("preserves signed bytes and envelope, authenticates dispatch, and only returns safe acknowledgement", async () => {
    const raw = Buffer.from('{ "type": "realtime.call.incoming", "text": "café" }\n');
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(
        JSON.stringify({
          received: true,
          handled: true,
          internal: "must not escape",
        }),
        { status: 202 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = res();
    expect(await forwardOpenAISipWebhook(req(), response, raw)).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://voice.example.com" + OPENAI_SIP_WEBHOOK_PATH);
    expect(Buffer.from(options.body)).toEqual(raw);
    expect(options.headers).toMatchObject({
      [VOICE_WORKER_AUTH_HEADER]: secret,
      "webhook-id": "message-1",
      "webhook-signature": "v1,signature",
    });
    expect(options.redirect).toBe("error");
    expect(response.json).toHaveBeenCalledWith({ received: true, handled: true });
  });
  it.each(["missing", "unreachable", "redirect", "bad_ack"])(
    "fails admission closed for %s worker",
    async (failure) => {
      const fetchMock = vi.fn();
      if (failure === "missing") vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "");
      else if (failure === "unreachable") fetchMock.mockRejectedValue(new Error("connection lost"));
      else
        fetchMock.mockResolvedValue(
          new globalThis.Response(JSON.stringify({ received: true }), {
            status: failure === "redirect" ? 302 : 202,
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const response = res();
      await expect(
        forwardOpenAISipWebhook(req(), response, Buffer.from("{}")),
      ).rejects.toMatchObject({ status: 503 });
      expect(response.json).not.toHaveBeenCalled();
      if (failure === "missing") expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("never forwards again from an authenticated persistent worker", async () => {
    vi.stubEnv("WIRELINE_VOICE_WORKER", "true");
    vi.stubEnv("VERCEL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await forwardOpenAISipWebhook(req(), res(), Buffer.from("{}"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(verifyVoiceWorkerServiceAuth("wrong")).toBe(false);
    await expect(
      forwardOpenAISipWebhook(
        { get: () => "wrong" } as unknown as Request,
        res(),
        Buffer.from("{}"),
      ),
    ).rejects.toMatchObject({ status: 401 });
    vi.stubEnv("VERCEL", "1");
    expect(isPersistentVoiceWorkerConfigured()).toBe(false);
    await expect(forwardOpenAISipWebhook(req(), res(), Buffer.from("{}"))).rejects.toMatchObject({
      status: 503,
    });
  });
  it.each([
    "http://voice.example.com",
    "https://botbound.me",
    "https://user:password@voice.example.com",
    "https://voice.example.com/path",
  ])("rejects unsafe/misrouted worker origin %s", (url) => {
    vi.stubEnv("WIRELINE_VOICE_WORKER_URL", url);
    expect(() => voiceWorkerEndpoint()).toThrow();
    expect(isPersistentVoiceWorkerConfigured()).toBe(false);
  });
  it("fails deployed forwarding closed without the canonical APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    expect(() => voiceWorkerEndpoint()).toThrow("APP_URL");
    expect(isPersistentVoiceWorkerConfigured()).toBe(false);
    vi.stubEnv("APP_URL", "https://wrong.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => voiceWorkerEndpoint()).toThrow("canonical");
    expect(isPersistentVoiceWorkerConfigured()).toBe(false);
  });
  it("rejects the current preview hostname even when it differs from APP_URL", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "branch-test.vercel.app");
    vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "https://branch-test.vercel.app");
    expect(() => voiceWorkerEndpoint()).toThrow("separate origin");
    expect(isPersistentVoiceWorkerConfigured()).toBe(false);
  });
  it("requires service authentication before parsing or starting call work", async () => {
    const router = express.Router();
    const accepted = vi.fn((_req: Request, response: Response) =>
      response.json({ received: true, handled: true }),
    );
    router.post(OPENAI_SIP_WEBHOOK_PATH, accepted);
    const worker = createVoiceWorkerApp(router, 1);
    server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const response = await fetch("http://127.0.0.1:" + address.port + OPENAI_SIP_WEBHOOK_PATH, {
      method: "POST",
      body: "bad json",
    });
    expect(response.status).toBe(401);
    expect(accepted).not.toHaveBeenCalled();
  });
  it("retains capacity and waits for an admission even after its client disconnects", async () => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = express.Router();
    router.post(OPENAI_SIP_WEBHOOK_PATH, async (_request, response) => {
      response.locals.voiceWorkerHandlerActive = true;
      try {
        started();
        await held; // A provider accept/commit continues despite an HTTP disconnect.
        response.json({ received: true, handled: true });
      } finally {
        response.locals.voiceWorkerHandlerActive = false;
        response.locals.voiceWorkerAdmissionRelease?.();
      }
    });
    const worker = createVoiceWorkerApp(router, 1);
    server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const url = "http://127.0.0.1:" + address.port + OPENAI_SIP_WEBHOOK_PATH;
    const client = httpRequest(url, {
      method: "POST",
      headers: { [VOICE_WORKER_AUTH_HEADER]: secret },
    });
    client.on("error", () => {});
    client.end();
    await entered;
    client.destroy();
    const second = await fetch(url, {
      method: "POST",
      headers: { [VOICE_WORKER_AUTH_HEADER]: secret },
    });
    expect(second.status).toBe(503);
    worker.beginDrain();
    let drained = false;
    const drain = worker.drainAdmissions().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await drain;
    expect(drained).toBe(true);
  });

  it("settles a pre-handler rejection even when the client has already disconnected", async () => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = express.Router();
    router.post(OPENAI_SIP_WEBHOOK_PATH, async (_request, response) => {
      started();
      await held; // Asynchronous limiter rejects before the call handler starts.
      response.status(429).end();
    });
    const worker = createVoiceWorkerApp(router, 1);
    server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const client = httpRequest("http://127.0.0.1:" + address.port + OPENAI_SIP_WEBHOOK_PATH, {
      method: "POST",
      headers: { [VOICE_WORKER_AUTH_HEADER]: secret },
    });
    client.on("error", () => {});
    client.end();
    await entered;
    client.destroy();
    worker.beginDrain();
    let drained = false;
    const drain = worker.drainAdmissions().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await drain;
    expect(drained).toBe(true);
  });
});
describe("business SIP duration", () => {
  it.each([undefined, "", "  ", "bad", "0", "-1", "Infinity"])(
    "defaults %s to a full hour",
    (value) => {
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: value })).toBe(3600);
    },
  );
  it.each([
    ["1800", 1800],
    ["3599.9", 3599],
    ["999999", 3600],
    ["10", 30],
  ])("honors bounded operator setting %s", (value, expected) => {
    expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: value })).toBe(
      expected,
    );
  });
});
