import { isValidElement, type FormEvent, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarAvailabilityPanel from "../src/components/CalendarAvailabilityPanel";
import {
  initialCalendarSettings,
  readCalendarSettings,
  type CalendarSettings,
} from "../src/lib/calendar-settings-client";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  NativeSelect: "select",
  Switch: "switch",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "checkbox" }));
vi.mock("react-router", () => ({ Link: "a" }));

type Props = {
  children?: ReactNode;
  id?: string;
  value?: unknown;
  disabled?: boolean;
  onClick?: () => Promise<void>;
  onSubmit?: (event: FormEvent) => Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
};
const defaults = (): CalendarSettings => ({
  enabled: false,
  time_zone: "America/Chicago",
  appointment_name: "Consultation",
  duration_minutes: 30,
  buffer_minutes: 0,
  minimum_notice_minutes: 60,
  booking_mode: "automatic",
  weekly_hours: [{ day: 1, start: "09:00", end: "17:00" }],
});
let settings: CalendarSettings;
let configured: boolean;
const saved = vi.fn();
function render() {
  h.stateCursor = 0;
  h.refCursor = 0;
  return CalendarAvailabilityPanel({
    settings,
    configured,
    onChange: (next) => {
      settings = next;
    },
    onSaved: (next) => {
      settings = next;
      configured = true;
      saved(next);
    },
  });
}
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function button(label: string) {
  return elements(render()).find((node) => node.type === "button" && text(node) === label)!;
}
function field(id: string) {
  return elements(render()).find((node) => node.props.id === id)!;
}
function submit() {
  return elements(render()).find((node) => node.type === "form")!.props.onSubmit!({
    preventDefault() {},
  } as FormEvent);
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.fetch.mockReset();
  saved.mockReset();
  settings = defaults();
  configured = false;
});

describe("native Calendar availability UI", () => {
  it("enables automatic booking only on an explicit save and accepts the confirmed response", async () => {
    h.fetch.mockImplementation(async (_url, init) =>
      response({ settings: JSON.parse(init.body), configured: true }),
    );
    render();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(text(render())).toContain("Enable booking");
    await submit();
    expect(h.fetch).toHaveBeenCalledWith(
      "/api/calendar/settings",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.parse(h.fetch.mock.calls[0][1].body)).toMatchObject({
      enabled: true,
      booking_mode: "automatic",
      time_zone: "America/Chicago",
    });
    expect(saved).toHaveBeenCalledOnce();
    expect(text(render())).toContain("Availability saved.");
  });

  it("retains edited hours and approval mode after failure and retries the same full settings", async () => {
    configured = true;
    settings.enabled = true;
    field("calendar-booking-mode").props.onChange!({ target: { value: "approval" } });
    field("calendar-appointment-name").props.onChange!({ target: { value: "Repair visit" } });
    h.fetch.mockResolvedValueOnce(response({ error: "Temporary calendar failure" }, 503));
    await submit();
    expect(saved).not.toHaveBeenCalled();
    expect(field("calendar-appointment-name").props.value).toBe("Repair visit");
    expect(field("calendar-booking-mode").props.value).toBe("approval");
    expect(text(render())).toContain("Temporary calendar failure");
    const first = h.fetch.mock.calls[0][1].body;
    h.fetch.mockResolvedValueOnce(response({ settings, configured: true }));
    await submit();
    expect(h.fetch.mock.calls[1][1].body).toBe(first);
    expect(saved).toHaveBeenCalledOnce();
  });

  it("does not claim success on a malformed response and blocks duplicate in-flight saves", async () => {
    let resolve!: (value: Response) => void;
    h.fetch.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const pending = submit();
    await submit();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(elements(render()).find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
    resolve(response({ settings: { enabled: true }, configured: true }));
    await pending;
    expect(saved).not.toHaveBeenCalled();
    expect(text(render())).toContain("Reload Calendar to check it before retrying.");
    expect(button("Enable booking").props.disabled).toBe(false);
  });

  it("requires hours before enabling but allows an already configured calendar to be paused", async () => {
    settings.weekly_hours = [];
    await submit();
    expect(h.fetch).not.toHaveBeenCalled();
    configured = true;
    h.fetch.mockResolvedValueOnce(response({ settings, configured: true }));
    await submit();
    expect(JSON.parse(h.fetch.mock.calls[0][1].body).enabled).toBe(false);
  });

  it("reports provider partial sync honestly", async () => {
    h.fetch.mockResolvedValueOnce(
      response({ accounts: [{ provider: "google" }, { provider: "microsoft" }] }),
    );
    h.fetch.mockResolvedValueOnce(
      response({ google: { status: "success" }, outlook: { status: "partial" } }),
    );
    await button("Sync busy times").props.onClick!();
    expect(text(render())).toContain("Outlook did not fully sync");
    expect(text(render())).not.toContain("Busy times refreshed at");
    expect(saved).not.toHaveBeenCalled();
  });

  it("recognizes successful Outlook results using the API response key", async () => {
    h.fetch.mockResolvedValueOnce(response({ accounts: [{ provider: "microsoft" }] }));
    h.fetch.mockResolvedValueOnce(
      response({ google: { status: "skipped" }, outlook: { status: "success" } }),
    );
    await button("Sync busy times").props.onClick!();
    expect(text(render())).toContain("Busy times refreshed at");
    expect(text(render())).not.toContain("did not fully sync");
    expect(saved).not.toHaveBeenCalled();
  });

  it("does not claim busy times are refreshed when the provider response is missing", async () => {
    h.fetch.mockResolvedValueOnce(response({ accounts: [{ provider: "microsoft" }] }));
    h.fetch.mockResolvedValueOnce(response({ google: { status: "success" } }));
    await button("Sync busy times").props.onClick!();
    expect(text(render())).toContain("Outlook did not fully sync");
    expect(text(render())).not.toContain("Busy times refreshed at");
  });

  it("keeps native booking independent when no provider is connected", async () => {
    h.fetch.mockResolvedValueOnce(response({ accounts: [] }));
    await button("Sync busy times").props.onClick!();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(text(render())).toContain("Connect Google or Outlook to import busy times.");
    expect(button("Enable booking").props.disabled).toBe(false);
  });

  it("accepts only complete, valid response settings and preserves a saved timezone", () => {
    expect(readCalendarSettings(settings)).toEqual(settings);
    expect(readCalendarSettings({ ...settings, time_zone: "Not/A_Zone" })).toBeNull();
    expect(
      readCalendarSettings({
        ...settings,
        weekly_hours: [{ day: 1, start: "17:00", end: "09:00" }],
      }),
    ).toBeNull();
    expect(
      readCalendarSettings({
        ...settings,
        weekly_hours: [...settings.weekly_hours, ...settings.weekly_hours],
      }),
    ).toBeNull();
    expect(readCalendarSettings({ ...settings, appointment_name: "x".repeat(101) })).toBeNull();
    expect(initialCalendarSettings(settings, true)).toBe(settings);
    expect(initialCalendarSettings(settings, false).enabled).toBe(false);
  });
});
