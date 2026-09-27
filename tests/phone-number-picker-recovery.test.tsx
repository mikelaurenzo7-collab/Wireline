import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PhoneNumberPicker from "../src/components/PhoneNumberPicker";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  mounted: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  onClaim: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) {
      h.states[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = typeof value === "function" ? value(h.states[index]) : value;
      },
    ];
  },
  useEffect(effect: () => void) {
    if (!h.mounted) h.effects.push(effect);
  },
}));
vi.mock("motion/react", () => ({
  AnimatePresence: "div",
  motion: { button: "button", div: "div" },
}));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));
vi.mock("../src/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  authFetch: h.fetch,
}));

type Props = {
  children?: ReactNode;
  role?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
};

const phoneNumber = "+13125550120";
const inventory = {
  available: [{ phone_number: phoneNumber, area_code: "312", region: "Chicago" }],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

function render() {
  h.cursor = 0;
  const view = PhoneNumberPicker({ agentId: "bot-1", onClaim: h.onClaim });
  h.mounted = true;
  return view;
}

function button(label: string) {
  const match = elements(render()).find(
    (node) =>
      node.type === "button" &&
      (node.props["aria-label"] === label || textOf(node).includes(label)),
  );
  expect(match, `button ${label}`).toBeDefined();
  return match!;
}

function alerts() {
  return elements(render())
    .filter((node) => node.props.role === "alert")
    .map(textOf);
}

async function mount() {
  render();
  h.effects.forEach((effect) => effect());
  await vi.waitFor(() => expect(textOf(render())).not.toContain("Loading available numbers"));
}

async function search() {
  const input = elements(render()).find((node) => node.type === "input")!;
  input.props.onChange!({ target: { value: "312" } });
  await button("Find numbers").props.onClick!();
}

beforeEach(() => {
  h.states = [];
  h.cursor = 0;
  h.mounted = false;
  h.effects = [];
  h.onClaim.mockReset();
  h.fetch.mockReset();
  h.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/area-codes")) return json({ area_codes: [] });
    if (url.endsWith("/available") || url.endsWith("/search")) return json(inventory);
    throw new Error(`Unexpected request: ${url}`);
  });
});

describe("phone number picker recovery", () => {
  it.each(["claim", "provision"])(
    "keeps a failed %s visible after inventory reload and allows a successful retry",
    async (operation) => {
      const fetchDefault = h.fetch.getMockImplementation()!;
      let attempts = 0;
      h.fetch.mockImplementation(async (url: string) => {
        if (url.endsWith(`/${operation}`)) {
          attempts += 1;
          return attempts === 1
            ? json({ error: "That number could not be activated." }, 409)
            : json({ ok: true, phone_number: phoneNumber });
        }
        return fetchDefault(url);
      });
      await mount();
      if (operation === "provision") await search();

      await button("(312) 555-0120").props.onClick!();
      expect(alerts()).toEqual([expect.stringContaining("That number could not be activated.")]);
      expect(h.onClaim).not.toHaveBeenCalled();
      expect(button("(312) 555-0120").props.disabled).toBe(false);
      if (operation === "provision") expect(button("Find numbers").props.disabled).toBe(false);

      if (operation === "provision") await search();
      await button("(312) 555-0120").props.onClick!();
      expect(attempts).toBe(2);
      expect(h.onClaim).toHaveBeenCalledExactlyOnceWith(phoneNumber);
      expect(alerts()).toEqual([]);
    },
  );

  it("keeps activation and inventory failures separate and permits inventory recovery", async () => {
    const fetchDefault = h.fetch.getMockImplementation()!;
    let inventoryReads = 0;
    let claimAttempts = 0;
    h.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/available")) {
        inventoryReads += 1;
        return inventoryReads === 2
          ? json({ error: "Carrier inventory is temporarily busy. Try again." }, 503)
          : json(inventory);
      }
      if (url.endsWith("/claim")) {
        claimAttempts += 1;
        if (claimAttempts === 1) throw new Error("Activation request interrupted.");
        return json({ ok: true, phone_number: phoneNumber });
      }
      return fetchDefault(url);
    });
    await mount();

    await button("(312) 555-0120").props.onClick!();
    expect(alerts()).toHaveLength(2);
    expect(alerts()[0]).toContain("Number inventory unavailable");
    expect(alerts()[0]).toContain("Carrier inventory is temporarily busy. Try again.");
    expect(alerts()[0]).not.toContain("Activation request interrupted.");
    expect(alerts()[1]).toContain("Activation request interrupted.");
    expect(h.onClaim).not.toHaveBeenCalled();

    await button("Retry").props.onClick!();
    expect(alerts()).toEqual([expect.stringContaining("Activation request interrupted.")]);
    expect(button("(312) 555-0120").props.disabled).toBe(false);
    await button("(312) 555-0120").props.onClick!();
    expect(h.onClaim).toHaveBeenCalledExactlyOnceWith(phoneNumber);
    expect(alerts()).toEqual([]);
  });

  it("shows an initial inventory failure without implying an activation failed", async () => {
    const fetchDefault = h.fetch.getMockImplementation()!;
    let inventoryReads = 0;
    h.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/available") && ++inventoryReads === 1) {
        return json({ error: "Inventory is temporarily unavailable." }, 503);
      }
      return fetchDefault(url);
    });
    await mount();
    expect(alerts()).toEqual([expect.stringContaining("Inventory is temporarily unavailable.")]);
    expect(h.onClaim).not.toHaveBeenCalled();

    await button("Retry").props.onClick!();
    expect(alerts()).toEqual([]);
    expect(button("(312) 555-0120").props.disabled).toBe(false);
  });
});
