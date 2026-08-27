import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import * as schema from "../src/db/schema";
import { ensureIntakeAutoDialJob } from "../src/lib/intake-auto-dial";
import {
  holdResponseEndForRuntimeAudit,
  persistRuntimeAuditRecordsForJob,
} from "../src/middleware/audit-middleware";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function intakeQueueDb(options: { failInsert?: boolean } = {}) {
  let durableJobId: string | null = null;
  const inserted: unknown[] = [];
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => (durableJobId ? [{ id: durableJobId }] : []),
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (value: unknown) => {
        inserted.push(value);
        return {
          returning: async () => {
            if (options.failInsert) throw new Error("queue unavailable");
            durableJobId = "job-intake-1";
            return [{ id: durableJobId }];
          },
        };
      },
    })),
  };
  const db = {
    transaction: vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { db, tx, inserted };
}

function aiAccountingDb(
  options: { failAuditInsert?: boolean; failQuotaInsert?: boolean; attempts?: number } = {},
) {
  const state: { result: Record<string, unknown>; auditWrites: number; quotaWrites: number } = {
    result: {},
    auditWrites: 0,
    quotaWrites: 0,
  };
  const job = {
    status: "running",
    attempts: options.attempts ?? 2,
    get result() {
      return state.result;
    },
  };
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: async () => [job],
          }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: () => {
        if (table === schema.quotaUsage) {
          return {
            onConflictDoUpdate: async () => {
              if (options.failQuotaInsert) throw new Error("quota insert unavailable");
              state.quotaWrites += 1;
            },
          };
        }
        return Promise.resolve().then(() => {
          if (options.failAuditInsert) throw new Error("audit insert unavailable");
          state.auditWrites += 1;
        });
      },
    }),
    update: () => ({
      set: (patch: { result: Record<string, unknown> }) => ({
        where: () => ({
          returning: async () => {
            state.result = patch.result;
            return [{ id: "job-ai-1" }];
          },
        }),
      }),
    }),
  };
  const db = {
    transaction: vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { db, state };
}

const aiPayload = {
  userId: "11111111-1111-4111-8111-111111111111",
  action: "workspace.reply",
  records: [
    {
      provider: "openai" as const,
      model: "gpt-5-mini",
      input_tokens: 120,
      output_tokens: 40,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      latency_ms: 250,
    },
  ],
  requestMeta: { method: "POST", path: "/reply", status: 200 },
  jobId: "job-ai-1",
  attempt: 2,
};

