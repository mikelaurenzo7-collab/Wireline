import { describe, expect, it } from "vitest";
import {
  clearPendingOutboundDial,
  isConfirmedTerminalDial,
  readPendingOutboundDial,
  savePendingOutboundDial,
} from "../src/lib/outbound-dial-recovery";

const requestKey = "e2c86757-a3c0-42eb-a6bc-2405ffb0c09c";
function storage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

describe("outbound operation recovery", () => {
  it("preserves only the operation ID across reopen and scopes it to its owner", () => {
    const store = storage();
    savePendingOutboundDial("owner-a", requestKey, store);
    expect(readPendingOutboundDial("owner-a", store)).toEqual({ requestKey });
    expect(readPendingOutboundDial("owner-b", store)).toBeNull();
    expect([...store.entries.values()]).toEqual([JSON.stringify({ version: 1, requestKey })]);
    clearPendingOutboundDial("owner-a", "a2c86757-a3c0-42eb-a6bc-2405ffb0c09c", store);
    expect(readPendingOutboundDial("owner-a", store)).not.toBeNull();
    clearPendingOutboundDial("owner-a", requestKey, store);
    expect(readPendingOutboundDial("owner-a", store)).toBeNull();
  });

  it("does not dispatch when operation storage cannot be confirmed", () => {
    const store = storage();
    expect(() =>
      savePendingOutboundDial("owner", requestKey, { ...store, setItem: () => {} }),
    ).toThrow("Could not retain");
    store.entries.set("botbound:outbound-dial:owner", "{}");
    expect(() => readPendingOutboundDial("owner", store)).toThrow("could not be read");
  });

  it("requires exact request identity and an explicit terminal state before clearing", () => {
    for (const value of [
      null,
      {},
      { terminal: true },
      { requestKey, status: "accepted", terminal: true },
      { requestKey, status: "completed", terminal: false },
      { requestKey: "other", status: "completed", terminal: true },
    ]) {
      expect(isConfirmedTerminalDial(value, requestKey)).toBe(false);
    }
    expect(
      isConfirmedTerminalDial({ requestKey, terminal: true, status: "completed" }, requestKey),
    ).toBe(true);
    expect(
      isConfirmedTerminalDial({ requestKey, terminal: true, status: "failed" }, requestKey),
    ).toBe(true);
  });
});
