import { beforeEach, describe, expect, it, vi } from "vitest";

// Scripted drizzle: select().from().where() resolves to the next queued row
// set; update().set().where() resolves to []. Mirrors the route-test pattern.
const h = vi.hoisted(() => {
  const queue: unknown[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const makeBuilder = (isUpdate = false) => {
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of ["from", "where"]) builder[m] = passthrough;
    builder.set = (vals: Record<string, unknown>) => {
      if (isUpdate) updates.push(vals);
      return builder;
    };
    (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(isUpdate ? [] : queue.length ? queue.shift() : []).then(resolve);
    return builder;
  };
  const drizzle = {
    select: vi.fn(() => makeBuilder(false)),
    update: vi.fn(() => makeBuilder(true)),
  };
  return { queue, updates, drizzle };
});

vi.mock("./server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const apns = vi.hoisted(() => ({
  sendApnsPush: vi.fn(),
  isApnsConfigured: vi.fn(() => true),
  isStaleApnsReason: vi.fn((r?: string) => r === "BadDeviceToken" || r === "Unregistered"),
}));
const fcm = vi.hoisted(() => ({
  sendFcmPush: vi.fn(),
  isFcmConfigured: vi.fn(() => true),
  isStaleFcmReason: vi.fn((r?: string) => r === "UNREGISTERED" || r === "INVALID_ARGUMENT"),
}));

vi.mock("./apns-push", () => apns);
vi.mock("./fcm-push", () => fcm);

import { notifyInboundCall, notifyCallRecap } from "./mobile-push";

beforeEach(() => {
  vi.clearAllMocks();
  h.queue.length = 0;
  h.updates.length = 0;
  apns.isApnsConfigured.mockReturnValue(true);
  fcm.isFcmConfigured.mockReturnValue(true);
  apns.sendApnsPush.mockResolvedValue({ ok: true, status: 200 });
  fcm.sendFcmPush.mockResolvedValue({ ok: true, status: 200 });
  apns.isStaleApnsReason.mockImplementation(
    (r?: string) => r === "BadDeviceToken" || r === "Unregistered",
  );
  fcm.isStaleFcmReason.mockImplementation(
    (r?: string) => r === "UNREGISTERED" || r === "INVALID_ARGUMENT",
  );
});

describe("notifyInboundCall", () => {
  it("short-circuits when no transport is configured", async () => {
    apns.isApnsConfigured.mockReturnValue(false);
    fcm.isFcmConfigured.mockReturnValue(false);
    const res = await notifyInboundCall("u1", { callId: "c1", fromNumber: "+15551230000" });
    expect(res).toEqual({ sent: 0, devices: 0 });
    expect(h.drizzle.select).not.toHaveBeenCalled();
  });

  it("fans out a VoIP push to iOS and a data message to Android", async () => {
    h.queue.push([
      {
        id: "d1",
        platform: "ios",
        apnsVoipToken: "voip-tok",
        apnsAlertToken: null,
        fcmToken: null,
      },
      {
        id: "d2",
        platform: "android",
        apnsVoipToken: null,
        apnsAlertToken: null,
        fcmToken: "fcm-tok",
      },
    ]);
    const res = await notifyInboundCall("u1", {
      callId: "c1",
      fromNumber: "+15551230000",
      agentName: "Ava",
    });
    expect(res).toEqual({ sent: 2, devices: 2 });

    expect(apns.sendApnsPush).toHaveBeenCalledWith(
      "voip-tok",
      expect.objectContaining({ type: "incoming_call", callId: "c1" }),
      "voip",
    );
    expect(fcm.sendFcmPush).toHaveBeenCalledWith(
      "fcm-tok",
      expect.objectContaining({
        shape: "data",
        data: expect.objectContaining({ type: "incoming_call", callId: "c1", agentName: "Ava" }),
      }),
    );
  });

  it("skips devices missing the relevant token", async () => {
    h.queue.push([
      { id: "d1", platform: "ios", apnsVoipToken: null, apnsAlertToken: null, fcmToken: null },
    ]);
    const res = await notifyInboundCall("u1", { callId: "c1", fromNumber: "+1" });
    expect(res).toEqual({ sent: 0, devices: 0 });
    expect(apns.sendApnsPush).not.toHaveBeenCalled();
  });

  it("prunes a stale APNs token", async () => {
    h.queue.push([
      { id: "d1", platform: "ios", apnsVoipToken: "dead", apnsAlertToken: null, fcmToken: null },
    ]);
    apns.sendApnsPush.mockResolvedValue({ ok: false, status: 410, reason: "Unregistered" });
    const res = await notifyInboundCall("u1", { callId: "c1", fromNumber: "+1" });
    expect(res).toEqual({ sent: 0, devices: 1 });
    // The stale voip token was nulled.
    expect(h.updates.some((u) => "apnsVoipToken" in u && u.apnsVoipToken === null)).toBe(true);
  });
});

describe("notifyCallRecap", () => {
  it("uses the alert token on iOS and a notification on Android", async () => {
    h.queue.push([
      {
        id: "d1",
        platform: "ios",
        apnsVoipToken: null,
        apnsAlertToken: "alert-tok",
        fcmToken: null,
      },
      {
        id: "d2",
        platform: "android",
        apnsVoipToken: null,
        apnsAlertToken: null,
        fcmToken: "fcm-tok",
      },
    ]);
    const res = await notifyCallRecap("u1", {
      callId: "c1",
      agentName: "Ava",
      summary: "Booked a demo",
    });
    expect(res).toEqual({ sent: 2, devices: 2 });
    expect(apns.sendApnsPush).toHaveBeenCalledWith("alert-tok", expect.anything(), "alert");
    expect(fcm.sendFcmPush).toHaveBeenCalledWith(
      "fcm-tok",
      expect.objectContaining({ shape: "notification" }),
    );
  });
});
