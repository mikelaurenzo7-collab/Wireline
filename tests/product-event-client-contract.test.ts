import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { emitProductEvent } from "../src/lib/product-event-client";

describe("product event client", () => {
  const pushes: Record<string, unknown>[] = [];

  beforeEach(() => {
    pushes.length = 0;
    vi.stubGlobal("window", {
      dataLayer: { push: (data: Record<string, unknown>) => pushes.push(data) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes canonical and GTM alias events for activation milestones", () => {
    emitProductEvent({ event: "agent_created", agentId: "agent-1" });
    emitProductEvent({ event: "first_call_completed", agentId: "agent-1" });

    expect(pushes[0]?.event).toBe("agent-created");
    expect(pushes[0]?.wireline_event).toBe("agent_created");
    expect(pushes[1]?.event).toBe("first-call-made");
    expect(pushes[1]?.wireline_event).toBe("first_call_completed");
  });
});
