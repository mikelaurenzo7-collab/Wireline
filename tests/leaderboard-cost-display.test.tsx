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

describe("Leaderboard customer results", () => {
  it("shows calls, bookings, and minutes without internal cost", () => {
    expect(metrics()).toEqual({ Calls: "2", Booking: "1", Minutes: "0" });
    expect(metrics()).not.toHaveProperty("$/Qual");
    expect(metrics()).not.toHaveProperty("Total Cost");
  });

  it("uses the singular label for one call and no bookings", () => {
    h.row.total_calls = 1;
    h.row.bookings = 0;
    h.row.minutes = 1;
    expect(metrics()).toEqual({ Call: "1", Bookings: "0", Minute: "1" });
  });
});
