/**
 * Cross-platform mobile push orchestration for the native Wireline apps.
 *
 * One place that, given a user, loads their registered devices and fans a
 * notification out to the right transport per platform:
 *   - iOS    → APNs (src/lib/apns-push.ts): split voip/alert tokens
 *   - Android → FCM  (src/lib/fcm-push.ts): a single registration token
 *
 * Every function is best-effort and env-gated: if NEITHER transport is
 * configured it short-circuits, and it NEVER throws into the webhook path that
 * triggers it. Tokens Apple/Google report as permanently invalid are pruned.
 */
import { eq, inArray } from "drizzle-orm";
import { log, drizzle } from "./server-context";
import * as schema from "../db/schema";
import { sendApnsPush, isApnsConfigured, isStaleApnsReason } from "./apns-push";
import { sendFcmPush, isFcmConfigured, isStaleFcmReason } from "./fcm-push";

export interface InboundCallPush {
  callId: string;
  fromNumber: string;
  agentName?: string | null;
  agentId?: string | null;
}

export interface CallRecapPush {
  callId: string;
  agentName?: string | null;
  fromNumber?: string | null;
  summary?: string | null;
}

export interface DeviceAction {
  /** "navigate" | "reminder" | "play_music" */
  action: string;
  args: Record<string, unknown>;
  /** Spoken/notification-friendly label, e.g. "Directions to SFO". */
  title: string;
}

export interface PushFanoutResult {
  sent: number;
  devices: number;
}

interface DeviceRow {
  id: string;
  platform: string;
  apnsVoipToken: string | null;
  apnsAlertToken: string | null;
  fcmToken: string | null;
}

/** True when at least one push transport is configured in this environment. */
function anyPushConfigured(): boolean {
  return isApnsConfigured() || isFcmConfigured();
}

async function loadDevices(userId: string): Promise<DeviceRow[]> {
  return drizzle
    .select({
      id: schema.mobileDevices.id,
      platform: schema.mobileDevices.platform,
      apnsVoipToken: schema.mobileDevices.apnsVoipToken,
      apnsAlertToken: schema.mobileDevices.apnsAlertToken,
      fcmToken: schema.mobileDevices.fcmToken,
    })
    .from(schema.mobileDevices)
    .where(eq(schema.mobileDevices.userId, userId));
}

/** Null out one token column for the given device ids in a single query. */
async function pruneTokens(
  column: "apnsVoipToken" | "apnsAlertToken" | "fcmToken",
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await drizzle
    .update(schema.mobileDevices)
    .set({ [column]: null })
    .where(inArray(schema.mobileDevices.id, ids));
}

/**
 * Wake every registered device for a user so the app can present a native
 * incoming call (CallKit on iOS, ConnectionService on Android). iOS gets a
 * VoIP push; Android gets a high-priority data message.
 */
