import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

vi.mock("./server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  drizzle: {},
}));

const h = vi.hoisted(() => ({
  authState: {
    script: { status: 200, body: undefined as unknown },
    lastSendBody: null as any,
    sendCalls: 0,
  },
}));

// The implementation authenticates via google-auth-library and sends with
// `auth.request(...)` (gaxios), which bypasses a global fetch stub — so mock the
// auth client directly and script its responses.
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async request({ data }: { url: string; method: string; data: unknown }) {
      h.authState.sendCalls += 1;
      h.authState.lastSendBody = data;
      const { status, body } = h.authState.script;
      if (status >= 200 && status < 300) return { status, data: body };
      throw Object.assign(new Error("FCM send failed"), {
        response: { status, data: body },
      });
    }
  },
}));

import { sendFcmPush, isFcmConfigured, isStaleFcmReason } from "./fcm-push";

// A throwaway RSA key in PKCS8 PEM — the shape of a service-account key.
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ORIGINAL_ENV = { ...process.env };

function configureFcm() {
  process.env.FCM_PROJECT_ID = "wireline-test";
  process.env.FCM_CLIENT_EMAIL = "push@wireline-test.iam.gserviceaccount.com";
  process.env.FCM_PRIVATE_KEY = PEM;
}

/**
 * Scripts the mocked GoogleAuth send: it returns the given status/body and
 * captures the last `{ message }` payload sent.
 */
function installFetch(send: { status: number; body?: unknown }) {
  h.authState.script = { status: send.status, body: send.body };
  h.authState.lastSendBody = null;
  h.authState.sendCalls = 0;
  return h.authState;
}

describe("fcm-push", () => {
  beforeEach(() => {
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a no-op when FCM is not configured", async () => {
    expect(isFcmConfigured()).toBe(false);
    const res = await sendFcmPush("tok", { shape: "data", data: { type: "incoming_call" } });
    expect(res).toEqual({ ok: false, status: 0, reason: "FCM_NOT_CONFIGURED" });
  });

  it("reports configured once the env vars are present", () => {
    configureFcm();
    expect(isFcmConfigured()).toBe(true);
  });

  it("guards against an empty device token", async () => {
    configureFcm();
    const res = await sendFcmPush("", { shape: "data" });
    expect(res.reason).toBe("NO_DEVICE_TOKEN");
  });

  it("sends a high-priority data-only message for the wake shape", async () => {
    configureFcm();
    const state = installFetch({ status: 200, body: { name: "projects/x/messages/1" } });
    const res = await sendFcmPush("dev-token", {
      shape: "data",
      data: { type: "incoming_call", callId: "c1", from: "+15551234567" },
    });
    expect(res).toEqual({ ok: true, status: 200 });
    const msg = state.lastSendBody.message;
    expect(msg.token).toBe("dev-token");
    expect(msg.android.priority).toBe("high");
    expect(msg.data).toEqual({ type: "incoming_call", callId: "c1", from: "+15551234567" });
    // Data-only: no notification block (so the app fully controls the wake).
    expect(msg.notification).toBeUndefined();
  });

  it("includes a notification block for the alert shape", async () => {
    configureFcm();
    const state = installFetch({ status: 200 });
    await sendFcmPush("dev-token", {
      shape: "notification",
      notification: { title: "Call recap", body: "Booked a demo" },
      data: { type: "call_recap", callId: "c1" },
    });
    const msg = state.lastSendBody.message;
    expect(msg.notification).toEqual({ title: "Call recap", body: "Booked a demo" });
    expect(msg.data.type).toBe("call_recap");
  });

  it("maps an FCM error response to ok:false with the reason", async () => {
    configureFcm();
    installFetch({
      status: 404,
      body: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } },
    });
    const res = await sendFcmPush("stale-token", { shape: "data", data: { type: "x" } });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.reason).toBe("UNREGISTERED");
  });

  it("flags only permanently-invalid reasons as stale", () => {
    expect(isStaleFcmReason("UNREGISTERED")).toBe(true);
    expect(isStaleFcmReason("INVALID_ARGUMENT")).toBe(true);
    expect(isStaleFcmReason("UNAVAILABLE")).toBe(false);
    expect(isStaleFcmReason(undefined)).toBe(false);
  });
});
