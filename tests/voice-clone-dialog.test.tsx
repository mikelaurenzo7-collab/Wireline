import { Buffer } from "node:buffer";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceCloneDialog from "../src/components/voice/VoiceCloneDialog";
import {
  encodeVoiceRecording,
  voiceAudioBase64,
} from "../src/components/voice/voice-clone-recording";
import {
  inspectPcm16MonoWav,
  VOICE_REFERENCE_SAMPLE_RATES,
} from "../src/lib/voice/voice-reference-audio";
import {
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_CLONE_CONSENT_TEXT,
} from "../src/lib/voice-clone-contract";

type Slot = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  effects: [] as Array<() => void>,
  getUserMedia: vi.fn(),
  stopTrack: vi.fn(),
  closed: vi.fn(),
  disconnect: vi.fn(),
  create: vi.fn(),
  closeDialog: vi.fn(),
  revokeUrl: vi.fn(),
  createUrl: vi.fn(),
  contexts: [] as Array<{ processor: { onaudioprocess: null | ((event: unknown) => void) } }>,
  failure: "" as "" | "context" | "processor" | "resume",
  resumePromise: null as Promise<void> | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => "voice-clone-test",
  useState(initial: unknown) {
    const slot = (h.slots[h.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (value: unknown) => {
        slot.value = typeof value === "function" ? value(slot.value) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.cursor++] ??= { value: { current: initial } }).value;
  },
  useLayoutEffect(callback: () => void | (() => void), dependencies: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (
      !slot.dependencies ||
      dependencies.some((value, index) => !Object.is(value, slot.dependencies![index]))
    ) {
      slot.dependencies = dependencies;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  },
}));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  Dialog: "dialog",
  DialogContent: "content",
  DialogDescription: "description",
  DialogFooter: "footer",
  DialogHeader: "header",
  DialogTitle: "title",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "checkbox" }));

