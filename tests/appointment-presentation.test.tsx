import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppointmentsPanel from "../src/components/AppointmentsPanel";

const h = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [h.states[h.cursor++], vi.fn()],
  useEffect: vi.fn(),
  useMemo: (run: () => unknown) => run(),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));
vi.mock("../src/components/atoms", () => ({
  Badge: "span",
  Button: "button",
  EmptyState: "div",
  Skeleton: "span",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "div" }));

const appointment = {
  id: "appointment-1",
  date: "2099-09-22",
  time: "00:05:00",
  customer_name: "Jordan Lee",
  service_type: "Plumbing Consultation",
  status: "Scheduled",
  phone_number: "+13125550123",
};
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (typeof node.type === "function") {
      return text((node.type as (props: unknown) => ReactNode)(node.props));
    }
    return text(node.props.children);
  }
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render(overrides: Partial<typeof appointment> = {}) {
  h.cursor = 0;
  h.states = [false, null, [{ ...appointment, ...overrides }], true, null];
  return text(AppointmentsPanel());
}
const originalTimezone = process.env.TZ;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("appointment presentation", () => {
  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
    "preserves the stored local date and clock time in %s",
    (timezone) => {
      process.env.TZ = timezone;
      const result = render();
      const date = new Date("2099-09-22T00:00:00Z").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      const time = new Date("2000-01-01T00:05:00Z").toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      });
      expect(result).toContain(`${date} · ${time}`);
    },
  );

  it("shows the service and a readable customer phone number", () => {
    const result = render();
    expect(result).toContain("Plumbing Consultation");
    expect(result).toContain("+1 (312) 555-0123");
  });

  it("preserves unrecognized stored dates and times rather than normalizing them", () => {
    expect(render({ date: "2099-02-30", time: "25:00" })).toContain("2099-02-30 · 25:00");
  });
});
