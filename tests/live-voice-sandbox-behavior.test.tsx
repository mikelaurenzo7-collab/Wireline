import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  callbacks: [] as Array<{ value: unknown; deps: unknown[] }>,
  effects: [] as Array<{ deps: unknown[]; cleanup?: () => void }>,
  pending: [] as Array<() => void>,
  stateCursor: 0,
  refCursor: 0,
  callbackCursor: 0,
  effectCursor: 0,
  fetch: vi.fn(),
  getUserMedia: vi.fn(),
  trackStop: vi.fn(),
  started: vi.fn(),
  completed: vi.fn(),
  iceState: "complete",
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
  useCallback: (value: unknown, deps: unknown[]) => {
    const index = h.callbackCursor++;
    const previous = h.callbacks[index];
    if (!previous || deps.some((d, i) => !Object.is(d, previous.deps[i])))
      h.callbacks[index] = { value, deps };
    return h.callbacks[index].value;
  },
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    const index = h.effectCursor++;
    const previous = h.effects[index];
    if (!previous || deps.some((d, i) => !Object.is(d, previous.deps[i]))) {
      h.pending.push(() => {
        previous?.cleanup?.();
        h.effects[index] = { deps, cleanup: effect() };
      });
    }
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/AgentFace", () => ({ default: "agent-face" }));
vi.mock("../src/components/molecules", () => ({
  ConversationActivity: "voice-activity",
  ConversationMessage: "voice-message",
  StatusNotice: "aside",
}));

import OpenAILiveVoiceSandbox from "../src/components/OpenAILiveVoiceSandbox";

class FakePeer {
  static instances: FakePeer[] = [];
  iceGatheringState = h.iceState;
  connectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  events = {
    readyState: "open",
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as (() => void) | null,
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
  };
  constructor() {
    FakePeer.instances.push(this);
  }
  createDataChannel = () => this.events;
  addTrack = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  createOffer = async () => ({ type: "offer", sdp: "v=0\r\no=test\r\n" });
  setLocalDescription = async (offer: { type: string; sdp: string }) => {
    this.localDescription = offer;
  };
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn();
}

type Props = { children?: ReactNode; onClick?: () => void; label?: string };
function descendants(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Props>;
  return [element, ...descendants(element.props.children)];
}
function render(agentId = "agent-a") {
  h.stateCursor = h.refCursor = h.callbackCursor = h.effectCursor = 0;
  const elements = descendants(
    OpenAILiveVoiceSandbox({
      agentId,
      agentName: agentId,
      onTestStarted: h.started,
      onTestCompleted: h.completed,
    }),
  );
  h.pending.splice(0).forEach((effect) => effect());
  return elements;
}
function button() {
  const handler = render().find((e) => e.type === "button")?.props.onClick;
  if (!handler) throw new Error("Missing voice control");
  return handler;
}
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}
async function start() {
  button()();
  await settle();
  return FakePeer.instances[0];
}
async function event(peer: FakePeer, value: unknown) {
  peer.events.onmessage?.({ data: JSON.stringify(value) });
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  h.states = [];
  h.refs = [];
  h.callbacks = [];
  h.effects = [];
  h.pending = [];
  h.iceState = "complete";
  FakePeer.instances = [];
  h.fetch.mockResolvedValue(Response.json({ sdp: "v=0\r\nanswer\r\n", maxDurationSeconds: 300 }));
  h.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: h.trackStop }] });
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: h.getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", FakePeer);
});
afterEach(() => {
  h.effects.forEach((effect) => effect.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live voice session lifecycle", () => {
  it("admits one start when a control fires twice before React renders", async () => {
    const click = button();
    click();
    click();
    await settle();
    expect(h.getUserMedia).toHaveBeenCalledOnce();
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("does not create a paid session after the user ends ICE gathering", async () => {
    h.iceState = "gathering";
    await start();
    button()();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.trackStop).toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("ignores a late signaling response after the test is stopped", async () => {
    let resolve!: (response: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const peer = await start();
    button()();
    resolve(Response.json({ sdp: "v=0\r\nanswer\r\n" }));
    await settle();
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops the old Bot's session when the selected Bot changes", async () => {
    const peer = await start();
    render("agent-b");
    expect(peer.close).toHaveBeenCalled();
    expect(h.trackStop).toHaveBeenCalled();
  });

  it("accumulates transcript deltas and replaces them with the final transcript", async () => {
    const peer = await start();
    for (const delta of ["Book ", "a visit"]) {
      await event(peer, {
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "item-1",
        delta,
      });
    }
    expect(render().find((e) => e.type === "voice-message")?.props.children).toBe("Book a visit");
    await event(peer, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-1",
      transcript: "Book a visit.",
    });
    expect(render().find((e) => e.type === "voice-message")?.props.children).toBe("Book a visit.");
  });

  it.each(["failed", "cancelled", "incomplete"])(
    "does not certify a %s response as a completed test",
    async (status) => {
      const peer = await start();
      peer.events.onopen?.();
      await event(peer, { type: "response.done", response: { status, output: [] } });
      expect(h.completed).not.toHaveBeenCalled();
    },
  );

  it("waits for an assistant answer instead of certifying a tool-only response", async () => {
    const peer = await start();
    peer.events.onopen?.();
    await event(peer, {
      type: "response.done",
      response: { status: "completed", output: [{ type: "function_call" }] },
    });
    expect(h.completed).not.toHaveBeenCalled();
    const answer = {
      type: "response.done",
      response: { status: "completed", output: [{ type: "message", role: "assistant" }] },
    };
    await event(peer, answer);
    await event(peer, answer);
    expect(h.completed).toHaveBeenCalledOnce();
  });
});
