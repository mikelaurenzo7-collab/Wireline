import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POST_CREATE_WIZARD_KEY,
  POST_CREATE_WIZARD_STEP_KEY,
  clearPostCreateWizard,
  readPostCreateWizard,
  readPostCreateWizardStep,
  stashPostCreateWizard,
  stashPostCreateWizardStep,
  updatePostCreateWizard,
} from "../src/lib/wireline-create-flow";

const payload = {
  agentId: "agent_test_1",
  agentName: "Reception",
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
});
