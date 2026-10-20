import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AISpendView from "../src/components/insights/AISpendView";
import VoiceLatencyView from "../src/components/insights/VoiceLatencyView";
import { computeAuditSummary } from "../src/lib/audit-summary";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
  insight: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    const slot = (h.slots[index] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) {
          slot.value = value;
          h.dirty = true;
        }
      },
    ];
  },
  useEffect(callback: () => void | (() => void), deps?: readonly unknown[]) {
    const index = h.cursor++;
    const slot = (h.slots[index] ??= {});
    if (!slot.deps || !deps || deps.some((value, i) => !Object.is(value, slot.deps?.[i]))) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = callback() || undefined;
      });
    }
  },
}));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/lib/api", async () => ({
  authFetch: h.fetch,
  readApiJson: (await import("../src/lib/api-base")).readApiJson,
}));
vi.mock("../src/components/insights/shared", () => ({
  fetchInsight: h.insight,
  InsightSkeleton: "skeleton",
  ErrCard: "error-card",
  InsightEmpty: "empty-state",
  SpendStat: "spend-stat",
}));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));
vi.mock("../src/components/ui/shadcn/ShadButton", () => ({ ShadButton: "button" }));

type Props = {
  children?: ReactNode;
  error?: string;
  disabled?: boolean;
  value?: string | number;
  label?: string;
  className?: string;
  "aria-hidden"?: string;
  onRetry?: () => void;
  onClick?: () => unknown;
  onChange?: (event: { target: { value: string } }) => void;
};
type Element = ReactElement<Props>;
let tree: ReactNode;
let component: () => ReactNode;
let days: number;
const status = {
  period: "2026-09",
  monthly_limit_usd: 20,
  maximum_limit_usd: 30,
  month_to_date_usd: 5,
  warn_threshold_pct: 80,
  guard_scope: "plan_funded",
};
const budget = { monthly_limit_usd: "20", warn_threshold_pct: 80 };
const actionData = {
  latency: { sample_count: 1, p50_ms: 10, p95_ms: 20 },
  totals: { avg_latency: 15 },
  by_action: [],
};
const voiceData = { trends: [], days: 7 };
const response = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json" },
  });

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function errors() {
  return elements(tree).filter((node) => node.type === "error-card");
}
function saveButton() {
  return elements(tree).find((node) => node.type === "button" && text(node) === "Save budget")!;
}
function render() {
  let passes = 0;
  do {
    if (++passes > 20) throw new Error("Activity render did not settle");
    h.cursor = 0;
    h.dirty = false;
    h.effects = [];
    tree = component();
    h.effects.forEach((effect) => effect());
  } while (h.dirty);
}
async function settle() {
  render();
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    if (h.dirty) render();
  }
}
function mountBudget() {
  // Exercise the actual child component without exporting a production-only test seam.
  h.slots = [{ value: null }, { value: false }, { value: null }, { value: 0 }];
  const view = AISpendView({ days: 7 });
  const card = elements(view).find(
    (node) => typeof node.type === "function" && node.type.name === "SpendBudgetCard",
  )!;
  component = card.type as () => ReactNode;
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  h.insight.mockReset();
  days = 7;
  component = () => VoiceLatencyView({ days });
  h.fetch.mockImplementation(async (url: string) =>
    url === "/api/spend/status" ? response(status) : response({ budget }),
  );
  h.insight.mockImplementation(async (url: string) =>
    url.startsWith("/api/audit/") ? actionData : voiceData,
  );
});
afterEach(() => h.slots.forEach((slot) => slot.cleanup?.()));

