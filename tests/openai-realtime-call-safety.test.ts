import { describe, expect, it } from "vitest";

import {
  OpenAIRealtimeProviderError,
  openAIRealtimeCallMayExistAfterResponse,
  openAIRealtimeFailureLogFields,
  openAIRealtimeProviderFailure,
} from "../src/lib/voice/openai-realtime-provider-failure";
import {
  openAIRealtimeKeyFingerprint,
  selectCurrentOpenAIRealtimeKey,
  selectOpenAIRealtimeHangupKey,
  type OpenAIRealtimeKeyEnvironment,
} from "../src/lib/voice/openai-realtime-keyring";

describe("OpenAI Realtime provider failure redaction", () => {
  it("retains only status, a safe request id, and a normalized internal code", () => {
    const providerBody = JSON.stringify({
      error: {
        code: "provider_specific_secret_code",
        message: "quota rejected for org_acme and key sk-provider-secret",
      },
    });
    const response = new Response(providerBody, {
      status: 429,
      headers: { "x-request-id": "req_realtime-123" },
    });

    const failure = openAIRealtimeProviderFailure(response, "WebRTC Call Create Failed");
    const fields = openAIRealtimeFailureLogFields(failure);
    const error = new OpenAIRealtimeProviderError("OpenAI Realtime signaling", failure);

    expect(fields).toEqual({
      status: 429,
      requestId: "req_realtime-123",
      errorCode: "webrtc_call_create_failed",
    });
    expect(Object.keys(fields).sort()).toEqual(["errorCode", "requestId", "status"]);
    expect(error.message).toContain("status=429");
    expect(error.message).toContain("request_id=req_realtime-123");
    expect(error.message).toContain("error_code=webrtc_call_create_failed");
    expect(JSON.stringify(fields)).not.toContain("org_acme");
    expect(JSON.stringify(fields)).not.toContain("sk-provider-secret");
    expect(error.message).not.toContain("provider_specific_secret_code");
    expect(error.message).not.toContain("sk-provider-secret");
  });

  it("drops an unsafe provider request id instead of allowing log injection", () => {
    const response = new Response("do not retain me", {
      status: 500,
      headers: { "x-request-id": "req_ok forged-log-line" },
    });

    expect(openAIRealtimeProviderFailure(response, "Hangup Failed")).toEqual({
      status: 500,
      requestId: null,
      errorCode: "hangup_failed",
    });
  });

  it("retains reservations for ambiguous 5xx call outcomes but refunds definitive 4xx rejections", () => {
    expect(openAIRealtimeCallMayExistAfterResponse(new Response(null, { status: 500 }))).toBe(true);
    expect(openAIRealtimeCallMayExistAfterResponse(new Response(null, { status: 503 }))).toBe(true);
    expect(openAIRealtimeCallMayExistAfterResponse(new Response(null, { status: 400 }))).toBe(
      false,
    );
    expect(openAIRealtimeCallMayExistAfterResponse(new Response(null, { status: 429 }))).toBe(
      false,
    );
  });
});

describe("OpenAI Realtime hangup key rotation", () => {
  const env: OpenAIRealtimeKeyEnvironment = {
    OPENAI_API_KEY: "sk-runtime-current",
    OPENAI_API_KEY_PREVIOUS: "sk-runtime-previous",
    OPENAI_API_KEY_CHATKIT: "sk-demo-current",
    OPENAI_API_KEY_CHATKIT_PREVIOUS: "sk-demo-previous",
  };

  it("never selects a previous key for new call creation", () => {
    expect(selectCurrentOpenAIRealtimeKey(env, "runtime")).toMatchObject({
      value: "sk-runtime-current",
      source: "runtime",
      generation: "current",
    });
    expect(
      selectCurrentOpenAIRealtimeKey({ OPENAI_API_KEY_PREVIOUS: "sk-runtime-previous" }, "runtime"),
    ).toBeNull();
  });

  it("selects the previous key only for its exact creating fingerprint and source", () => {
    const selected = selectOpenAIRealtimeHangupKey(env, {
      purpose: "runtime",
      requiredSource: "runtime",
      expectedFingerprint: openAIRealtimeKeyFingerprint("sk-runtime-previous"),
    });

    expect(selected).toMatchObject({
      value: "sk-runtime-previous",
      source: "runtime",
      generation: "previous",
    });
  });

  it("prefers the current key when its fingerprint still matches", () => {
    const selected = selectOpenAIRealtimeHangupKey(env, {
      purpose: "chatgpt_demo",
      requiredSource: "chatgpt_demo",
      expectedFingerprint: openAIRealtimeKeyFingerprint("sk-demo-current"),
    });

    expect(selected).toMatchObject({
      value: "sk-demo-current",
      source: "chatgpt_demo",
      generation: "current",
    });
  });

  it("does not cross sources or use a previous key without an expected fingerprint", () => {
    expect(
      selectOpenAIRealtimeHangupKey(env, {
        purpose: "chatgpt_demo",
        requiredSource: "runtime",
        expectedFingerprint: openAIRealtimeKeyFingerprint("sk-demo-previous"),
      }),
    ).toBeNull();
    expect(
      selectOpenAIRealtimeHangupKey(env, {
        purpose: "runtime",
        requiredSource: "chatgpt_demo",
        expectedFingerprint: openAIRealtimeKeyFingerprint("sk-demo-previous"),
      }),
    ).toBeNull();
    expect(
      selectOpenAIRealtimeHangupKey(
        { OPENAI_API_KEY_PREVIOUS: "sk-runtime-previous" },
        { purpose: "runtime", requiredSource: "runtime" },
      ),
    ).toBeNull();
  });
});
