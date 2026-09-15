import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import BillingSettings from "../src/pages/BillingSettings";
import {
  clearPostCreateWizard,
  readPostCreateWizard,
  stashPostCreateWizard,
  stashPostCreateWizardStep,
} from "../src/lib/wireline-create-flow";

const harness = vi.hoisted(() => ({
  user: { id: "owner-1" } as { id: string } | null,
  fetch: vi.fn(),
  replace: vi.fn(),
  replaceState: vi.fn(),
  states: [] as unknown[],
  cursor: 0,
  effect: null as (() => void | (() => void)) | null,
  dependencies: [] as unknown[],
}));

// Run the real billing effect and storage helpers with mocked HTTP transport.
// No live checkout, provider credentials, or browser session is involved.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states))
      harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      harness.states[index],
      (value: unknown) => {
        harness.states[index] = value;
      },
    ];
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
    harness.effect = effect;
    harness.dependencies = dependencies;
  },
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: harness.user }) }));
vi.mock("../src/lib/api", () => ({ authFetch: (...args: unknown[]) => harness.fetch(...args) }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules/StatusNotice", () => ({ StatusNotice: "aside" }));
vi.mock("../src/components/StripeBillingCard", () => ({
  default: "billing-card",
  BillingTrustFooter: "billing-footer",
}));
vi.mock("../src/components/settings/SettingsTabs", () => ({ default: "settings-tabs" }));
vi.mock("../src/components/layout/WorkspacePageFrame", () => ({
  WorkspacePageFrame: "main",
  WorkspacePageIntro: "header",
}));
vi.mock("../src/components/WorkspaceShell", () => ({ default: "workspace" }));

const guide = {
  ownerId: "owner-1",
  agentId: "bot-1",
  agentName: "Sales Bot",
  pendingBrief: "Only offer approved services.",
  phoneProvisionRequested: false,
  phoneProvisioned: false,
  phoneActivationRequired: true,
};
const response = (body: unknown) => new Response(JSON.stringify(body));
function saveGuide(payload = guide) {
  stashPostCreateWizard(payload);
  stashPostCreateWizardStep("launch");
}
function mount() {
  harness.cursor = 0;
  BillingSettings();
  return harness.effect?.();
}
function pendingVerification() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  harness.fetch.mockImplementation((url: string) =>
    url === "/api/billing/checkout/verify"
      ? promise
      : Promise.resolve(
          response(url === "/api/billing/status" ? { subscription: null } : { balance_usd: 0 }),
        ),
  );
  return () => resolve(response({ synced: true, payment_status: "paid" }));
}
async function expectBillingLoaded() {
  await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledWith("/api/conversation-balance"));
  expect(harness.replace).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.states = [];
  harness.effect = null;
  harness.user = { id: "owner-1" };
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", {
    location: {
      pathname: "/settings/billing",
      search: "?billing=success&session_id=cs_test_owner",
      hash: "",
      replace: harness.replace,
    },
    history: { state: null, replaceState: harness.replaceState },
    setTimeout,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("checkout guide ownership", () => {
  it("waits for the signed-in owner before consuming checkout proof or a saved guide", () => {
    saveGuide();
    harness.user = null;
    mount();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.replaceState).not.toHaveBeenCalled();
    expect(readPostCreateWizard()).toMatchObject(guide);
  });

  it("resumes the verified owner's same guide and preserves its latest brief", async () => {
    saveGuide();
    const finish = pendingVerification();
    mount();
    saveGuide({ ...guide, pendingBrief: "Latest approved policy." });
    finish();
    await vi.waitFor(() => expect(harness.replace).toHaveBeenCalledWith("/studio"));
    expect(readPostCreateWizard()).toMatchObject({
      ownerId: "owner-1",
      pendingBrief: "Latest approved policy.",
      phoneActivationRequired: false,
    });
    expect(harness.replace).toHaveBeenCalledTimes(1);
  });

  it("does not route a fulfilled checkout through another account's saved guide", async () => {
    saveGuide();
    harness.user = { id: "owner-2" };
    const finish = pendingVerification();
    mount();
    finish();
    await expectBillingLoaded();
    expect(harness.replaceState).toHaveBeenCalledTimes(1);
  });

  it.each(["dismissed", "replaced", "different-owner"])(
    "does not revive a %s guide when verification finishes late",
    async (change) => {
      saveGuide();
      const finish = pendingVerification();
      mount();
      if (change === "dismissed") clearPostCreateWizard();
      if (change === "replaced") saveGuide({ ...guide, agentId: "bot-2" });
      if (change === "different-owner") saveGuide({ ...guide, ownerId: "owner-2" });
      finish();
      await expectBillingLoaded();
      if (change === "replaced")
        expect(readPostCreateWizard()).toMatchObject({
          agentId: "bot-2",
          phoneActivationRequired: true,
        });
    },
  );

  it("cancels the old owner's reconciliation when authentication changes", async () => {
    saveGuide();
    const finish = pendingVerification();
    const cleanup = mount();
    expect(harness.dependencies).toEqual(["owner-1"]);
    cleanup?.();
    harness.user = null;
    mount();
    const stateAtLogout = [...harness.states];
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.states).toEqual(stateAtLogout);
    expect(harness.replace).not.toHaveBeenCalled();
    expect(harness.replaceState).not.toHaveBeenCalled();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });
});