type Props = {
  children?: ReactNode;
  id?: string;
  type?: string;
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  onClick?: () => unknown;
  onChange?: (event: unknown) => unknown;
  onOpenChange?: (value: boolean) => void;
};
function nodes(node: ReactNode): Array<ReactElement<Props>> {
  return Array.isArray(node)
    ? node.flatMap(nodes)
    : isValidElement<Props>(node)
      ? [node, ...nodes(node.props.children)]
      : [];
}
function text(node: ReactNode): string {
  return typeof node === "string"
    ? node
    : typeof node === "number"
      ? String(node)
      : Array.isArray(node)
        ? node.map(text).join("")
        : isValidElement<Props>(node)
          ? text(node.props.children)
          : "";
}
let open = true;
let agentName = "Front Desk";
function render() {
  h.cursor = 0;
  const tree = VoiceCloneDialog({ open, agentName, onClose: h.closeDialog, onCreate: h.create });
  h.effects.splice(0).forEach((effect) => effect());
  return nodes(tree);
}
function button(label: string) {
  return render().find((node) => node.type === "button" && text(node) === label)!;
}
function field(suffix: string) {
  return render().find((node) => node.props.id === `voice-clone-test-${suffix}`)!;
}
function messages() {
  return render()
    .map((node) => text(node.props.children))
    .join(" ");
}
async function flush() {
  for (let index = 0; index < 30; index++) await Promise.resolve();
}
function wav(seconds = 6, rate = 24_000) {
  return encodeVoiceRecording([new Float32Array(seconds * rate).fill(0.2)], rate);
}
async function upload(bytes = wav(), label = "my-voice.wav", size = bytes.length) {
  const file = { name: label, size, arrayBuffer: async () => new Uint8Array(bytes).buffer };
  render().find((node) => node.props.type === "file")!.props.onChange!({
    currentTarget: { files: [file], value: "file" },
  });
  await flush();
}
function consent() {
  field("consent").props.onChange!({ target: { checked: true } });
}
function pushSamples(seconds: number, rate = 48_000) {
  h.contexts.at(-1)!.processor.onaudioprocess!({
    inputBuffer: { getChannelData: () => new Float32Array(seconds * rate).fill(0.15) },
  });
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.contexts = [];
  h.failure = "";
  h.resumePromise = null;
  for (const fn of [
    h.getUserMedia,
    h.stopTrack,
    h.closed,
    h.disconnect,
    h.create,
    h.closeDialog,
    h.revokeUrl,
    h.createUrl,
  ])
    fn.mockReset();
  h.create.mockResolvedValue(undefined);
  h.createUrl.mockReturnValue("blob:voice-preview");
  h.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: h.stopTrack }] });
  class Context {
    sampleRate = 48_000;
    destination = {};
    processor = {
      onaudioprocess: null as null | ((event: unknown) => void),
      connect() {},
      disconnect: h.disconnect,
    };
    constructor() {
      if (h.failure === "context") throw new Error("Audio context failed.");
      h.contexts.push(this);
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect: h.disconnect };
    }
    createScriptProcessor() {
      if (h.failure === "processor") throw new Error("Audio processor failed.");
      return this.processor;
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect: h.disconnect };
    }
    resume() {
      return h.failure === "resume"
        ? Promise.reject(new Error("Audio resume failed."))
        : h.resumePromise || Promise.resolve();
    }
    close() {
      h.closed();
      return Promise.resolve();
    }
  }
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: h.getUserMedia } });
  vi.stubGlobal("window", {
    AudioContext: Context,
    location: { href: "https://botbound.app/studio?agent=one" },
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation(h.createUrl);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(h.revokeUrl);
  open = true;
  agentName = "Front Desk";
  render();
  render();
});
afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("voice clone dialog", () => {
  it("opens without microphone access, with unchecked speaker consent and an unavailable Save", () => {
    expect(h.getUserMedia).not.toHaveBeenCalled();
    expect(field("name").props.value).toBe("Front Desk voice");
    expect(field("consent").props.checked).toBe(false);
    expect(button("Save voice").props.disabled).toBe(true);
    expect(messages()).toContain(VOICE_CLONE_CONSENT_TEXT);
    expect(messages()).toContain("private preview");
  });

  it("validates upload before enabling consent, then submits exactly the consented audio", async () => {
    await upload();
    expect(field("consent").props.disabled).toBe(false);
    expect(button("Save voice").props.disabled).toBe(true);
    consent();
    button("Save voice").props.onClick!();
    button("Saving voice…").props.onClick!();
    await flush();
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith({
      name: "Front Desk voice",
      referenceAudioBase64: voiceAudioBase64(wav()),
      consentAccepted: true,
      consentVersion: VOICE_ASSET_CONSENT_VERSION,
    });
    expect(h.closeDialog).toHaveBeenCalledTimes(1);
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  it("shows malformed and oversized upload errors and permits choosing a valid file afterward", async () => {
    await upload(new Uint8Array([1, 2, 3]));
    expect(messages()).toContain("mono PCM 16-bit WAV");
    expect(button("Save voice").props.disabled).toBe(true);
    await upload(wav(), "large.wav", 2_000_001);
    expect(messages()).toContain("smaller than 2 MB");
    await upload();
    expect(messages()).not.toContain("smaller than 2 MB");
    expect(messages()).toContain("my-voice.wav");
  });

  it("records only on Start, stops media, resamples, and makes a local preview", async () => {
    button("Start recording").props.onClick!();
    await flush();
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    pushSamples(6);
    button("Stop recording").props.onClick!();
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
    expect(h.closed).toHaveBeenCalledTimes(1);
    expect(messages()).toContain("Recorded voice · 6.0s");
    expect(field("consent").props.checked).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("caps recording at twenty seconds and requires fresh consent after redo", async () => {
    await upload();
    consent();
    button("Record again").props.onClick!();
    await flush();
    pushSamples(22);
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
    expect(messages()).toContain("Recorded voice · 20.0s");
    expect(field("consent").props.checked).toBe(false);
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:voice-preview");
  });

  it("keeps short recordings unsaved and allows retry", async () => {
    button("Start recording").props.onClick!();
    await flush();
    pushSamples(3);
    button("Stop recording").props.onClick!();
    expect(messages()).toContain("Record between 6 and 20 seconds");
    expect(button("Save voice").props.disabled).toBe(true);
    expect(button("Start recording").props.disabled).toBe(false);
  });

  for (const failure of ["context", "processor", "resume"] as const) {
    it(`releases acquired microphone on ${failure} failure`, async () => {
      h.failure = failure;
      button("Start recording").props.onClick!();
      await flush();
      expect(h.stopTrack).toHaveBeenCalledTimes(1);
      expect(h.closed).toHaveBeenCalledTimes(failure === "context" ? 0 : 1);
      expect(button("Start recording").props.disabled).toBe(false);
      expect(h.create).not.toHaveBeenCalled();
    });
  }

  it("stops a microphone granted after the dialog is closed without creating a context", async () => {
    let grant!: (value: unknown) => void;
    h.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    button("Start recording").props.onClick!();
    open = false;
    render();
    grant({ getTracks: () => [{ stop: h.stopTrack }] });
    await flush();
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
    expect(h.contexts).toHaveLength(0);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("does not request microphone permission twice before the first request resolves", async () => {
    let grant!: (value: unknown) => void;
    h.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    const start = button("Start recording").props.onClick!;
    start();
    start();
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    grant({ getTracks: () => [{ stop: h.stopTrack }] });
    await flush();
    expect(button("Stop recording").props.disabled).toBe(false);
  });

  it("recovers from denied microphone permission without creating audio resources", async () => {
    h.getUserMedia.mockRejectedValueOnce(new Error("Microphone permission denied."));
    button("Start recording").props.onClick!();
    await flush();
    expect(messages()).toContain("Microphone permission denied.");
    expect(h.contexts).toHaveLength(0);
    expect(button("Start recording").props.disabled).toBe(false);
    expect(button("Upload WAV").props.disabled).toBe(false);
  });

  it("does not resurrect a stopped recording when audio resume resolves late", async () => {
    let resume!: () => void;
    h.resumePromise = new Promise<void>((resolve) => {
      resume = resolve;
    });
    button("Start recording").props.onClick!();
    await flush();
    pushSamples(20);
    resume();
    await flush();
    expect(messages()).toContain("Recorded voice · 20.0s");
    expect(render().some((node) => node.type === "button" && text(node) === "Stop recording")).toBe(
      false,
    );
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
    expect(h.closed).toHaveBeenCalledTimes(1);
  });

  it("ignores an uploaded file that finishes reading after switching Bots", async () => {
    let read!: (value: ArrayBuffer) => void;
    const promise = new Promise<ArrayBuffer>((resolve) => {
      read = resolve;
    });
    render().find((node) => node.props.type === "file")!.props.onChange!({
      currentTarget: {
        files: [{ name: "old-voice.wav", size: wav().length, arrayBuffer: () => promise }],
        value: "file",
      },
    });
    agentName = "Sales";
    render();
    render();
    read(new Uint8Array(wav()).buffer);
    await flush();
    expect(messages()).not.toContain("old-voice.wav");
    expect(h.createUrl).not.toHaveBeenCalled();
    expect(field("name").props.value).toBe("Sales voice");
  });

  it("closing or switching Bots releases active media and revokes local audio", async () => {
    await upload();
    agentName = "Sales";
    render();
    render();
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:voice-preview");
    expect(field("name").props.value).toBe("Sales voice");
    button("Start recording").props.onClick!();
    await flush();
    open = false;
    render();
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
    expect(h.closed).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed save's recording and consent ready for an explicit retry", async () => {
    h.create.mockRejectedValueOnce(new Error("Voice storage is temporarily unavailable."));
    await upload();
    consent();
    button("Save voice").props.onClick!();
    await flush();
    expect(messages()).toContain("Voice storage is temporarily unavailable.");
    expect(button("Save voice").props.disabled).toBe(false);
    expect(field("consent").props.checked).toBe(true);
    button("Save voice").props.onClick!();
    await flush();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.closeDialog).toHaveBeenCalledTimes(1);
  });

  it("stops local playback when removing the recording or detaching the player", async () => {
    await upload();
    const audio = { pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() };
    const attach = (
      render().find((node) => node.type === "audio")!.props as unknown as {
        ref: (value: unknown) => void;
      }
    ).ref;
    attach(audio);
    button("Remove recording").props.onClick!();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
    expect(audio.load).toHaveBeenCalledTimes(1);
    attach(null);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it("ignores a late save error after closing and reopening a new Bot", async () => {
    let reject!: (error: Error) => void;
    h.create.mockReturnValue(
      new Promise((_resolve, decline) => {
        reject = decline;
      }),
    );
    await upload();
    consent();
    button("Save voice").props.onClick!();
    open = false;
    render();
    open = true;
    agentName = "Sales";
    render();
    render();
    reject(new Error("Old Bot request failed."));
    await flush();
    expect(messages()).not.toContain("Old Bot request failed.");
    expect(field("name").props.value).toBe("Sales voice");
    expect(h.closeDialog).not.toHaveBeenCalled();
    expect(button("Save voice").props.disabled).toBe(true);
  });
});

describe("portable microphone encoding", () => {
  it.each([16_000, 22_050, 24_000, 44_100, 48_000, 96_000])(
    "resamples %i Hz to six seconds of mono 24kHz PCM16",
    (rate) => {
      const bytes = wav(6, rate);
      expect(
        inspectPcm16MonoWav(bytes, {
          maxBytes: 2_000_000,
          minDurationSeconds: 6,
          maxDurationSeconds: 20,
          sampleRates: VOICE_REFERENCE_SAMPLE_RATES,
        }),
      ).toMatchObject({ sampleRateHz: 24_000, channels: 1, bitsPerSample: 16, durationSeconds: 6 });
      const decoded = Uint8Array.from(atob(voiceAudioBase64(bytes)), (character) =>
        character.charCodeAt(0),
      );
      expect(Buffer.from(decoded).equals(Buffer.from(bytes))).toBe(true);
    },
  );
  it("clamps microphone peaks and rejects invalid or overlong samples", () => {
    const input = new Float32Array(6 * 24_000);
    input[0] = -2;
    input[1] = 2;
    const bytes = encodeVoiceRecording([input], 24_000);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(-32_768);
    expect(view.getInt16(46, true)).toBe(32_767);
    expect(() => encodeVoiceRecording([new Float32Array(21 * 24_000)], 24_000)).toThrow();
    expect(() => encodeVoiceRecording([input], 0)).toThrow();
    input[0] = Number.NaN;
    expect(() => encodeVoiceRecording([input], 24_000)).toThrow();
  });
});
