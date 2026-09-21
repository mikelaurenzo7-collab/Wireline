import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Area, AreaChart, XAxis } from "recharts";
import { AuditActivityPanel } from "../src/components/admin/AuditActivityPanel";
import { computeAuditSummary } from "../src/lib/audit-summary";

const h = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [h.states[h.cursor++], vi.fn()],
  useEffect: vi.fn(),
}));

type Props = {
  children?: ReactNode;
  data?: Array<Record<string, unknown>>;
  dataKey?: string;
  tickFormatter?: (value: unknown) => string;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

beforeEach(() => {
  h.cursor = 0;
});

describe("admin audit daily cost chart", () => {
  it("plots real API day buckets with date labels that preserve the UTC billing day", () => {
    const summary = computeAuditSummary({
      windowDays: 7,
      rows: [
        { createdAt: "2026-09-20T00:30:00Z", action: "conversation-summary", costUsd: 0.12 },
        { createdAt: "2026-09-21T03:00:00Z", action: "conversation-summary", costUsd: 0.25 },
      ],
    });
    h.states = [30, summary, [], false, false, null, null];
    const nodes = elements(AuditActivityPanel());
    const chart = nodes.find((node) => node.type === AreaChart)!;
    const axis = nodes.find((node) => node.type === XAxis)!;
    const area = nodes.find((node) => node.type === Area)!;
    const dates = chart.props.data!.map((row) => row[axis.props.dataKey!]);
    expect(dates).toEqual(["2026-09-20", "2026-09-21"]);
    expect(chart.props.data!.map((row) => row[area.props.dataKey!])).toEqual([0.12, 0.25]);
    expect(dates.map((day) => axis.props.tickFormatter!(day))).toEqual(
      dates.map((day) =>
        new Date(day as string).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
      ),
    );
  });
});
