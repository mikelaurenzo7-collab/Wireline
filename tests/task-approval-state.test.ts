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
        where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
          const apply = () => {
            const task = table === schema.followUpTasks;
            h.events.push(task ? "task" : "thread");
            if (task && !["pending", "open", "in_progress"].includes(String(h.task.status)))
              return [];
            if (task) {
              const query = dialect.sqlToQuery(condition);
              if (query.sql.includes("btrim(coalesce(")) {
                const expectedTo = query.params.at(-1);
                const actualTo = String((h.task.payload as Row | undefined)?.to ?? "").trim();
                if (actualTo !== expectedTo) return [];
              }
            }
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
  it("rejects an edited message when its recipient changed in another tab", async () => {
    h.task.taskType = "send_email";
    h.task.payload = { to: "new@example.test", body: "Current message" };
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    const handler = h.routes.get("patch /api/Assistants/tasks/:id")![0];

    await handler(
      {
        user: { id: "tenant" },
        params: { id: "task" },
        body: {
          description: "Edited notes",
          payload: { to: "old@example.test", body: "Draft for old recipient" },
          expected_to: "old@example.test",
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TASK_RECIPIENT_CHANGED" }),
    );
    expect(h.task.payload).toEqual({ to: "new@example.test", body: "Current message" });

    res.status.mockClear();
    res.json.mockClear();
    await handler(
      {
        user: { id: "tenant" },
        params: { id: "task" },
        body: {
          payload: { to: "new@example.test", body: "Reviewed message" },
          expected_to: "new@example.test",
          expected_payload: { to: "new@example.test", body: "Current message" },
          expected_task_type: "send_email",
          expected_agent_id: null,
          expected_priority: null,
          expected_description: null,
        },
      },
      res,
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(h.task.payload).toEqual({ to: "new@example.test", body: "Reviewed message" });
  });

  it.each(["payload", "taskType", "agentId", "priority", "description"] as const)(
    "does not overwrite a newer %s while saving an edited message",
    async (changedField) => {
      h.task.taskType = "send_email";
      h.task.agentId = "original-bot";
      h.task.priority = "medium";
      h.task.description = "Original notes";
      h.task.payload = { to: "same@example.test", body: "Original message" };
      const expected = {
        expected_to: "same@example.test",
        expected_payload: { to: "same@example.test", body: "Original message" },
        expected_task_type: "send_email",
        expected_agent_id: "original-bot",
        expected_priority: "medium",
        expected_description: "Original notes",
      };
      const newerValue: Record<typeof changedField, unknown> = {
        payload: { to: "same@example.test", body: "Changed in another tab" },
        taskType: "send_text_message",
        agentId: "different-bot",
        priority: "high",
        description: "Newer notes",
      };
      h.task[changedField] = newerValue[changedField];
      const currentTask = { ...h.task };
      const res = { json: vi.fn(), status: vi.fn() };
      res.status.mockReturnValue(res);
      const handler = h.routes.get("patch /api/Assistants/tasks/:id")![0];

      await handler(
        {
          user: { id: "tenant" },
          params: { id: "task" },
          body: {
            description: "My edited notes",
            payload: { to: "same@example.test", body: "My edited message" },
            ...expected,
          },
        },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "TASK_CONTENT_CHANGED" }),
      );
      expect(h.task).toEqual(currentTask);
      expect(h.events).not.toContain("task");
    },
  );

  it("blocks approval if the saved message recipient changed before execution", async () => {
    h.task.taskType = "send_email";
    h.task.payload = { to: "new@example.test", body: "Changed elsewhere" };
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    const handler = h.routes.get("post /api/Assistants/tasks/:id/approve")![1];

    await handler(
      {
        user: { id: "tenant" },
        params: { id: "task" },
        body: { expected_to: "old@example.test" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TASK_RECIPIENT_CHANGED" }),
    );
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it("blocks approval if the message changed after an edit was saved", async () => {
    h.task.taskType = "send_email";
    h.task.payload = { to: "same@example.test", body: "Newer body from another tab" };
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    const handler = h.routes.get("post /api/Assistants/tasks/:id/approve")![1];

    await handler(
      {
        user: { id: "tenant" },
        params: { id: "task" },
        body: {
          expected_to: "same@example.test",
          expected_payload: { to: "same@example.test", body: "My saved body" },
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TASK_CONTENT_CHANGED" }),
    );
    expect(h.executeAction).not.toHaveBeenCalled();
  });

  it("blocks approval if another tab changed the sending Bot", async () => {
    h.task.taskType = "send_text_message";
    h.task.agentId = "new-bot";
    h.task.payload = { to: "+15125550100", body: "Reviewed text" };
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    const handler = h.routes.get("post /api/Assistants/tasks/:id/approve")![1];

    await handler(
      {
        user: { id: "tenant" },
        params: { id: "task" },
        body: {
          expected_to: "+15125550100",
          expected_payload: { to: "+15125550100", body: "Reviewed text" },
          expected_task_type: "send_text_message",
          expected_agent_id: "old-bot",
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TASK_CONTENT_CHANGED" }),
    );
    expect(h.executeAction).not.toHaveBeenCalled();
  });

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
