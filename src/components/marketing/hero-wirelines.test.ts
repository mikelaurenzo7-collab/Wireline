import { describe, expect, it } from "vitest";
import { WIRELINE_AMBIENT, WIRELINE_HUB, WIRELINE_VIEWBOX, WIRELINE_WIRES } from "./hero-wirelines";

const VIEW = { w: 1440, h: 720 };
const hubPoint = `${WIRELINE_HUB.x} ${WIRELINE_HUB.y}`;

describe("hero-wirelines geometry", () => {
  it("uses the normalized hero viewBox", () => {
    expect(WIRELINE_VIEWBOX).toBe(`0 0 ${VIEW.w} ${VIEW.h}`);
  });

  it("connects all four robots through the exchange hub", () => {
    expect(WIRELINE_WIRES).toHaveLength(4);
    for (const wire of WIRELINE_WIRES) {
      if (wire.side === "left") {
        // left wires flow INTO the hub (path ends at hub)
        expect(wire.d.trim().endsWith(hubPoint)).toBe(true);
        expect(wire.d.startsWith(`M ${wire.anchor.x} ${wire.anchor.y}`)).toBe(true);
      } else {
        // right wires flow OUT of the hub (path starts at hub)
        expect(wire.d.startsWith(`M ${hubPoint}`)).toBe(true);
        expect(wire.d.trim().endsWith(`${wire.anchor.x} ${wire.anchor.y}`)).toBe(true);
      }
    }
  });

  it("keeps two wires per gutter side", () => {
    expect(WIRELINE_WIRES.filter((w) => w.side === "left")).toHaveLength(2);
    expect(WIRELINE_WIRES.filter((w) => w.side === "right")).toHaveLength(2);
  });

  it("anchors robots in the gutters, outside the 31rem content corridor", () => {
    const corridorHalf = 31 * 16; // HERO_CORRIDOR_HALF in px
    for (const wire of WIRELINE_WIRES) {
      const fromCenter = Math.abs(wire.anchor.x - VIEW.w / 2);
      expect(fromCenter).toBeGreaterThan(corridorHalf);
      expect(wire.anchor.x).toBeGreaterThan(0);
      expect(wire.anchor.x).toBeLessThan(VIEW.w);
      // robots live in the top ~14–30% of the hero
      expect(wire.anchor.y).toBeGreaterThan(0.1 * VIEW.h);
      expect(wire.anchor.y).toBeLessThan(0.35 * VIEW.h);
    }
  });

  it("keeps the exchange hub centered behind the headline", () => {
    expect(WIRELINE_HUB.x).toBe(VIEW.w / 2);
    expect(WIRELINE_HUB.y).toBeGreaterThan(0.2 * VIEW.h);
    expect(WIRELINE_HUB.y).toBeLessThan(0.45 * VIEW.h);
  });

  it("ambient wires span the full hero width", () => {
    expect(WIRELINE_AMBIENT).toHaveLength(3);
    for (const d of WIRELINE_AMBIENT) {
      const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+-?\d+(?:\.\d+)?/g)].map((m) =>
        parseFloat(m[1]),
      );
      expect(Math.min(...xs)).toBeLessThanOrEqual(0);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(VIEW.w);
    }
  });
});