export async function notifyInboundCall(
  userId: string,
  call: InboundCallPush,
): Promise<PushFanoutResult> {
  if (!anyPushConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await loadDevices(userId);
    if (devices.length === 0) return { sent: 0, devices: 0 };

    // Shared payload, expressed once and shaped per transport below.
    const apnsPayload = {
      aps: { "content-available": 1 },
      type: "incoming_call",
      callId: call.callId,
      from: call.fromNumber,
      agentName: call.agentName ?? null,
      agentId: call.agentId ?? null,
    };
    const fcmData: Record<string, string> = {
      type: "incoming_call",
      callId: call.callId,
      from: call.fromNumber,
    };
    if (call.agentName) fcmData.agentName = call.agentName;
    if (call.agentId) fcmData.agentId = call.agentId;

    let sent = 0;
    let targeted = 0;
    const staleVoip: string[] = [];
    const staleFcm: string[] = [];

    await Promise.all(
      devices.map(async (d) => {
        if (d.platform === "android") {
          if (!d.fcmToken) return;
          targeted += 1;
          const res = await sendFcmPush(d.fcmToken, { shape: "data", data: fcmData });
          if (res.ok) sent += 1;
          else if (isStaleFcmReason(res.reason)) staleFcm.push(d.id);
        } else {
          if (!d.apnsVoipToken) return;
          targeted += 1;
          const res = await sendApnsPush(d.apnsVoipToken, apnsPayload, "voip");
          if (res.ok) sent += 1;
          else if (isStaleApnsReason(res.reason)) staleVoip.push(d.id);
        }
      }),
    );

    await pruneTokens("apnsVoipToken", staleVoip);
    await pruneTokens("fcmToken", staleFcm);
    return { sent, devices: targeted };
  } catch (err) {
    log.warn("notifyInboundCall failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}

/**
 * Send a tap-to-open recap alert after a call completes. Uses the alert token
 * on iOS and a notification message on Android so it works when the app is
 * backgrounded.
 */
export async function notifyCallRecap(
  userId: string,
  recap: CallRecapPush,
): Promise<PushFanoutResult> {
  if (!anyPushConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await loadDevices(userId);
    if (devices.length === 0) return { sent: 0, devices: 0 };

    const who = recap.fromNumber || "a caller";
    const title = recap.agentName ? `${recap.agentName} · call recap` : "Call recap";
    const body = (recap.summary || "Tap to see the recap.").slice(0, 240);
    const apnsPayload = {
      aps: { alert: { title, subtitle: who, body }, sound: "default" },
      type: "call_recap",
      callId: recap.callId,
    };
    const fcmData: Record<string, string> = { type: "call_recap", callId: recap.callId };

    let sent = 0;
    let targeted = 0;
    const staleAlert: string[] = [];
    const staleFcm: string[] = [];

    await Promise.all(
      devices.map(async (d) => {
        if (d.platform === "android") {
          if (!d.fcmToken) return;
          targeted += 1;
          const res = await sendFcmPush(d.fcmToken, {
            shape: "notification",
            notification: { title, body },
            data: fcmData,
          });
          if (res.ok) sent += 1;
          else if (isStaleFcmReason(res.reason)) staleFcm.push(d.id);
        } else {
          if (!d.apnsAlertToken) return;
          targeted += 1;
          const res = await sendApnsPush(d.apnsAlertToken, apnsPayload, "alert");
          if (res.ok) sent += 1;
          else if (isStaleApnsReason(res.reason)) staleAlert.push(d.id);
        }
      }),
    );

    await pruneTokens("apnsAlertToken", staleAlert);
    await pruneTokens("fcmToken", staleFcm);
    return { sent, devices: targeted };
  } catch (err) {
    log.warn("notifyCallRecap failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}

/**
 * Dispatch an in-call device action (navigate / reminder / play music) to a
 * user's phone. The app deep-links Maps / writes a calendar reminder / opens
 * music when the notification is delivered or tapped.
 */
export async function notifyDeviceAction(
  userId: string,
  deviceAction: DeviceAction,
): Promise<PushFanoutResult> {
  if (!anyPushConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await loadDevices(userId);
    if (devices.length === 0) return { sent: 0, devices: 0 };

    const apnsPayload = {
      aps: { alert: { title: "Wireline", body: deviceAction.title }, sound: "default" },
      type: "device_action",
      action: deviceAction.action,
      args: deviceAction.args,
    };
    const fcmData: Record<string, string> = {
      type: "device_action",
      action: deviceAction.action,
      args: JSON.stringify(deviceAction.args),
    };

    let sent = 0;
    let targeted = 0;
    const staleAlert: string[] = [];
    const staleFcm: string[] = [];

    await Promise.all(
      devices.map(async (d) => {
        if (d.platform === "android") {
          if (!d.fcmToken) return;
          targeted += 1;
          const res = await sendFcmPush(d.fcmToken, {
            shape: "notification",
            notification: { title: "Wireline", body: deviceAction.title },
            data: fcmData,
          });
          if (res.ok) sent += 1;
          else if (isStaleFcmReason(res.reason)) staleFcm.push(d.id);
        } else {
          if (!d.apnsAlertToken) return;
          targeted += 1;
          const res = await sendApnsPush(d.apnsAlertToken, apnsPayload, "alert");
          if (res.ok) sent += 1;
          else if (isStaleApnsReason(res.reason)) staleAlert.push(d.id);
        }
      }),
    );

    await pruneTokens("apnsAlertToken", staleAlert);
    await pruneTokens("fcmToken", staleFcm);
    return { sent, devices: targeted };
  } catch (err) {
    log.warn("notifyDeviceAction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}
