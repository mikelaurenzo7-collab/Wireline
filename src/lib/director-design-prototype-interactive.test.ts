import { describe, expect, it } from "vitest";
import {
  DESIGN_PROTOTYPE_INTERACTIVITY_MARKER,
  ensurePrototypeInteractivity,
} from "./director-design-prototype-interactive";

describe("ensurePrototypeInteractivity", () => {
  it("injects script before closing body", () => {
    const html = "<!doctype html><html><body><main>Hi</main></body></html>";
    const out = ensurePrototypeInteractivity(html);
    expect(out).toContain(DESIGN_PROTOTYPE_INTERACTIVITY_MARKER);
    expect(out).toMatch(/<script>[\s\S]*<\/body>/i);
  });

  it("is idempotent", () => {
    const html = "<html><body></body></html>";
    const once = ensurePrototypeInteractivity(html);
    expect(ensurePrototypeInteractivity(once)).toBe(once);
  });

  it("appends script when body tag is missing", () => {
    const html = "<div>fragment</div>";
    const out = ensurePrototypeInteractivity(html);
    expect(out).toContain(DESIGN_PROTOTYPE_INTERACTIVITY_MARKER);
  });
});
