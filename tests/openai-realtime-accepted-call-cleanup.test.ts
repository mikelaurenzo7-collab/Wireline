import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  enqueue: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn(),
  assertPrivateVoiceSimulationAllowed: vi.fn(),
}));
vi.mock("../src/lib/job-queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  fetchWithTimeout: mocks.fetchWithTimeout,
  log: { warn: mocks.warn, error: mocks.error },
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: vi.fn(),
}));

import {
  createServerManagedOpenAIRealtimeCall,
  OPENAI_REALTIME_SYSTEM_USER_ID,
} from "../src/lib/voice/openai-realtime-call-control";
import { realtimeProviderCallMayExist } from "../src/lib/realtime-provider-outcome";

const input = {
  userId: OPENAI_REALTIME_SYSTEM_USER_ID,
  sdp: `v=0\r\na=mid:${"x".repeat(120)}\r\n`,
  session: { model: "gpt-realtime" },
  maxDurationSeconds: 60,
};

function acceptedCall(answer: string): Response {
  return new Response(answer, {
    status: 201,
    headers: { location: "https://api.openai.com/v1/realtime/calls/call_cleanup_123" },
  });
}

function mockClientSecret(): void {
  mocks.fetchWithTimeout.mockResolvedValueOnce(
    new Response(JSON.stringify({ value: "ephemeral-test-key" }), { status: 200 }),
  );
}

async function captureFailure(): Promise<unknown> {
  try {
    await createServerManagedOpenAIRealtimeCall(input);
  } catch (error) {
    return error;
  }
  throw new Error("Expected call creation to fail.");
}

describe("accepted OpenAI Realtime call cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-runtime");
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("hangs up an accepted call when reading its answer fails", async () => {
    mockClientSecret();
    const response = acceptedCall("v=0\r\n");
    vi.spyOn(response, "text").mockRejectedValueOnce(new Error("answer stream failed"));
    mocks.fetchWithTimeout.mockResolvedValueOnce(response);
    mocks.fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const failure = await captureFailure();

    expect(failure).toMatchObject({ status: 503 });
    expect(realtimeProviderCallMayExist(failure)).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(3);
    expect(mocks.fetchWithTimeout.mock.calls[2]?.[0]).toBe(
      "https://api.openai.com/v1/realtime/calls/call_cleanup_123/hangup",
    );
  });

  it("hangs up an accepted call whose answer is invalid", async () => {
    mockClientSecret();
    mocks.fetchWithTimeout.mockResolvedValueOnce(acceptedCall("invalid SDP"));
    mocks.fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const failure = await captureFailure();

    expect(failure).toMatchObject({ status: 502 });
    expect(realtimeProviderCallMayExist(failure)).toBe(false);
    expect(mocks.fetchWithTimeout.mock.calls[2]?.[0]).toBe(
      "https://api.openai.com/v1/realtime/calls/call_cleanup_123/hangup",
    );
  });

  it("retains the spend reservation if emergency hangup also fails", async () => {
    mockClientSecret();
    mocks.fetchWithTimeout.mockResolvedValueOnce(acceptedCall("invalid SDP"));
    mocks.fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const failure = await captureFailure();

    expect(failure).toMatchObject({ status: 502 });
    expect(realtimeProviderCallMayExist(failure)).toBe(true);
    expect(mocks.error).toHaveBeenCalledWith(
      "OpenAI Realtime emergency hangup failed",
      expect.objectContaining({ callId: "call_cleanup_123", providerCallMayExist: true }),
    );
  });
});
