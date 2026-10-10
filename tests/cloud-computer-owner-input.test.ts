import { describe, expect, it } from "vitest";

import { ownerInputFrom } from "../src/lib/cloud-computer/owner-input";

describe("owner browser input requests", () => {
  it("parses every control sent by the takeover pane", () => {
    expect(ownerInputFrom({ kind: "click", x: 20, y: 30 })).toEqual({
      kind: "click",
      x: 20,
      y: 30,
    });
    expect(ownerInputFrom({ kind: "drag", from: { x: 20, y: 30 }, to: { x: 40, y: 50 } })).toEqual({
      kind: "drag",
      from: { x: 20, y: 30 },
      to: { x: 40, y: 50 },
    });
    expect(ownerInputFrom({ kind: "scroll", x: 20, y: 30, deltaX: 0, deltaY: 500 })).toEqual({
      kind: "scroll",
      x: 20,
      y: 30,
      deltaX: 0,
      deltaY: 500,
    });
    expect(ownerInputFrom({ kind: "navigate", url: "https://example.com/login" })).toEqual({
      kind: "navigate",
      url: "https://example.com/login",
    });
    expect(ownerInputFrom({ kind: "history", action: "back" })).toEqual({
      kind: "history",
      action: "back",
    });
    expect(ownerInputFrom({ kind: "type", text: "owner value" })).toEqual({
      kind: "type",
      text: "owner value",
    });
    expect(ownerInputFrom({ kind: "key", key: "Enter" })).toEqual({ kind: "key", key: "Enter" });
  });

  it("bounds owner input and rejects invalid history actions", () => {
    expect(() => ownerInputFrom({ kind: "navigate", url: "x".repeat(2_049) })).toThrow();
    expect(() => ownerInputFrom({ kind: "history", action: "delete" })).toThrow();
    expect(() => ownerInputFrom({ kind: "click", x: 1_281, y: 20 })).toThrow();
    expect(() =>
      ownerInputFrom({ kind: "scroll", x: 20, y: 30, deltaX: 0, deltaY: 1_201 }),
    ).toThrow();
    expect(() => ownerInputFrom({ kind: "type", text: "x".repeat(1_001) })).toThrow();
  });
});
