import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InsightsView from "../src/components/insights/InsightsView";

const h = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, search: "" }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock("react-router", () => ({
  useSearchParams: () => [new URLSearchParams(h.search), vi.fn()],
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [{ id: "synthetic-bot" }], loading: false, degraded: false }),
}));
vi.mock("../src/components/layout/ClientRouteViewport", () => ({ default: "viewport" }));
vi.mock("../src/components/layout/ClientToolbar", () => ({ default: "toolbar" }));
vi.mock("../src/components/ui/SegmentStrip", () => ({ SegmentStrip: "period-control" }));
vi.mock("../src/components/CsvExportButton", () => ({ default: "export" }));
vi.mock("../src/components/CallOpsOverview", () => ({ default: "calls" }));
vi.mock("../src/components/GoalsView", () => ({ default: "goals" }));
vi.mock("../src/components/WidgetBoundary", () => ({ default: "widget" }));
vi.mock("../src/components/insights/shared", () => ({ InsightEmpty: "empty" }));
vi.mock("../src/components/insights/FunnelView", () => ({ default: "funnel" }));
vi.mock("../src/components/insights/AttributionView", () => ({ default: "attribution" }));
vi.mock("../src/components/insights/TopicsView", () => ({ default: "topics" }));
vi.mock("../src/components/insights/HeatmapView", () => ({ default: "heatmap" }));
vi.mock("../src/components/insights/FailureModesView", () => ({ default: "failures" }));
vi.mock("../src/components/insights/VoiceLatencyView", () => ({ default: "latency" }));
vi.mock("../src/components/insights/AISpendView", () => ({ default: "spend" }));
vi.mock("../src/components/insights/LearningMetricsView", () => ({ default: "learning" }));

type Props = {
  children?: ReactNode;
  actions?: ReactNode;
  value?: string;
  label?: string;
  days?: number;
  onChange?: (value: string) => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node)
    ? [node, ...elements(node.props.children), ...elements(node.props.actions)]
    : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children) + text(node.props.actions);
  return typeof node === "string" ? node : "";
}
function render() {
  h.cursor = 0;
  return InsightsView();
}

beforeEach(() => {
  h.states = [];
  h.cursor = 0;
  h.search = "tab=performance&view=funnel";
});

describe("Insights period controls", () => {
  it.each([
    ["performance", "calls", "Today and all-time"],
    ["performance", "goals", "This month"],
    ["revenue", "topics", "Recent calls"],
    ["quality", "failures", "Recent qualifying calls"],
  ])(
    "shows the real fixed scope for %s/%s without an ineffective day selector",
    (group, view, label) => {
      h.search = `tab=${group}&view=${view}`;
      const tree = render();
      expect(elements(tree).some((node) => node.type === "period-control")).toBe(false);
      expect(text(tree)).toContain(label);
      expect(elements(tree).find((node) => node.type === "export")?.props.label).toBe(
        "Export all calls",
      );
    },
  );

  it("keeps the selected days when visiting a fixed-period view and returning", () => {
    elements(render()).find((node) => node.type === "period-control")!.props.onChange!("14");
    expect(elements(render()).find((node) => node.type === "funnel")?.props.days).toBe(14);
    h.search = "tab=performance&view=calls";
    expect(elements(render()).some((node) => node.type === "period-control")).toBe(false);
    h.search = "tab=performance&view=heatmap";
    const nodes = elements(render());
    expect(nodes.find((node) => node.type === "period-control")?.props.value).toBe("14");
    expect(nodes.find((node) => node.type === "heatmap")?.props.days).toBe(14);
  });
});
