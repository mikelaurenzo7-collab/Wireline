import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OpenAILiveVoiceSandbox from "../src/components/OpenAILiveVoiceSandbox";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
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
  role?: string;
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
  return OpenAILiveVoiceSandbox({ agentId: "bot-a", agentName: "Front Desk", compact: true });
}
function click(label: string) {
  const button = elements(render()).find(
    (element) =>
      element.type === "button" &&
      (text(element) === label || element.props["aria-label"] === label),
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

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ result: {} })));
});
afterEach(() => vi.unstubAllGlobals());

it("keeps pending microphone mute, Bot activity and error recovery aligned with real resources", async () => {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let resolveMicrophone!: (value: typeof stream) => void;
  const microphone = new Promise<typeof stream>((resolve) => {
    resolveMicrophone = resolve;
  });
  let resolveOffer!: (value: { sdp: string }) => void;
  const offer = new Promise<{ sdp: string }>((resolve) => {
    resolveOffer = resolve;
  });
  const addTrack = vi.fn();
  const close = vi.fn();
  const events = {
    readyState: "connecting",
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as (() => void) | null,
    close: vi.fn(),
  };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => microphone } });
  vi.stubGlobal("window", { clearTimeout: vi.fn() });
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      createDataChannel() {
        return events;
      }
      addTrack(value: typeof track) {
        addTrack(value.enabled);
      }
      createOffer() {
        return offer;
      }
      close() {
        close();
      }
    },
  );

  click("Start rehearsal");
  click("Mute");
  expect(statusText()).toContain("Connecting Live Voice");
  expect(statusText()).toContain("Microphone muted");
  resolveMicrophone(stream);
  await vi.waitFor(() => expect(addTrack).toHaveBeenCalledWith(false));
  expect(track.enabled).toBe(false);

  events.onopen!();
  expect(statusText()).toBe("Microphone muted");
  events.onmessage!({
    data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Hello." }),
  });
  expect(statusText()).toBe("Microphone muted");
  events.onmessage!({ data: JSON.stringify({ type: "output_audio_buffer.started" }) });
  expect(statusText()).toContain("Bot Speaking");
  expect(statusText()).toContain("Microphone muted");
  events.onmessage!({ data: JSON.stringify({ type: "response.done" }) });
  expect(statusText()).toContain("Bot Speaking");
  events.onmessage!({ data: JSON.stringify({ type: "output_audio_buffer.stopped" }) });
  expect(statusText()).toBe("Microphone muted");
  events.onmessage!({
    data: JSON.stringify({
      type: "response.function_call_arguments.done",
      name: "search_knowledge",
      call_id: "tool-a",
      arguments: "{}",
    }),
  });
  expect(statusText()).toContain("Checking Approved Knowledge");
  expect(statusText()).toContain("Microphone muted");
  events.onmessage!({ data: JSON.stringify({ type: "response.done" }) });
  expect(statusText()).toContain("Checking Approved Knowledge");

  click("Unmute");
  expect(track.enabled).toBe(true);
  expect(statusText()).not.toContain("Microphone muted");
  events.onerror!();
  expect(statusText()).toBe("Live Voice Needs Attention");
  expect(track.stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  click("Reset live voice");
  expect(statusText()).toBe("Ready for a Voice Rehearsal");
  expect(track.stop).toHaveBeenCalledOnce();
  resolveOffer({ sdp: "v=0" });
  await Promise.resolve();
  expect(h.fetch.mock.calls.some(([url]) => url === "/api/voice/live/session")).toBe(false);
});
