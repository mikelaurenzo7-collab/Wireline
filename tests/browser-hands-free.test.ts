import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHandsFreeAvailable, browserHandsFreeSpeech } from "../src/lib/browser-hands-free";
function browser(prefixed = false) {
  const created: FakeRecognition[] = [];
  class FakeRecognition {
    lang = "";
    continuous = true;
    interimResults = true;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onresult:
      | ((event: { results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
      | null = null;
    start = vi.fn();
    abort = vi.fn();
    constructor() {
      created.push(this);
    }
  }
  class Utterance {
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    lang = "";
    constructor(public text: string) {}
  }
  const synthesis = { speak: vi.fn(), cancel: vi.fn() };
  const scope = {
    isSecureContext: true,
    [prefixed ? "webkitSpeechRecognition" : "SpeechRecognition"]: FakeRecognition,
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: Utterance,
  };
  vi.stubGlobal("window", scope);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  return { created, scope, synthesis };
}
afterEach(() => vi.unstubAllGlobals());
describe("browser speech adapter", () => {
  it("does not capture or play audio on capability checks", () => {
    const b = browser();
    expect(browserHandsFreeAvailable()).toBe(true);
    expect(b.created).toHaveLength(0);
    expect(b.synthesis.speak).not.toHaveBeenCalled();
  });
  it("requires secure input and output capabilities", () => {
    const b = browser();
    b.scope.isSecureContext = false;
    expect(browserHandsFreeAvailable()).toBe(false);
    vi.stubGlobal("window", { isSecureContext: true, speechSynthesis: b.synthesis });
    expect(browserHandsFreeAvailable()).toBe(false);
  });
  it.each([false, true])(
    "supports standard/prefixed recognition (%s) and detaches before abort",
    (prefixed) => {
      const b = browser(prefixed);
      const events = { started: vi.fn(), result: vi.fn(), error: vi.fn(), ended: vi.fn() };
      const stop = browserHandsFreeSpeech().listen(events);
      const recognition = b.created[0]!;
      expect(recognition.lang).toBe("en-US");
      expect(recognition.continuous).toBe(false);
      recognition.onresult!({ results: [{ isFinal: false, 0: { transcript: "send task" } }] });
      expect(events.result).not.toHaveBeenCalled();
      recognition.onresult!({ results: [{ isFinal: true, 0: { transcript: "My exact note" } }] });
      expect(events.result).toHaveBeenCalledExactlyOnceWith("My exact note");
      stop();
      expect(recognition.onresult).toBeNull();
      expect(recognition.onend).toBeNull();
      expect(recognition.abort).toHaveBeenCalledOnce();
    },
  );
  it.each(["not-allowed", "service-not-allowed", "no-speech", "network", "audio-capture"])(
    "reports %s without restarting",
    (error) => {
      const b = browser();
      const events = { started: vi.fn(), result: vi.fn(), error: vi.fn(), ended: vi.fn() };
      browserHandsFreeSpeech().listen(events);
      b.created[0]!.onerror!({ error });
      expect(events.error).toHaveBeenCalledOnce();
      expect(b.created).toHaveLength(1);
    },
  );
  it("uses device speech and cancels without a stale completion", () => {
    const b = browser();
    const done = vi.fn();
    const stop = browserHandsFreeSpeech().speak("Private note saved.", done, vi.fn());
    const utterance = b.synthesis.speak.mock.calls[0]![0];
    expect(utterance.text).toBe("Private note saved.");
    stop();
    expect(utterance.onend).toBeNull();
    expect(utterance.onerror).toBeNull();
    expect(b.synthesis.cancel).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  });
});