describe("Activity budget recovery", () => {
  it("shows actionable payment recovery without hiding spend history or inventing a cap breach", async () => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({ ...status, paid_allowance_funding_blocked: true, hard_capped_now: false })
        : response({ budget }),
    );
    await settle();
    expect(errors()).toHaveLength(0);
    expect(text(tree)).toContain("Payment needs attention");
    expect(text(tree)).toContain(
      "Included work is paused after a payment reversal. Review Billing or contact support.",
    );
    expect(text(tree)).toContain("$5.00");
    expect(text(tree)).not.toContain("Live usage limit reached");
    expect(saveButton()).toBeDefined();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    const links = elements(tree).filter((node) => node.type === "a") as ReactElement<{
      href?: string;
    }>[];
    expect(links.map((node) => node.props.href)).toEqual([
      "/settings/billing",
      "mailto:support@botbound.app?subject=Payment%20needs%20attention",
    ]);
  });
  it("shows the paid allowance end without promising renewal or exposing its internal key", async () => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({
            ...status,
            period: "paid:sub_customer:1789401600",
            reset_at: "2026-10-14T16:00:00Z",
          })
        : response({ budget }),
    );
    await settle();
    expect(text(tree)).toContain("Through Oct 14");
    expect(text(tree)).not.toContain("Resets");
    expect(text(tree)).not.toContain("paid:sub_customer");
  });

  it.each([undefined, "invalid"])(
    "does not infer dates from period keys when reset_at is %s",
    async (resetAt) => {
      mountBudget();
      h.fetch.mockImplementation(async (url: string) =>
        url === "/api/spend/status"
          ? response({ ...status, period: "paid:sub_customer:1789401600", reset_at: resetAt })
          : response({ budget }),
      );
      await settle();
      expect(text(tree)).toContain("Current allowance period");
      expect(text(tree)).not.toContain("Invalid Date");
      expect(text(tree)).not.toContain("paid:sub_customer");
    },
  );

  it("directs a missing paid-period sync to Billing without inventing a new allowance", async () => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({ code: "PAID_ALLOWANCE_SYNC_REQUIRED", error: "Paid period unavailable" }, 503)
        : response({ budget }),
    );
    await settle();
    expect(errors()[0].props.error).toBe(
      "Open Billing and refresh your subscription to sync your usage allowance.",
    );
    expect(saveButton()).toBeUndefined();
    expect(errors()[0].props.onRetry).toBeTypeOf("function");
  });

  it("renders fired thresholds from the server's camel-case alert records", async () => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({
            ...status,
            alerts_fired: [
              { thresholdPct: 80, firedAt: "2026-09-26T12:00:00Z" },
              { thresholdPct: 100, firedAt: "2026-09-27T12:00:00Z" },
            ],
          })
        : response({ budget }),
    );
    await settle();
    expect(text(tree)).toContain("Alerts fired this period: 80% · 100%");
    expect(text(tree)).not.toContain("undefined%");
  });

  it("explains the free simulation scope once while retaining the enforced pause", async () => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({ ...status, guard_scope: "free_simulation_allowance" })
        : response({ budget }),
    );
    await settle();
    expect(text(tree).match(/Activate a paid plan to go live\./g)).toHaveLength(1);
    expect(text(tree)).toContain("Maximum $30.00 per month.");
    expect(text(tree)).toContain("Private simulation pauses at the monthly allowance.");
  });

  it.each([
    ["/api/spend/status", null],
    ["/api/spend/status", {}],
    ["/api/spend/budget", {}],
    ["/api/spend/budget", { budget: { monthly_limit_usd: "not a number" } }],
  ])("treats an incomplete successful %s response as unavailable", async (path, body) => {
    mountBudget();
    h.fetch.mockImplementation(async (url: string) =>
      url === path
        ? response(body)
        : url === "/api/spend/status"
          ? response(status)
          : response({ budget }),
    );
    await settle();
    expect(errors()).toHaveLength(1);
    expect(saveButton()).toBeUndefined();
    expect(text(tree)).not.toContain("No limit set");
  });

  it("recovers a rejected budget request without losing the retry control", async () => {
    mountBudget();
    h.fetch.mockRejectedValue(new TypeError("Network unavailable"));
    await settle();
    expect(errors()).toHaveLength(1);
    expect(errors()[0].props.onRetry).toBeTypeOf("function");
    expect(saveButton()).toBeUndefined();
  });

  it.each(["/api/spend/status", "/api/spend/budget"])(
    "does not invent editable limits when %s fails, and recovers on retry",
    async (failedPath) => {
      mountBudget();
      h.fetch.mockImplementation(async (url: string) =>
        url === failedPath
          ? response({ error: "Temporarily unavailable" }, 503)
          : url === "/api/spend/status"
            ? response(status)
            : response({ budget }),
      );
      await settle();
      expect(errors()).toHaveLength(1);
      expect(text(tree)).not.toContain("No limit set");
      expect(elements(tree).filter((node) => node.type === "input")).toHaveLength(0);
      expect(saveButton()).toBeUndefined();

      h.fetch.mockImplementation(async (url: string) =>
        url === "/api/spend/status" ? response(status) : response({ budget }),
      );
      errors()[0].props.onRetry?.();
      await settle();
      expect(errors()).toHaveLength(0);
      expect(text(tree)).toContain("$5.00");
      expect(saveButton().props.disabled).toBe(false);
    },
  );

  it("retains the confirmed limit and edited draft when the post-save refresh fails", async () => {
    mountBudget();
    await settle();
    const limitInput = elements(tree).find((node) => node.type === "input")!;
    limitInput.props.onChange?.({ target: { value: "12" } });
    render();
    h.fetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? response({ budget: { monthlyLimitUsd: "12" } })
        : response({ error: "Temporarily unavailable" }, 503),
    );
    await saveButton().props.onClick?.();
    await settle();
    expect(errors()).toHaveLength(1);
    expect(text(tree)).toContain("$20.00");
    expect(text(tree)).not.toContain("Saved.");
    const inputs = elements(tree).filter((node) => node.type === "input");
    expect(inputs[0].props.value).toBe("12");
    expect(inputs.every((node) => node.props.disabled)).toBe(true);
    expect(saveButton().props.disabled).toBe(true);
    expect(h.fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);

    h.fetch.mockImplementation(async (url: string) =>
      url === "/api/spend/status"
        ? response({ ...status, monthly_limit_usd: 12 })
        : response({ budget: { ...budget, monthly_limit_usd: "12" } }),
    );
    errors()[0].props.onRetry?.();
    await settle();
    expect(errors()).toHaveLength(0);
    expect(text(tree)).toContain("$12.00");
    expect(saveButton().props.disabled).toBe(false);
  });
});

