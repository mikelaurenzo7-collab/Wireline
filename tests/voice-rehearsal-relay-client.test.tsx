import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OpenAILiveVoiceSandbox from "../src/components/OpenAILiveVoiceSandbox";
import { resampleToPcm16 } from "../src/lib/rehearsal-relay-audio";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  fetch: vi.fn(),
  completed: vi.fn(),
  ended: vi.fn(),
  sockets: [] as FakeSocket[],
  sources: [] as FakeSource[],
  processors: [] as Array<{ onaudioprocess: ((event: unknown) => void) | null }>,
}));

type FakeSource = {
  onended: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
type FakeSocket = {
  url: string;
  protocols: string[];
  readyState: number;
  binaryType: string;
  sent: unknown[];
  closed: boolean;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
};

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = typeof value === "function" ? value(h.states[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
}));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/components/molecules", () => ({
  ConversationMessage: "conversation-message",
  StatusNotice: "status-notice",
}));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  onChange?: (event: { target: { value: string } }) => void;
  role?: string;
  title?: string;
  "aria-label"?: string;
};
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return OpenAILiveVoiceSandbox({
    agentId: "bot-a",
    agentName: "Front Desk",
    compact: true,
    onTestCompleted: h.completed,
    onTestEnded: h.ended,
  });
}
function click(label: string) {
  const button = elements(render()).find(
    (element) => element.type === "button" && text(element) === label,
  );
  expect(button, label).toBeDefined();
  button!.props.onClick!();
}
function statusText() {
  return elements(render())
    .filter((element) => element.props.role === "status")
    .map(text)
    .join(" ");
}
function pageText() {
  return text(render());
}

