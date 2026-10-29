import type { Server } from "node:http";
import type { LiveServerMessage, Session } from "@google/genai";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";
import { log } from "../server-context";
import {
  getGeminiClient,
  mulawToPcm16_16k,
  pcm24ToMulawBuffer,
  RESOLVED_GEMINI_LIVE_MODEL,
} from "./gemini-live-client";
import {
  prepareGeminiLiveSessionConfig,
  runGeminiLiveTool,
} from "./gemini-live-service";

const startFrameSchema = z.object({
  event: z.literal("start"),
  streamSid: z.string(),
  start: z.object({
    callSid: z.string(),
    streamSid: z.string(),
    customParameters: z.record(z.string(), z.string()).optional(),
  }),
});

const mediaFrameSchema = z.object({
  event: z.literal("media"),
  streamSid: z.string(),
  media: z.object({
    payload: z.string(),
  }),
});

export const GEMINI_MEDIA_STREAM_PATH = "/api/voice/gemini-stream";

export function installGeminiMediaBridge(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", "http://localhost");
    if (url.pathname === GEMINI_MEDIA_STREAM_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (twilioSocket: WebSocket) => {
    let streamSid = "";
    let callSid = "";
    let geminiSession: Session | null = null;
    let isTerminating = false;

    twilioSocket.on("message", async (data: WebSocket.RawData) => {
      try {
        const raw = JSON.parse(data.toString());

        if (raw.event === "start") {
          const parsed = startFrameSchema.safeParse(raw);
          if (!parsed.success) {
            log.warn("[gemini-media-bridge] Invalid start frame", { error: parsed.error });
            return;
          }

          streamSid = parsed.data.streamSid;
          callSid = parsed.data.start.callSid;
          const params = parsed.data.start.customParameters || {};
          const userId = params.userId;
          const agentId = params.agentId;

          if (!userId || !agentId) {
            log.error("[gemini-media-bridge] Missing userId or agentId in stream start", {
              callSid,
              streamSid,
            });
            twilioSocket.close(1008, "Missing agent context");
            return;
          }

          log.info("[gemini-media-bridge] Starting Gemini Live media session", {
            callSid,
            streamSid,
            agentId,
          });

          const prepared = await prepareGeminiLiveSessionConfig({
            userId,
            agentId,
            model: RESOLVED_GEMINI_LIVE_MODEL,
          });

          const ai = getGeminiClient();

          geminiSession = await ai.live.connect({
            model: prepared.model,
            config: prepared.config,
            callbacks: {
              onopen: () => {
                log.info("[gemini-media-bridge] Gemini live session open", {
                  callSid,
                  streamSid,
                });
              },
              onmessage: async (msg: LiveServerMessage) => {
                if (isTerminating || twilioSocket.readyState !== WebSocket.OPEN) return;

                // 1. Handle user barge-in / interruption: flush Twilio playback buffer immediately
                if (msg.serverContent?.interrupted) {
                  log.info("[gemini-media-bridge] Barge-in detected; clearing Twilio buffer", {
                    streamSid,
                  });
                  twilioSocket.send(
                    JSON.stringify({
                      event: "clear",
                      streamSid,
                    }),
                  );
                }

                // 2. Stream synthesized 24kHz PCM from Gemini downsampled to 8kHz mu-law for Twilio
                if (msg.serverContent?.modelTurn?.parts) {
                  for (const part of msg.serverContent.modelTurn.parts) {
                    if (part.inlineData?.data) {
                      const pcm24 = Buffer.from(part.inlineData.data, "base64");
                      const mulaw = pcm24ToMulawBuffer(pcm24);
                      if (mulaw.length > 0) {
                        twilioSocket.send(
                          JSON.stringify({
                            event: "media",
                            streamSid,
                            media: {
                              payload: mulaw.toString("base64"),
                            },
                          }),
                        );
                      }
                    }
                  }
                }

                // 3. Handle asynchronous function calling
                if (msg.toolCall?.functionCalls) {
                  for (const call of msg.toolCall.functionCalls) {
                    if (!call.name || !call.id || !geminiSession) {
                      log.warn("[gemini-media-bridge] Incomplete tool call or session");
                      continue;
                    }
                    const session = geminiSession;
                    try {
                      const result = await runGeminiLiveTool({
                        userId,
                        agentId,
                        name: call.name,
                        args: (call.args as Record<string, unknown>) || {},
                      });
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            id: call.id,
                            response: { output: result },
                          },
                        ],
                      });
                    } catch (toolError) {
                      log.error("[gemini-media-bridge] Tool call failed", {
                        name: call.name,
                        error: String(toolError),
                      });
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            id: call.id,
                            response: { error: String(toolError) },
                          },
                        ],
                      });
                    }
                  }
                }
              },
              onerror: (err: unknown) => {
                log.error("[gemini-media-bridge] Gemini session error", {
                  callSid,
                  streamSid,
                  error: String(err),
                });
              },
              onclose: () => {
                log.info("[gemini-media-bridge] Gemini session closed", {
                  callSid,
                  streamSid,
                });
                if (twilioSocket.readyState === WebSocket.OPEN) {
                  twilioSocket.close();
                }
              },
            },
          });
        } else if (raw.event === "media") {
          const parsed = mediaFrameSchema.safeParse(raw);
          if (parsed.success && geminiSession) {
            const mulaw = Buffer.from(parsed.data.media.payload, "base64");
            const pcm16 = mulawToPcm16_16k(mulaw);
            if (pcm16.length > 0) {
              geminiSession.sendRealtimeInput({
                audio: {
                  data: pcm16.toString("base64"),
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            }
          }
        } else if (raw.event === "stop") {
          log.info("[gemini-media-bridge] Carrier stop received", { streamSid, callSid });
          isTerminating = true;
          if (geminiSession) {
            try {
              geminiSession.close?.();
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        log.error("[gemini-media-bridge] Error processing websocket message", {
          error: String(err),
        });
      }
    });

    twilioSocket.on("close", () => {
      isTerminating = true;
      if (geminiSession) {
        try {
          geminiSession.close?.();
        } catch {
          /* ignore */
        }
      }
    });
  });

  return wss;
}
