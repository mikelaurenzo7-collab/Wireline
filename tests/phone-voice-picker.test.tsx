import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CallDeliverySettings, {
  type CallDeliveryView,
} from "../src/components/voice/CallDeliverySettings";
import SimpleVoicePicker from "../src/components/voice/SimpleVoicePicker";
import { PHONE_VOICES } from "../src/lib/phone-voices";

type Slot = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

// The component is called as a function with these hooks, so a test can read
// what it would render and press its buttons without a browser.
vi.mock("react", async (original) => {
  function useEffect(callback: () => void | (() => void), dependencies: readonly unknown[]) {
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
  }
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= { value: initial });
      return [
        slot.value,
        (value: unknown) => {
          slot.value = typeof value === "function" ? value(slot.value) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = (h.slots[h.cursor++] ??= { value: { current: initial } });
      return slot.value;
    },
    useMemo(factory: () => unknown) {
      return factory();
    },
    useCallback(callback: unknown) {
      return callback;
    },
    useLayoutEffect: useEffect,
    useEffect,
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("../src/components/voice/VoiceClonePanel", () => ({ default: "voice-clone-panel" }));
vi.mock("../src/components/OpenAILiveVoiceSandbox", () => ({ default: "voice-sandbox" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = Record<string, unknown> & { children?: ReactNode; onClick?: () => void };
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render() {
  h.cursor = 0;
  const nodes = elements(SimpleVoicePicker({ agentId: "bot-a", agentName: "Front Desk" }));
  h.effects.splice(0).forEach((effect) => effect());
  return nodes;
}

const sampleButtons = (nodes: Element[]) =>
  nodes.filter(
    (node) => node.type === "button" && / sample$/.test(String(node.props["aria-label"] ?? "")),
  );
/** The card button that picks a voice: it starts with the voice's name. */
const voiceButton = (nodes: Element[], name: string) =>
  nodes.find(
    (node) => node.type === "button" && !node.props["aria-label"] && text(node).startsWith(name),
  );
const labelled = (nodes: Element[], label: string) =>
  nodes.find((node) => node.type === "button" && text(node) === label);
const deliveryPanel = (nodes: Element[]) =>
  nodes.find((node) => node.type === CallDeliverySettings) as
    | ReactElement<{
        initial: CallDeliveryView;
        onSaved: (delivery: CallDeliveryView) => void;
        sample: { playing: boolean; loading: boolean; toggle: () => void } | null;
        otherVoiceAnswers: boolean;
      }>
    | undefined;
const requests = () =>
  h.fetch.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? "GET",
    body: (init as RequestInit | undefined)?.body,
  }));

const noDelivery: CallDeliveryView = { speakingRate: 1.1, pronunciations: [], recognizedNames: [] };
const saved = (voice: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    voice: {
      voiceId: "cedar",
      provider: "openai",
      phoneCall: { provider: "phone-engine", voice: "castor" },
      phoneCallReady: true,
      phoneVoiceCatalog: true,
      phoneVoice: "castor",
      delivery: noDelivery,
      rehearsalHearsPhoneVoice: true,
      ...voice,
    },
  }),
});
const loaded = async (count: number) => {
  render();
  await vi.waitFor(() => expect(sampleButtons(render())).toHaveLength(count));
  return render();
};

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.fetch.mockReset().mockResolvedValue(saved());
});

