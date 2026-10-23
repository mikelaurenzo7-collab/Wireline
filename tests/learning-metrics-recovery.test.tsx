import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LearningMetricsView from "../src/components/insights/LearningMetricsView";

// Exercise the retained component directly: Learning is no longer a navigable
// Insights view. This follows the repository's isolated hook-render test pattern.
const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  cursor: 0,
  dirty: false,
  effects: [] as Array<() => void>,
  fetch: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = (h.slots[h.cursor++] ??= {
      value: typeof initial === "function" ? initial() : initial,
    });
    return [
      slot.value,
      (next: unknown) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) h.dirty = true;
        slot.value = value;
      },
    ];
  },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (
      !slot.deps ||
      deps.length !== slot.deps.length ||
      deps.some((dep, i) => !Object.is(dep, slot.deps?.[i]))
    ) {
      slot.deps = deps;
      h.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
  },
}));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));
vi.mock("../src/components/molecules", () => ({ StatusNotice: "notice" }));
vi.mock("../src/components/ui/MetricStatTile", () => ({ MetricStatTile: "metric" }));
vi.mock("../src/components/ui/EmptyState", () => ({ EmptyState: "empty-state" }));
vi.mock("../src/components/layout/ClientRouteLoading", () => ({ default: "loading" }));

type Props = {
  children?: ReactNode;
  action?: ReactNode;
  title?: string;
  label?: string;
  value?: number;
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
};
const bots = [
  { id: "bot-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales", role: "sales" },
];
let tree: ReactNode;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function digest(agentId: string, pending = 2, approved = 3) {
  return {
    ok: true,
    digest: {
      agentId,
      lessonsPending: pending,
      lessonsApproved: approved,
      topLessons: [`Guidance for ${agentId}`],
      outcomeLiftPct: null,
      objectionsTrending: [],
    },
  };
}

function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node)
    ? [node, ...elements(node.props.children), ...elements(node.props.action)]
    : [];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

function render() {
  h.cursor = 0;
  h.dirty = false;
  tree = LearningMetricsView();
}

async function settle() {
  for (let pass = 0; pass < 32; pass++) {
    if (h.dirty) render();
    h.effects.splice(0).forEach((effect) => effect());
    await Promise.resolve();
  }
}

async function mount() {
  render();
  await settle();
}

function button(label: string) {
  const node = elements(tree).find(
    (element) => element.type === "button" && textOf(element) === label,
  );
  if (!node) throw new Error(`Missing ${label} button: ${textOf(tree)}`);
  return node.props;
}

function summary(name: string) {
  return elements(tree).find(
    (element) =>
      element.type === "section" && element.props["aria-label"] === `${name} learning summary`,
  );
}

function notices() {
  return elements(tree).filter((node) => node.type === "notice");
}

function metric(label: string) {
  return elements(tree).find((node) => node.type === "metric" && node.props.label === label);
}

async function retry() {
  expect(button("Retry").disabled).toBe(false);
  button("Retry").onClick?.();
  await settle();
}

beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.dirty = false;
  h.effects = [];
  h.fetch.mockReset();
  tree = null;
});

afterEach(() => {
  h.slots.forEach((slot) => slot.cleanup?.());
});

