import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import twilio from "twilio";

const h = vi.hoisted(() => ({ update: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({
    calls: () => ({ update: h.update, recordings: { list: h.list, create: h.create } }),
  }),
}));
vi.mock("../src/lib/server-context", () => ({ log: { warn: vi.fn() } }));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: vi.fn(),
  commitPlatformCostReservation: vi.fn(),
}));
vi.mock("../src/lib/voice/live-voice-service", () => ({
  markRuntimeCustomVoicePlayed: vi.fn(),
  resolveRuntimeCustomVoice: vi.fn(),
  LIVE_CUSTOM_VOICE_KEY: "liveCustomVoice",
}));
vi.mock("../src/lib/voice/live-call-recording", () => ({
  liveRecordingCallbackUrl: () => "https://botbound.app/api/recording",
}));
vi.mock("../src/lib/voice/inbound-bridge", () => ({
  referTransferTwiml: (_target: string, _caller: unknown, options: { absoluteAction: boolean }) =>
    options.absoluteAction
      ? "<Response><Dial action='https://botbound.app/callback'/></Response>"
      : null,
}));

import {
  installClonedMediaServer,
  registeredMediaCall,
  authorizeMediaCall,
  controlMediaCall,
  prepareMediaRecording,
} from "../src/lib/voice/elevenlabs-media-bridge";

const sid = `CA${"a".repeat(32)}`,
  streamSid = `MZ${"b".repeat(32)}`;
let server: Server;
let port: number;
let carrier: WebSocket | undefined;
let admitted: Promise<void>;
let requestBody: Record<string, unknown>;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
  vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "https://voice.example.test");
  vi.stubEnv("WIRELINE_VOICE_WORKER_SECRET", "s".repeat(40));
  h.list.mockResolvedValue([]);
  h.create.mockResolvedValue({});
  h.update.mockResolvedValue({});
  let resolve!: () => void;
  admitted = new Promise<void>((done) => {
    resolve = done;
  });
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requestBody = JSON.parse(body);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ handled: true }));
    resolve();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as { port: number }).port;
  installClonedMediaServer(server, { port, maxCalls: 2, canAdmit: () => true });
});
afterEach(async () => {
  if (carrier && carrier.readyState !== WebSocket.CLOSED) {
    const closed = once(carrier, "close");
    carrier.terminate();
    await closed;
  }
  carrier = undefined;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});
async function connect(signature?: string) {
  carrier = new WebSocket(`ws://127.0.0.1:${port}/api/voice/cloned-media`, {
    headers: {
      "x-twilio-signature":
        signature ??
        twilio.getExpectedTwilioSignature(
          "test-token",
          "https://voice.example.test/api/voice/cloned-media",
          {},
        ),
    },
  });
  await once(carrier, "open");
  return carrier;
}
async function start() {
  const ws = await connect();
  ws.send(
    JSON.stringify({
      event: "start",
      start: {
        accountSid: "ACtest",
        callSid: sid,
        streamSid,
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { token: "signed-routing-token", direction: "inbound" },
      },
    }),
  );
  await admitted;
  return ws;
}
describe("signed cloned-call carrier admission", () => {
  it("rejects an unsigned socket before admission", async () => {
    await expect(connect("invalid")).rejects.toThrow("403");
    expect(registeredMediaCall(`media:${sid}`, "signed-routing-token")).toBe(false);
  });
  it("binds the registered stream to the exact token and refuses call control before routing authorization", async () => {
    const ws = await start();
    expect(requestBody).toEqual({
      callId: `media:${sid}`,
      token: "signed-routing-token",
      direction: "inbound",
    });
    expect(registeredMediaCall(`media:${sid}`, "wrong-token")).toBe(false);
    expect(registeredMediaCall(`media:${sid}`, "signed-routing-token")).toBe(true);
    const closed = once(ws, "close");
    await controlMediaCall(`media:${sid}`, "hangup");
    await closed;
    expect(h.update).not.toHaveBeenCalled();
  });
  it("allows parent call control only after the admission pipeline authorizes the binding", async () => {
    await start();
    authorizeMediaCall(`media:${sid}`);
    await controlMediaCall(`media:${sid}`, "refer", "tel:+13125550199");
    expect(h.update).toHaveBeenCalledWith({
      twiml: expect.stringContaining("https://botbound.app/callback"),
    });
    await controlMediaCall(`media:${sid}`, "hangup");
    expect(h.update).toHaveBeenLastCalledWith({ status: "completed" });
  });
  it("never records an opted-out call and avoids duplicate active recorders", async () => {
    await prepareMediaRecording(`media:${sid}`, false);
    expect(h.list).not.toHaveBeenCalled();
    h.list.mockResolvedValueOnce([{ status: "in-progress" }]);
    await prepareMediaRecording(`media:${sid}`, true);
    expect(h.create).not.toHaveBeenCalled();
    await prepareMediaRecording(`media:${sid}`, true);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingChannels: "dual",
        recordingTrack: "both",
        recordingStatusCallback: "https://botbound.app/api/recording",
      }),
    );
  });
});
