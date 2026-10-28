import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  values: [
    {
      cached: true,
      total_analyzed: 3,
      topics: [{ name: "Booking", count: 3, category: "service" }],
    },
    false,
    null,
  ] as unknown[],
  cursor: 0,
  fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => {
    const index = h.cursor++;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] = value;
      },
    ];
  },
  useEffect: () => {},
}));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/insights/shared", () => ({
  fetchInsight: h.fetch,
  InsightSkeleton: "skeleton",
  ErrCard: "error",
  InsightEmpty: "empty",
}));
import TopicsView from "../src/components/insights/TopicsView";

type Props = { children?: ReactNode; disabled?: boolean; onClick?: () => void };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

it("disables refresh while the pending request is running and restores it afterwards", async () => {
  let resolve!: (value: unknown) => void;
  h.fetch.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const render = () => {
    h.cursor = 0;
    return TopicsView();
  };
  const refresh = () => elements(render()).find((element) => element.type === "button")!;
  expect(refresh().props.disabled).toBe(false);
  refresh().props.onClick?.();
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect(refresh().props.disabled).toBe(true);
  expect(refresh().props.children).toEqual(expect.arrayContaining(["Refreshing…"]));
  resolve(h.values[0]);
  await vi.waitFor(() => expect(refresh().props.disabled).toBe(false));
});
