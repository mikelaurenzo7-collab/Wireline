import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "node:url";
import { IncomingMessage } from "node:http";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

export function initSupervisorWebSocketServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: any, head: any) => {
    const { pathname } = parseUrl(request.url || "");

    if (pathname === "/api/supervisor/stream") {
      wss.handleUpgrade(request, socket, head, (ws: any) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const urlObj = parseUrl(request.url || "", true);
    const callId = urlObj.query.callId as string;
    const mode = urlObj.query.mode as string;
    const userId = urlObj.query.userId as string;

    if (!callId || !mode || !userId) {
      ws.close(4000, "Missing required query parameters");
      return;
    }

    log.info("Supervisor WebSocket connected", { callId, mode, userId });

    if (mode === "listen") {
      try {
        // Check if the call exists and belongs to the user
        const [callRow] = await drizzle
          .select()
          .from(schema.callLogs)
          .where(eq(schema.callLogs.vapiCallId, callId))
          .limit(1);

        if (!callRow || callRow.userId !== userId) {
          ws.close(4004, "Call not found");
          return;
        }

        // Generate and stream simulated audio chunks
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
      ws.on("message", async (data: string) => {
        try {
          const payload = JSON.parse(data);
          if (payload.type === "whisper" && payload.text) {
            const text = payload.text;

            // Log in DB (update call logs and/or subscription notes)
            await drizzle
              .update(schema.callLogs)
              .set({ coachingNote: text })
              .where(eq(schema.callLogs.vapiCallId, callId));

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
