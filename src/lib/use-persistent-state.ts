import { useCallback, useEffect, useState } from "react";

/**
 * Minimal Storage shape we depend on — lets the pure helpers be unit-tested
 * with an in-memory stub (the project tests pure logic, no DOM renderer).
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = "wireline:personal:";
export const storageKeyFor = (key: string) => `${PREFIX}${key}`;

/** Read + JSON-parse a persisted value, falling back to `initial` on any error. */
export function readPersisted<T>(store: KeyValueStore | null, key: string, initial: T): T {
  if (!store) return initial;
  try {
    const raw = store.getItem(storageKeyFor(key));
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

/** JSON-serialize + persist a value; swallows storage-disabled errors. */
export function writePersisted<T>(store: KeyValueStore | null, key: string, value: T): void {
  if (!store) return;
  try {
    store.setItem(storageKeyFor(key), JSON.stringify(value));
  } catch {
    /* storage disabled (private mode) — caller keeps in-memory value */
  }
}

function browserStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * usePersistentState — like useState, but mirrored to localStorage so the
 * personal workspace remembers the operator's choices (selected model, enabled
 * automations, guardrail toggles, setup progress) across reloads and tabs.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPersisted(browserStore(), key, initial));

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writePersisted(browserStore(), key, resolved);
        return resolved;
      });
    },
    [key],
  );

  // Keep multiple tabs / surfaces in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKeyFor(key) && e.newValue !== null) {
        try {
          setValue(JSON.parse(e.newValue) as T);
        } catch {
          /* ignore malformed cross-tab write */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [value, set];
}