describe("Learning metrics unavailable results and recovery", () => {
  it.each(["unavailable", "malformed", "wrong-bot", "invalid-count"] as const)(
    "keeps a %s digest unavailable instead of showing healthy zeroes, then recovers",
    async (failure) => {
      let recovered = false;
      h.fetch.mockImplementation(async (path: string) => {
        if (path === "/api/agents") return json({ agents: [bots[0]] });
        const payload = digest(bots[0].id);
        if (recovered) return json(payload);
        if (failure === "unavailable") return json({ error: "Temporarily unavailable" }, 503);
        if (failure === "malformed") return json({ ok: true, digest: { agentId: bots[0].id } });
        if (failure === "wrong-bot") return json(digest(bots[1].id));
        return json({ ...payload, digest: { ...payload.digest, lessonsApproved: "3" } });
      });

      await mount();
      expect(notices().map((node) => node.props.title)).toEqual(["Learning Metrics Unavailable"]);
      expect(textOf(tree)).toContain("Unavailable: Front Desk");
      expect(metric("Approved lessons")).toBeUndefined();
      expect(summary("Front Desk")).toBeUndefined();

      recovered = true;
      await retry();
      expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      expect(metric("Approved lessons")?.props.value).toBe(3);
      expect(textOf(tree)).toContain("Latest 50 lessons per Bot.");
      expect(notices()).toHaveLength(0);
      expect(textOf(tree)).not.toMatch(/Lessons in runtime|outcome lift/);
      expect(h.fetch.mock.calls.map(([path]) => path)).toEqual([
        "/api/agents",
        "/api/agents/bot-desk/learning-digest",
        "/api/agents",
        "/api/agents/bot-desk/learning-digest",
      ]);
    },
  );

  it.each(["unavailable", "malformed"] as const)(
    "retains partial results across a %s roster retry and a later digest failure",
    async (rosterFailure) => {
      let phase = 0;
      let releaseRetry!: () => void;
      const retryReady = new Promise<void>((resolve) => {
        releaseRetry = resolve;
      });
      h.fetch.mockImplementation(async (path: string) => {
        if (path === "/api/agents") {
          return phase === 1
            ? rosterFailure === "unavailable"
              ? json({ error: "Temporarily unavailable" }, 503)
              : json({})
            : json({ agents: bots });
        }
        const agentId = path.split("/")[3];
        if (phase === 2) await retryReady;
        const unavailable =
          (phase === 0 && agentId === bots[1].id) || (phase === 2 && agentId === bots[0].id);
        return unavailable
          ? json({ error: "Temporarily unavailable" }, 503)
          : json(digest(agentId, agentId === bots[0].id ? 2 : 4, 3));
      });

      await mount();
      expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      expect(summary("Sales")).toBeUndefined();
      expect(textOf(tree)).toContain("Unavailable: Sales");
      expect(textOf(tree)).toContain("Totals cover only the summaries shown below.");
      expect(metric("Bots loaded")?.props.value).toBe(1);

      phase = 1;
      await retry();
      expect(textOf(tree)).toContain("Could not refresh the Bot list");
      expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      expect(textOf(summary("Front Desk"))).toContain("Last loaded results · Refresh unavailable");
      expect(elements(tree).filter((node) => node.props.title === "No Bots")).toHaveLength(0);
      // The failed roster read must not start another round of digest requests.
      expect(h.fetch.mock.calls.filter(([path]) => path.endsWith("/learning-digest"))).toHaveLength(
        2,
      );

      phase = 2;
      await retry();
      try {
        expect(button("Retrying…").disabled).toBe(true);
        expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      } finally {
        releaseRetry();
      }
      await settle();
      expect(textOf(summary("Sales"))).toContain("4 pending · 3 approved");
      expect(textOf(tree)).toContain("Unavailable: Front Desk");
      expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      expect(textOf(summary("Front Desk"))).toContain("Last loaded results · Refresh unavailable");
      expect(textOf(summary("Sales"))).not.toContain("Last loaded results · Refresh unavailable");

      phase = 3;
      await retry();
      expect(notices()).toHaveLength(0);
      expect(textOf(tree)).not.toContain("Last loaded results · Refresh unavailable");
      expect(textOf(summary("Front Desk"))).toContain("2 pending · 3 approved");
      expect(textOf(summary("Sales"))).toContain("4 pending · 3 approved");
      expect(metric("Bots loaded")?.props.value).toBe(2);
    },
  );

  it("discloses the Bot and recent-lesson bounds and only requests the first 12 Bots", async () => {
    const agents = Array.from({ length: 13 }, (_, index) => ({
      id: `bot-${index}`,
      name: `Bot ${index}`,
      role: "receptionist",
    }));
    h.fetch.mockImplementation(async (path: string) =>
      path === "/api/agents" ? json({ agents }) : json(digest(path.split("/")[3])),
    );

    await mount();
    expect(textOf(tree)).toContain("Latest 50 lessons per Bot. Showing 12 of 13 Bots.");
    expect(elements(tree).filter((node) => node.type === "section")).toHaveLength(12);
    expect(metric("Bots loaded")?.props.value).toBe(12);
    expect(h.fetch.mock.calls.map(([path]) => path).slice(1)).toEqual(
      agents.slice(0, 12).map((agent) => `/api/agents/${agent.id}/learning-digest`),
    );
  });
});
