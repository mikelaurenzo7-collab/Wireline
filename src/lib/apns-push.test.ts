import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

// ── node:http2 stub ────────────────────────────────────────────────────────
// Captures the request headers/body and lets each test script the response
// status. `connect()` returns a fake client; `request()` returns an emitter
// that, once `end()` is called, emits a 200 (or the scripted status) + end.
const h2 = vi.hoisted(() => {
  const state = {
    lastHeaders: null as Record<string, string> | null,
    lastBody: "" as string,
    nextStatus: 200 as number,
    nextBody: "" as string,
  };
  const connect = vi.fn(() => {
    const client = new EventEmitter() as EventEmitter & {
      request: (headers: Record<string, string>) => unknown;
      close: () => void;
    };
    client.close = vi.fn();
    client.request = (headers: Record<string, string>) => {
      state.lastHeaders = headers;
      const req = new EventEmitter() as EventEmitter & {
        setEncoding: (e: string) => void;
        end: (body?: Buffer) => void;
      };
      req.setEncoding = vi.fn();
      req.end = (body?: Buffer) => {
        state.lastBody = body ? body.toString() : "";
        setImmediate(() => {
          req.emit("response", { ":status": state.nextStatus });
          if (state.nextBody) req.emit("data", state.nextBody);
          req.emit("end");
        });
      };
      return req;
    };
    return client;
  });
  return { state, connect };
});

vi.mock("node:http2", () => ({ default: { connect: h2.connect }, connect: h2.connect }));
vi.mock("./server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  drizzle: {},
}));

import { sendApnsPush, isApnsConfigured, notifyInboundCall, notifyCallRecap } from "./apns-push";

// A throwaway P-256 key in PKCS8 PEM — exactly the shape of an APNs .p8.
const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ORIGINAL_ENV = { ...process.env };

function configureApns() {
  process.env.APNS_KEY_ID = "KEY123";
  process.env.APNS_TEAM_ID = "TEAM123";
  process.env.APNS_AUTH_KEY = PEM;
  process.env.APNS_BUNDLE_ID = "com.wireline.wingman";
  process.env.APNS_ENV = "production";
}

describe("apns-push", () => {
  beforeEach(() => {
    h2.state.nextStatus = 200;
    h2.state.nextBody = "";
    h2.connect.mockClear();
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_AUTH_KEY;
    delete process.env.APNS_BUNDLE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is a no-op when APNs is not configured", async () => {
    expect(isApnsConfigured()).toBe(false);
    const res = await sendApnsPush("device-token", { aps: {} }, "voip");
    expect(res).toEqual({ ok: false, status: 0, reason: "APNS_NOT_CONFIGURED" });
    expect(h2.connect).not.toHaveBeenCalled();
  });

  it("reports configured once the env vars are present", () => {
    configureApns();
    expect(isApnsConfigured()).toBe(true);
  });

  it("guards against an empty device token", async () => {
    configureApns();
    const res = await sendApnsPush("", { aps: {} }, "voip");
    expect(res.reason).toBe("NO_DEVICE_TOKEN");
  });

  it("sends a VoIP push with a well-formed ES256 bearer + topic", async () => {
    configureApns();
    const res = await sendApnsPush("abc123token", { aps: { "content-available": 1 } }, "voip");
    expect(res).toEqual({ ok: true, status: 200 });

    const headers = h2.state.lastHeaders!;
    expect(headers[":method"]).toBe("POST");
    expect(headers[":path"]).toBe("/3/device/abc123token");
    expect(headers["apns-push-type"]).toBe("voip");
    expect(headers["apns-topic"]).toBe("com.wireline.wingman.voip");
    expect(headers["apns-priority"]).toBe("10");
    // bearer <header>.<payload>.<signature> — three base64url segments.
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("alert pushes target the bundle topic, not the voip topic", async () => {
    configureApns();
    await sendApnsPush("tok", { aps: { alert: "hi" } }, "alert");
    expect(h2.state.lastHeaders!["apns-topic"]).toBe("com.wireline.wingman");
    expect(h2.state.lastHeaders!["apns-push-type"]).toBe("alert");
  });

  it("notifyInboundCall short-circuits when APNs is unconfigured", async () => {
    expect(isApnsConfigured()).toBe(false);
    const res = await notifyInboundCall("user-1", { callId: "c1", fromNumber: "+15551234567" });
    expect(res).toEqual({ sent: 0, devices: 0 });
    expect(h2.connect).not.toHaveBeenCalled();
  });

  it("notifyCallRecap short-circuits when APNs is unconfigured", async () => {
    const res = await notifyCallRecap("user-1", { callId: "c1", summary: "Booked a demo" });
    expect(res).toEqual({ sent: 0, devices: 0 });
    expect(h2.connect).not.toHaveBeenCalled();
  });

  it("maps an Apple error response to ok:false with the reason", async () => {
    configureApns();
    h2.state.nextStatus = 410;
    h2.state.nextBody = JSON.stringify({ reason: "Unregistered" });
    const res = await sendApnsPush("stale-token", { aps: {} }, "voip");
    expect(res).toEqual({ ok: false, status: 410, reason: "Unregistered" });
  });
});
