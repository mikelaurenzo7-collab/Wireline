/**
 * APNs push for the native Wireline iOS app.
 *
 * Two delivery shapes share one transport here:
 *   - VoIP pushes (PushKit) wake the app from suspended/terminated state so it
 *     can `reportNewIncomingCall` through CallKit the instant an inbound call
 *     starts ringing. These MUST be `apns-push-type: voip` on the `<bundle>.voip`
 *     topic at priority 10.
 *   - Alert pushes carry mid-call tool dispatch (e.g. "open Maps to the clinic")
 *     to a device that is already foregrounded in a call.
 *
 * WHY raw http2 instead of `node-apn`: Wireline's webhook handlers run on Vercel
 * serverless functions, which are stateless and short-lived. `node-apn` keeps a
 * long-lived HTTP/2 session to Apple alive across requests — the wrong fit for a
 * function that may be frozen between invocations. We open a per-call h2 session,
 * send, and close it. Token-based auth (a cached ES256 JWT) avoids cert files.
 *
 * Fully env-gated: if the APNS_* vars are not configured (local dev, CI, any
 * environment without Apple credentials) every function is a safe no-op. It must
 * NEVER throw into the webhook path that triggers it.
 */
import http2 from "node:http2";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { log, drizzle } from "./server-context";
import * as schema from "../db/schema";

interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** PEM-encoded `.p8` private key contents (newlines may be escaped as `\n`). */
  authKey: string;
  bundleId: string;
  /** APNs host — production unless APNS_ENV is "sandbox" / "development". */
  host: string;
}

function loadApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const authKeyRaw = process.env.APNS_AUTH_KEY;
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  if (!keyId || !teamId || !authKeyRaw || !bundleId) return null;

  // Vercel env vars can't hold literal newlines — accept `\n`-escaped PEM.
  const authKey = authKeyRaw.includes("\\n") ? authKeyRaw.replace(/\\n/g, "\n") : authKeyRaw;
  const env = (process.env.APNS_ENV || "production").toLowerCase();
  const host =
    env === "sandbox" || env === "development"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";
  return { keyId, teamId, authKey, bundleId, host };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// APNs provider tokens are valid up to 60 min and Apple rejects a token reused
// more often than every ~20 min from the same connection. Cache for 50 min.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken: { value: string; expiresAt: number } | null = null;

function buildProviderToken(cfg: ApnsConfig): string {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const payload = base64url(JSON.stringify({ iss: cfg.teamId, iat }));
  const signingInput = `${header}.${payload}`;

  // ES256 = ECDSA P-256 / SHA-256. JOSE requires the raw r||s signature
  // (ieee-p1363), not the DER encoding Node emits by default.
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(cfg.authKey),
    dsaEncoding: "ieee-p1363",
  });
  const token = `${signingInput}.${base64url(signature)}`;
  cachedToken = { value: token, expiresAt: now + TOKEN_TTL_MS };
  return token;
}

export type ApnsPushType = "voip" | "alert";

export interface ApnsSendResult {
  ok: boolean;
  status: number;
  /** Apple's `reason` string on failure (e.g. "BadDeviceToken"), if any. */
  reason?: string;
}

/**
 * Send a single push to one device token over a one-shot HTTP/2 session.
 * Resolves with the outcome; never throws (transport errors map to ok:false).
 */
