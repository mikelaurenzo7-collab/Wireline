import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppointmentsPanel from "../src/components/AppointmentsPanel";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => {
  const changed = (before?: readonly unknown[], after?: readonly unknown[]) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((value, index) => !Object.is(value, before[index]));
  const memo = (factory: () => unknown, dependencies?: readonly unknown[]) => {
    const index = h.cursor++;
    if (!h.slots[index] || changed(h.slots[index].dependencies, dependencies))
      h.slots[index] = { value: factory(), dependencies };
    return h.slots[index].value;
  };
  return {
    ...(await original<typeof import("react")>()),
    useState(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        h.slots[index].value,
        (next: unknown) => {
          const value = typeof next === "function" ? next(h.slots[index].value) : next;
          if (!Object.is(value, h.slots[index].value)) {
            h.slots[index].value = value;
            h.dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const index = h.cursor++;
      h.slots[index] ??= { value: { current: initial } };
      return h.slots[index].value;
    },
    useMemo: memo,
    useCallback: (callback: unknown, dependencies?: readonly unknown[]) =>
      memo(() => callback, dependencies),
    useEffect(callback: () => void | (() => void), dependencies?: readonly unknown[]) {
      const index = h.cursor++;
      const slot = h.slots[index] ?? {};
      if (changed(slot.dependencies, dependencies)) {
        slot.dependencies = dependencies;
        h.effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = callback() || undefined;
        });
      }
      h.slots[index] = slot;
    },
  };
});
vi.mock("react-router", () => ({ Link: "a" }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Badge: "span",
  EmptyState: "empty",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  appointment?: { id: string; customer_name: string };
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let appointmentResponses: Array<() => Promise<Response>>;
let calendarResponse: () => Promise<Response>;
const cursor = "00000000-0000-4000-8000-000000000100";
function appointment(id: string, future = false) {
  return {
    id,
    date: future ? "2099-12-25" : "2020-01-01",
    time: "12:30",
    customer_name: `Customer ${id}`,
    service_type: "Consultation",
    status: "Scheduled",
    phone_number: null,
  };
}
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
function page(
  appointments: ReturnType<typeof appointment>[],
  hasMore = false,
  nextCursor: string | null = null,
) {
  return response({ appointments, hasMore, nextCursor });
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("Appointments did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.effects = [];
    tree = AppointmentsPanel();
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(label: string) {
  const found = elements(tree).find((node) => node.type === "button" && text(node) === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function displayed() {
  return elements(tree).flatMap((node) =>
    node.props.appointment ? [node.props.appointment.id] : [],
  );
}
function requests() {
  return h.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/appointments?"));
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  appointmentResponses = [];
  calendarResponse = async () => response({ accounts: [{}] });
  h.fetch.mockImplementation(async (url: string) =>
    url === "/api/calendar/accounts"
      ? calendarResponse()
      : (appointmentResponses.shift()?.() ?? page([])),
  );
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("appointment history and recovery", () => {
  it("shows appointments even if the optional calendar connection request rejects", async () => {
    calendarResponse = async () => {
      throw new Error("Calendar offline");
    };
    appointmentResponses = [async () => page([appointment("one", true)])];
    await settle();
    expect(displayed()).toEqual(["one"]);
    expect(elements(tree).some((node) => node.props.title === "Appointments Unavailable")).toBe(
      false,
    );
  });

  it("keeps a booked future appointment accessible beyond 100 newer past records", async () => {
    const older = deferred();
    appointmentResponses = [
      async () =>
        page(
          Array.from({ length: 100 }, (_, index) => appointment(String(index))),
          true,
          cursor,
        ),
      () => older.promise,
    ];
    await settle();
    expect(text(tree)).toContain("No upcoming appointments in loaded history");
    const nodes = elements(tree);
    expect(nodes.indexOf(button("Load More Appointments"))).toBeLessThan(
      nodes.findIndex((node) => node.type === "details"),
    );
    const load = button("Load More Appointments").props.onClick!;
    load();
    load();
    await settle();
    expect(requests()).toHaveLength(2);
    expect(new URL(requests()[1][0], "https://botbound.test").searchParams.get("cursor")).toBe(
      cursor,
    );
    expect(button("Loading…").props.disabled).toBe(true);
    older.resolve(page([appointment("future", true)]));
    await settle();
    expect(displayed()).toHaveLength(101);
    expect(displayed()[0]).toBe("future");
    expect(text(tree)).not.toContain("Load More Appointments");
  });

  it("retains loaded appointments and retries a failed continuation with the same cursor", async () => {
    appointmentResponses = [
      async () => page([appointment("one")], true, cursor),
      async () => response({ error: "Temporary failure" }, 503),
      async () => page([appointment("two", true)]),
    ];
    await settle();
    button("Load More Appointments").props.onClick?.();
    await settle();
    expect(displayed()).toEqual(["one"]);
    button("Retry More Appointments").props.onClick?.();
    await settle();
    expect(requests()[2][0]).toBe(requests()[1][0]);
    expect(displayed()).toEqual(["two", "one"]);
  });

  it("offers refresh when an owned cursor no longer exists", async () => {
    appointmentResponses = [
      async () => page([appointment("one")], true, cursor),
      async () =>
        response(
          {
            error: "Appointment history changed. Refresh to continue.",
            code: "APPOINTMENT_CURSOR_EXPIRED",
          },
          404,
        ),
      async () => page([appointment("current", true)]),
    ];
    await settle();
    button("Load More Appointments").props.onClick?.();
    await settle();
    expect(displayed()).toEqual(["one"]);
    button("Refresh Appointments").props.onClick?.();
    await settle();
    expect(requests()[2][0]).toBe(requests()[0][0]);
    expect(displayed()).toEqual(["current"]);
  });

  it("retries a failed first load without reloading the page", async () => {
    appointmentResponses = [
      async () => response({ error: "Unavailable" }, 503),
      async () => page([appointment("recovered", true)]),
    ];
    await settle();
    button("Retry").props.onClick?.();
    await settle();
    expect(displayed()).toEqual(["recovered"]);
    expect(requests()).toHaveLength(2);
  });
});
