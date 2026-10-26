import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompanyIdentityPack from "../src/components/settings/CompanyIdentityPack";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; dependencies?: readonly unknown[] }>,
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
    useMemo(factory: () => unknown, dependencies?: readonly unknown[]) {
      const index = h.cursor++;
      if (!h.slots[index] || changed(h.slots[index].dependencies, dependencies))
        h.slots[index] = { value: factory(), dependencies };
      return h.slots[index].value;
    },
    useEffect(callback: () => void, dependencies?: readonly unknown[]) {
      const index = h.cursor++;
      const slot = h.slots[index] ?? {};
      if (changed(slot.dependencies, dependencies)) {
        slot.dependencies = dependencies;
        h.effects.push(callback);
      }
      h.slots[index] = slot;
    },
  };
});
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/shadcn/Checkbox", () => ({ Checkbox: "checkbox" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  placeholder?: string;
  value?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;

let tree: ReactNode;
function render() {
  let passes = 0;
  do {
    if (++passes > 25) throw new Error("Company identity did not settle");
    h.dirty = false;
    h.cursor = 0;
    h.effects = [];
    tree = CompanyIdentityPack();
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
const notices = () => elements(tree).filter((node) => node.type === "notice");
const button = (label: string) =>
  elements(tree).find((node) => node.type === "button" && text(node) === label);
const businessNameInput = () =>
  elements(tree).find(
    (node) => node.type === "input" && node.props.placeholder === "Laurenzo Services LLC",
  );

const channel = {
  profile_status: "ready",
  provider_status: "not_requested",
  missing: [],
  display_scope: "Shown on calls.",
};
const identity = {
  profile: {
    business_name: "Saved Services LLC",
    brand_name: "Saved Services",
    logo_url: null,
    caller_id_name: null,
    website: null,
    support_email: null,
    physical_postal_address: null,
    default_call_reason: null,
    requested_channels: ["voice"],
    review_requested_at: null,
  },
  phone_number: null,
  channels: { voice: channel, sms: channel, email: channel },
  review_eligible: false,
  guarantee: "Review status comes from the carrier.",
};
const response = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
});

describe("company identity error recovery", () => {
  it.each([
    { requestedChannels: ["voice", "email"], smsVisible: true },
    { requestedChannels: ["voice", "sms"], smsVisible: true },
  ])(
    "shows SMS and preserves saved channels: $requestedChannels",
    async ({ requestedChannels, smsVisible }) => {
      const saved = {
        ...identity,
        profile: { ...identity.profile, requested_channels: requestedChannels },
      };
      h.fetch.mockResolvedValueOnce(response(saved));
      await settle();

      const smsLabel = elements(tree).find((node) => node.type === "label" && text(node) === "SMS");
      expect(Boolean(smsLabel)).toBe(smsVisible);
      businessNameInput()!.props.onChange!({ target: { value: "Updated Services LLC" } });
      render();
      h.fetch.mockResolvedValueOnce(
        response({
          ...saved,
          profile: { ...saved.profile, business_name: "Updated Services LLC" },
        }),
      );
      button("Save Identity")!.props.onClick!();
      await settle();

      const [, request] = h.fetch.mock.calls[1];
      expect(JSON.parse(request.body).requested_channels).toEqual(requestedChannels);
    },
  );

  it("keeps the owner's edits and names the failure when a save is rejected", async () => {
    h.fetch.mockResolvedValueOnce(response(identity));
    await settle();

    businessNameInput()!.props.onChange!({ target: { value: "Renamed Services LLC" } });
    render();
    h.fetch.mockResolvedValueOnce(response({ error: "Add a support email first." }, 422));
    button("Save Identity")!.props.onClick!();
    await settle();

    const [notice] = notices();
    expect(notice.props.title).toBe("Changes Not Saved");
    expect(text(notice)).toBe("Add a support email first.");
    expect(notice.props.action).toBeUndefined();
    // A reload would have replaced the typed value with the saved one.
    expect(businessNameInput()!.props.value).toBe("Renamed Services LLC");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("offers a reload only when the saved identity could not be read", async () => {
    h.fetch.mockResolvedValueOnce(response({ error: "unavailable" }, 503));
    await settle();

    const [notice] = notices();
    expect(notice.props.title).toBe("Company Identity Unavailable");
    expect(text(notice)).toBe("Your saved details are unchanged.");
    expect(businessNameInput()).toBeUndefined();

    h.fetch.mockResolvedValueOnce(response(identity));
    button("Try Again")!.props.onClick!();
    await settle();

    expect(h.fetch).toHaveBeenLastCalledWith("/api/company-identity");
    expect(notices()).toHaveLength(0);
    expect(businessNameInput()!.props.value).toBe("Saved Services LLC");
  });
});
