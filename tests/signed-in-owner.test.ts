import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBoOnboarding, readBoOnboarding, writeBoOnboarding } from "../src/lib/bo-onboarding";
import {
  isSignedInOwner,
  setSignedInOwner,
  suspendSignedInOwner,
} from "../src/lib/signed-in-owner";
import { extractionBodyPersistedSomething } from "../src/lib/training-extraction-result";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  setSignedInOwner(null);
  setSignedInOwner("owner-a");
});
afterEach(() => {
  setSignedInOwner(null);
  vi.unstubAllGlobals();
});

// The first-brief recovery retired with the create dialog and the setup guide.
// Bo's first conversation keeps its own per-account state, and the account
// guard the recovery owned now lives in signed-in-owner.
describe("private first-run session state", () => {
  it("clears the retired first-brief and setup-guide keys on hydration and keeps the rest", () => {
    storage.set("unrelated", "keep");
    storage.set("wireline:create-brief:v1:owner-a:bot-one", "Our repair shop opens at 7am.");
    storage.set("wireline:create-brief:v1:owner-b:bot-two", "Another account's brief");
    storage.set("wireline:post-create-wizard", JSON.stringify({ agentId: "bot-one" }));
    storage.set("wireline:post-create-wizard-step", "launch");
    writeBoOnboarding("owner-a", { agentId: "bo", step: "website", business: "Rivera Plumbing" });
    setSignedInOwner("owner-a");
    expect(storage.get("unrelated")).toBe("keep");
    expect([...storage.keys()].filter((key) => key.includes("create-brief"))).toEqual([]);
    expect([...storage.keys()].filter((key) => key.includes("post-create-wizard"))).toEqual([]);
    expect(storage.size).toBe(2);
    // Hydrating the same account again does not end Bo's conversation.
    expect(readBoOnboarding("owner-a")).toEqual({
      agentId: "bo",
      step: "website",
      business: "Rivera Plumbing",
    });
  });

  it("stops honoring a previous account after a switch and owns nothing during an inconclusive session probe", () => {
    expect(isSignedInOwner("owner-a")).toBe(true);
    expect(isSignedInOwner("owner-b")).toBe(false);
    expect(isSignedInOwner("")).toBe(false);
    writeBoOnboarding("owner-a", { agentId: "bo-a", step: "website", business: "Rivera Plumbing" });
    setSignedInOwner("owner-b");
    expect(isSignedInOwner("owner-a")).toBe(false);
    expect(isSignedInOwner("owner-b")).toBe(true);
    expect(readBoOnboarding("owner-b")).toBeNull();
    // The previous account's business line does not stay in this tab.
    expect(readBoOnboarding("owner-a")).toBeNull();

    writeBoOnboarding("owner-b", { agentId: "bo", step: "questions" });
    suspendSignedInOwner();
    expect(isSignedInOwner("owner-b")).toBe(false);
    // The probe deletes nothing: once the session is confirmed, Bo picks up where it was.
    setSignedInOwner("owner-b");
    expect(isSignedInOwner("owner-b")).toBe(true);
    expect(readBoOnboarding("owner-b")).toEqual({ agentId: "bo", step: "questions" });
    setSignedInOwner(null);
    expect(isSignedInOwner("owner-b")).toBe(false);
    expect(readBoOnboarding("owner-b")).toBeNull();
  });

  it("keeps the account guard and Bo's conversation working when browser storage is denied", () => {
    vi.stubGlobal("sessionStorage", {
      get length(): number {
        throw new Error("Denied");
      },
      key: () => {
        throw new Error("Denied");
      },
      getItem: () => {
        throw new Error("Denied");
      },
      setItem: () => {
        throw new Error("Denied");
      },
      removeItem: () => {
        throw new Error("Denied");
      },
    });
    expect(() => setSignedInOwner("owner-b")).not.toThrow();
    expect(isSignedInOwner("owner-b")).toBe(true);
    expect(isSignedInOwner("owner-a")).toBe(false);
    expect(() => writeBoOnboarding("owner-b", { agentId: "bo", step: "about" })).not.toThrow();
    expect(readBoOnboarding("owner-b")).toBeNull();
    expect(() => clearBoOnboarding("owner-b")).not.toThrow();
  });
});

describe("confirmed extraction result", () => {
  it.each([
    {},
    null,
    { readiness: { rules: 0, facts: 0, tone: false } },
    { readiness: { rules: "1", facts: -1, tone: "false" } },
    { directives: [], knowledge: [], personality: " " },
  ])("does not mark empty or malformed content as training success: %j", (body) => {
    expect(extractionBodyPersistedSomething(body)).toBe(false);
  });

  it.each([
    { readiness: { rules: 1, facts: 0, tone: false } },
    { readiness: { rules: 0, facts: 1, tone: false } },
    { readiness: { rules: 0, facts: 0, tone: true } },
    { directives: [{ content: "Confirm the model" }] },
    { alreadySaved: true },
  ])("recognizes persisted training: %j", (body) => {
    expect(extractionBodyPersistedSomething(body)).toBe(true);
  });
});
