import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceClonePanel from "../src/components/voice/VoiceClonePanel";
import {
  VOICE_ASSET_CONSENT_VERSION,
  type VoiceCloneCreateInput,
} from "../src/lib/voice-clone-contract";
import { encodeVoiceRecording } from "../src/components/voice/voice-clone-recording";

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
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "checkbox" }));
vi.mock("../src/components/voice/VoiceCloneDialog", () => ({ default: "clone-dialog" }));

type Row = {
  id: string;
  name: string;
  status: string;
  version: number;
  sourceSha256: string;
  durationSeconds: number;
  sampleRateHz: number;
  createdAt: string;
  reviewedAt: string | null;
  revokedAt: string | null;
};
type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
  checked?: boolean;
  open?: boolean;
  onClick?: () => unknown;
  onChange?: (event: unknown) => unknown;
  onCreate?: (input: VoiceCloneCreateInput) => Promise<void>;
  onClose?: () => void;
  ref?: (value: unknown) => void;
  autoPlay?: boolean;
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
let ownerId = "owner-a";
let agentId = "bot-a";
let caps: unknown;
let rows: Row[];
let mutation: (url: string, init: RequestInit) => Promise<Response>;
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function asset(status = "pending_review", version = 1, index = 1): Row {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    name: `My voice ${index}`,
    status,
    version,
    sourceSha256: "a".repeat(64),
    durationSeconds: 6,
    sampleRateHz: 24_000,
    createdAt: "2026-10-17T12:00:00.000Z",
    reviewedAt: status === "approved" ? "2026-10-17T12:01:00.000Z" : null,
    revokedAt: null,
  };
}
function validCaps() {
  return {
    available: true,
    scope: "private_preview",
    engineReady: true,
    consentVersion: VOICE_ASSET_CONSENT_VERSION,
    qualityCheckVersion: "voice-reference-quality-v1-2026-10-17",
    previewReserveUsd: 0.002,
    maxReferenceBytes: 2_000_000,
    minReferenceSeconds: 6,
    maxReferenceSeconds: 20,
  };
}
function render() {
  h.cursor = 0;
  const tree = VoiceClonePanel({ ownerId, agentId, agentName: "Front Desk" });
  h.effects.splice(0).forEach((effect) => effect());
  return nodes(tree);
}
function button(name: string) {
  return render().find(
    (node) => node.type === "button" && (node.props["aria-label"] === name || text(node) === name),
  )!;
}
function copy() {
  return render()
    .map((node) => text(node.props.children))
    .join(" ");
}
function dialog() {
  return render().find((node) => node.type === "clone-dialog")!;
}
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function ready() {
  render();
  await flush();
  render();
}
function audioResponse() {
  return new Response(
    new Uint8Array(encodeVoiceRecording([new Float32Array(6 * 24_000)], 24_000)).buffer,
    { headers: { "Content-Type": "audio/wav" } },
  );
}
function body(init: RequestInit) {
  return JSON.parse(String(init.body));
}
const createInput: VoiceCloneCreateInput = {
  name: "New voice",
  referenceAudioBase64: "V0FW",
  consentAccepted: true,
  consentVersion: VOICE_ASSET_CONSENT_VERSION,
};

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset();
  h.createUrl.mockReset().mockReturnValue("blob:generated-voice");
  h.revokeUrl.mockReset();
  vi.spyOn(URL, "createObjectURL").mockImplementation(h.createUrl);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(h.revokeUrl);
  ownerId = "owner-a";
  agentId = "bot-a";
  caps = validCaps();
  rows = [asset()];
  mutation = async () => {
    throw new Error("Unexpected write.");
  };
  h.fetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/capabilities")) return json(caps);
    if (url === "/api/voice/assets" && !init.method) return json({ assets: rows });
    return mutation(url, init);
  });
});
afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
  vi.restoreAllMocks();
});

