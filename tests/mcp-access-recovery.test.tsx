import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import McpCoachingPanel from "../src/components/settings/McpCoachingPanel";

type Slot = {
  value?: unknown;
  dependencies?: readonly unknown[];
  cleanup?: () => void;
};
const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    const slot = (h.slots[index] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) {
          slot.value = value;
          h.dirty = true;
        }
      },
    ];
  },
  useEffect(callback: () => void | (() => void), dependencies: readonly unknown[]) {
    const index = h.cursor++;
    const slot = (h.slots[index] ??= {});
    if (
      !slot.dependencies ||
      dependencies.some((value, i) => !Object.is(value, slot.dependencies![i]))
    ) {
      slot.dependencies = dependencies;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => h.fetch(...args) }));
vi.mock("../src/components/atoms", () => ({ Button: "button", Switch: "switch" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));

type Props = {
  children?: ReactNode;
  title?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick?: () => void;
  onCheckedChange?: (next: boolean) => void;
};
type Element = ReactElement<Props>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function render() {
  h.cursor = 0;
  h.dirty = false;
  const nodes = elements(McpCoachingPanel());
  h.effects.splice(0).forEach((run) => run());
  return nodes;
}
async function settle() {
  let nodes = render();
  for (let index = 0; index < 16; index++) {
    await Promise.resolve();
    if (h.dirty) nodes = render();
  }
  return nodes;
}
function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, json: async () => data };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("connected app access recovery", () => {
  it.each(["503", "network", "malformed success"])(
    "keeps unknown access read-only after %s and restores server state on retry",
    async (failure) => {
      if (failure === "network") h.fetch.mockRejectedValueOnce(new Error("Network unavailable"));
      else {
        h.fetch.mockResolvedValueOnce(
          failure === "503" ? response({ error: "Service unavailable" }, 503) : response({}),
        );
      }
      let nodes = await settle();
      const unknownSwitch = nodes.find((node) => node.type === "switch")!;
      expect(unknownSwitch.props.disabled).toBe(true);
      expect(nodes.some((node) => node.props.title === "App Access Unavailable")).toBe(true);
      expect(nodes.some((node) => text(node) === "No connected apps.")).toBe(false);
      unknownSwitch.props.onCheckedChange!(true);
      await settle();
      expect(h.fetch).toHaveBeenCalledTimes(1);

      const retry = deferred<ReturnType<typeof response>>();
      h.fetch.mockReturnValueOnce(retry.promise);
      nodes.find((node) => node.type === "button" && text(node) === "Retry")!.props.onClick!();
      nodes = render();
      expect(nodes.find((node) => node.type === "switch")?.props.disabled).toBe(true);
      expect(nodes.some((node) => text(node) === "Loading connected apps…")).toBe(true);
      expect(nodes.some((node) => text(node) === "No connected apps.")).toBe(false);
      retry.resolve(
        response({
          coaching_writes_enabled: true,
          connections: [
            {
              client: "Cursor",
              scope: "agents.read agents.write",
              created_at: "2026-09-01T00:00:00Z",
              expires_at: "2026-10-01T00:00:00Z",
            },
          ],
        }),
      );
      nodes = await settle();
      expect(nodes.find((node) => node.type === "switch")?.props).toMatchObject({
        checked: true,
        disabled: false,
      });
      expect(nodes.some((node) => node.props.title === "App Access Unavailable")).toBe(false);
      expect(nodes.some((node) => text(node) === "Cursor")).toBe(true);
      expect(
        nodes.find((node) => text(node) === "Disconnect all connected apps")?.props.disabled,
      ).toBe(false);
      expect(h.fetch.mock.calls).toEqual([["/api/mcp/connections"], ["/api/mcp/connections"]]);
    },
  );

  it("does not publish a response body after the view has unmounted", async () => {
    const body = deferred<unknown>();
    h.fetch.mockResolvedValueOnce({ ok: true, json: () => body.promise });
    await settle();
    h.slots.forEach((slot) => slot.cleanup?.());
    h.dirty = false;
    body.resolve({ coaching_writes_enabled: true, connections: [] });
    for (let index = 0; index < 8; index++) await Promise.resolve();
    expect(h.dirty).toBe(false);
  });
});
