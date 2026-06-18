import { describe, expect, it } from "vitest";
import {
  type KeyValueStore,
  readPersisted,
  storageKeyFor,
  writePersisted,
} from "./use-persistent-state";

function memoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe("use-persistent-state helpers", () => {
  it("namespaces keys under wireline:personal:", () => {
    expect(storageKeyFor("model")).toBe("wireline:personal:model");
  });

  it("returns initial when nothing is stored", () => {
    expect(readPersisted(memoryStore(), "model", "Grok 4.3")).toBe("Grok 4.3");
  });

  it("round-trips values through write + read", () => {
    const store = memoryStore();
    writePersisted(store, "enabled", ["place-call", "wait-on-hold"]);
    expect(readPersisted(store, "enabled", [] as string[])).toEqual(["place-call", "wait-on-hold"]);
  });

  it("rehydrates a pre-seeded value", () => {
    const store = memoryStore({ "wireline:personal:flag": "true" });
    expect(readPersisted(store, "flag", false)).toBe(true);
  });

  it("falls back to initial on malformed JSON", () => {
    const store = memoryStore({ "wireline:personal:bad": "{not json" });
    expect(readPersisted(store, "bad", 7)).toBe(7);
  });

  it("is a no-op (no throw) when storage is unavailable", () => {
    expect(() => writePersisted(null, "x", 1)).not.toThrow();
    expect(readPersisted(null, "x", "fallback")).toBe("fallback");
  });
});
