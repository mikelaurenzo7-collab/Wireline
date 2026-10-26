import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioVoiceRehearsal from "../src/components/StudioVoiceRehearsal";

type Slot = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
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
  useCallback(callback: unknown, dependencies: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (
      !slot.dependencies ||
      dependencies.some((value, index) => !Object.is(value, slot.dependencies![index]))
    ) {
      slot.dependencies = dependencies;
      slot.value = callback;
    }
    return slot.value;
  },
  useEffect(callback: () => void | (() => void), dependencies: readonly unknown[]) {
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
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Badge: "badge" }));
vi.mock("../src/components/OpenAILiveVoiceSandbox", () => ({ default: "live-rehearsal" }));
vi.mock("../src/components/voice/TestCallLink", () => ({ default: "call-link" }));

type Props = {
  children?: ReactNode;
  onClick?: () => void;
  "aria-pressed"?: boolean;
  "aria-label"?: string;
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
    : Array.isArray(node)
      ? node.map(text).join("")
      : isValidElement<Props>(node)
        ? text(node.props.children)
        : "";
}
function render() {
  h.cursor = 0;
  const tree = StudioVoiceRehearsal({ agentId: "bot-a", agentName: "Front Desk" });
  h.effects.splice(0).forEach((effect) => effect());
  return nodes(tree);
}
function button() {
  const result = render().find(
    (node) =>
      node.type === "button" &&
      ["Hear Voice: Founder", "Pause Preview: Founder"].includes(node.props["aria-label"] ?? ""),
  );
  expect(result).toBeDefined();
  return result!;
}
function unmount() {
  h.slots.forEach((slot) => {
    slot.cleanup?.();
    slot.cleanup = undefined;
  });
}
async function flush() {
  for (let index = 0; index < 50; index++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
function audioResponse(blob: () => Promise<Blob>) {
  return { ok: true, blob } as Response;
}
let preview: (init: RequestInit) => Promise<Response>;
let playback: () => Promise<void>;
let instances: FakeAudio[];
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(playback);
  constructor(readonly src: string) {
    instances.push(this);
  }
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset();
  h.createUrl.mockReset().mockImplementation(() => "blob:preview-" + instances.length);
  h.revokeUrl.mockReset();
  vi.spyOn(URL, "createObjectURL").mockImplementation(h.createUrl);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(h.revokeUrl);
  vi.stubGlobal("Audio", FakeAudio);
  instances = [];
  playback = async () => undefined;
  preview = async () => audioResponse(async () => new Blob(["voice"]));
  h.fetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url === "/api/voice/live-voices") {
      return new Response(
        JSON.stringify({
          voices: [
            {
              id: "clone-a",
              name: "Founder",
              speaksOnCalls: true,
              inUseByAgentIds: ["bot-a"],
            },
          ],
        }),
      );
    }
    expect(url).toBe("/api/voice/live-voices/clone-a/preview?variant=clone&agentName=Front+Desk");
    return preview(init);
  });
});
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Studio cloned voice preview lifecycle", () => {
  it.each([
    ["stop", "fetch"],
    ["stop", "blob"],
    ["unmount", "fetch"],
    ["unmount", "blob"],
  ] as const)("ignores a late %s-cancelled %s result", async (cancel, phase) => {
    const response = deferred<Response>();
    const blob = deferred<Blob>();
    const readBlob = vi.fn(() => blob.promise);
    let signal: AbortSignal | null | undefined;
    preview = (init) => {
      signal = init.signal;
      return phase === "fetch" ? response.promise : Promise.resolve(audioResponse(readBlob));
    };
    render();
    await flush();
    button().props.onClick!();
    await flush();
    expect(button().props["aria-pressed"]).toBe(true);
    expect(text(button())).toBe("Pause Preview");
    if (phase === "blob") expect(readBlob).toHaveBeenCalledOnce();

    if (cancel === "stop") button().props.onClick!();
    else unmount();
    expect(signal?.aborted).toBe(true);
    if (cancel === "stop") {
      expect(button().props["aria-pressed"]).toBe(false);
      expect(text(button())).toBe("Hear Voice");
    }

    // Resolve despite abort to cover providers that do not honor cancellation.
    if (phase === "fetch") response.resolve(audioResponse(readBlob));
    blob.resolve(new Blob(["late voice"]));
    await flush();
    if (phase === "fetch") expect(readBlob).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
    expect(h.createUrl).not.toHaveBeenCalled();
    expect(h.revokeUrl).not.toHaveBeenCalled();
  });

  it("does not let an old play rejection or event stop a newer preview", async () => {
    const firstPlay = deferred<void>();
    playback = () => firstPlay.promise;
    render();
    await flush();
    button().props.onClick!();
    await flush();
    expect(instances).toHaveLength(1);
    const first = instances[0];
    const lateEnded = first.onended!;
    expect(first.play).toHaveBeenCalledOnce();

    button().props.onClick!();
    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.onended).toBeNull();
    expect(first.onerror).toBeNull();
    expect(h.revokeUrl).toHaveBeenCalledExactlyOnceWith(first.src);

    playback = async () => undefined;
    button().props.onClick!();
    await flush();
    expect(instances).toHaveLength(2);
    const second = instances[1];
    expect(second.play).toHaveBeenCalledOnce();
    firstPlay.reject(new Error("Playback interrupted by pause"));
    lateEnded();
    await flush();
    expect(button().props["aria-pressed"]).toBe(true);
    expect(second.pause).not.toHaveBeenCalled();
    expect(h.revokeUrl).toHaveBeenCalledExactlyOnceWith(first.src);

    unmount();
    expect(second.pause).toHaveBeenCalledOnce();
    expect(h.revokeUrl.mock.calls).toEqual([[first.src], [second.src]]);
  });
});
