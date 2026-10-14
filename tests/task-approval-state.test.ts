import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Handler = (req: unknown, res: unknown, next?: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler[]>(),
  task: {} as Row,
  thread: {} as Row,
  appointment: null as Row | null,
  events: [] as string[],
  executeAction: vi.fn(),
  emitProductEvent: vi.fn(),
  afterLock: undefined as (() => void) | undefined,
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) => {
          const key = `${method} ${path}`;
          h.routes.set(key, [...(h.routes.get(key) ?? []), handlers.at(-1)!]);
        },
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({
  authenticateUser: () => {},
  authenticateEventStream: () => {},
}));
vi.mock("../src/middleware/api-rate-limits", () => ({ fleetRateLimit: () => {} }));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => () => {},
  updateFollowUpTaskSchema: {},
}));
vi.mock("../src/lib/action-engine", () => ({ executeAction: h.executeAction }));
vi.mock("../src/lib/product-event-server", () => ({
  emitServerProductEventOnce: h.emitProductEvent,
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: () => {} }));
vi.mock("../src/services/presence-stream-service", () => ({ presenceStreams: {} }));
vi.mock("../src/lib/server-context", async () => {
  const schema = await import("../src/db/schema");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const db = {
    select: () => {
      let table: unknown;
      const query = {
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: () => query,
        limit: () => query,
        for: () => query,
        then: (resolve: (value: Row[]) => unknown) =>
          Promise.resolve(
            table === schema.auditLog
              ? []
              : table === schema.appointments
                ? h.appointment
                  ? [h.appointment]
                  : []
                : [{ ...(table === schema.followUpTasks ? h.task : h.thread) }],
          ).then(resolve),
      };
      return query;
    },
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: () => {
          const apply = () => {
            const task = table === schema.followUpTasks;
            h.events.push(task ? "task" : "thread");
            if (task && !["pending", "open", "in_progress"].includes(String(h.task.status)))
              return [];
            Object.assign(task ? h.task : h.thread, patch);
            return [{ id: task ? "task" : "thread" }];
          };
          return {
            returning: async () => apply(),
            then: (resolve: (value: Row[]) => unknown) => Promise.resolve(apply()).then(resolve),
          };
        },
      }),
    }),
    execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const query = dialect.sqlToQuery(statement);
      expect(query.sql).toContain("pg_advisory_xact_lock");
      expect(query.params).toEqual([`tenant:${h.task.sourceType}:thread:human_handoff`]);
      h.events.push("lock");
      h.afterLock?.();
    },
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
      const task = { ...h.task },
        thread = { ...h.thread };
      try {
        return await operation(db);
      } catch (error) {
        h.task = task;
        h.thread = thread;
        throw error;
      }
    },
  };
  return { drizzle: db, log: { error: vi.fn() }, serialQueryBatch: vi.fn() };
});

import "../src/routes/operator-task-routes";
import "../src/routes/fleet-routes";

const invoke = async (kind: "action" | "approve" | "dismiss") => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  const path = kind === "dismiss" ? "dismiss-handoff" : "approve";
  const handlers = h.routes.get(`post /api/Assistants/tasks/:id/${path}`)!;
  await handlers[kind === "action" ? 1 : 0](
    { user: { id: "tenant" }, params: { id: "task" } },
    res,
    vi.fn(),
  );
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.task = {
    id: "task",
    userId: "tenant",
    status: "pending",
    taskType: "human_handoff",
    sourceType: "sms_thread",
    sourceId: "thread",
  };
  h.thread = { id: "thread", userId: "tenant", status: "escalated" };
  h.appointment = null;
  h.events = [];
  h.afterLock = undefined;
  h.executeAction.mockResolvedValue({ success: true });
});

describe("approval lifecycle boundaries", () => {
  it.each(["internal_task", "follow_up", "ticket", "callback", "human_escalation"])(
    "completes human %s work without invoking the action engine",
    async (taskType) => {
      h.task.taskType = taskType;
      await invoke("action");
      expect(h.executeAction).not.toHaveBeenCalled();
      expect(h.task.status).toBe("completed");
      expect(h.task.resolutionNotes).toBe("Completed by Account Holder");
    },
  );

  it("does not label a queued draft as an executed action", async () => {
    h.task.taskType = "send_email";
    h.executeAction.mockResolvedValue({ success: true, queued: true });
    await invoke("action");
    expect(h.task.status).toBe("pending");
  });

  it("resolves an old Calendar draft after native Calendar saves a Requested appointment", async () => {
    const appointmentId = "9225c30b-455e-4083-8d5c-bbcfc997c90d";
    h.task.taskType = "schedule_calendar";
    h.appointment = {
      id: appointmentId,
      userId: "tenant",
      bookingSource: "native",
      status: "Requested",
    };
    h.executeAction.mockResolvedValue({ success: true, queued: true, actionId: appointmentId });

    const response = await invoke("action");

    expect(h.task.status).toBe("completed");
    expect(h.task.resolutionNotes).toBe("Native Calendar request saved for approval");
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      calendar_status: "Requested",
      appointment_id: appointmentId,
    });
    expect(h.emitProductEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "first_meeting_booked" }),
    );
  });

  it.each(["cancelled", "archived", null])("does not execute a %s task", async (status) => {
    Object.assign(h.task, { status, taskType: "send_email" });
    await expect(invoke("action")).rejects.toMatchObject({ status: 409 });
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it.each(["pending", "open", "in_progress"])("preserves approval of %s work", async (status) => {
    Object.assign(h.task, { status, taskType: "send_email" });
    await invoke("action");
    expect(h.executeAction).toHaveBeenCalledTimes(1);
    expect(h.executeAction).toHaveBeenCalledWith(
      "tenant",
      expect.anything(),
      expect.objectContaining({ approvalTaskId: "task" }),
      "auto",
    );
  });

  it.each(["approve", "dismiss"] as const)(
    "%s cannot erase an SMS routing conflict",
    async (kind) => {
      h.thread.status = "routing_conflict";
      await expect(invoke(kind)).rejects.toMatchObject({
        status: 409,
        code: "SMS_THREAD_ROUTING_CONFLICT",
      });
      expect(h.task.status).toBe("pending");
      expect(h.thread.status).toBe("routing_conflict");
    },
  );

  it.each(["email_thread", "sms_thread"])(
    "serializes %s handoffs in the outcome route's lock order",
    async (sourceType) => {
      h.task.sourceType = sourceType;
      await invoke("approve");
      expect(h.events).toEqual(["lock", "thread", "task"]);
      expect(h.task.status).toBe("completed");
      expect(h.thread.status).toBe("resolved");
    },
  );

  it("rechecks a routing conflict that appeared while waiting for the conversation lock", async () => {
    h.afterLock = () => {
      h.thread.status = "routing_conflict";
    };
    await expect(invoke("approve")).rejects.toMatchObject({ status: 409 });
    expect(h.events).toEqual(["lock"]);
  });
});
