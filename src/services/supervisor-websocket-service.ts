/* eslint-disable @typescript-eslint/no-explicit-any -- The `ws` upgrade handler
 * surfaces node's http server / net socket / upgrade head as loosely-typed
 * values, and whisper-message JSON payloads aren't (yet) modeled as a schema.
 * Tightening requires either a structural type for the upgrade triple or a
 * runtime validator (zod) for the whisper protocol; both are out of scope for
 * the type-cleanup pass. catch (e: any) → e?.message reads use the narrow
 * property access so a future migration to `unknown` is mechanical. */
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "node:url";
import { IncomingMessage } from "node:http";
import { log, drizzle, tenantStore } from "../lib/server-context";
import { verifyInternalJwt, type JwtPayload } from "../lib/auth-utils";
import { isSessionGenerationActive } from "../lib/session-generation";
import { sessionUsers } from "../db/security-schema";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { parseCookieHeader, SESSION_COOKIE_NAME, isProductionRuntime } from "../lib/session-cookie";
import { isAllowedBrowserOrigin } from "../middleware/same-origin";
import { isAllowedVapiListenUrl } from "../lib/vapi-monitor-url";
import {
  applyVapiListenControlMessage,
  clearVapiAssistantSpeaking,
  isVapiAssistantSpeaking,
  setVapiAssistantSpeaking,
} from "../lib/vapi-listen-gate";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * The supervisor socket is not routed through `authenticateUser`, so it must
 * apply the same database-owned session-generation fence itself. Signature-only
 * verification would keep listen/whisper alive for the full token TTL after a
 * sign-out or password change already bumped session_version — exactly the
 * drift `session-generation.ts` exists to prevent.
 *
 * The tenant scope stays tight to this one lookup: the rest of the connection
 * handler queries signal_presence / call_logs unscoped, and widening the scope
 * here would change their RLS behavior.
 */
async function isActiveSupervisorSession(payload: JwtPayload): Promise<boolean> {
  return tenantStore.run(payload.sub, async () => {
    const [user] = await drizzle
      .select({
        sessionRevokedBefore: sessionUsers.sessionRevokedBefore,
        sessionVersion: sessionUsers.sessionVersion,
      })
      .from(sessionUsers)
      .where(eq(sessionUsers.id, payload.sub))
      .limit(1);
    return Boolean(user && isSessionGenerationActive(payload, user));
  });
}