describe("built-in phone voices in the picker", () => {
  it("lists every voice by name with the one callers hear selected", async () => {
    const nodes = await loaded(PHONE_VOICES.length);
    expect(PHONE_VOICES).toHaveLength(28);
    expect(text(nodes[0])).toContain("28 Built-In Voices");
    for (const voice of PHONE_VOICES) {
      expect(voiceButton(nodes, voice.name), voice.name).toBeDefined();
    }
    expect(voiceButton(nodes, "Castor")!.props["aria-pressed"]).toBe(true);
    expect(voiceButton(nodes, "Luna")!.props["aria-pressed"]).toBe(false);
    expect(text(voiceButton(nodes, "Eve")!)).toBe("EveEnergetic & Upbeat · British");
    // Owners pick a voice, not a vendor.
    expect(text(nodes[0])).not.toMatch(/xai|grok|openai|eleven|cartesia/i);
  });

  it("narrows the list to female or male voices and back", async () => {
    let nodes = await loaded(28);
    labelled(nodes, "Female")!.props.onClick!();
    nodes = render();
    expect(labelled(nodes, "Female")!.props["aria-pressed"]).toBe(true);
    expect(sampleButtons(nodes)).toHaveLength(
      PHONE_VOICES.filter((voice) => voice.gender === "female").length,
    );
    expect(voiceButton(nodes, "Luna")).toBeDefined();
    expect(voiceButton(nodes, "Castor")).toBeUndefined();
    labelled(nodes, "Male")!.props.onClick!();
    nodes = render();
    expect(sampleButtons(nodes)).toHaveLength(
      PHONE_VOICES.filter((voice) => voice.gender === "male").length,
    );
    labelled(nodes, "All")!.props.onClick!();
    expect(sampleButtons(render())).toHaveLength(28);
  });

  it("saves a pick as the voice itself, confirms it, and can undo it", async () => {
    const nodes = await loaded(28);
    h.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        voice: {
          voiceId: "marin",
          provider: "openai",
          phoneCall: { provider: "phone-engine", voice: "luna" },
          phoneVoice: "luna",
          rehearsalHearsPhoneVoice: true,
        },
        customVoiceCleared: false,
      }),
    });
    voiceButton(nodes, "Luna")!.props.onClick!();
    await vi.waitFor(() => expect(voiceButton(render(), "Luna")!.props["aria-pressed"]).toBe(true));
    expect(requests().at(-1)).toEqual({
      url: "/api/agent-config/bot-a/voice",
      method: "PATCH",
      body: JSON.stringify({ voiceId: "luna", provider: "phone" }),
    });
    const after = render();
    expect(voiceButton(after, "Castor")!.props["aria-pressed"]).toBe(false);
    expect(text(after[0])).toContain("Saved. Luna answers Front Desk's next call.");
    expect(text(after[0])).toContain("Callers and rehearsals hear Luna.");

    labelled(after, "Undo, switch back to Castor")!.props.onClick!();
    await vi.waitFor(() =>
      expect(requests().at(-1)!.body).toBe(
        JSON.stringify({ voiceId: "castor", provider: "phone" }),
      ),
    );
  });

  it("plays each sample the way this Bot speaks on calls", async () => {
    h.fetch.mockResolvedValue(
      saved({
        delivery: {
          speakingRate: 1.2,
          pronunciations: [{ word: "Desk", say: "Desque" }],
          recognizedNames: [],
        },
      }),
    );
    let nodes = await loaded(28);
    const pending = new Promise(() => {});
    h.fetch.mockReturnValue(pending);
    sampleButtons(nodes).find((node) => node.props["aria-label"] === "Play Luna sample")!.props
      .onClick!();
    const first = requests().at(-1)!.url;
    expect(first).toMatch(
      /^\/api\/agent-config\/bot-a\/voice\/sample\?voice=luna&provider=phone&pace=1\.2&rev=[a-z0-9]+$/,
    );

    // A new pace or pronunciation stops what was playing and makes the next sample a new one.
    nodes = render();
    deliveryPanel(nodes)!.props.onSaved({ ...noDelivery, speakingRate: 0.9 });
    nodes = render();
    sampleButtons(nodes).find((node) => node.props["aria-label"] === "Play Luna sample")!.props
      .onClick!();
    const second = requests().at(-1)!.url;
    expect(second).toContain("voice=luna&provider=phone&pace=0.9&rev=");
    expect(second.split("rev=")[1]).not.toBe(first.split("rev=")[1]);
  });

  it("offers pace and pronunciation with a sample of the voice in use", async () => {
    const nodes = await loaded(28);
    const panel = deliveryPanel(nodes)!;
    expect(panel.props.initial).toEqual(noDelivery);
    expect(panel.props.otherVoiceAnswers).toBe(false);
    expect(panel.props.sample).toMatchObject({ playing: false, loading: false });
    h.fetch.mockReturnValue(new Promise(() => {}));
    panel.props.sample!.toggle();
    expect(requests().at(-1)!.url).toContain("/voice/sample?voice=castor&provider=phone&pace=1.1");
  });

  it("keeps pace and pronunciation but no built-in sample while a library voice answers", async () => {
    h.fetch.mockResolvedValue(
      saved({
        phoneCall: { provider: "library", voice: "Skylar" },
        catalogVoice: {
          id: "voice-1234567",
          provider: "cartesia",
          name: "Skylar",
          language: "en",
          gender: "female",
        },
      }),
    );
    const nodes = await loaded(28);
    // The built-in voice behind it is listed but is not what callers hear.
    expect(voiceButton(nodes, "Castor")!.props["aria-pressed"]).toBe(false);
    expect(deliveryPanel(nodes)!.props.sample).toBeNull();
    // Names are recognized only when a built-in voice answers, and the panel is told so.
    expect(deliveryPanel(nodes)!.props.otherVoiceAnswers).toBe(true);
    expect(text(nodes[0])).toContain("Callers Hear Skylar.");
  });

  it("selects nothing and asks for a choice when the saved voice has no certain match", async () => {
    h.fetch.mockResolvedValue(
      saved({ voiceId: "presenter-voice-7", provider: "openai", phoneVoice: null }),
    );
    const nodes = await loaded(28);
    for (const voice of PHONE_VOICES) {
      expect(voiceButton(nodes, voice.name)!.props["aria-pressed"], voice.name).toBe(false);
    }
    expect(text(nodes[0])).toContain("Unavailable Voice");
    expect(
      nodes.some(
        (node) => node.type === "notice" && text(node) === "Choose a voice before the next call.",
      ),
    ).toBe(true);
    // Any catalog voice can still be picked from here.
    h.fetch.mockResolvedValueOnce(saved({ voiceId: "marin", phoneVoice: "luna" }));
    voiceButton(nodes, "Luna")!.props.onClick!();
    await vi.waitFor(() => expect(voiceButton(render(), "Luna")!.props["aria-pressed"]).toBe(true));
  });
});

describe("the saved ten, when calls cannot speak the phone catalog", () => {
  beforeEach(() => {
    h.fetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ voice: { voiceId: "marin", provider: "openai" } }),
    });
  });

  it("lists them as before, with no filter and no call delivery", async () => {
    render();
    await vi.waitFor(() =>
      expect(voiceButton(render(), "Marin")?.props["aria-pressed"]).toBe(true),
    );
    const nodes = render();
    expect(text(nodes[0])).toContain("10 Built-In Voices");
    expect(voiceButton(nodes, "Luna")).toBeUndefined();
    expect(labelled(nodes, "Female")).toBeUndefined();
    expect(deliveryPanel(nodes)).toBeUndefined();

    h.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voice: { voiceId: "cedar", provider: "openai" } }),
    });
    voiceButton(nodes, "Cedar")!.props.onClick!();
    await vi.waitFor(() =>
      expect(voiceButton(render(), "Cedar")!.props["aria-pressed"]).toBe(true),
    );
    expect(requests().at(-1)!.body).toBe(JSON.stringify({ voiceId: "cedar", provider: "openai" }));
  });
});