describe("Activity latency recovery", () => {
  it.each([
    ["audit", null],
    ["audit", {}],
    ["latency", null],
    ["latency", { trends: null }],
  ])("treats incomplete %s data as unavailable", async (path, body) => {
    h.insight.mockImplementation(async (url: string) =>
      url.includes(path) ? body : url.startsWith("/api/audit/") ? actionData : voiceData,
    );
    await settle();
    expect(errors()).toHaveLength(1);
    expect(elements(tree).some((node) => node.type === "empty-state")).toBe(false);
  });

  it.each(["audit", "latency", "both"])(
    "shows an error, not empty or zero metrics, when %s fails",
    async (failed) => {
      h.insight.mockImplementation(async (url: string) => {
        if (failed === "both" || url.includes(failed)) throw new Error("Temporarily unavailable");
        return url.startsWith("/api/audit/") ? actionData : voiceData;
      });
      await settle();
      expect(errors()).toHaveLength(1);
      expect(elements(tree).some((node) => node.type === "empty-state")).toBe(false);
      expect(text(tree)).not.toContain("0ms");

      h.insight.mockImplementation(async (url: string) =>
        url.startsWith("/api/audit/") ? actionData : voiceData,
      );
      errors()[0].props.onRetry?.();
      await settle();
      expect(errors()).toHaveLength(0);
      expect(text(tree)).toContain("Median action time10ms");
    },
  );

  it("keeps a real empty result distinct from an unavailable request", async () => {
    h.insight.mockImplementation(async (url: string) =>
      url.startsWith("/api/audit/")
        ? { ...actionData, latency: { sample_count: 0, p50_ms: 0, p95_ms: 0 } }
        : voiceData,
    );
    await settle();
    expect(errors()).toHaveLength(0);
    expect(elements(tree).some((node) => node.type === "empty-state")).toBe(true);
  });

  it("does not relabel previous metrics as the newly selected window when loading fails", async () => {
    await settle();
    expect(text(tree)).toContain("Median action time10ms");
    days = 30;
    h.insight.mockRejectedValue(new Error("Unavailable"));
    await settle();
    expect(errors()).toHaveLength(1);
    expect(text(tree)).not.toContain("Median action time10ms");
    h.insight.mockImplementation(async (url: string) =>
      url.startsWith("/api/audit/")
        ? { ...actionData, latency: { sample_count: 2, p50_ms: 30, p95_ms: 40 } }
        : { ...voiceData, days: 30 },
    );
    errors()[0].props.onRetry?.();
    await settle();
    expect(errors()).toHaveLength(0);
    expect(text(tree)).toContain("Median action time30ms");
    expect(h.insight.mock.calls.slice(-2).every(([url]) => url.endsWith("days=30"))).toBe(true);
  });
});

