import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsageMeter from "../src/components/UsageMeter";

const h = vi.hoisted(() => ({ cursor: 0, snapshot: {} as Record<string, unknown> }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [[h.snapshot, false, null][h.cursor++], vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/components/ui/shadcn/Progress", () => ({ Progress: "progress" }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
beforeEach(() => {
  h.cursor = 0;
  h.snapshot = {
    plan_id: "team",
    voice_minutes_used: 80,
    voice_minutes_included: 100,
    overage_minutes: 0,
    overage_per_min_usd: 0.22,
    credit_balance_usd: 24.5,
    completion_grace_due_usd: 0,
    live_voice_blocked: false,
    reset_at: "2026-10-01T00:00:00Z",
  };
});

describe("voice allowance boundary copy", () => {
  it("describes the allowance as approaching while minutes remain", () => {
    expect(text(UsageMeter({}))).toContain("Approaching your 100 included minutes. After that");
  });

  it.each([100, 142])("describes %s of 100 minutes as used", (used) => {
    h.snapshot.voice_minutes_used = used;
    const content = text(UsageMeter({}));
    expect(content).toContain("Your 100 included minutes are used. New calls use Runtime Balance");
    expect(content).not.toContain("Approaching your");
    expect(content).not.toContain("After that");
  });

  it("retains the actual extra-usage disclosure once prepaid overage is recorded", () => {
    h.snapshot.voice_minutes_used = 142;
    h.snapshot.overage_minutes = 42;
    const content = text(UsageMeter({}));
    expect(content).toContain("42 extra minutes");
    expect(content).toContain("covered by Runtime Balance at $0.22/min");
    expect(content).not.toContain("Approaching your");
  });
});
