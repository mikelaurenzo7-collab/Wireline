import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  createdAt: Date;
  durationSeconds: number | null;
  outcomeTag: string | null;
  qaScore: number | null;
  summary: string;
};

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  tasks: [] as Array<{ description: string; priority: string; dueDate: null }>,
  appointments: 5,
  frequency: "weekly" as "daily" | "weekly",
  artifact: vi.fn(),
  publish: vi.fn(),
  filters: [] as unknown[],
  limits: [] as Array<{ table: string; limit: number }>,
}));

vi.mock("drizzle-orm", () => ({
  and: (...clauses: unknown[]) => clauses,
  desc: (field: unknown) => field,
  eq: (field: unknown, value: unknown) => ["eq", field, value],
  gte: (field: unknown, value: unknown) => ["gte", field, value],
  lt: (field: unknown, value: unknown) => ["lt", field, value],
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    as: (alias: string) => ({ strings, values, alias }),
  }),
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string) =>
    new Proxy(
      { __name: name },
      { get: (target, key) => (key === "__name" ? target.__name : `${name}.${String(key)}`) },
    );
  return {
    jobs: table("jobs"),
    callLogs: table("calls"),
    appointments: table("appointments"),
    followUpTasks: table("tasks"),
    subscriptions: table("subscriptions"),
  };
});
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn() },
  drizzle: {
    select: (fields: Record<string, unknown>) => {
      let table = "";
      let limit: number | undefined;
      const query: any = {
        from: (source: { __name: string }) => {
          table = source.__name;
          return query;
        },
        where: (filter: unknown) => {
          h.filters.push(filter);
          return query;
        },
        orderBy: () => query,
        groupBy: () => query,
        limit: (count: number) => {
          limit = count;
          h.limits.push({ table, limit: count });
          return query;
        },
        then: (resolve: (rows: unknown[]) => unknown) => {
          let rows: unknown[] = [];
          if (table === "jobs") rows = [{ id: "next-occurrence" }];
          if (table === "subscriptions") rows = [{ plan: "pro" }];
          if (table === "appointments")
            rows =
              "count" in fields
                ? [{ count: h.appointments }]
                : Array.from({ length: h.appointments }, (_, id) => ({ id, status: "confirmed" }));
          if (table === "tasks") rows = "count" in fields ? [{ count: h.tasks.length }] : h.tasks;
          if (table === "calls" && !("callCount" in fields)) {
            rows = [...h.calls].sort(
              (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
            );
          }
          if (table === "calls" && "callCount" in fields) {
            const start = Date.parse(
              h.frequency === "weekly" ? "2026-09-14T13:00:00Z" : "2026-09-20T13:00:00Z",
            );
            const groups = new Map<
              string,
              {
                dayIndex: number;
                outcomeTag: string | null;
                callCount: number;
                durationSeconds: number;
                qaScoreTotal: number;
                qaScoreCount: number;
              }
            >();
            for (const call of h.calls) {
              const dayIndex = Math.floor((call.createdAt.getTime() - start) / 86_400_000);
              const key = `${dayIndex}:${call.outcomeTag}`;
              const group = groups.get(key) ?? {
                dayIndex,
                outcomeTag: call.outcomeTag,
                callCount: 0,
                durationSeconds: 0,
                qaScoreTotal: 0,
                qaScoreCount: 0,
              };
              group.callCount++;
              group.durationSeconds += call.durationSeconds ?? 0;
              if (call.qaScore !== null) {
                group.qaScoreTotal += call.qaScore;
                group.qaScoreCount++;
              }
              groups.set(key, group);
            }
            // pg aggregates may be strings. Exercise the conversion boundary.
            rows = [...groups.values()].map((group) => ({
              ...group,
              callCount: String(group.callCount),
              durationSeconds: String(group.durationSeconds),
              qaScoreTotal: String(group.qaScoreTotal),
              qaScoreCount: String(group.qaScoreCount),
            }));
          }
          return Promise.resolve(limit === undefined ? rows : rows.slice(0, limit)).then(resolve);
        },
      };
      return query;
    },
  },
}));
vi.mock("../src/lib/job-queue", () => ({ enqueue: vi.fn() }));
vi.mock("../src/lib/post-call-output-preferences", () => ({
  getPostCallOutputPreferences: vi.fn(async () => ({
    scheduled_report_frequency: h.frequency,
    scheduled_report_format: "pdf",
    scheduled_report_destination: "google_drive",
    scheduled_report_version: 1,
    scheduled_report_send_at_utc: "13:00",
    scheduled_report_weekday: 1,
  })),
}));
vi.mock("../src/lib/openai-post-call-artifact", () => ({
  generateAndStorePostCallArtifact: h.artifact,
}));
vi.mock("../src/lib/plan-catalog", () => ({ planById: () => ({ id: "pro" }) }));
vi.mock("../src/lib/shareable-artifact/entitlement", () => ({
  isBrandedArtifactEntitled: () => true,
}));
vi.mock("../src/lib/shareable-artifact/service", () => ({ publishWeeklyRecap: h.publish }));

import { generateScheduledOperatingReport } from "../src/lib/scheduled-report-service";
import { maybePublishWeeklyRecap } from "../src/lib/shareable-artifact/publish-weekly-recap";

const payload = () => ({
  userId: "tenant",
  scheduleVersion: 1,
  frequency: h.frequency,
  format: "pdf" as const,
  destination: "google_drive" as const,
  scheduledFor: "2026-09-21T13:00:00Z",
});

