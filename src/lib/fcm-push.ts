/**
 * FCM (Firebase Cloud Messaging) push for the native Wireline Android app.
 *
 * This mirrors apns-push.ts, using the FCM HTTP v1 API.
 * High-priority data messages are used to wake the Android device and trigger
 * `WirelineMessagingService`.
 */
import { GoogleAuth } from "google-auth-library";
import { log } from "./server-context";

interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function loadFcmConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;
  return { projectId, clientEmail, privateKey };
}

let authClient: GoogleAuth | null = null;

function getAuthClient(cfg: FcmConfig): GoogleAuth {
  if (authClient) return authClient;
  authClient = new GoogleAuth({
    credentials: {
      client_email: cfg.clientEmail,
      private_key: cfg.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  return authClient;
}

export interface FcmSendResult {
  ok: boolean;
  status: number;
  reason?: string;
}

export interface FcmPayload {
  shape: "data" | "notification";
  notification?: { title: string; body: string };
  data?: Record<string, string>;
}

/**
 * Send a single high-priority push to one FCM device token.
 */
export async function sendFcmPush(
  deviceToken: string,
  payload: FcmPayload,
): Promise<FcmSendResult> {
  const cfg = loadFcmConfig();
  if (!cfg) return { ok: false, status: 0, reason: "FCM_NOT_CONFIGURED" };
  if (!deviceToken) return { ok: false, status: 0, reason: "NO_DEVICE_TOKEN" };

  try {
    const auth = getAuthClient(cfg);
    const url = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`;

    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: any = {
      token: deviceToken,
      android: { priority: "high" },
    };

    if (payload.shape === "notification" && payload.notification) {
      message.notification = payload.notification;
    }
    if (Object.keys(stringData).length > 0) {
      message.data = stringData;
    }

    const res = await auth.request({
      url,
      method: "POST",
      data: { message },
    });

    return { ok: true, status: res.status };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    const status = error.response?.status || 0;
    const reason = error.response?.data?.error?.details?.[0]?.errorCode || error.message;
    log.warn("FCM push error", {
      status,
      reason,
      deviceToken: deviceToken.substring(0, 10) + "...",
    });
    return { ok: false, status, reason };
  }
}

/** Whether FCM is configured in this environment. */
export function isFcmConfigured(): boolean {
  return loadFcmConfig() !== null;
}

/** FCM reasons that mean a token will never work again -> prune it. */
export function isStaleFcmReason(reason?: string): boolean {
  return reason === "UNREGISTERED" || reason === "INVALID_ARGUMENT";
}