export async function sendApnsPush(
  deviceToken: string,
  payload: Record<string, unknown>,
  pushType: ApnsPushType = "voip",
): Promise<ApnsSendResult> {
  const cfg = loadApnsConfig();
  if (!cfg) return { ok: false, status: 0, reason: "APNS_NOT_CONFIGURED" };
  if (!deviceToken) return { ok: false, status: 0, reason: "NO_DEVICE_TOKEN" };

  // VoIP pushes go to the dedicated `<bundle>.voip` topic; alerts to the bundle.
  const topic = pushType === "voip" ? `${cfg.bundleId}.voip` : cfg.bundleId;
  const body = Buffer.from(JSON.stringify(payload));

  return new Promise<ApnsSendResult>((resolve) => {
    let settled = false;
    const client = http2.connect(cfg.host);
    // Guard against a hung stream: if Apple never responds, resolve and tear
    // down so we don't leak the h2 session or wedge a Promise.all caller.
    const timer = setTimeout(() => {
      done({ ok: false, status: 0, reason: "TIMEOUT" });
    }, 10_000);
    const done = (r: ApnsSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client.close();
      } catch {
        /* already closing */
      }
      resolve(r);
    };

    client.on("error", (err) => {
      log.warn("APNs h2 connection error", {
        error: err instanceof Error ? err.message : String(err),
      });
      done({ ok: false, status: 0, reason: "CONNECTION_ERROR" });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${buildProviderToken(cfg)}`,
      "apns-topic": topic,
      "apns-push-type": pushType,
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": String(body.length),
    });

    let status = 0;
    let raw = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      if (status !== 200 && raw) {
        try {
          reason = (JSON.parse(raw) as { reason?: string }).reason;
        } catch {
          /* non-JSON error body — leave reason undefined */
        }
      }
      done({ ok: status === 200, status, reason });
    });
    req.on("error", (err) => {
      log.warn("APNs h2 request error", {
        error: err instanceof Error ? err.message : String(err),
      });
      done({ ok: false, status: 0, reason: "REQUEST_ERROR" });
    });

    req.end(body);
  });
}

/** Whether APNs is configured in this environment. */
export function isApnsConfigured(): boolean {
  return loadApnsConfig() !== null;
}

export interface InboundCallPush {
  callId: string;
  fromNumber: string;
  agentName?: string | null;
  agentId?: string | null;
}

/**
 * Wake every registered device for a user with a VoIP push so the app can
 * report a CallKit incoming call. Best-effort: looks up the user's devices,
 * pushes to each, prunes tokens Apple reports as permanently invalid, and
 * never throws. Returns how many pushes Apple accepted.
 */
export async function notifyInboundCall(
  userId: string,
  call: InboundCallPush,
): Promise<{ sent: number; devices: number }> {
  if (!isApnsConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await drizzle
      .select({
        id: schema.mobileDevices.id,
        token: schema.mobileDevices.apnsVoipToken,
      })
      .from(schema.mobileDevices)
      .where(eq(schema.mobileDevices.userId, userId));

    const targets = devices.filter((d) => !!d.token);
    if (targets.length === 0) return { sent: 0, devices: 0 };

    const payload = {
      aps: { "content-available": 1 },
      type: "incoming_call",
      callId: call.callId,
      from: call.fromNumber,
      agentName: call.agentName ?? null,
      agentId: call.agentId ?? null,
    };

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      targets.map(async (d) => {
        const res = await sendApnsPush(d.token as string, payload, "voip");
        if (res.ok) {
          sent += 1;
        } else if (res.reason === "BadDeviceToken" || res.reason === "Unregistered") {
          // Apple says this token will never work again — drop it.
          stale.push(d.id);
        }
      }),
    );

    if (stale.length > 0) {
      // Apple says these tokens will never work again — drop them in one query.
      await drizzle
        .update(schema.mobileDevices)
        .set({ apnsVoipToken: null })
        .where(inArray(schema.mobileDevices.id, stale));
    }

    return { sent, devices: targets.length };
  } catch (err) {
    log.warn("notifyInboundCall failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}

export interface CallRecapPush {
  callId: string;
  agentName?: string | null;
  fromNumber?: string | null;
  summary?: string | null;
}

/**
 * Send a tap-to-open recap alert to a user's devices after a call completes.
 * Uses the standard alert token (separate from the VoIP token) so it works
 * when the app is backgrounded. Best-effort, env-gated, never throws.
 */
export async function notifyCallRecap(
  userId: string,
  recap: CallRecapPush,
): Promise<{ sent: number; devices: number }> {
  if (!isApnsConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await drizzle
      .select({
        id: schema.mobileDevices.id,
        token: schema.mobileDevices.apnsAlertToken,
      })
      .from(schema.mobileDevices)
      .where(eq(schema.mobileDevices.userId, userId));

    const targets = devices.filter((d) => !!d.token);
    if (targets.length === 0) return { sent: 0, devices: 0 };

    const who = recap.fromNumber || "a caller";
    const summary = (recap.summary || "Tap to see the recap.").slice(0, 240);
    const payload = {
      aps: {
        alert: {
          title: recap.agentName ? `${recap.agentName} · call recap` : "Call recap",
          subtitle: who,
          body: summary,
        },
        sound: "default",
      },
      type: "call_recap",
      callId: recap.callId,
    };

    let sent = 0;
    await Promise.all(
      targets.map(async (d) => {
        const res = await sendApnsPush(d.token as string, payload, "alert");
        if (res.ok) sent += 1;
        else if (res.reason === "BadDeviceToken" || res.reason === "Unregistered") {
          await drizzle
            .update(schema.mobileDevices)
            .set({ apnsAlertToken: null })
            .where(eq(schema.mobileDevices.id, d.id));
        }
      }),
    );
    return { sent, devices: targets.length };
  } catch (err) {
    log.warn("notifyCallRecap failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}

export interface DeviceAction {
  /** "navigate" | "reminder" | "play_music" */
  action: string;
  args: Record<string, unknown>;
  /** Spoken/notification-friendly label, e.g. "Directions to SFO". */
  title: string;
}

/**
 * Dispatch an in-call device action (navigate / reminder / play music) to a
 * user's phone via an alert push. The app deep-links Maps / writes EventKit /
 * opens music when the notification is delivered or tapped. Best-effort,
 * env-gated, never throws.
 */
export async function notifyDeviceAction(
  userId: string,
  deviceAction: DeviceAction,
): Promise<{ sent: number; devices: number }> {
  if (!isApnsConfigured()) return { sent: 0, devices: 0 };
  try {
    const devices = await drizzle
      .select({ id: schema.mobileDevices.id, token: schema.mobileDevices.apnsAlertToken })
      .from(schema.mobileDevices)
      .where(eq(schema.mobileDevices.userId, userId));

    const targets = devices.filter((d) => !!d.token);
    if (targets.length === 0) return { sent: 0, devices: 0 };

    const payload = {
      aps: {
        alert: { title: "Wireline", body: deviceAction.title },
        sound: "default",
      },
      type: "device_action",
      action: deviceAction.action,
      args: deviceAction.args,
    };

    let sent = 0;
    await Promise.all(
      targets.map(async (d) => {
        const res = await sendApnsPush(d.token as string, payload, "alert");
        if (res.ok) sent += 1;
      }),
    );
    return { sent, devices: targets.length };
  } catch (err) {
    log.warn("notifyDeviceAction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, devices: 0 };
  }
}
