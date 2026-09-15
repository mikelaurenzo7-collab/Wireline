import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POST_CREATE_WIZARD_KEY,
  POST_CREATE_WIZARD_STEP_KEY,
  clearPostCreateWizard,
  readPostCreateWizard,
  readPostCreateWizardForOwner,
  readPostCreateWizardStep,
  stashPostCreateWizard,
  stashPostCreateWizardStep,
  updatePostCreateWizard,
  updatePostCreateBrief,
} from "../src/lib/wireline-create-flow";

const payload = {
  agentId: "agent_test_1",
  agentName: "Reception",
  ownerId: "owner-1",
  markKey: "spark-rose" as const,
  phoneProvisionRequested: true,
  phoneProvisioned: false,
};

function installSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    get length() {
      return store.size;
    },
  });
}

describe("wireline create flow wizard persistence", () => {
  beforeEach(() => {
    installSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stashes wizard payload and default train step", () => {
    stashPostCreateWizard(payload);
    expect(readPostCreateWizard()).toEqual(payload);
    expect(readPostCreateWizardStep()).toBe("train");
  });

  it("survives refresh — read without consume", () => {
    stashPostCreateWizard(payload);
    stashPostCreateWizardStep("channels");
    expect(readPostCreateWizard()).toEqual(payload);
    expect(readPostCreateWizardStep()).toBe("channels");
  });

  it("accepts launch as the live third step", () => {
    stashPostCreateWizard(payload);
    stashPostCreateWizardStep("launch");
    expect(readPostCreateWizardStep()).toBe("launch");
  });

  it("clears wizard and step on dismiss", () => {
    stashPostCreateWizard(payload);
    stashPostCreateWizardStep("wire");
    clearPostCreateWizard();
    expect(readPostCreateWizard()).toBeNull();
    expect(readPostCreateWizardStep()).toBeNull();
    expect(sessionStorage.getItem(POST_CREATE_WIZARD_KEY)).toBeNull();
    expect(sessionStorage.getItem(POST_CREATE_WIZARD_STEP_KEY)).toBeNull();
  });

  it("applies a background phone result without resetting the current setup step", () => {
    stashPostCreateWizard(payload);
    stashPostCreateWizardStep("launch");
    const updated = {
      ...payload,
      phoneProvisioned: true,
      phoneNumber: "+12025550123",
      identityBootstrapComplete: true,
    };

    expect(updatePostCreateWizard(updated)).toBe(true);
    expect(readPostCreateWizard()).toEqual(updated);
    expect(readPostCreateWizardStep()).toBe("launch");
  });

  it("does not resurrect a dismissed guide when provisioning finishes later", () => {
    stashPostCreateWizard(payload);
    clearPostCreateWizard();

    expect(updatePostCreateWizard({ ...payload, identityBootstrapComplete: true })).toBe(false);
    expect(readPostCreateWizard()).toBeNull();
    expect(readPostCreateWizardStep()).toBeNull();
  });

  it("does not let an older Bot's background result overwrite the current guide", () => {
    stashPostCreateWizard(payload);
    const current = { ...payload, agentId: "agent_test_2", agentName: "Sales" };
    stashPostCreateWizard(current);
    stashPostCreateWizardStep("test");

    expect(updatePostCreateWizard({ ...payload, identityBootstrapComplete: true })).toBe(false);
    expect(readPostCreateWizard()).toEqual(current);
    expect(readPostCreateWizardStep()).toBe("test");
  });

  it("does not restore a successfully saved brief when identity setup finishes late", () => {
    const pending = { ...payload, pendingBrief: "Ask about timing." };
    stashPostCreateWizard(pending);
    expect(updatePostCreateBrief(payload.agentId, null)).toBe(true);
    stashPostCreateWizardStep("test");
    updatePostCreateWizard({ ...pending, identityBootstrapComplete: true });
    expect(readPostCreateWizard()?.pendingBrief).toBeUndefined();
    expect(readPostCreateWizardStep()).toBe("test");
  });

  it("preserves the latest brief edit and identity fields whichever request finishes first", () => {
    const pending = { ...payload, pendingBrief: "Original brief" };
    stashPostCreateWizard(pending);
    updatePostCreateBrief(payload.agentId, "Ask about budget and timing.");
    updatePostCreateWizard({
      ...pending,
      phoneNumber: "+12025550123",
      identityBootstrapComplete: true,
    });
    expect(readPostCreateWizard()).toMatchObject({
      pendingBrief: "Ask about budget and timing.",
      phoneNumber: "+12025550123",
    });
    updatePostCreateBrief(payload.agentId, null);
    expect(readPostCreateWizard()).toMatchObject({
      phoneNumber: "+12025550123",
      identityBootstrapComplete: true,
    });
    expect(readPostCreateWizard()?.pendingBrief).toBeUndefined();
  });

  it("never lets a stale brief retry change another Bot's guide or reopen a dismissed one", () => {
    stashPostCreateWizard({ ...payload, agentId: "new-bot", pendingBrief: "New brief" });
    expect(updatePostCreateBrief(payload.agentId, null)).toBe(false);
    expect(readPostCreateWizard()?.pendingBrief).toBe("New brief");
    clearPostCreateWizard();
    expect(updatePostCreateBrief("new-bot", "Late edit")).toBe(false);
    expect(readPostCreateWizard()).toBeNull();
  });

  it("rejects a malformed persisted brief while keeping a valid guide", () => {
    sessionStorage.setItem(
      POST_CREATE_WIZARD_KEY,
      JSON.stringify({ ...payload, pendingBrief: { text: "forged" } }),
    );
    expect(readPostCreateWizard()?.pendingBrief).toBeUndefined();
    expect(readPostCreateWizard()?.agentId).toBe(payload.agentId);
  });

  it("resumes a brief only for the account that created the guide", () => {
    stashPostCreateWizard({
      ...payload,
      ownerId: "owner-1",
      pendingBrief: "Private business rules",
    });
    expect(readPostCreateWizardForOwner(null)).toBeNull();
    expect(readPostCreateWizardForOwner("owner-1")?.pendingBrief).toBe("Private business rules");
    expect(readPostCreateWizardForOwner("owner-2")).toBeNull();
    expect(readPostCreateWizard()).toBeNull();
  });

  it("does not reveal a legacy unbound guide to the next signed-in account", () => {
    sessionStorage.setItem(POST_CREATE_WIZARD_KEY, JSON.stringify({ ...payload, ownerId: undefined }));
    expect(readPostCreateWizardForOwner("owner-1")).toBeNull();
    expect(readPostCreateWizard()).toBeNull();
  });
});
