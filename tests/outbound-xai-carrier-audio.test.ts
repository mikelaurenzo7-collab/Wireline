import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";
import { bridgeXaiAudio } from "../src/lib/voice/xai-carrier-audio";
import { mediaCallSid } from "../src/lib/voice/cloned-media-config";
import { toXAIRealtimeSession } from "../src/lib/voice/xai-voice-config";
import { carrierMediaTwiml } from "../src/lib/voice/cloned-call-routing";

function socket() {
  const fake = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
  });
  return {
    fake,
    ws: fake as unknown as WebSocket,
    receive: (data: object) => fake.emit("message", Buffer.from(JSON.stringify(data))),
    sent: () => fake.send.mock.calls.map(([value]) => JSON.parse(value as string)),
  };
}

describe("outbound native xAI carrier audio", () => {
  it("connects the answered parent directly with a signed token and no second Dial", () => {
    vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "https://voice.example.test");
    try {
      const xml = carrierMediaTwiml({ direction: "outbound", nativeXai: true, token: "a&b" });
      expect(xml).toContain(
        '<Connect><Stream url="wss://voice.example.test/api/voice/cloned-media">',
      );
      expect(xml).toContain('name="token" value="a&amp;b"');
      expect(xml).toContain('name="engine" value="xai"');
      expect(xml).not.toContain("<Dial");
      const sid = `CA${"a".repeat(32)}`;
      expect(mediaCallSid(`xai:media:${sid}`)).toBe(sid);
      expect(mediaCallSid(`xai:${sid}`)).toBeNull();
      expect(toXAIRealtimeSession({}, { carrierAudio: true }).audio).toMatchObject({
        input: { format: { type: "audio/pcmu" } },
        output: { format: { type: "audio/pcmu" } },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("plays a greeting once, waits for carrier playback, then carries caller audio and interruptions", () => {
    const carrier = socket(),
      model = socket(),
      streamSid = "MZtest";
    bridgeXaiAudio(carrier.ws, model.ws, streamSid);
    const incoming = { event: "media", streamSid, media: { payload: "AAAA" } };
    model.receive({ type: "session.updated" });
    carrier.receive(incoming);
    model.receive({ type: "response.output_audio.delta", delta: "BBBB" });
    model.receive({ type: "response.output_audio.done" });
    model.receive({ type: "response.done" });
    const [audio, mark] = carrier.sent();
    expect(audio).toEqual({ event: "media", streamSid, media: { payload: "BBBB" } });
    expect(carrier.sent()).toHaveLength(2);
    carrier.receive({ ...mark, mark: { name: "other" } });
    carrier.receive(incoming);
    expect(model.sent()).toEqual([]);
    carrier.receive(mark);
    carrier.receive(incoming);
    expect(model.sent()).toEqual([{ type: "input_audio_buffer.append", audio: "AAAA" }]);
    model.receive({ type: "input_audio_buffer.speech_started" });
    expect(carrier.sent().at(-1)).toEqual({ event: "clear", streamSid });
    carrier.receive({ event: "stop", streamSid });
    expect(model.fake.close).toHaveBeenCalledWith(1000, "Carrier ended call");
    model.fake.emit("close");
    expect(carrier.fake.close).toHaveBeenCalledOnce();
  });

  it("allows a long buffered opening to finish but still times out an unacknowledged stream", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const carrier = socket(), model = socket(), streamSid = "MZlong";
      bridgeXaiAudio(carrier.ws, model.ws, streamSid);
      model.fake.emit("open");
      model.receive({ type: "session.updated" });
      model.receive({ type: "response.output_audio.delta", delta: Buffer.alloc(240_000).toString("base64") });
      model.receive({ type: "response.output_audio.done" });
      vi.advanceTimersByTime(30_000);
      expect(model.fake.close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(20_000);
      expect(model.fake.close).toHaveBeenCalledWith(1011, "Opening audio unavailable");
      model.fake.emit("close");
    } finally {
      vi.useRealTimers();
    }
  });

  it("truncates the unheard portion and ignores echoed clear marks and late audio", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const carrier = socket(), model = socket(), streamSid = "MZbarge";
      bridgeXaiAudio(carrier.ws, model.ws, streamSid);
      model.receive({ type: "session.updated" });
      model.receive({ type: "response.output_audio.delta", delta: "BBBB" });
      model.receive({ type: "response.output_audio.done" });
      carrier.receive(carrier.sent().at(-1));
      const delta = {
        type: "response.output_audio.delta",
        response_id: "resp-2",
        item_id: "item-2",
        content_index: 0,
        delta: Buffer.alloc(8_000).toString("base64"),
      };
      model.receive(delta);
      model.receive({ type: "response.output_audio.done", response_id: "resp-2" });
      const mark = carrier.sent().at(-1);
      vi.advanceTimersByTime(250);
      model.receive({ type: "input_audio_buffer.speech_started" });
      expect(model.sent()).toContainEqual({
        type: "conversation.item.truncate", item_id: "item-2",
        content_index: 0, audio_end_ms: 250,
      });
      expect(carrier.sent().at(-1)).toEqual({ event: "clear", streamSid });
      const count = carrier.sent().length;
      carrier.receive(mark);
      model.receive(delta);
      expect(carrier.sent()).toHaveLength(count);
      model.fake.emit("close");
    } finally {
      vi.useRealTimers();
    }
  });
});
