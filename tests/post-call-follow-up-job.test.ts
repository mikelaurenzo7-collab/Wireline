import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRow } from "../src/lib/job-queue";

/**
 * The two jobs that turn a finished call into follow-ups, run for real against
 * a small fake database: reading the transcript once, deciding who finishes
 * each follow-up, and handing the owner whatever could not be finished.
 */
const h = vi.hoisted(() => ({
  /** Rows for each read, in order: live email results, then live text attempts. */
  reads: [] as unknown[][],
  saved: [] as unknown[],
  extract: vi.fn(),
  enqueue: vi.fn(),
  execute: vi.fn(),
  note: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({ from: () => ({ where: async () => h.reads.shift() ?? [] }) }),
    update: () => ({
      set: (value: { result?: unknown }) => ({
        where: async () => {
          h.saved.push(value.result);
        },
      }),
    }),
  },
  quotaTracker: {},
  tenantStore: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/ai-brains", () => ({ extractActions: h.extract }));
vi.mock("../src/lib/job-queue", () => ({
  enqueue: h.enqueue,
  startWorker: vi.fn(),
  writeTransactionConfig: {},
}));
vi.mock("../src/lib/action-engine", () => ({
  executeAction: h.execute,
  recordOwnerNote: h.note,
}));
vi.mock("../src/lib/ai-audit", () => ({}));
vi.mock("../src/lib/post-call-analysis-policy", () => ({}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({}));
vi.mock("../src/middleware/audit-middleware", () => ({}));
vi.mock("../src/lib/webhook-helpers", () => ({}));
vi.mock("../src/lib/crm-service", () => ({}));
vi.mock("../src/lib/account-deletion", () => ({}));
vi.mock("../src/lib/account-deletion-fence", () => ({}));
vi.mock("../src/lib/app-url", () => ({}));

import { handleJob } from "../src/lib/job-worker-base";

const CALLER = "+17735550100";
const textBack = {
  type: "send_text_message",
  priority: "medium",
  reasoning: "Caller asked for the address by text.",
  payload: { to: "773-555-0100", body: "We are at 12 Main St." },
};
const quoteEmail = {
  type: "send_email",
  priority: "medium",
  reasoning: "Promised a quote.",
  payload: { to: "dana@example.com", subject: "Your quote", body: "Hi Dana" },
};
const message = {
  type: "create_internal_task",
  priority: "high",
  reasoning: "Take a message.",
  payload: { description: "Call Dana back about the water heater." },
};

const extraction = (result?: unknown) =>
  ({
    id: "job-extract",
    userId: "owner-1",
    type: "v2a_action_extraction",
    payload: {
      userId: "owner-1",
      agentId: "bot-1",
      callId: "call-1",
      transcript: "Agent: Thanks for calling.\nCaller: Can you text me the address?",
      summary: "Caller asked for the address.",
      customerNumber: CALLER,
    },
    ...(result === undefined ? {} : { result }),
  }) as unknown as JobRow;

const execution = (action: unknown, autonomy?: "draft") =>
  ({
    id: "job-run",
    userId: "owner-1",
    type: "execute_action",
    payload: {
      userId: "owner-1",
      action,
      context: { sourceId: "call-1", sourceType: "phone_call" },
      ...(autonomy ? { autonomy } : {}),
    },
  }) as unknown as JobRow;

const queued = () => h.enqueue.mock.calls.map(([, job]) => job.payload);

beforeEach(() => {
  vi.clearAllMocks();
  h.reads = [];
  h.saved = [];
  h.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
  h.extract.mockResolvedValue([]);
  h.execute.mockResolvedValue({ success: true });
  h.note.mockResolvedValue(undefined);
});

describe("reading follow-ups from a finished call", () => {
  it("lets the Bot finish a text back to the caller and a note, and leaves an email to the owner", async () => {
    h.extract.mockResolvedValue([textBack, quoteEmail, message]);
    await handleJob(extraction());

    const [text, email, note] = queued();
    // The caller's number as the carrier supplied it, not as it was spoken.
    expect(text).toEqual({
      userId: "owner-1",
      action: { ...textBack, agentId: "bot-1", payload: { ...textBack.payload, to: CALLER } },
      context: { sourceId: "call-1", sourceType: "phone_call" },
    });
    expect(text).not.toHaveProperty("autonomy");
    expect(email.autonomy).toBe("draft");
    expect(email.action.payload).toEqual({
      ...quoteEmail.payload,
      reasoning:
        "The address was heard on the call and not read back to the caller. Check it before you send.",
    });
    expect(note).not.toHaveProperty("autonomy");
    expect(note.action).toEqual({ ...message, agentId: "bot-1" });
  });

  it("gives the Bot one text of its own per call, and the owner any other", async () => {
    // Two workers can pick these up at the same moment. Decided here, in
    // order, the two cannot each wait on the other and neither leave.
    const hours = {
      ...textBack,
      reasoning: "Caller asked for the hours too.",
      payload: { to: CALLER, body: "We are open 8 to 5, Monday to Friday." },
    };
    h.extract.mockResolvedValue([message, textBack, hours]);
    await handleJob(extraction());

    const [note, first, second] = queued();
    expect(note).not.toHaveProperty("autonomy");
    expect(first).not.toHaveProperty("autonomy");
    expect(first.action.payload).toEqual({ ...textBack.payload, to: CALLER });
    expect(second.autonomy).toBe("draft");
    expect(second.action.payload).toEqual({
      ...hours.payload,
      reasoning:
        "Your Bot is already texting this caller about the call. Send this only if it says something new.",
    });
  });

  it("decides the follow-ups once: the plan is saved first and a retry queues exactly that", async () => {
    h.extract.mockResolvedValue([textBack, quoteEmail]);
    await handleJob(extraction());
    expect(h.extract).toHaveBeenCalledOnce();
    const first = queued();
    // What is saved is what is queued: the action, the call, and who finishes it.
    expect(h.saved).toEqual([{ followUps: first }]);

    // The retry carries the saved plan. Asked again, the model would word the
    // text differently, and a differently worded text would be sent again. The
    // live text that was still in flight would also be read differently now.
    vi.clearAllMocks();
    h.saved = [];
    h.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
    h.extract.mockResolvedValue([
      { ...textBack, payload: { to: CALLER, body: "Our address is 12 Main Street." } },
    ]);
    h.reads = [
      [],
      [{ metadata: { status: "completed", output: { result: `SMS sent to ${CALLER}.` } } }],
    ];
    await handleJob(extraction({ followUps: first }));
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.saved).toEqual([]);
    expect(queued()).toEqual(first);
  });

  it("reuses a saved plan with nothing in it, and never one saved for another owner", async () => {
    await handleJob(extraction({ followUps: [] }));
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();

    const foreign = {
      userId: "owner-2",
      action: { ...textBack, payload: { to: "+17735550199", body: "Hello." } },
      context: { sourceId: "call-9", sourceType: "phone_call" },
    };
    await handleJob(extraction({ followUps: [foreign] }));
    expect(h.enqueue).not.toHaveBeenCalled();

    // Anything that is not a plan is ignored, and the transcript is read.
    for (const result of [null, { skipped: true }, { followUps: "all" }, []]) {
      vi.clearAllMocks();
      h.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
      h.extract.mockResolvedValue([message]);
      await handleJob(extraction(result));
      expect(h.extract).toHaveBeenCalledOnce();
      expect(queued()).toHaveLength(1);
    }
  });

  it("saves the plan before queueing anything, so a failed enqueue is retried safely", async () => {
    h.extract.mockResolvedValue([textBack, message]);
    // The queue throws when it cannot take a follow-up, which fails this job.
    h.enqueue
      .mockResolvedValueOnce({ ok: true, jobId: "queued" })
      .mockRejectedValueOnce(new Error("Failed to enqueue execute_action job"));
    await expect(handleJob(extraction())).rejects.toThrow("Failed to enqueue execute_action job");
    expect(h.saved).toHaveLength(1);
    const plan = (h.saved[0] as { followUps: unknown[] }).followUps;
    expect(plan).toHaveLength(2);
    // The retry queues both again; the ledger turns the first into a no-op.
    vi.clearAllMocks();
    h.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
    await handleJob(extraction({ followUps: plan }));
    expect(queued()).toEqual(plan);
  });

  it.each([
    [
      "already texted this number",
      [{ metadata: { status: "completed", output: { result: `SMS sent to ${CALLER}.` } } }],
      "Your Bot already texted this number during the call. Send this only if it says something new.",
    ],
    [
      "has a text already waiting",
      [
        {
          metadata: {
            status: "completed",
            output: { result: `DRAFT_SAVED: ${CALLER}\nThe text is written.` },
          },
        },
      ],
      "A text to this number is already waiting from the call. Send this only if it says something new.",
    ],
    [
      "got no clear answer from the carrier",
      [
        {
          metadata: {
            status: "completed",
            output: {
              result:
                "The message was not confirmed. The message may have been accepted. Do not resend it.",
            },
          },
        },
      ],
      "Your Bot tried to text during the call and the result is not known. Check Texts before you send, so the caller is not texted twice.",
    ],
    [
      "never finished its attempt",
      [{ metadata: { status: "processing" } }],
      "Your Bot tried to text during the call and the result is not known. Check Texts before you send, so the caller is not texted twice.",
    ],
  ])(
    "leaves the text to the owner when the Bot %s during the call",
    async (_name, attempts, why) => {
      h.reads = [[], attempts];
      h.extract.mockResolvedValue([textBack]);
      await handleJob(extraction());
      const [text] = queued();
      expect(text.autonomy).toBe("draft");
      expect(text.action.payload.reasoning).toBe(why);
    },
  );

  it("tells the model what the Bot already did, and skips an email it already sent", async () => {
    h.reads = [
      [
        {
          metadata: {
            output: {
              result:
                "SUBMISSION_OK: Email accepted by the sending service for dana@example.com. Confirm briefly.",
            },
          },
        },
      ],
      [{ metadata: { status: "completed", output: { result: `SMS sent to ${CALLER}.` } } }],
    ];
    h.extract.mockResolvedValue([quoteEmail]);
    await handleJob(extraction());
    expect(h.extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        customerNumber: CALLER,
        completedOnCall: ["Sent an email to dana@example.com.", `Sent a text to ${CALLER}.`],
      }),
    );
    expect(h.enqueue).not.toHaveBeenCalled();
  });
});

