import { Router, type Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const recordingRateLimiter = createRateLimiter({
  bucket: "api:call-recording",
  windowMs: 60_000,
  max: 30,
});
const TWILIO_RECORDING_MAX_REDIRECTS = 3;

function isTrustedTwilioMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "api.twilio.com" ||
    host.endsWith(".twilio.com") ||
    host === "twiliocdn.com" ||
    host.endsWith(".twiliocdn.com")
  );
}

function trustedTwilioMediaUrl(value: string | null, base?: string): string | null {
  if (!value) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (
      url.protocol !== "https:" ||
      !isTrustedTwilioMediaHost(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function twilioMediaUrl(value: string | null): string | null {
  const trusted = trustedTwilioMediaUrl(value);
  if (!trusted) return null;
  const url = new URL(trusted);
  if (!/\.(?:mp3|wav)$/i.test(url.pathname)) url.pathname += ".mp3";
  return url.toString();
}

async function fetchTwilioRecording(
  mediaUrl: string,
  accountSid: string,
  authToken: string,
  range: string | undefined,
): Promise<globalThis.Response> {
  let currentUrl = mediaUrl;

  for (let redirects = 0; redirects <= TWILIO_RECORDING_MAX_REDIRECTS; redirects += 1) {
    const currentHost = new URL(currentUrl).hostname.toLowerCase();
    const headers: Record<string, string> = {};
    if (currentHost === "api.twilio.com" || currentHost.endsWith(".twilio.com")) {
      headers.Authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
    }
    if (range) headers.Range = range;

    const upstream = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status < 300 || upstream.status >= 400) return upstream;

    if (redirects >= TWILIO_RECORDING_MAX_REDIRECTS) {
      throw new Error("Twilio recording redirected too many times");
    }
    const nextUrl = trustedTwilioMediaUrl(upstream.headers.get("location"), currentUrl);
    if (!nextUrl) throw new Error("Twilio returned an untrusted recording redirect");
    currentUrl = nextUrl;
  }

  throw new Error("Twilio recording redirect handling failed");
}

async function pipeAudio(upstream: globalThis.Response, res: Response): Promise<void> {
  const contentType = upstream.headers.get("content-type") || "audio/mpeg";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    throw new Error(`Recording provider returned unexpected content type: ${contentType}`);
  }
  res.status(upstream.status);
  res.setHeader("Content-Type", contentType);
  for (const header of ["content-length", "content-range", "accept-ranges"] as const) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  if (!upstream.body) throw new Error("Recording provider returned an empty body");
  await pipeline(Readable.from(upstream.body as unknown as AsyncIterable<Uint8Array>), res);
}

/**
 * Authenticated recording boundary. Twilio media (failover voicemail, and
 * live calls the Bot owner chose to record) is streamed with server-held
 * credentials and its persistent provider URL never crosses the tenant API.
 * A live call reaches the provider branch only when a recording URL was
 * stored for it, which happens solely when that Bot's recording was on.
 */
router.get(
  "/api/calls/:callId/recording",
  authenticateUser,
  recordingRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", 'inline; filename="botbound-call.mp3"');

    // Bounded like parseDeliveryId: /^\d+$/ alone admits digit strings past
    // signed-64-bit, which BigInt() happily builds and Postgres then rejects
    // with an unhandled overflow — a 500 for what is simply a nonexistent id.
    const callId = String(req.params.callId || "");
    if (!/^[1-9]\d{0,18}$/.test(callId) || BigInt(callId) > 9_223_372_036_854_775_807n) {
      return res.status(404).json({ code: "NOT_FOUND", error: "Recording not found." });
    }

    const [call] = await drizzle
      .select({
        providerCallId: schema.callLogs.vapiCallId,
        recordingUrl: schema.callLogs.recordingUrl,
      })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.id, BigInt(callId)), eq(schema.callLogs.userId, req.user.id)))
      .limit(1);

    if (!call) {
      return res.status(404).json({ code: "NOT_FOUND", error: "Recording not found." });
    }

    try {
      const mediaUrl = twilioMediaUrl(call.recordingUrl);
      const isVoicemailRecording = call.providerCallId?.startsWith("twilio-voicemail:");
      // Live SIP calls carry providerCallId "openai:…"; their Twilio media is
      // served exactly like voicemail once the recording callback stored it.
      const isLiveRecording = call.providerCallId?.startsWith("openai:");
      if (mediaUrl && (isVoicemailRecording || isLiveRecording)) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
        const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
        if (!accountSid || !authToken) {
          return res.status(503).json({
            code: "RECORDING_PROVIDER_UNAVAILABLE",
            error: "This recording is temporarily unavailable.",
          });
        }
        const upstream = await fetchTwilioRecording(
          mediaUrl,
          accountSid,
          authToken,
          req.headers.range,
        );
        if (!upstream.ok && upstream.status !== 206) {
          log.warn("Twilio recording retrieval failed", {
            call_log_id: callId,
            status: upstream.status,
          });
          return res.status(upstream.status === 404 ? 404 : 502).json({
            code: "RECORDING_UNAVAILABLE",
            error: "This recording is not available.",
          });
        }
        await pipeAudio(upstream, res);
        return;
      }

      return res.status(404).json({
        code: "RECORDING_UNAVAILABLE",
        error: "This call has a transcript but no audio recording.",
      });
    } catch (error) {
      log.warn("Recording retrieval failed", {
        call_log_id: callId,
        error: getErrorMessage(error),
      });
      if (res.headersSent) return;
      return res.status(502).json({
        code: "RECORDING_UNAVAILABLE",
        error: "This recording is not available.",
      });
    }
  },
);

export default router;
