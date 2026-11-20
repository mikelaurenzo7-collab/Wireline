import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportingPreferences from "../src/components/training/ReportingPreferences";

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
vi.mock("../src/components/atoms", () => ({ Button: "button", NativeSelect: "select" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "input" }));
vi.mock("../src/components/training/RecentCallArtifactRequests", () => ({
  REPORT_PREFERENCES_SAVED_EVENT: "reports-saved",
}));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string; checked?: boolean } }) => void;
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let getResponses: Array<() => Promise<Response>>;
let saveResponses: Array<() => Promise<Response>>;
const preferences = {
  internal_record_enabled: true,
  spreadsheet_destination: "none",
  artifact_mode: "manual",
  artifact_format: "pdf",
  artifact_destination: "google_drive",
  scheduled_report_frequency: "weekly",
  scheduled_report_format: "pdf",
  scheduled_report_destination: "google_drive",
  scheduled_report_send_at_utc: "13:00",
  scheduled_report_weekday: 1,
  scheduled_report_version: 1,
};
function payload(overrides: Record<string, unknown> = {}) {
  return {
    preferences: { ...preferences, ...overrides },
    connections: {
      google_drive: true,
      google_sheets: true,
      onedrive: false,
      microsoft_excel: false,
    },
    next_scheduled_report_at: "2026-09-28T13:00:00Z",
  };
}
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
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
    if (++passes > 25) throw new Error("Report settings did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.effects = [];
    tree = ReportingPreferences();
    h.effects.forEach((run) => run());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let index = 0; index < 20; index++) {
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
function control(label: string) {
  const owner = elements(tree).find(
    (node) => node.type === "label" && text(node).startsWith(label),
  );
  const found = elements(owner).find((node) => node.type === "input" || node.type === "select");
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function posts() {
  return h.fetch.mock.calls.filter(([, options]) => options?.method === "POST");
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  getResponses = [];
  saveResponses = [];
  vi.stubEnv("TZ", "UTC");
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal(
    "CustomEvent",
    class {
      constructor(
        public type: string,
        public options: unknown,
      ) {}
    },
  );
  h.fetch.mockImplementation(
    async (_url: string, options?: RequestInit) =>
      (options?.method === "POST" ? saveResponses.shift()?.() : getResponses.shift()?.()) ??
      response(payload()),
  );
});
afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("report settings save continuity", () => {
  it("locks submitted settings and duplicate saves, then displays the returned schedule", async () => {
    const pending = deferred();
    saveResponses = [() => pending.promise];
    await settle();
    const changeFormat = control("Default format").props.onChange!;
    const changeTime = control("Delivery time").props.onChange!;
    const save = button("Save Report Settings").props.onClick!;
    save();
    save();
    changeFormat({ target: { value: "docx" } });
    changeTime({ target: { value: "23:45" } });
    await settle();
    expect(posts()).toHaveLength(1);
    expect(control("Default format").props.value).toBe("pdf");
    expect(control("Delivery time").props.value).toBe("13:00");
    expect(elements(tree).some((node) => node.type === "fieldset" && node.props.disabled)).toBe(
      true,
    );
    pending.resolve(
      response(payload({ scheduled_report_send_at_utc: "02:45", scheduled_report_weekday: 2 })),
    );
    await settle();
    expect(control("Delivery time").props.value).toBe("02:45");
    expect(control("Delivery day").props.value).toBe("2");
    expect(text(tree)).toContain("Report preferences saved.");
  });

  it("retains a failed draft and retries the same values", async () => {
    saveResponses = [
      () => Promise.resolve(response({ error: "Temporarily unavailable" }, 503)),
      () =>
        Promise.resolve(
          response(payload({ artifact_format: "docx", scheduled_report_send_at_utc: "18:30" })),
        ),
    ];
    await settle();
    control("Default format").props.onChange?.({ target: { value: "docx" } });
    control("Delivery time").props.onChange?.({ target: { value: "18:30" } });
    await settle();
    button("Save Report Settings").props.onClick?.();
    await settle();
    expect(control("Default format").props.value).toBe("docx");
    expect(control("Delivery time").props.value).toBe("18:30");
    button("Save Report Settings").props.onClick?.();
    await settle();
    expect(posts()).toHaveLength(2);
    expect(posts()[1][1].body).toBe(posts()[0][1].body);
  });

  it("recovers a failed initial load in place", async () => {
    getResponses = [
      () => Promise.resolve(response({ error: "Settings unavailable" }, 503)),
      () => Promise.resolve(response(payload())),
    ];
    await settle();
    expect(elements(tree).some((node) => node.props.title === "Report Settings Unavailable")).toBe(
      true,
    );
    button("Retry").props.onClick?.();
    await settle();
    expect(control("Default format").props.value).toBe("pdf");
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(posts()).toHaveLength(0);
  });

  it("does not silently turn a cleared delivery time into midnight", async () => {
    await settle();
    control("Delivery time").props.onChange?.({ target: { value: "" } });
    await settle();
    button("Save Report Settings").props.onClick?.();
    await settle();
    expect(posts()).toHaveLength(0);
    expect(text(tree)).toContain("Choose a delivery time.");
  });

  it("names the Connections cards that enable report storage", async () => {
    const data = payload();
    getResponses = [
      () =>
        Promise.resolve(
          response({
            ...data,
            connections: { ...data.connections, google_drive: false, google_sheets: false },
          }),
        ),
    ];
    await settle();
    expect(text(tree)).toContain("Manage saved connections in Connections.");
    expect(text(tree)).not.toContain("Google Sheets for Google Drive");
    expect(text(tree)).not.toContain("Microsoft Excel for OneDrive");
    expect(text(tree)).not.toContain("Connect Google Drive or OneDrive");
  });
});