describe("background durability P1s", () => {
  it("adopts one intake auto-dial job across idempotent request retries", async () => {
    const fake = intakeQueueDb();
    const payload = {
      userId: "11111111-1111-4111-8111-111111111111",
      leadId: "42",
      intakeKeyName: "CRM intake",
    };

    await expect(ensureIntakeAutoDialJob(payload, fake.db as never)).resolves.toEqual({
      jobId: "job-intake-1",
      alreadyEnqueued: false,
    });
    await expect(ensureIntakeAutoDialJob(payload, fake.db as never)).resolves.toEqual({
      jobId: "job-intake-1",
      alreadyEnqueued: true,
    });
    expect(fake.tx.execute).toHaveBeenCalledTimes(2);
    expect(fake.inserted).toHaveLength(1);
  });

  it("does not manufacture intake initiation when the durable insert fails", async () => {
    const fake = intakeQueueDb({ failInsert: true });
    await expect(
      ensureIntakeAutoDialJob(
        {
          userId: "11111111-1111-4111-8111-111111111111",
          leadId: "42",
          intakeKeyName: "CRM intake",
        },
        fake.db as never,
      ),
    ).rejects.toThrow("queue unavailable");
    expect(fake.inserted).toHaveLength(1);

    const intake = read("src/routes/intake-routes.ts");
    const enqueue = intake.indexOf("autoDialInitiated = await enqueueIntakeAutoDial");
    const response = intake.indexOf("auto_dial_initiated: autoDialInitiated", enqueue);
    expect(enqueue).toBeGreaterThan(-1);
    expect(response).toBeGreaterThan(enqueue);
    expect(intake).not.toContain('runInBackground("intake auto-dial"');
  });

  it("commits AI spend rows and the retry receipt once in the same transaction", async () => {
    const fake = aiAccountingDb();
    const telemetry = vi.fn(async () => undefined);

    await expect(
      persistRuntimeAuditRecordsForJob(aiPayload, {
        db: fake.db as never,
        publishTelemetry: telemetry,
      }),
    ).resolves.toBe(true);
    await expect(
      persistRuntimeAuditRecordsForJob(aiPayload, {
        db: fake.db as never,
        publishTelemetry: telemetry,
      }),
    ).resolves.toBe(false);

    expect(fake.state.auditWrites).toBe(1);
    expect(fake.state.quotaWrites).toBe(1);
    expect(fake.state.result.ai_spend_accounting_persisted).toBe(true);
    expect(telemetry).toHaveBeenCalledTimes(1);
  });

  it("leaves no AI spend receipt when the audit insert fails", async () => {
    const fake = aiAccountingDb({ failAuditInsert: true });
    const telemetry = vi.fn(async () => undefined);
    await expect(
      persistRuntimeAuditRecordsForJob(aiPayload, {
        db: fake.db as never,
        publishTelemetry: telemetry,
      }),
    ).rejects.toThrow("audit insert unavailable");
    expect(fake.state.result.ai_spend_accounting_persisted).toBeUndefined();
    expect(fake.state.quotaWrites).toBe(0);
    expect(telemetry).not.toHaveBeenCalled();
  });

  it("leaves the job retryable when its transactional quota aggregate fails", async () => {
    const fake = aiAccountingDb({ failQuotaInsert: true });
    const telemetry = vi.fn(async () => undefined);
    await expect(
      persistRuntimeAuditRecordsForJob(aiPayload, {
        db: fake.db as never,
        publishTelemetry: telemetry,
      }),
    ).rejects.toThrow("quota insert unavailable");
    expect(fake.state.result.ai_spend_accounting_persisted).toBeUndefined();
    expect(telemetry).not.toHaveBeenCalled();
  });

  it("fails a stale AI accounting attempt before it can write spend", async () => {
    const fake = aiAccountingDb({ attempts: 3 });
    await expect(
      persistRuntimeAuditRecordsForJob(aiPayload, {
        db: fake.db as never,
        publishTelemetry: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("lost its durable attempt claim");
    expect(fake.state.auditWrites).toBe(0);
  });

  it("holds the final response boundary until the durable accounting enqueue resolves", async () => {
    let release: (() => void) | undefined;
    const enqueueJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const originalEnd = vi.fn(() => response);
    const response = { end: originalEnd };

    holdResponseEndForRuntimeAudit(response, () => aiPayload, { enqueueJob });
    expect(response.end("complete", "utf8")).toBe(response);
    expect(enqueueJob).toHaveBeenCalledWith(aiPayload);
    expect(originalEnd).not.toHaveBeenCalled();

    release?.();
    await vi.waitFor(() => expect(originalEnd).toHaveBeenCalledWith("complete", "utf8"));
    expect(originalEnd).toHaveBeenCalledTimes(1);
  });

  it("preserves the response return contract when enqueue resolves immediately", async () => {
    const enqueueJob = vi.fn(async () => undefined);
    const originalEnd = vi.fn(() => response);
    const response = { end: originalEnd };

    holdResponseEndForRuntimeAudit(response, () => aiPayload, { enqueueJob });
    expect(response.end()).toBe(response);
    expect(originalEnd).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(originalEnd).toHaveBeenCalledTimes(1));
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("reports an enqueue rejection and still ends the response exactly once", async () => {
    const failure = new Error("queue unavailable");
    const reportFailure = vi.fn();
    const originalEnd = vi.fn(() => response);
    const response = { end: originalEnd };

    holdResponseEndForRuntimeAudit(response, () => aiPayload, {
      enqueueJob: vi.fn(async () => {
        throw failure;
      }),
      reportFailure,
    });
    response.end();

    await vi.waitFor(() => expect(originalEnd).toHaveBeenCalledTimes(1));
    expect(reportFailure).toHaveBeenCalledWith(failure, aiPayload);
  });

  it("keeps the no-record response path synchronous", () => {
    const enqueueJob = vi.fn(async () => undefined);
    const originalEnd = vi.fn(() => "original-return");
    const response = { end: originalEnd };

    holdResponseEndForRuntimeAudit(response, () => null, { enqueueJob });
    expect(response.end("body")).toBe("original-return");
    expect(originalEnd).toHaveBeenCalledWith("body");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("coalesces duplicate end calls while accounting is being enqueued", async () => {
    let release: (() => void) | undefined;
    const originalEnd = vi.fn(() => response);
    const response = { end: originalEnd };

    holdResponseEndForRuntimeAudit(response, () => aiPayload, {
      enqueueJob: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    response.end("first");
    response.end("second");
    release?.();

    await vi.waitFor(() => expect(originalEnd).toHaveBeenCalledTimes(1));
    expect(originalEnd).toHaveBeenCalledWith("first");
    expect(response.end("third")).toBe(response);
    expect(originalEnd).toHaveBeenCalledTimes(1);
  });
});
