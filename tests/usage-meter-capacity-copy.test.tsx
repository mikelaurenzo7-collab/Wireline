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

function findButton(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  return node.type === "button" ? node : findButton(node.props.children);
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
    ai_spend_usd: 0.375,
    ai_spend_limit_usd: 3,
    reset_at: "2026-10-01T00:00:00Z",
  };
});

describe("voice allowance boundary copy", () => {
  it("shows a concise payment-reversal hold without hiding independent balance or billing management", () => {
    h.snapshot.paid_allowance_funding_blocked = true;
    h.snapshot.live_voice_blocked = true;
    const meter = UsageMeter({ onUpgrade: vi.fn() });
    const content = text(meter);
    expect(content).toContain("Payment needs attention");
    expect(content).toContain(
      "Included work is paused after a payment reversal. Review Billing or contact support.",
    );
    expect(content).toContain("$24.50");
    expect(content).toContain("Manage Billing");
    expect(content).not.toContain("New calls paused");
    expect(content).not.toContain("refresh");
    const findSupport = (node: ReactNode): any => {
      if (Array.isArray(node)) return node.map(findSupport).find(Boolean);
      if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) return null;
      return node.type === "a" ? node : findSupport(node.props.children);
    };
    expect(findSupport(meter)?.props.href).toBe(
      "mailto:support@botbound.app?subject=Payment%20needs%20attention",
    );
  });

  it("describes reversed Email funding without claiming every account or credit is blocked", () => {
    h.snapshot.plan_id = "email-light";
    h.snapshot.voice_minutes_used = 0;
    h.snapshot.voice_minutes_included = 0;
    h.snapshot.paid_allowance_funding_blocked = true;
    const content = text(UsageMeter({}));
    expect(content).toContain("Included work is paused after a payment reversal");
    expect(content).not.toContain("New calls paused");
    expect(content).toContain("$24.50");
  });

  it("does not infer a reversal when the optional compatibility flag is absent", () => {
    expect(text(UsageMeter({}))).not.toContain("Payment needs attention");
  });

  it("keeps the compact funding explanation actionable without promising refresh fixes it", () => {
    h.snapshot.paid_allowance_funding_blocked = true;
    const meter = UsageMeter({ compact: true });
    expect(meter?.props.title).toContain(
      "Included work is paused after a payment reversal. Review Billing or contact support.",
    );
    expect(meter?.props.title).not.toContain("refresh");
  });
  it("shows managed AI usage and its cap separately from voice and Runtime Balance", () => {
    const content = text(UsageMeter({ showBalance: false }));
    expect(content).toContain("AI usage");
    expect(content).toContain("Computer and other AI work");
    expect(content).toContain("$0.38 / $3.00 used");
    expect(content).not.toContain("$24.50");
  });

  it("does not round small Computer spend down to zero", () => {
    h.snapshot.ai_spend_usd = 0.0001;
    expect(text(UsageMeter({}))).toContain("$0.0001 / $3.00 used");
  });

  it("uses the server allowance end without promising a renewal or interpreting its opaque key", () => {
    h.snapshot.plan_id = "voice-regular";
    h.snapshot.period_key = "paid:sub_customer:1789401600";
    h.snapshot.reset_at = "2026-10-14T16:00:00Z";
    const content = text(UsageMeter({}));
    expect(content).toContain("Current allowance · through Oct 14");
    expect(content).not.toContain("resets");
    expect(content).not.toContain("paid:sub_customer");
    expect(content).not.toContain("This month");
  });

  it("keeps the compact paid allowance boundary neutral about renewal", () => {
    h.snapshot.reset_at = "2026-10-14T16:00:00Z";
    const meter = UsageMeter({ compact: true });
    expect(meter?.props.title).toContain("current allowance through Oct 14");
    expect(meter?.props.title).not.toContain("resets");
  });

  it("does not mistake a plan restriction for exhausted minutes or promise a reset", () => {
    h.snapshot.voice_minutes_used = 0;
    h.snapshot.live_voice_blocked = true;
    const content = text(UsageMeter({}));
    expect(content).toContain("Review your plan and Runtime Balance in Billing");
    expect(content).not.toContain("included minutes are used");
    expect(content).not.toContain("monthly reset");
    expect(content).not.toContain("resume");

    h.cursor = 0;
    const meter = UsageMeter({ compact: true });
    expect(meter?.props.title).toContain("Review your plan and Runtime Balance in Billing");
    expect(meter?.props.title).not.toContain("reset");
  });

  it("truthfully labels billing management and disables it while the portal request is pending", () => {
    const action = findButton(UsageMeter({ onUpgrade: vi.fn(), upgradePending: true }));
    expect(isValidElement(action)).toBe(true);
    if (!isValidElement<{ disabled: boolean; "aria-busy": boolean }>(action)) return;
    expect(action.props.disabled).toBe(true);
    expect(action.props["aria-busy"]).toBe(true);
    expect(text(action)).toBe("Manage Billing");
  });

  it("keeps the balance visible by default on standalone usage surfaces", () => {
    expect(text(UsageMeter({}))).toContain("$24.50");
  });

  it("can omit a repeated balance while retaining extra-usage payment terms", () => {
    h.snapshot.voice_minutes_used = 142;
    h.snapshot.overage_minutes = 42;
    const content = text(UsageMeter({ showBalance: false }));
    expect(content).not.toContain("$24.50");
    expect(content).toContain("42 extra minutes");
    expect(content).toContain("covered by Runtime Balance at $0.22/min");
    expect(content).toContain("No automatic invoice overage.");
  });

  it("keeps call-pause and restoration constraints when the containing page owns the balance", () => {
    h.snapshot.credit_balance_usd = -3.5;
    h.snapshot.completion_grace_due_usd = 3.5;
    h.snapshot.live_voice_blocked = true;
    const content = text(UsageMeter({ showBalance: false }));
    expect(content).toContain("New calls paused");
    expect(content).toContain("$3.50 is due for extra call time");
    expect(content).toContain(
      "Clear it in Billing and check your plan before starting another call.",
    );
    expect(content).not.toContain("resume new calls");
    expect(content).toContain(
      "Calls use their admitted duration, including any completion buffer.",
    );
    expect(content).not.toContain("never cuts off");
  });

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
