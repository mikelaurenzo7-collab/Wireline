import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { emitProductEventOnce } from "../src/lib/product-event-client";

describe("product event client", () => {
  const pushes: Record<string, unknown>[] = [];

  beforeEach(() => {
    pushes.length = 0;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    vi.stubGlobal("window", {
      dataLayer: { push: (data: Record<string, unknown>) => pushes.push(data) },
      localStorage,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires a product event at most once per scoped activation milestone", () => {
    emitProductEventOnce({ event: "first_call_completed", agentId: "agent-1" });
    emitProductEventOnce({ event: "first_call_completed", agentId: "agent-1" });

    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.event).toBe("first-call-made");

    emitProductEventOnce({ event: "first_call_completed", agentId: "agent-2" });
    expect(pushes).toHaveLength(2);
  });
});
