import {
  probeVoiceWorkerReadiness,
  readVoiceWorkerReadiness,
  voiceWorkerSourceRevision,
} from "../src/lib/voice/openai-sip-worker-readiness";
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

const releaseRevision = "a".repeat(40);
const webReadinessEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  APP_URL: "https://botbound.me",
  WIRELINE_VOICE_WORKER_URL: "https://voice.example.com",
  WIRELINE_VOICE_WORKER_SECRET: secret,
  WIRELINE_VOICE_WORKER_SOURCE_REVISION: releaseRevision,
  OPENAI_API_KEY: "test-openai-api-key",
  OPENAI_PROJECT_ID: "proj_testproject123",
  OPENAI_WEBHOOK_SECRET: "test-openai-signature-secret",
  INTERNAL_JWT_SECRET: "test-jwt-signature-secret-at-least-32",
  OPENAI_SIP_MAX_CALL_SECONDS: "3600",
};
const workerReadinessEnv: NodeJS.ProcessEnv = {
  ...webReadinessEnv,
  VERCEL: "",
  WIRELINE_VOICE_WORKER: "true",
};

describe("authenticated deployment readiness", () => {
  it("reports safe source/duration/parity metadata only after its database check", async () => {
    const database = vi.fn().mockResolvedValue(undefined);
    const readiness = await readVoiceWorkerReadiness(database, workerReadinessEnv);
    expect(database).toHaveBeenCalledOnce();
    expect(readiness).toMatchObject({
      ready: true,
      protocol: 1,
      source_revision: releaseRevision,
      max_call_seconds: 3600,
    });
    expect(readiness.sip_configuration_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(readiness);
    for (const sensitive of [
      secret,
      webReadinessEnv.OPENAI_API_KEY,
      webReadinessEnv.OPENAI_WEBHOOK_SECRET,
      webReadinessEnv.INTERNAL_JWT_SECRET,
      webReadinessEnv.OPENAI_PROJECT_ID,
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it.each(["", "main", "a".repeat(39)])(
    "rejects missing or invalid deployed revision %s",
    (revision) => {
      expect(() =>
        voiceWorkerSourceRevision({
          ...workerReadinessEnv,
          WIRELINE_VOICE_WORKER_SOURCE_REVISION: revision,
        }),
      ).toThrow("40-character");
    },
  );

  it("fails readiness on a database outage or accidental Vercel worker", async () => {
    await expect(
      readVoiceWorkerReadiness(async () => {
        throw new Error("database unavailable");
      }, workerReadinessEnv),
    ).rejects.toThrow("database unavailable");
    const database = vi.fn();
    await expect(
      readVoiceWorkerReadiness(database, { ...workerReadinessEnv, VERCEL: "1" }),
    ).rejects.toThrow("Persistent worker");
    expect(database).not.toHaveBeenCalled();
  });

  it("verifies a read-only authenticated probe for the exact release", async () => {
    const snapshot = await readVoiceWorkerReadiness(async () => undefined, workerReadinessEnv);
    const request = vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify(snapshot)));
    const result = await probeVoiceWorkerReadiness(releaseRevision, webReadinessEnv, request);
    expect(result.ready).toBe(true);
    expect(request).toHaveBeenCalledWith(
      new URL("https://voice.example.com/readyz"),
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: { [VOICE_WORKER_AUTH_HEADER]: secret },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.stringify(result)).not.toContain(snapshot.sip_configuration_fingerprint);
  });

  it.each(["source", "duration", "protocol", "draining", "fingerprint"] as const)(
    "blocks release when the worker's %s differs",
    async (mismatch) => {
      const snapshot: Record<string, unknown> = await readVoiceWorkerReadiness(
        async () => undefined,
        workerReadinessEnv,
      );
      if (mismatch === "source") snapshot.source_revision = "b".repeat(40);
      if (mismatch === "duration") snapshot.max_call_seconds = 300;
      if (mismatch === "protocol") snapshot.protocol = 0;
      if (mismatch === "draining") snapshot.ready = false;
      if (mismatch === "fingerprint") snapshot.sip_configuration_fingerprint = "b".repeat(64);
      const request = vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify(snapshot)));
      expect(
        (await probeVoiceWorkerReadiness(releaseRevision, webReadinessEnv, request)).ready,
      ).toBe(false);
    },
  );

  it.each(["OPENAI_PROJECT_ID", "OPENAI_WEBHOOK_SECRET", "INTERNAL_JWT_SECRET"] as const)(
    "detects a different worker %s without exposing its value",
    async (setting) => {
      const different = {
        ...workerReadinessEnv,
        [setting]:
          setting === "OPENAI_PROJECT_ID"
            ? "proj_different123"
            : "different-secret-at-least-thirty-two-bytes",
      };
      const snapshot = await readVoiceWorkerReadiness(async () => undefined, different);
      const request = vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify(snapshot)));
      const result = await probeVoiceWorkerReadiness(releaseRevision, webReadinessEnv, request);
      expect(result).toMatchObject({
        ready: false,
        detail: expect.stringContaining("signing settings differ"),
      });
      expect(JSON.stringify(result)).not.toContain(different[setting]);
    },
  );

  it.each(["unreachable", "timeout", "unauthorized", "invalid_json"] as const)(
    "fails closed and redacts a %s readiness failure",
    async (failure) => {
      const request = vi.fn();
      if (failure === "unreachable" || failure === "timeout") {
        request.mockRejectedValue(new Error("transport accidentally includes " + secret));
      } else {
        request.mockResolvedValue(
          new globalThis.Response(failure === "invalid_json" ? "<html>" : "{}", {
            status: failure === "unauthorized" ? 401 : 200,
          }),
        );
      }
      const result = await probeVoiceWorkerReadiness(releaseRevision, webReadinessEnv, request);
      expect(result.ready).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it("never contacts an invalid target or verifies an unknown expected revision", async () => {
    const request = vi.fn();
    expect((await probeVoiceWorkerReadiness("", webReadinessEnv, request)).ready).toBe(false);
    expect(
      (
        await probeVoiceWorkerReadiness(
          releaseRevision,
          {
            ...webReadinessEnv,
            WIRELINE_VOICE_WORKER_URL: "http://voice.example.com",
          },
          request,
        )
      ).ready,
    ).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("protects metadata and rejects drain or failed database readiness over HTTP", async () => {
    const snapshot = await readVoiceWorkerReadiness(async () => undefined, workerReadinessEnv);
    const read = vi.fn().mockResolvedValue(snapshot);
    const worker = createVoiceWorkerApp(express.Router(), 1, read);
    server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const url = "http://127.0.0.1:" + address.port;
    const publicHealth = await fetch(url + "/healthz");
    expect(await publicHealth.json()).toEqual({ ready: true });
    expect((await fetch(url + "/readyz")).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    const options = { headers: { [VOICE_WORKER_AUTH_HEADER]: secret } };
    const ready = await fetch(url + "/readyz", options);
    expect(ready.status).toBe(200);
    expect(ready.headers.get("cache-control")).toBe("no-store");
    expect(await ready.json()).toEqual(snapshot);
    read.mockRejectedValueOnce(new Error("private database connection data"));
    const failed = await fetch(url + "/readyz", options);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ ready: false });
    worker.beginDrain();
    const draining = await fetch(url + "/readyz", options);
    expect(draining.status).toBe(503);
    expect(await draining.json()).toEqual({ ready: false });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
