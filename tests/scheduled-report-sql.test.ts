import { expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ queries: [] as Array<{ query: string; params: unknown[] }> }));

// Use the real production schema and SQL builder, replacing only execution.
// No connection, credentials or database changes are involved.
vi.mock("../src/lib/server-context", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    drizzle: drizzle(async (query, params) => {
      h.queries.push({ query, params });
      if (query.includes('from "wireline_jobs"')) return { rows: [["next-occurrence"]] };
      if (query.startsWith("select count(*)")) return { rows: [["0"]] };
      return { rows: [] };
    }),
  };
});
vi.mock("../src/lib/job-queue", () => ({ enqueue: vi.fn() }));
vi.mock("../src/lib/post-call-output-preferences", () => ({
  getPostCallOutputPreferences: vi.fn(async () => ({
    scheduled_report_frequency: "weekly",
    scheduled_report_format: "pdf",
    scheduled_report_destination: "google_drive",
    scheduled_report_version: 1,
    scheduled_report_send_at_utc: "13:00",
    scheduled_report_weekday: 1,
  })),
}));
vi.mock("../src/lib/openai-post-call-artifact", () => ({
  generateAndStorePostCallArtifact: vi.fn(async () => ({
    externalUrl: "https://example.test/report",
    fileName: "report.pdf",
    provider: "google_drive",
    openaiResponseId: "response",
  })),
}));
vi.mock("../src/lib/shareable-artifact/publish-weekly-recap", () => ({
  maybePublishWeeklyRecap: vi.fn(async () => null),
}));

import { generateScheduledOperatingReport } from "../src/lib/scheduled-report-service";

it("groups full-period metrics by the selected day alias without a second grouping parameter", async () => {
  await generateScheduledOperatingReport({
    userId: "00000000-0000-4000-8000-000000000123",
    scheduleVersion: 1,
    frequency: "weekly",
    format: "pdf",
    destination: "google_drive",
    scheduledFor: "2026-09-21T13:00:00Z",
  });
  const grouped = h.queries.find(({ query }) => query.includes(" group by "));
  expect(grouped).toBeDefined();
  expect(grouped!.query).toContain('as "report_day_index"');
  expect(grouped!.query.split(" group by ")[1]).toBe(
    '"report_day_index", "wireline_call_logs"."outcome_tag"',
  );
  expect(grouped!.query).not.toContain(" limit ");
  expect(grouped!.params).toEqual([
    "2026-09-14T13:00:00.000Z",
    "00000000-0000-4000-8000-000000000123",
    "2026-09-14T13:00:00.000Z",
    "2026-09-21T13:00:00.000Z",
  ]);
  expect(grouped!.query).toContain('"wireline_call_logs"."user_id" = $2');
  expect(grouped!.query).toContain('"wireline_call_logs"."created_at" >= $3');
  expect(grouped!.query).toContain('"wireline_call_logs"."created_at" < $4');
  expect(grouped!.query).toContain('count("qa_score")');
});
