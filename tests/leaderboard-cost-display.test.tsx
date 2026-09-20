import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeaderboardView from "../src/components/insights/LeaderboardView";

const h = vi.hoisted(() => ({ cursor: 0, row: {} as Record<string, unknown> }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [[{ agents: [h.row] }, false, null, 0][h.cursor++], vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("motion/react", () => ({ motion: { div: "div" } }));
vi.mock("../src/components/insights/shared", () => ({
  fetchInsight: vi.fn(),
  InsightSkeleton: "loading",
  ErrCard: "error",
  InsightEmpty: "empty",
}));

type Props = { children?: ReactNode };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function metrics() {
  const view = LeaderboardView({ days: 30 });
  return Object.fromEntries(
    elements(view)
      .filter((element) => element.type === "dl")
      .flatMap((list) =>
        elements(list)
          .filter((element) => element.type === "div")
          .map((row) => {
            const children = elements(row);
            return [
              text(children.find((element) => element.type === "dt")),
              text(children.find((element) => element.type === "dd")),
            ];
          }),
      ),
  );
}

beforeEach(() => {
  h.cursor = 0;
  h.row = {
    agent_id: "test-bot",
    agent_name: "Test Bot",
    role: "customer_service",
    total_calls: 2,
    qualified: 1,
    bookings: 1,
    minutes: 0,
    avg_lead_score: 70,
    total_cost: 0,
    cost_per_qualified: 0,
    cost_per_outcome: 0,
  };
});

describe("Leaderboard monetary values", () => {
  it("shows actual zero spend and zero unit costs with recorded outcomes", () => {
    expect(metrics()).toMatchObject({ "$/Qual": "$0", "$/Outcome": "$0", "Total Cost": "$0" });
  });

  it("keeps unit cost unavailable when no qualifying outcome exists", () => {
    h.row.qualified = 0;
    h.row.bookings = 0;
    expect(metrics()).toMatchObject({ "$/Qual": "N/A", "$/Outcome": "N/A", "Total Cost": "$0" });
  });

  it("uses bookings as a valid outcome without inventing a qualified lead", () => {
    h.row.qualified = 0;
    expect(metrics()).toMatchObject({ "$/Qual": "N/A", "$/Outcome": "$0" });
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not convert unavailable or invalid cost %s to zero",
    (value) => {
      h.row.total_cost = value;
      h.row.cost_per_qualified = value;
      h.row.cost_per_outcome = value;
      expect(metrics()).toMatchObject({ "$/Qual": "N/A", "$/Outcome": "N/A", "Total Cost": "N/A" });
    },
  );

  it("retains nonzero amounts and precision returned by the API", () => {
    h.row.total_cost = 1.2345;
    h.row.cost_per_qualified = 0.75;
    h.row.cost_per_outcome = 0.38;
    expect(metrics()).toMatchObject({
      "$/Qual": "$0.75",
      "$/Outcome": "$0.38",
      "Total Cost": "$1.2345",
    });
  });
});
