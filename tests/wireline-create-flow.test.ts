import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POST_CREATE_WIZARD_KEY,
  POST_CREATE_WIZARD_STEP_KEY,
  clearPostCreateWizard,
  readPostCreateWizard,
  readPostCreateWizardStep,
  stashPostCreateWizard,
  stashPostCreateWizardStep,
} from "../src/lib/wireline-create-flow";

const payload = {
  agentId: "agent_test_1",
  agentName: "Reception",
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

  it("clears wizard and step on dismiss", () => {
    stashPostCreateWizard(payload);
    stashPostCreateWizardStep("wire");
    clearPostCreateWizard();
    expect(readPostCreateWizard()).toBeNull();
    expect(readPostCreateWizardStep()).toBeNull();
    expect(sessionStorage.getItem(POST_CREATE_WIZARD_KEY)).toBeNull();
    expect(sessionStorage.getItem(POST_CREATE_WIZARD_STEP_KEY)).toBeNull();
  });
});
