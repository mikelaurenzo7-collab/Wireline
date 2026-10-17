import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SimpleVoicePicker from "../src/components/voice/SimpleVoicePicker";
import type { BotMarkKey } from "../src/lib/bot-mark";

type Slot = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  ownerId: "owner-a",
}));

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
    useLayoutEffect: useEffect,
    useEffect,
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: h.ownerId } }) }));
vi.mock("../src/components/voice/VoiceClonePanel", () => ({ default: "voice-clone-panel" }));
vi.mock("../src/components/OpenAILiveVoiceSandbox", () => ({ default: "voice-sandbox" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = {
  children?: ReactNode;
  markKey?: string;
  disabled?: boolean;
  onClick?: () => void;
  "aria-pressed"?: boolean;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function render(markKey: BotMarkKey) {
  h.cursor = 0;
  const nodes = elements(SimpleVoicePicker({ agentId: "bot-a", agentName: "Front Desk", markKey }));
  h.effects.splice(0).forEach((effect) => effect());
  return nodes;
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.ownerId = "owner-a";
  h.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ voice: { voiceId: "marin", provider: "openai" } }),
  });
});

it("ignores a late saved voice after the signed-in account changes", async () => {
  render("spark-rose");
  await vi.waitFor(() =>
    expect(
      render("spark-rose").find((node) => node.type === "button" && text(node).startsWith("Marin"))
        ?.props["aria-pressed"],
    ).toBe(true),
  );
  let finishSave!: (value: unknown) => void;
  h.fetch.mockReturnValueOnce(
    new Promise((resolve) => {
      finishSave = resolve;
    }),
  );
  render("spark-rose").find((node) => node.type === "button" && text(node).startsWith("Cedar"))!
    .props.onClick!();
  h.ownerId = "owner-b";
  h.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ voice: { voiceId: "echo", provider: "openai" } }),
  });
  render("spark-rose");
  await vi.waitFor(() =>
    expect(
      render("spark-rose").find((node) => node.type === "button" && text(node).startsWith("Echo"))
        ?.props["aria-pressed"],
    ).toBe(true),
  );
  finishSave({ ok: true, json: async () => ({ voice: { voiceId: "cedar", provider: "openai" } }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const current = render("spark-rose");
  expect(
    current.find((node) => node.type === "button" && text(node).startsWith("Echo"))?.props[
      "aria-pressed"
    ],
  ).toBe(true);
  expect(
    current.find((node) => node.type === "button" && text(node).startsWith("Cedar"))?.props[
      "aria-pressed"
    ],
  ).toBe(false);
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

it("passes the saved mark into an idle voice preview and updates it after a saved identity change", async () => {
  render("spark-rose");
  await vi.waitFor(() => {
    const preview = render("spark-rose").find(
      (node) => node.type === "button" && text(node) === "Preview Voice",
    );
    expect(preview?.props.disabled).toBe(false);
  });
  render("spark-rose").find((node) => node.type === "button" && text(node) === "Preview Voice")!
    .props.onClick!();
  expect(render("spark-rose").find((node) => node.type === "voice-sandbox")?.props.markKey).toBe(
    "spark-rose",
  );
  expect(render("compass-teal").find((node) => node.type === "voice-sandbox")?.props.markKey).toBe(
    "compass-teal",
  );
  expect(h.fetch.mock.calls).toEqual([["/api/agent-config/bot-a"]]);
});
