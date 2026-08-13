import { Router, type Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, parseBigIntId } from "../lib/server-utils";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const recordingRateLimiter = createRateLimiter({
  bucket: "api:call-recording",
  windowMs: 60_000,
  max: 30,
});

function safeHttpsLocation(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function twilioMediaUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const trustedHost = url.hostname === "api.twilio.com" || url.hostname.endsWith(".twilio.com");
    if (url.protocol !== "https:" || !trustedHost || url.username || url.password) return null;
    if (!/\.(?:mp3|wav)$/i.test(url.pathname)) url.pathname += ".mp3";
    return url.toString();
  } catch {
    return null;
  }
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
 * Authenticated recording boundary. Persistent vendor URLs never cross the
 * tenant API: Vapi mints a short-lived signed URL after ownership is checked,
 * while Twilio failover media is streamed with server-held credentials.
 */
router.get(
  "/api/calls/:callId/recording",
  authenticateUser,
  recordingRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", 'inline; filename="wireline-call.mp3"');

    // parseBigIntId also bounds against the Postgres bigint ceiling, so an
    // overlong id answers 404 here instead of a DB range error surfacing as 500.
    const callId = parseBigIntId(String(req.params.callId || ""));
    if (callId === null) {
      return res.status(404).json({ code: "NOT_FOUND", error: "Recording not found." });
    }

    const [call] = await drizzle
      .select({
        vapiCallId: schema.callLogs.vapiCallId,
        recordingUrl: schema.callLogs.recordingUrl,
      })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.id, callId), eq(schema.callLogs.userId, req.user.id)))
      .limit(1);

    if (!call) {
      return res.status(404).json({ code: "NOT_FOUND", error: "Recording not found." });
    }

    try {
      if (call.vapiCallId?.startsWith("twilio-voicemail:")) {
        const mediaUrl = twilioMediaUrl(call.recordingUrl);
        const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
        const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
        if (!mediaUrl || !accountSid || !authToken) {
          return res.status(503).json({
            code: "RECORDING_PROVIDER_UNAVAILABLE",
            error: "This recording is temporarily unavailable.",
          });
        }
        const headers: Record<string, string> = {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        };
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = await fetch(mediaUrl, {
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
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

      const vapiCallId = call.vapiCallId?.trim();
      const privateKey = process.env.VAPI_PRIVATE_KEY?.trim();
      if (!vapiCallId || vapiCallId === "unknown" || !privateKey) {
        return res.status(503).json({
          code: "RECORDING_PROVIDER_UNAVAILABLE",
          error: "This recording is temporarily unavailable.",
        });
      }
      const upstream = await fetch(
        `https://api.vapi.ai/call/${encodeURIComponent(vapiCallId)}/mono-recording`,
        {
          headers: { Authorization: `Bearer ${privateKey}` },
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (upstream.status >= 300 && upstream.status < 400) {
        const signedUrl = safeHttpsLocation(upstream.headers.get("location"));
        if (!signedUrl) throw new Error("Vapi returned an invalid recording redirect");
        return res.redirect(302, signedUrl);
      }
      if (upstream.ok) {
        await pipeAudio(upstream, res);
        return;
      }
      log.warn("Vapi recording retrieval failed", {
        call_log_id: callId,
        status: upstream.status,
      });
      return res.status(upstream.status === 404 ? 404 : 502).json({
        code: "RECORDING_UNAVAILABLE",
        error: "This recording is not available.",
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