export function initSupervisorWebSocketServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: any, head: any) => {
    const { pathname } = parseUrl(request.url || "");

    if (pathname === "/api/supervisor/stream") {
      // The socket accepts cookie credentials, so a cross-site page opening it
      // would ride the victim's session (whisper mode writes coaching notes).
      // assertSameOrigin never sees upgrades — gate the browser Origin here.
      const origin =
        typeof request.headers.origin === "string" ? request.headers.origin : undefined;
      if (!isAllowedBrowserOrigin(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws: any) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const urlObj = parseUrl(request.url || "", true);
    const callId = urlObj.query.callId as string;
    const mode = urlObj.query.mode as string;

    // Prefer header-borne credentials over the ?token= query param. Tokens in
    // URLs leak into proxy access logs, browser history, referer headers,
    // crash reports and the like. We accept (in order):
    //   1. `Authorization: ****** — what server-to-server clients use.
    //   2. `Sec-WebSocket-Protocol: bearer, <jwt>` — what browsers use,
    //      since the WebSocket constructor cannot set arbitrary headers but
    //      it CAN advertise subprotocols.
    //   3. httpOnly session cookie — same-origin browser clients (Recaps).
    //   4. `?token=<jwt>` — dev-only fallback; rejected in production.
    const authHeader =
      typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    const headerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    const rawProto = request.headers["sec-websocket-protocol"];
    const protoParts = Array.isArray(rawProto)
      ? rawProto.flatMap((p) => p.split(","))
      : typeof rawProto === "string"
        ? rawProto.split(",")
        : [];
    const protoTokens = protoParts.map((p) => p.trim()).filter(Boolean);
    const bearerIdx = protoTokens.findIndex((p) => p.toLowerCase() === "bearer");
    const subprotocolToken =
      bearerIdx >= 0 && bearerIdx + 1 < protoTokens.length ? protoTokens[bearerIdx + 1] : "";

    const queryToken = typeof urlObj.query.token === "string" ? urlObj.query.token : "";
    if (isProductionRuntime() && queryToken) {
      ws.close(4001, "Query token authentication is not supported. Use session cookies.");
      return;
    }

    const cookieToken = parseCookieHeader(request.headers.cookie)[SESSION_COOKIE_NAME];
    const token = cookieToken || headerToken || subprotocolToken || queryToken || undefined;
    if (token && token === queryToken && !headerToken && !subprotocolToken && !cookieToken) {
      log.warn("Supervisor WebSocket: deprecated ?token= auth (dev only)", { callId, mode });
    }

    if (!callId || !mode || !token) {
      ws.close(4000, "Missing required parameters (callId, mode, auth)");
      return;
    }

    let userId: string;
    try {
      const secret = requireInternalJwtSecret();
      const payload = await verifyInternalJwt(token, secret);
      if (!payload?.sub) {
        ws.close(4001, "Invalid or expired token");
        return;
      }
      // Fails closed: a throw here (DB down, pool exhausted) is caught below and
      // closes the socket before userId is ever assigned.
      if (!(await isActiveSupervisorSession(payload))) {
        log.warn("Supervisor WebSocket: revoked session rejected", { callId, mode });
        ws.close(4001, "Session has been revoked");
        return;
      }
      userId = payload.sub;
    } catch {
      ws.close(4001, "Authentication failed");
      return;
    }

    log.info("Supervisor WebSocket connected", { callId, mode, userId });

    const verifyCallAccess = async (): Promise<{
      ok: boolean;
      listenUrl: string | null;
    }> => {
      const [presence] = await drizzle
        .select({
          userId: schema.signalPresence.userId,
          listenUrl: schema.signalPresence.listenUrl,
        })
        .from(schema.signalPresence)
        .where(eq(schema.signalPresence.id, callId))
        .limit(1);
      if (presence && presence.userId === userId) {
        return { ok: true, listenUrl: presence.listenUrl };
      }

      const [callRow] = await drizzle
        .select({ userId: schema.callLogs.userId })
        .from(schema.callLogs)
        .where(eq(schema.callLogs.vapiCallId, callId))
        .limit(1);
      return {
        ok: !!callRow && callRow.userId === userId,
        listenUrl: null,
      };
    };

    if (mode === "listen") {
      try {
        const access = await verifyCallAccess();
        if (!access.ok) {
          ws.close(4004, "Call not found");
          return;
        }

        if (access.listenUrl && isAllowedVapiListenUrl(access.listenUrl)) {
          const upstream = new WebSocket(access.listenUrl);
          let upstreamOpen = false;
          setVapiAssistantSpeaking(callId, false);

          upstream.on("open", () => {
            upstreamOpen = true;
            log.info("Vapi listen relay connected", { callId, userId });
          });

          upstream.on("message", (data, isBinary) => {
            if (!isBinary) {
              applyVapiListenControlMessage(callId, data.toString());
              return;
            }
            if (ws.readyState === WebSocket.OPEN && isVapiAssistantSpeaking(callId)) {
              ws.send(data);
            }
          });

          upstream.on("close", () => {
            clearVapiAssistantSpeaking(callId);
            if (ws.readyState === WebSocket.OPEN) ws.close(1000, "Upstream closed");
          });

          upstream.on("error", (err: Error) => {
            log.warn("Vapi listen relay upstream error", { callId, error: err.message });
            if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Upstream error");
          });

          ws.on("close", () => {
            clearVapiAssistantSpeaking(callId);
            if (upstreamOpen) upstream.close();
            log.info("Supervisor stream socket closed (listen relay)", { callId });
          });

          return;
        }

        if (isProductionRuntime()) {
          ws.close(4005, "Live call audio is not available for this call yet.");
          return;
        }

        // Dev-only fallback: simulated audio when listenUrl is not yet available.
        let sampleIndex = 0;
        const sampleRate = 8000;
        const intervalMs = 100;
        const numSamples = (sampleRate * intervalMs) / 1000; // 800 samples

        const intervalId = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(intervalId);
            return;
          }

          // Buffer size is numSamples * 2 (16-bit PCM = 2 bytes/sample)
          const buffer = Buffer.alloc(numSamples * 2);
          for (let i = 0; i < numSamples; i++) {
            const t = sampleIndex / sampleRate;
            // Generate a complex tone by summing two sine waves to simulate speech-like patterns
            // Modulate frequency to create visual activity in the visualizer
            const frequency = 400 + 100 * Math.sin(2 * Math.PI * 0.5 * t);
            const sampleVal =
              Math.sin(2 * Math.PI * frequency * t) +
              0.5 * Math.sin(2 * Math.PI * (frequency * 1.5) * t);
            // Scale to 16-bit signed integer range (-32768 to 32767)
            const pcmVal = Math.floor(sampleVal * 16384);
            buffer.writeInt16LE(pcmVal, i * 2);
            sampleIndex++;
          }

          ws.send(buffer);
        }, intervalMs);

        ws.on("close", () => {
          clearInterval(intervalId);
          log.info("Supervisor stream socket closed (listen mode)", { callId });
        });
      } catch (err: any) {
        log.error("Failed to setup supervisor listen stream", { error: err.message });
        ws.close(5000, "Internal Server Error");
      }
    } else if (mode === "whisper") {
      const whisperAccess = await verifyCallAccess();
      if (!whisperAccess.ok) {
        ws.close(4004, "Call not found");
        return;
      }

      ws.on("message", async (data: string) => {
        try {
          const payload = JSON.parse(data);
          if (payload.type === "whisper" && payload.text) {
            const text = payload.text;

            if (!(await verifyCallAccess()).ok) {
              ws.close(4004, "Call not found");
              return;
            }

            // Log in DB (update call logs and/or subscription notes)
            await drizzle
              .update(schema.callLogs)
              .set({ coachingNote: text })
              .where(
                and(eq(schema.callLogs.vapiCallId, callId), eq(schema.callLogs.userId, userId)),
              );

            await drizzle
              .update(schema.supervisorSubscriptions)
              .set({ note: text })
              .where(
                and(
                  eq(schema.supervisorSubscriptions.callId, callId),
                  eq(schema.supervisorSubscriptions.userId, userId),
                ),
              );

            log.info("Whisper coaching note logged", { callId, text });

            // Acknowledge to supervisor client
            ws.send(
              JSON.stringify({
                type: "whisper_delivered",
                text: "Note broadcasted to agent: " + text,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        } catch (e: any) {
          log.error("Failed to process whisper socket message", { error: e.message });
        }
      });

      ws.on("close", () => {
        log.info("Supervisor stream socket closed (whisper mode)", { callId });
      });
    }
  });
}