describe("running one follow-up", () => {
  const text = {
    ...textBack,
    agentId: "bot-1",
    payload: { to: CALLER, body: "We are at 12 Main St." },
  };

  it("does nothing more when the Bot finished it or it is waiting for the owner", async () => {
    await handleJob(execution(text));
    expect(h.execute).toHaveBeenCalledExactlyOnceWith(
      "owner-1",
      text,
      { sourceId: "call-1", sourceType: "phone_call" },
      undefined,
    );
    h.execute.mockResolvedValue({ success: true, queued: true });
    await handleJob(execution(quoteEmail, "draft"));
    expect(h.execute).toHaveBeenLastCalledWith(
      "owner-1",
      quoteEmail,
      { sourceId: "call-1", sourceType: "phone_call" },
      "draft",
    );
    expect(h.note).not.toHaveBeenCalled();
  });

  it("leaves a text nothing sent waiting for the owner, with the reason", async () => {
    h.execute
      .mockResolvedValueOnce({
        success: false,
        retryable: true,
        error: "Too long had passed since the call for your Bot to text on its own.",
      })
      .mockResolvedValueOnce({ success: true, queued: true });
    await handleJob(execution(text));
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(h.execute).toHaveBeenLastCalledWith(
      "owner-1",
      {
        ...text,
        payload: {
          ...text.payload,
          reasoning:
            "Not sent by your Bot: Too long had passed since the call for your Bot to text on its own.",
        },
      },
      { sourceId: "call-1", sourceType: "phone_call" },
      "draft",
    );
    expect(h.note).not.toHaveBeenCalled();
  });

  it("leaves a note, never a second copy, when it is not known whether the text was sent", async () => {
    h.execute.mockResolvedValue({ success: false, error: "The carrier did not confirm the text." });
    await handleJob(execution(text));
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.note).toHaveBeenCalledExactlyOnceWith("owner-1", {
      description:
        `Your Bot could not confirm a text to ${CALLER} was sent. The carrier did not confirm the text. ` +
        "Check before sending it again. The message was: We are at 12 Main St.",
      priority: "medium",
      agentId: "bot-1",
      sourceId: "call-1",
      sourceType: "phone_call",
    });
  });

  it("leaves a note when a message could not even be saved for the owner", async () => {
    h.execute.mockResolvedValue({ success: false, error: "No mailbox is connected." });
    await handleJob(execution({ ...quoteEmail, agentId: "bot-1" }, "draft"));
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.note).toHaveBeenCalledExactlyOnceWith(
      "owner-1",
      expect.objectContaining({
        description:
          "A caller asked for an email to dana@example.com and your Bot could not prepare it for you. " +
          "No mailbox is connected. The message was: Hi Dana",
      }),
    );
  });

  it("falls back to a note when the waiting copy cannot be saved either", async () => {
    h.execute
      .mockResolvedValueOnce({ success: false, retryable: true, error: "Outside contact hours." })
      .mockResolvedValueOnce({ success: false, error: "Database unavailable." });
    await handleJob(execution(text));
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(h.note).toHaveBeenCalledOnce();
    expect(h.note.mock.calls[0][1].description).toContain(
      `A caller asked for a text to ${CALLER} and your Bot could not prepare it for you. Database unavailable.`,
    );
  });

  it("writes a note the Bot could not write again, as it was", async () => {
    h.execute.mockResolvedValue({ success: false, error: "Database unavailable." });
    await handleJob(execution({ ...message, agentId: "bot-1" }));
    expect(h.note).toHaveBeenCalledExactlyOnceWith(
      "owner-1",
      expect.objectContaining({
        description: "Call Dana back about the water heater.",
        priority: "high",
        agentId: "bot-1",
      }),
    );
  });

  it("fails the job when even the note cannot be written, so the queue tries again", async () => {
    h.execute.mockResolvedValue({ success: false, error: "The carrier did not confirm the text." });
    h.note.mockRejectedValue(new Error("Database unavailable"));
    await expect(handleJob(execution(text))).rejects.toThrow("Database unavailable");
  });

  it("ignores a malformed follow-up instead of running it", async () => {
    await handleJob(execution({ type: "wire_money", priority: "high", payload: {} }));
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.note).not.toHaveBeenCalled();
  });
});
