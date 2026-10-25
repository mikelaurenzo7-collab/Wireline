import { isValidElement, type ReactElement, type ReactNode, type FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "../src/pages/CalendarPage";
import CalendarAvailabilityPanel from "../src/components/CalendarAvailabilityPanel";

const h = vi.hoisted(() => ({
  slots: { page: [], panel: [] } as Record<
    string,
    Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>
  >,
  scope: "page",
  cursor: 0,
  effects: [] as Array<() => void>,
  params: new URLSearchParams("tab=availability"),
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = (h.slots[h.scope][h.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        slot.value = typeof next === "function" ? next(slot.value) : next;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.scope][h.cursor++] ??= { value: { current: initial } }).value;
  },
  useCallback: (callback: unknown) => callback,
  useEffect(callback: () => void | (() => void), deps: readonly unknown[]) {
    const slot = (h.slots[h.scope][h.cursor++] ??= {});
    if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps?.[i]))) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  },
}));
vi.mock("react-router", () => ({
  Link: "a",
  useSearchParams: () => [
    h.params,
    (next: (params: URLSearchParams) => URLSearchParams) => {
      h.params = next(new URLSearchParams(h.params));
    },
  ],
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  NativeSelect: "select",
  Switch: "switch",
  Skeleton: "skeleton",
}));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "checkbox" }));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "shell" }));
vi.mock("../src/components/AppointmentsPanel", () => ({ default: "appointments" }));
vi.mock("../src/components/layout/WorkspaceControlBand", () => ({ default: "controls" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspaceOperateIntro: "intro",
  WorkspacePageFrame: "frame",
}));
vi.mock("../src/components/layout/WorkspaceTabStrip", () => ({ WorkspaceTabStrip: "tabs" }));

type Props = {
  children?: ReactNode;
  tabs?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  action?: ReactNode;
  title?: string;
  id?: string;
  disabled?: boolean;
  hidden?: boolean;
  value?: string;
  onSubmit?: (event: FormEvent) => Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
  onSelect?: (id: string) => void;
  onClick?: () => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [
    node,
    ...elements(node.props.children),
    ...elements(node.props.tabs),
    ...elements(node.props.primary),
    ...elements(node.props.secondary),
    ...elements(node.props.action),
  ];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
let page: ReactNode;
let panel: ReactNode;
function render() {
  h.scope = "page";
  h.cursor = 0;
  page = CalendarPage();
  const child = elements(page).find((node) => node.type === CalendarAvailabilityPanel);
  if (child) {
    h.scope = "panel";
    h.cursor = 0;
    panel = CalendarAvailabilityPanel(
      child.props as Parameters<typeof CalendarAvailabilityPanel>[0],
    );
  } else {
    h.slots.panel = [];
    panel = null;
  }
  h.effects.splice(0).forEach((effect) => effect());
}
async function settle() {
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    render();
  }
}
function input() {
  return elements(panel).find((node) => node.props.id === "calendar-appointment-name")!;
}
function submit() {
  return elements(panel).find((node) => node.type === "form")!.props.onSubmit!({
    preventDefault() {},
  } as FormEvent);
}
function tab(id: string) {
  elements(page).find((node) => node.type === "tabs")!.props.onSelect!(id);
  render();
}
const defaults = {
  enabled: true,
  time_zone: "America/Chicago",
  appointment_name: "Consultation",
  duration_minutes: 30,
  buffer_minutes: 0,
  minimum_notice_minutes: 60,
  booking_mode: "automatic",
  weekly_hours: [{ day: 1, start: "09:00", end: "17:00" }],
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  h.slots = { page: [], panel: [] };
  h.effects = [];
  h.params = new URLSearchParams("tab=availability");
  h.fetch.mockReset();
  h.fetch.mockResolvedValueOnce(response({ settings: defaults, configured: true }));
});
describe("Calendar pending saves across tabs", () => {
  it("shows availability load failure and retry on the default Calendar tab", async () => {
    h.params = new URLSearchParams();
    h.fetch.mockReset();
    h.fetch.mockResolvedValueOnce(response({ error: "Availability could not load." }, 503));
    render();
    await settle();
    const notice = elements(page).find((node) => node.props.title === "Availability Unavailable");
    expect(notice).toBeDefined();
    expect(
      elements(page).some(
        (node) => node.props.hidden && elements(node.props.children).includes(notice!),
      ),
    ).toBe(false);
    expect(text(notice)).toContain("Availability could not load.");
    expect(
      elements(page).find((node) => node.type === "button" && text(node) === "Set availability")
        ?.props.disabled,
    ).toBe(true);

    h.fetch.mockResolvedValueOnce(response({ settings: defaults, configured: true }));
    const retry = elements(notice).find((node) => node.type === "button" && text(node) === "Retry");
    expect(retry).toBeDefined();
    retry!.props.onClick!();
    await settle();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.params.has("tab")).toBe(false);
    expect(elements(page).some((node) => node.props.title === "Availability Unavailable")).toBe(
      false,
    );
    expect(
      elements(page).find((node) => node.type === "button" && text(node) === "New Appointment")
        ?.props.disabled,
    ).toBe(false);
  });

  it.each([true, false])(
    "keeps the mounted form locked across tab changes, success=%s",
    async (success) => {
      render();
      await settle();
      input().props.onChange!({ target: { value: "Repair visit" } });
      render();
      let finish!: (value: Response) => void;
      h.fetch.mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            finish = done;
          }),
      );
      const pending = submit();
      render();
      tab("agenda");
      expect(panel).not.toBeNull();
      expect(
        elements(page).some(
          (node) =>
            node.props.hidden === true &&
            elements(node.props.children).some((child) => child.type === CalendarAvailabilityPanel),
        ),
      ).toBe(true);
      tab("availability");
      expect(elements(panel).find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
      input().props.onChange!({ target: { value: "Should remain locked" } });
      render();
      expect(input().props.value).toBe("Repair visit");
      await submit();
      expect(h.fetch).toHaveBeenCalledTimes(2);
      const saved = { ...defaults, appointment_name: "Repair visit" };
      finish(
        success
          ? response({ settings: saved, configured: true })
          : response({ error: "Retry this save." }, 503),
      );
      await pending;
      await settle();
      expect(input().props.value).toBe("Repair visit");
      expect(elements(panel).find((node) => node.type === "fieldset")?.props.disabled).toBe(false);
      if (success) expect(text(panel)).toContain("Availability saved.");
      else {
        expect(text(panel)).toContain("Retry this save.");
        expect(text(panel)).not.toContain("Availability saved.");
        h.fetch.mockResolvedValueOnce(response({ settings: saved, configured: true }));
        await submit();
        await settle();
        expect(h.fetch.mock.calls[2][1].body).toBe(h.fetch.mock.calls[1][1].body);
        expect(text(panel)).toContain("Availability saved.");
      }
    },
  );
});