beforeEach(() => {
  h.calls = [];
  h.tasks = [];
  h.appointments = 5;
  h.frequency = "weekly";
  h.filters = [];
  h.limits = [];
  h.artifact.mockReset().mockResolvedValue({
    externalUrl: "https://example.test/report",
    fileName: "report.pdf",
    provider: "google_drive",
    openaiResponseId: "response",
  });
  h.publish.mockReset().mockResolvedValue({ url: "https://example.test/recap" });
});

describe("scheduled report full-period totals", () => {
  it("counts the entire week and pending task backlog while keeping supporting detail bounded", async () => {
    h.calls = Array.from({ length: 302 }, (_, index) => ({
      createdAt: new Date(index < 52 ? "2026-09-14T13:30:00Z" : "2026-09-20T13:30:00Z"),
      durationSeconds: index < 52 ? 600 : 60,
      outcomeTag: index < 52 ? "booked" : "followup",
      qaScore: index === 0 ? null : index === 1 ? 0 : index < 52 ? 20 : 80,
      summary: `Call ${index}`,
    }));
    h.tasks = Array.from({ length: 44 }, (_, index) => ({
      description: `Task ${index}`,
      priority: "low",
      dueDate: null,
    }));

    const result = await generateScheduledOperatingReport(payload());
    expect(result.calls).toBe(302);
    const request = h.artifact.mock.calls[0][0];
    expect(JSON.parse(request.summary)).toMatchObject({
      calls: 302,
      voice_minutes: 770,
      booked_or_qualified: 52,
      outcomes: { booked: 52, followup: 250 },
      average_qa_score: 70,
      open_follow_up_tasks: 44,
      appointments_created: 5,
    });
    const supporting = JSON.parse(request.transcript);
    expect(supporting.calls).toHaveLength(100);
    expect(supporting.open_tasks).toHaveLength(30);
    expect(supporting.sampling).toMatchObject({
      calls_included: 100,
      calls_total: 302,
      open_tasks_included: 30,
      open_tasks_total: 44,
    });
    const content = h.publish.mock.calls[0][0].content;
    expect(content.totals).toEqual({
      calls: 302,
      voiceMinutes: 770,
      booked: 52,
      qualified: 0,
      followup: 250,
    });
    expect(content.volumeByDay).toEqual([
      { label: "Mon", count: 52 },
      { label: "Tue", count: 0 },
      { label: "Wed", count: 0 },
      { label: "Thu", count: 0 },
      { label: "Fri", count: 0 },
      { label: "Sat", count: 0 },
      { label: "Sun", count: 250 },
    ]);
    expect(content.outcomeMix).toEqual([
      { tag: "followup", count: 250 },
      { tag: "booked", count: 52 },
    ]);
    expect(h.filters).toContainEqual(
      expect.arrayContaining([
        ["eq", "calls.userId", "tenant"],
        ["gte", "calls.createdAt", new Date("2026-09-14T13:00:00Z")],
        ["lt", "calls.createdAt", new Date("2026-09-21T13:00:00Z")],
      ]),
    );
    expect(h.limits).toContainEqual({ table: "calls", limit: 250 });
  });

  it("keeps unscored calls out of the QA average but includes a zero score", async () => {
    h.frequency = "daily";
    h.calls = [
      {
        createdAt: new Date("2026-09-20T14:00:00Z"),
        durationSeconds: null,
        outcomeTag: null,
        qaScore: null,
        summary: "Unscored",
      },
      {
        createdAt: new Date("2026-09-20T15:00:00Z"),
        durationSeconds: 60,
        outcomeTag: "",
        qaScore: 0,
        summary: "Zero score",
      },
    ];
    await generateScheduledOperatingReport(payload());
    expect(JSON.parse(h.artifact.mock.calls[0][0].summary)).toMatchObject({
      calls: 2,
      voice_minutes: 1,
      average_qa_score: 0,
      outcomes: { unclassified: 2 },
    });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("reports an empty period without inventing a QA score", async () => {
    h.appointments = 0;
    await generateScheduledOperatingReport(payload());
    expect(JSON.parse(h.artifact.mock.calls[0][0].summary)).toMatchObject({
      calls: 0,
      voice_minutes: 0,
      average_qa_score: null,
      outcomes: {},
      open_follow_up_tasks: 0,
    });
    expect(
      h.publish.mock.calls[0][0].content.volumeByDay.every(
        (point: { count: number }) => point.count === 0,
      ),
    ).toBe(true);
  });
});

it("retains timestamp-based recap callers when aggregate volume is not supplied", async () => {
  await maybePublishWeeklyRecap({
    userId: "tenant",
    weekLabel: "This Week",
    periodStart: new Date("2026-09-14T13:00:00Z"),
    periodEnd: new Date("2026-09-21T13:00:00Z"),
    callTimestamps: [new Date("2026-09-15T12:59:00Z"), new Date("2026-09-15T13:00:00Z")],
    totals: { calls: 2, voiceMinutes: 1, booked: 0, qualified: 0, followup: 0 },
    averageQaScore: null,
    outcomeMix: [],
    topMoments: [],
    followUps: [],
  });
  expect(h.publish.mock.calls[0][0].content.volumeByDay.slice(0, 2)).toEqual([
    { label: "Mon", count: 1 },
    { label: "Tue", count: 1 },
  ]);
});
