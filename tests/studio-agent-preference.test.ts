import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearStudioLastAgentId,
  readStudioLastAgentId,
  resolveStudioActiveAgentId,
  KEY,
  writeStudioLastAgentId,
} from "../src/lib/studio-agent-preference";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
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
  };
}

describe("studio-agent-preference", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("reads and writes the MRU agent id", () => {
    writeStudioLastAgentId("agent-b");
    expect(readStudioLastAgentId()).toBe("agent-b");
    expect(globalThis.localStorage.getItem(KEY)).toBe("agent-b");
  });

  it("prefers a valid requested id over MRU", () => {
    writeStudioLastAgentId("agent-b");
    expect(resolveStudioActiveAgentId("agent-a", ["agent-a", "agent-b"])).toBe("agent-a");
  });

  it("falls back to MRU when requested id is missing from roster", () => {
    writeStudioLastAgentId("agent-b");
    expect(resolveStudioActiveAgentId("deleted-agent", ["agent-a", "agent-b"])).toBe("agent-b");
  });

  it("falls back to first roster id when MRU is invalid", () => {
    writeStudioLastAgentId("deleted-agent");
    expect(resolveStudioActiveAgentId(null, ["agent-a", "agent-b"])).toBe("agent-a");
  });

  it("falls back to first roster id when MRU and requested id are invalid", () => {
    writeStudioLastAgentId("stale-mru");
    expect(resolveStudioActiveAgentId("stale-request", ["agent-a", "agent-b"])).toBe("agent-a");
  });

  it("returns null for an empty roster", () => {
    writeStudioLastAgentId("agent-a");
    expect(resolveStudioActiveAgentId(null, [])).toBeNull();
  });

  it("clears MRU on logout helper", () => {
    writeStudioLastAgentId("agent-a");
    clearStudioLastAgentId();
    expect(readStudioLastAgentId()).toBeNull();
  });

  it("still resolves a Bot when the storage getter is denied", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Storage access denied");
      },
    });

    expect(readStudioLastAgentId()).toBeNull();
    expect(resolveStudioActiveAgentId(null, ["agent-a", "agent-b"])).toBe("agent-a");
    expect(resolveStudioActiveAgentId("agent-b", ["agent-a", "agent-b"])).toBe("agent-b");
    expect(() => writeStudioLastAgentId("agent-b")).not.toThrow();
    expect(() => clearStudioLastAgentId()).not.toThrow();
  });

  it("keeps preference read, write, and logout failures non-blocking", () => {
    const denied = () => {
      throw new Error("Storage operation denied");
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: denied, setItem: denied, removeItem: denied },
    });

    expect(readStudioLastAgentId()).toBeNull();
    expect(() => writeStudioLastAgentId("agent-b")).not.toThrow();
    expect(() => clearStudioLastAgentId()).not.toThrow();
    expect(resolveStudioActiveAgentId("stale", ["agent-a"])).toBe("agent-a");
  });
});