function stubBrowser() {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => stream } });
  vi.stubGlobal("window", {
    clearTimeout: vi.fn(),
    setTimeout: vi.fn(() => 1),
    location: { href: "https://botbound.app/studio" },
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 48_000;
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      createMediaStreamSource = node;
      createGain = () => ({ ...node(), gain: { value: 1 } });
      createScriptProcessor = () => {
        const processor = { ...node(), onaudioprocess: null };
        h.processors.push(processor);
        return processor;
      };
      createBuffer = (_channels: number, length: number, rate: number) => ({
        duration: length / rate,
        getChannelData: () => new Float32Array(length),
      });
      createBufferSource = () => {
        const source = { ...node(), buffer: null, onended: null, start: vi.fn(), stop: vi.fn() };
        h.sources.push(source);
        return source;
      };
    },
  );
  vi.stubGlobal(
    "WebSocket",
    Object.assign(
      class {
        url: string;
        protocols: string[];
        readyState = 0;
        binaryType = "blob";
        sent: unknown[] = [];
        closed = false;
        onopen = null;
        onmessage = null;
        onclose = null;
        constructor(url: string, protocols: string[]) {
          this.url = url;
          this.protocols = protocols;
          h.sockets.push(this as unknown as FakeSocket);
        }
        send(value: unknown) {
          this.sent.push(value);
        }
        close() {
          this.closed = true;
          this.readyState = 3;
        }
      },
      { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
    ),
  );
  return { track };
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.sockets = [];
  h.sources = [];
  h.processors = [];
  h.completed.mockReset();
  h.ended.mockReset();
  h.fetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("resamples microphone audio to 24 kHz PCM16", () => {
  const input = new Float32Array(4_800).fill(0.5);
  const pcm = resampleToPcm16(input, 48_000);
  expect(pcm).toHaveLength(2_400);
  // 0.5 of full scale, truncated into a 16-bit sample.
  expect(pcm[0]).toBe(16_383);
  expect(resampleToPcm16(new Float32Array(441), 44_100)).toHaveLength(240);
  expect(resampleToPcm16(new Float32Array(160), 16_000)).toHaveLength(240);
  expect(resampleToPcm16(new Float32Array([2, -2]), 24_000)).toEqual(
    new Int16Array([0x7fff, -0x8000]),
  );
});

it("rehearses over the relay: opening, playback, barge-in, typed lines and provider loss", async () => {
  stubBrowser();
  h.fetch.mockImplementation(async (url: string) =>
    url === "/api/voice/live/session"
      ? new Response(
          JSON.stringify({
            transport: "relay",
            relayPath: "/api/voice/live/relay",
            protocol: "botbound-rehearsal.v1",
            ticket: "ticket-1",
            cleanupToken: "cleanup-1",
            maxDurationSeconds: 120,
          }),
        )
      : new Response(JSON.stringify({ stopped: true })),
  );

  click("Start Rehearsal");
  await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
  expect(JSON.parse(h.fetch.mock.calls[0]![1].body)).toEqual({
    agentId: "bot-a",
    transport: "relay",
  });
  const socket = h.sockets[0]!;
  expect(socket.url).toBe("wss://botbound.app/api/voice/live/relay");
  expect(socket.protocols).toEqual(["botbound-rehearsal.v1", "ticket.ticket-1"]);
  expect(socket.binaryType).toBe("arraybuffer");
  expect(statusText()).toContain("Connecting Live Voice");

  socket.readyState = 1;
  socket.onopen!();
  const capture = h.processors[0]!;
  const frame = { inputBuffer: { getChannelData: () => new Float32Array(2_048) } };
  capture.onaudioprocess!(frame);
  // Nothing is sent until the relay says the session is ready.
  expect(socket.sent).toHaveLength(0);

  const message = (value: unknown) => socket.onmessage!({ data: JSON.stringify(value) });
  message({ type: "ready", sampleRate: 24_000, maxDurationSeconds: 120 });
  expect(statusText()).not.toContain("Connecting");
  message({
    type: "bot_text",
    id: "opening",
    text: "Hi, I'm Front Desk, an AI assistant.",
    final: true,
  });
  expect(pageText()).toContain("Hi, I'm Front Desk, an AI assistant.");

  capture.onaudioprocess!(frame);
  expect(socket.sent).toHaveLength(1);
  expect((socket.sent[0] as ArrayBuffer).byteLength).toBe(2_048);

  socket.onmessage!({ data: new Int16Array(240).buffer });
  expect(statusText()).toContain("Bot Speaking");
  h.sources[0]!.onended!();
  expect(statusText()).not.toContain("Bot Speaking");

  socket.onmessage!({ data: new Int16Array(240).buffer });
  expect(statusText()).toContain("Bot Speaking");
  message({ type: "interrupt" });
  expect(h.sources[1]!.stop).toHaveBeenCalledOnce();
  expect(statusText()).not.toContain("Bot Speaking");

  message({ type: "caller_text", id: "c1", text: "When do", final: false });
  message({ type: "caller_text", id: "c1", text: "When do you open?", final: true });
  expect(pageText()).toContain("When do you open?");
  expect(pageText()).not.toContain("When doWhen do");

  message({ type: "thinking", active: true });
  expect(statusText()).toContain("Checking Approved Knowledge");
  message({ type: "thinking", active: false });
  message({ type: "bot_text", id: "r1", text: "We open ", final: false });
  message({ type: "bot_text", id: "r1", text: "at eight.", final: false });
  expect(pageText()).toContain("We open at eight.");
  message({ type: "turn_done", completed: false });
  expect(h.completed).not.toHaveBeenCalled();
  message({ type: "turn_done", completed: true });
  message({ type: "turn_done", completed: true });
  expect(h.completed).toHaveBeenCalledOnce();

  const input = elements(render()).find((element) => element.type === "input");
  input!.props.onChange!({ target: { value: "Do you fix drains?" } });
  const form = elements(render()).find((element) => element.type === "form");
  form!.props.onSubmit!({ preventDefault: vi.fn() });
  expect(socket.sent.at(-1)).toBe(
    JSON.stringify({ type: "user_text", text: "Do you fix drains?" }),
  );

  message({
    type: "ended",
    reason: "provider_closed",
    message: "The voice connection ended. Start the rehearsal again to continue.",
  });
  socket.onclose!();
  expect(statusText()).toBe("Live Voice Needs Attention");
  // The Bot answered, but the rehearsal ended on a lost connection.
  expect(h.ended).toHaveBeenCalledExactlyOnceWith({ replied: true, failed: true });
  expect(pageText()).toContain("The voice connection ended.");
  // The server already ended its session; no stop request is needed.
  expect(h.fetch.mock.calls.some(([url]) => url === "/api/voice/live/session/stop")).toBe(false);
});

it("ends a relayed rehearsal through its cleanup ticket", async () => {
  stubBrowser();
  h.fetch.mockImplementation(async (url: string) =>
    url === "/api/voice/live/session"
      ? new Response(
          JSON.stringify({
            transport: "relay",
            relayPath: "/api/voice/live/relay",
            protocol: "botbound-rehearsal.v1",
            ticket: "ticket-1",
            cleanupToken: "cleanup-1",
          }),
        )
      : new Response(JSON.stringify({ stopped: true })),
  );
  click("Start Rehearsal");
  await vi.waitFor(() => expect(h.sockets).toHaveLength(1));
  h.sockets[0]!.readyState = 1;
  h.sockets[0]!.onopen!();
  h.sockets[0]!.onmessage!({ data: JSON.stringify({ type: "ready" }) });
  expect(h.ended).not.toHaveBeenCalled();
  click("End Rehearsal");
  expect(h.ended).toHaveBeenCalledExactlyOnceWith({ replied: false, failed: false });
  expect(h.sockets[0]!.closed).toBe(true);
  const stop = h.fetch.mock.calls.find(([url]) => url === "/api/voice/live/session/stop");
  expect(JSON.parse(stop![1].body)).toEqual({ cleanupToken: "cleanup-1" });
  // Back to idle: compact mode hides the empty status bar and offers Start again.
  expect(statusText()).toBe("");
  expect(
    elements(render()).some(
      (element) => element.type === "button" && text(element) === "Start Rehearsal",
    ),
  ).toBe(true);
});

it("falls back to the OpenAI WebRTC offer when the server answers webrtc", async () => {
  stubBrowser();
  const peers: unknown[] = [];
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      iceGatheringState = "complete";
      localDescription = { sdp: `v=0${"a".repeat(120)}` };
      constructor() {
        peers.push(this);
      }
      createDataChannel() {
        return {
          readyState: "connecting",
          close: vi.fn(),
          send: vi.fn(),
          addEventListener: vi.fn(),
        };
      }
      addTrack() {}
      async createOffer() {
        return { sdp: this.localDescription.sdp };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() {}
    },
  );
  h.fetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ transport: "webrtc", reason: "x" })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ sdp: "v=0 answer", cleanupToken: "cleanup-2" })),
    );
  click("Start Rehearsal");
  await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
  expect(h.sockets).toHaveLength(0);
  expect(peers).toHaveLength(1);
  const offer = JSON.parse(h.fetch.mock.calls[1]![1].body);
  expect(offer.agentId).toBe("bot-a");
  expect(offer.sdp).toMatch(/^v=0/);
});
