import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsPanel } from "../src/components/admin/AccountsPanel";
import { CarrierPanel } from "../src/components/admin/CarrierPanel";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  addAccount: vi.fn(),
  navigate: vi.fn(),
  fetch: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (value: unknown) => (h.states[index] = value)];
  },
}));
vi.mock("react-router", () => ({ useNavigate: () => h.navigate }));
vi.mock("../src/contexts/AccountContext", () => ({
  useAccount: () => ({
    accounts: [],
    activeAccount: null,
    loading: false,
    addAccount: h.addAccount,
  }),
}));
vi.mock("../src/contexts/ToastContext", () => ({ useToast: () => ({ error: h.error }) }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/WebhooksManager", () => ({ default: "webhooks" }));
vi.mock("../src/components/IntakeKeysManager", () => ({ default: "intake-keys" }));
vi.mock("../src/components/PhoneNumberPicker", () => ({ default: "phone-picker" }));

type Props = {
  children?: ReactNode;
  role?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: () => Promise<void>;
  onBlur?: (event: { currentTarget: { value: string; disabled: boolean } }) => Promise<void>;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}
function renderAccounts() {
  h.cursor = 0;
  return AccountsPanel();
}
function addButton() {
  return elements(renderAccounts()).find(
    (node) => node.type === "button" && textOf(node).includes("Add workspace"),
  )!;
}

beforeEach(() => {
  h.states = [];
  h.cursor = 0;
  h.addAccount.mockReset();
  h.navigate.mockReset();
  h.fetch.mockReset();
  h.error.mockReset();
});

describe("workspace creation recovery", () => {
  it.each(["empty response", "request rejection"])(
    "shows %s failures and permits retry",
    async (failure) => {
      if (failure === "request rejection") h.addAccount.mockRejectedValueOnce(new Error("offline"));
      else h.addAccount.mockResolvedValueOnce(null);
      h.addAccount.mockResolvedValueOnce({ id: "new-workspace" });

      const pending = addButton().props.onClick!();
      expect(addButton().props.disabled).toBe(true);
      await pending;
      const alert = elements(renderAccounts()).find((node) => node.props.role === "alert");
      expect(textOf(alert)).toContain("Couldn't add the workspace");
      expect(h.navigate).not.toHaveBeenCalled();
      expect(addButton().props.disabled).toBe(false);

      await addButton().props.onClick!();
      expect(h.navigate).toHaveBeenCalledWith("/studio", { replace: true });
      expect(elements(renderAccounts()).some((node) => node.props.role === "alert")).toBe(false);
    },
  );
});

function campaignEditor(number: { id: string; phone_number: string; campaign_label: string }) {
  const view = CarrierPanel({
    settings: {} as ComponentProps<typeof CarrierPanel>["settings"],
    agents: [],
    phoneNumbers: [number],
    carrierNumbers: [],
    isSaving: false,
    isSyncing: false,
    onUpdateSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onSyncNumbers: vi.fn(),
    onAddNumber: vi.fn(),
    onDeleteNumber: vi.fn(),
    onUpdateNumberAgent: vi.fn(),
  });
  return elements(view).find(
    (node) => node.props["aria-label"] === `Campaign label for ${number.phone_number}`,
  )!;
}

describe("campaign label persistence", () => {
  it.each(["HTTP failure", "network failure"])(
    "restores the saved label after a %s",
    async (failure) => {
      if (failure === "network failure") h.fetch.mockRejectedValueOnce(new Error("offline"));
      else h.fetch.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
      const number = { id: "line-1", phone_number: "+15550100100", campaign_label: "Front Desk" };
      const input = { value: "Campaign", disabled: false };

      const pending = campaignEditor(number).props.onBlur!({ currentTarget: input });
      expect(input.disabled).toBe(true);
      await pending;
      expect(input).toEqual({ value: "Front Desk", disabled: false });
      expect(number.campaign_label).toBe("Front Desk");
      expect(h.error).toHaveBeenCalledWith("Couldn't save the campaign label. Please try again.");

      input.value = " Campaign ";
      h.fetch.mockResolvedValueOnce(new Response("{}"));
      await campaignEditor(number).props.onBlur!({ currentTarget: input });
      expect(input).toEqual({ value: "Campaign", disabled: false });
      expect(number.campaign_label).toBe("Campaign");
      expect(h.fetch).toHaveBeenLastCalledWith("/api/phone-numbers/line-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_label: "Campaign" }),
      });
      await campaignEditor(number).props.onBlur!({ currentTarget: input });
      expect(h.fetch).toHaveBeenCalledTimes(2);
    },
  );
});