describe("Activity spend presentation", () => {
  function summary() {
    return computeAuditSummary({
      windowDays: 7,
      rows: [
        { action: "signup", createdAt: "2026-09-26T00:00:00Z" },
        { action: "terms_accepted", createdAt: "2026-09-26T00:00:00Z" },
        {
          action: "agent_setup",
          model: "openai/gpt-5.6-terra",
          costUsd: 0.01,
          cacheCreateTokens: 5634,
          createdAt: "2026-09-27T00:00:00Z",
        },
      ],
    });
  }
  const stats = () => elements(tree).filter((node) => node.type === "spend-stat");

  it("uses readable action names with the original audit keys in native disclosures", async () => {
    const agentId = "agent-2dfbe489-96e1-4d57-b71d-784b1ec39ecc";
    const actions = [
      [`workspace.api.agents.${agentId}.workspace.messages.stream`, "Bot Setup"],
      [`workspace.api.agents.${agentId}.workspace.messages`, "Bot Setup"],
      [`workspace.api.agents.${agentId}.workspace.files`, "Knowledge upload"],
      [`agent-test.api.agents.${agentId}.test.stream`, "Bot rehearsal"],
      ["terms_accepted", "Terms accepted"],
      [`custom-check.api.agents.${agentId}.status`, "Custom check"],
    ];
    h.insight.mockResolvedValue(
      computeAuditSummary({
        windowDays: 7,
        rows: actions.map(([action]) => ({
          action,
          costUsd: 0.01,
          createdAt: "2026-09-27T00:00:00Z",
        })),
      }),
    );
    component = () => AISpendView({ days: 7 });
    await settle();
    const disclosures = elements(tree).filter((node) => node.type === "details");
    expect(disclosures).toHaveLength(actions.length);
    for (const [action, label] of actions) {
      const disclosure = disclosures.find((node) =>
        elements(node).some((child) => child.type === "code" && text(child) === action),
      );
      expect(disclosure).toBeDefined();
      const summary = elements(disclosure).find((node) => node.type === "summary")!;
      expect(text(summary)).toBe(`${label}$0.010`);
      expect(text(summary)).not.toContain(agentId);
    }
  });

  it("labels the audit aggregate as recorded events, including non-model account events", async () => {
    const data = summary();
    h.insight.mockResolvedValue(data);
    component = () => AISpendView({ days: 7 });
    await settle();
    expect(stats().find((node) => node.props.label === "Recorded events")?.props.value).toBe("3");
    expect(stats().find((node) => node.props.label === "Avg / event")?.props.value).toBe("$0.0033");
    expect(stats().some((node) => node.props.label === "AI Calls")).toBe(false);
    expect(text(tree)).toContain("No model recorded");
    expect(text(tree)).toContain("2 events");
    expect(text(tree)).toContain("Spend by Action");
  });

  it.each([
    [-0.0028, "Cache overhead", "$0.0028"],
    [0.0028, "Saved by cache", "$0.0028"],
    [-1.2, "Cache overhead", "$1.20"],
    [0, "Saved by cache", "$0.00"],
    [-0, "Saved by cache", "$0.00"],
  ])(
    "shows net cache economics %s without negative zero or lost subcent costs",
    async (net, label, amount) => {
      const data = summary();
      data.totals.cache_savings_usd = net;
      h.insight.mockResolvedValue(data);
      component = () => AISpendView({ days: 7 });
      await settle();
      expect(stats().find((node) => node.props.label === label)?.props.value).toBe(amount);
    },
  );

  it("keeps daily cost and event labels outside clipped proportional bars", async () => {
    h.insight.mockResolvedValue(summary());
    component = () => AISpendView({ days: 7 });
    await settle();
    const bars = elements(tree).filter((node) => node.props["aria-hidden"] === "true");
    expect(bars).toHaveLength(2);
    expect(bars.every((node) => text(node) === "")).toBe(true);
    expect(text(tree)).toContain("$0.00");
    expect(text(tree)).toContain("$0.01");
    expect(text(tree)).toContain("2 events");
  });
});