describe("private voice clone panel", () => {
  it("probes capabilities first and makes no list or provider requests when closed", async () => {
    caps = { available: false };
    await ready();
    expect(render()).toEqual([]);
    expect(h.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/voice/assets/capabilities"]);
  });

  it("fails closed for an unrecognized capability or consent version", async () => {
    caps = { ...validCaps(), consentVersion: "old-consent" };
    await ready();
    expect(render()).toEqual([]);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("lists saved references without starting audio and discloses the unchanged call voice", async () => {
    await ready();
    expect(copy()).toContain("Private previews only. Call voice stays unchanged.");
    expect(copy()).toContain("Review needed");
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.createUrl).not.toHaveBeenCalled();
    expect(button("Approve private preview")).toBeUndefined();
  });

  it("requires the review checkbox and sends the precise version and source hash", async () => {
    await ready();
    mutation = async (url, init) => {
      expect(url).toBe(`/api/voice/assets/${rows[0].id}/review`);
      expect(body(init)).toEqual({
        expectedVersion: 1,
        sourceSha256: rows[0].sourceSha256,
        qualityCheckVersion: validCaps().qualityCheckVersion,
      });
      return json({ asset: asset("approved", 2) });
    };
    button("Review My voice 1").props.onClick!();
    expect(button("Approve private preview").props.disabled).toBe(true);
    render().find((node) => node.type === "checkbox")!.props.onChange!({
      target: { checked: true },
    });
    button("Approve private preview").props.onClick!();
    await flush();
    expect(copy()).toContain("Ready to preview");
    expect(button("Preview My voice 1").props.disabled).toBe(false);
    expect(h.createUrl).not.toHaveBeenCalled();
  });

  it("retains the saved row on a malformed mutation and requires Reload", async () => {
    await ready();
    mutation = async () =>
      json({ asset: { ...asset("approved", 2), id: asset("approved", 2, 2).id } });
    button("Review My voice 1").props.onClick!();
    render().find((node) => node.type === "checkbox")!.props.onChange!({
      target: { checked: true },
    });
    button("Approve private preview").props.onClick!();
    await flush();
    expect(copy()).toContain("could not be verified");
    expect(copy()).toContain("Review needed");
    expect(button("Add voice").props.disabled).toBe(true);
    expect(button("Reload saved voices").props.disabled).toBe(false);
  });

  it("recovers a 409 only through an explicit Reload", async () => {
    await ready();
    mutation = async () => json({ error: "This voice reference changed." }, 409);
    button("Delete My voice 1").props.onClick!();
    button("Confirm delete My voice 1").props.onClick!();
    await flush();
    expect(copy()).toContain("Reload saved voices before continuing.");
    expect(h.fetch).toHaveBeenCalledTimes(3);
    rows = [asset("approved", 2)];
    button("Reload saved voices").props.onClick!();
    await flush();
    expect(copy()).toContain("Ready to preview");
    expect(button("Add voice").props.disabled).toBe(false);
  });

  it("confirms deletion before making a request and removes only a verified deleted row", async () => {
    await ready();
    mutation = async (_url, init) => {
      expect(init.method).toBe("DELETE");
      expect(body(init)).toEqual({ expectedVersion: 1 });
      return json({ asset: { ...asset("deleted", 2), revokedAt: "2026-10-17T12:02:00.000Z" } });
    };
    button("Delete My voice 1").props.onClick!();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    button("Keep voice").props.onClick!();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    button("Delete My voice 1").props.onClick!();
    button("Confirm delete My voice 1").props.onClick!();
    await flush();
    expect(copy()).toContain("No voice recordings saved.");
  });

  it("uses explicit metered Preview and exposes validated WAV only after the response", async () => {
    rows = [asset("approved", 2)];
    await ready();
    expect(copy()).toContain("Preview reserves $0.002 of AI allowance.");
    mutation = async (url, init) => {
      expect(url).toContain("/preview");
      expect(body(init)).toEqual({
        expectedVersion: 2,
        expectedReserveUsd: validCaps().previewReserveUsd,
      });
      return audioResponse();
    };
    button("Preview My voice 1").props.onClick!();
    await flush();
    const audio = render().find((node) => node.type === "audio")!;
    expect(audio.props["aria-label"]).toBe("Generated preview of My voice 1");
    expect(audio.props.autoPlay).not.toBe(true);
    expect(h.createUrl).toHaveBeenCalledTimes(1);
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });

  it("cancels pending previews, ignores a late WAV, and allows safe explicit deletion", async () => {
    rows = [asset("approved", 2)];
    await ready();
    let answer!: (response: Response) => void;
    let previewSignal: AbortSignal | undefined;
    mutation = async (_url, init) => {
      previewSignal = init.signal as AbortSignal;
      return new Promise((resolve) => {
        answer = resolve;
      });
    };
    button("Preview My voice 1").props.onClick!();
    button("Cancel preview for My voice 1").props.onClick!();
    expect(previewSignal?.aborted).toBe(true);
    expect(copy()).toContain("allowance reservation may remain");
    expect(button("Delete My voice 1").props.disabled).toBe(false);
    answer(audioResponse());
    await flush();
    expect(h.createUrl).not.toHaveBeenCalled();
    mutation = async () =>
      json({ asset: { ...asset("deleted", 3), revokedAt: "2026-10-17T12:02:00.000Z" } });
    button("Delete My voice 1").props.onClick!();
    button("Confirm delete My voice 1").props.onClick!();
    await flush();
    expect(copy()).toContain("No voice recordings saved.");
  });

  it.each([
    ["wrong media", () => new Response("not wave", { headers: { "Content-Type": "text/html" } })],
    [
      "invalid WAV",
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/wav" } }),
    ],
    [
      "oversized WAV",
      () =>
        new Response("data", {
          headers: { "Content-Type": "audio/wav", "Content-Length": "2880045" },
        }),
    ],
  ] as const)(
    "rejects %s without presenting a player or retrying provider work",
    async (_label, response) => {
      rows = [asset("approved", 2)];
      await ready();
      mutation = async () => response();
      button("Preview My voice 1").props.onClick!();
      await flush();
      expect(h.createUrl).not.toHaveBeenCalled();
      expect(h.fetch).toHaveBeenCalledTimes(3);
      expect(copy()).toContain("allowance reservation may remain");
      expect(button("Preview My voice 1").props.disabled).toBe(false);
    },
  );

  it("keeps saving and deleting available when the engine is not ready, with Preview disabled", async () => {
    caps = { ...validCaps(), engineReady: false };
    rows = [asset("approved", 2)];
    await ready();
    expect(button("Add voice").props.disabled).toBe(false);
    expect(button("Delete My voice 1").props.disabled).toBe(false);
    expect(button("Preview My voice 1").props.disabled).toBe(true);
    expect(copy()).toContain("Voice preview engine is unavailable.");
  });

  it("stops and revokes local playback before a deletion request", async () => {
    rows = [asset("approved", 2)];
    await ready();
    mutation = async () => audioResponse();
    button("Preview My voice 1").props.onClick!();
    await flush();
    const player = { pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() };
    render().find((node) => node.type === "audio")!.props.ref!(player);
    mutation = async () =>
      json({ asset: { ...asset("deleted", 3), revokedAt: "2026-10-17T12:02:00.000Z" } });
    button("Delete My voice 1").props.onClick!();
    button("Confirm delete My voice 1").props.onClick!();
    await flush();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(h.revokeUrl).toHaveBeenCalledWith("blob:generated-voice");
  });

  it("scopes late list and preview results away from another account or Bot", async () => {
    rows = [asset("approved", 2)];
    await ready();
    let answer!: (response: Response) => void;
    mutation = async () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    button("Preview My voice 1").props.onClick!();
    ownerId = "owner-b";
    agentId = "bot-b";
    rows = [];
    render();
    await flush();
    answer(audioResponse());
    await flush();
    expect(h.createUrl).not.toHaveBeenCalled();
    expect(copy()).toContain("No voice recordings saved.");
    expect(copy()).not.toContain("My voice 1");
    expect(dialog().key).toBe("owner-b:bot-b");
  });

  it("adds a verified recording through the scoped native dialog without generating speech", async () => {
    rows = [];
    await ready();
    button("Add voice").props.onClick!();
    expect(dialog().props.open).toBe(true);
    mutation = async (url, init) => {
      expect(url).toBe("/api/voice/assets");
      expect(body(init)).toEqual(createInput);
      return json({ asset: asset() }, 201);
    };
    await dialog().props.onCreate!(createInput);
    expect(copy()).toContain("My voice 1");
    expect(copy()).toContain("I have reviewed my recording.");
    expect(h.createUrl).not.toHaveBeenCalled();
  });

  it("blocks duplicate pending creates and ignores late creation after owner switch", async () => {
    rows = [];
    await ready();
    let answer!: (response: Response) => void;
    mutation = async () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    const oldCreate = dialog().props.onCreate!;
    const request = oldCreate(createInput);
    await expect(oldCreate(createInput)).rejects.toThrow("Reload saved voices");
    ownerId = "owner-b";
    render();
    await flush();
    answer(json({ asset: asset() }, 201));
    await expect(request).rejects.toThrow("view changed");
    expect(copy()).not.toContain("My voice 1");
  });

  it("rejects an old dialog callback invoked after switching accounts", async () => {
    rows = [];
    await ready();
    const oldCreate = dialog().props.onCreate!;
    ownerId = "owner-b";
    render();
    await flush();
    const requests = h.fetch.mock.calls.length;
    await expect(oldCreate(createInput)).rejects.toThrow("Reload saved voices");
    expect(h.fetch).toHaveBeenCalledTimes(requests);
  });

  it("limits retained references to five and never hides an overflowing server list", async () => {
    rows = Array.from({ length: 5 }, (_, index) => asset("pending_review", 1, index + 1));
    await ready();
    expect(button("Add voice").props.disabled).toBe(true);
    expect(copy()).toContain("Five voices saved");
    rows.push(asset("pending_review", 1, 6));
    button("Reload saved voices").props.onClick!();
    await flush();
    expect(copy()).toContain("Saved voices could not be verified");
    expect(copy()).not.toContain("My voice 6");
    expect(button("Add voice").props.disabled).toBe(true);
  });

  it("exposes Reload when an authorized panel's initial list fails", async () => {
    h.fetch.mockImplementation(async (url: string) =>
      url.endsWith("capabilities")
        ? json(validCaps())
        : json({ error: "Voice storage is temporarily unavailable." }, 503),
    );
    await ready();
    expect(copy()).toContain("Voice storage is temporarily unavailable.");
    expect(button("Reload saved voices").props.disabled).toBe(false);
    expect(button("Add voice").props.disabled).toBe(true);
  });
});
