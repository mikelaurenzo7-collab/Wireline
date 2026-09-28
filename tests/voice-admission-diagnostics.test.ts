import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import RestException from "twilio/lib/base/RestException";
import { AppError } from "../src/lib/api-error";
import {
  openAIAcceptFailureDiagnostics,
  safeVoiceAdmissionError,
} from "../src/lib/voice/voice-admission-diagnostics";
import { createVoiceWorkerApp } from "../src/lib/voice/openai-sip-worker-app";
import { OPENAI_SIP_WEBHOOK_PATH } from "../src/lib/voice/openai-sip-config";
import { VOICE_WORKER_AUTH_HEADER } from "../src/lib/voice/openai-sip-worker-dispatch";

const h = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("../src/lib/server-logger", () => ({ log: { error: h.error } }));
vi.mock("../src/lib/background-work", () => ({ activeBackgroundWorkCount: () => 0 }));
let server: Server | undefined;
const privateText = "sk-test-private-key caller +13125550123 instructions do not disclose";
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("private voice admission diagnostics", () => {
  it("extracts the actual Twilio SDK exception class, numeric code and HTTP status only", () => {
    const error = new RestException({
      statusCode: 400,
      body: {
        message: privateText,
        code: 21220,
        more_info: privateText,
        details: { session: privateText },
      },
    });
    expect(error.name).toBe("Error");
    expect(safeVoiceAdmissionError(error)).toEqual({
      error_class: "RestException",
      http_status: 400,
      error_code: 21220,
    });
  });
  it("retains application refusal codes without their private message or details", () => {
    expect(
      safeVoiceAdmissionError(
        new AppError(402, "VOICE_FUNDING_REQUIRED", privateText, {
          session: privateText,
        }),
      ),
    ).toEqual({ error_class: "AppError", http_status: 402, error_code: "VOICE_FUNDING_REQUIRED" });
  });
  it("drops arbitrary class and code text instead of logging an error payload", () => {
    expect(
      safeVoiceAdmissionError({
        name: privateText,
        code: privateText,
        status: privateText,
        message: privateText,
        request: privateText,
      }),
    ).toEqual({ error_class: "NonError", http_status: 503 });
  });
  it("records only bounded OpenAI machine fields and never message, session or headers", async () => {
    const result = await openAIAcceptFailureDiagnostics(
      new Response(
        JSON.stringify({
          error: {
            code: "unknown_parameter",
            type: "invalid_request_error",
            param: "session.max_output_tokens",
            message: privateText,
            session: { instructions: privateText },
          },
          session: privateText,
        }),
        {
          status: 400,
          headers: { "x-request-id": "req_test12345678", authorization: privateText },
        },
      ),
    );
    expect(result).toEqual({
      http_status: 400,
      provider_request_id: "req_test12345678",
      provider_error_body: "parsed",
      provider_error_code: "unknown_parameter",
      provider_error_type: "invalid_request_error",
      provider_error_param: "session.max_output_tokens",
    });
    expect(JSON.stringify(result)).not.toContain(privateText);
  });
  it("drops malicious or unbounded provider machine fields", async () => {
    const result = await openAIAcceptFailureDiagnostics(
      new Response(
        JSON.stringify({
          error: {
            code: "sk_privatecredential",
            type: privateText,
            param: "session." + "x".repeat(500),
            message: privateText,
          },
        }),
        { status: 503, headers: { "x-request-id": "req_sk_privatecredential" } },
      ),
    );
    expect(result).toEqual({ http_status: 503, provider_error_body: "parsed" });
  });
  it.each([true, false])(
    "bounds oversized provider bodies with content-length=%s",
    async (declared) => {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(privateText.repeat(300)));
          },
          cancel,
        }),
        { status: 502, headers: declared ? { "content-length": "20000" } : {} },
      );
      expect(await openAIAcceptFailureDiagnostics(response)).toEqual({
        http_status: 502,
        provider_error_body: "too_large",
      });
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it("bounds a stalled error stream and cancels it without changing the provider status", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const pending = openAIAcceptFailureDiagnostics(
      new Response(new ReadableStream({ cancel }), { status: 502 }),
    );
    await vi.advanceTimersByTimeAsync(750);
    expect(await pending).toEqual({ http_status: 502, provider_error_body: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("keeps a malformed provider response diagnostic generic", async () => {
    expect(
      await openAIAcceptFailureDiagnostics(new Response(privateText, { status: 500 })),
    ).toEqual({
      http_status: 500,
      provider_error_body: "unreadable",
    });
  });
  it("logs the private worker failure safely while keeping its existing generic response and releasing admission", async () => {
    for (const key of [
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_GIT_COMMIT_REF",
      "VERCEL_GIT_COMMIT_SHA",
      "RENDER",
      "RENDER_SERVICE_ID",
      "RENDER_GIT_BRANCH",
      "RENDER_GIT_COMMIT",
      "IS_PULL_REQUEST",
      "WIRELINE_DEPLOYMENT_ENVIRONMENT",
      "WIRELINE_VOICE_WORKER_ADMISSIONS_ENABLED",
    ])
      vi.stubEnv(key, "");
    const secret = "worker-test-authorization-secret-at-least-32-bytes";
    vi.stubEnv("WIRELINE_VOICE_WORKER_SECRET", secret);
    const router = express.Router();
    router.post(OPENAI_SIP_WEBHOOK_PATH, (_req, _res, next) =>
      next(
        new RestException({
          statusCode: 400,
          body: { code: 21220, message: privateText, details: { secret } },
        }),
      ),
    );
    const worker = createVoiceWorkerApp(router, 1);
    server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test listener");
    const response = await fetch(`http://127.0.0.1:${address.port}${OPENAI_SIP_WEBHOOK_PATH}`, {
      method: "POST",
      headers: { [VOICE_WORKER_AUTH_HEADER]: secret },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Voice call admission could not be completed.",
    });
    expect(h.error).toHaveBeenCalledExactlyOnceWith("Voice worker admission failed", {
      error_class: "RestException",
      http_status: 400,
      error_code: 21220,
    });
    expect(JSON.stringify(h.error.mock.calls)).not.toContain(privateText);
    expect(JSON.stringify(h.error.mock.calls)).not.toContain(secret);
    await expect(worker.drainAdmissions()).resolves.toBeUndefined();
  });
});
