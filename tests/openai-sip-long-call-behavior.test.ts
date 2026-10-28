import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/sms-usage-billing", () => {
  const unexpected = () => {
    throw new Error("Unexpected SMS billing in SIP test");
  };
  return {
    reserveSmsUsage: unexpected,
    settleSmsUsage: unexpected,
    hasReleasedSmsUsage: unexpected,
  };
});

vi.mock("../src/lib/voice/elevenlabs-media-bridge", () => ({
  createClonedMediaSession: vi.fn(() => {
    throw new Error("Unexpected media call in SIP test");
  }),
  controlMediaCall: vi.fn(),
}));

const h = vi.hoisted(() => ({
  sockets: [] as Array<{
    emit: (event: string, ...args: unknown[]) => boolean;
    close: () => void;
    readyState: number;
  }>,
  sent: [] as Array<Record<string, any>>,
  writes: [] as Array<Record<string, any>>,
  account: vi.fn(),
  providerUsage: vi.fn(),
  flushProviderUsage: vi.fn(),
  usage: vi.fn(),
  digest: vi.fn(),
  tool: vi.fn(),
  provider: vi.fn(),
  environment: vi.fn(),
  funding: vi.fn(),
  canonicalFundingId: vi.fn(),
  refundFunding: vi.fn(),
  carrierDuration: vi.fn(),
  reportError: vi.fn(),
  presenceStatus: "connected" as string | undefined,
  presenceUser: "tenant",
  presenceScopes: [] as unknown[],
  transactionTail: Promise.resolve() as Promise<unknown>,
  respondToPing: true,
  pingFails: false,
  openFails: false,
  failNextToolOutput: false,
  callUser: "tenant",
  callDirection: "inbound" as string | null,
  callSource: "twilio:CA11111111111111111111111111111111" as string | null,
  callOwner: "owner",
  callPhase: "terminal",
  callReason: "provider-heartbeat-timeout",
}));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    constructor() {
      super();
      h.sockets.push(this);
      queueMicrotask(() => {
        if (h.openFails) {
          this.emit("error", new Error("connection refused"));
          return;
        }
        this.readyState = 1;
        this.emit("open");
      });
    }
    send(raw: string) {
      const event = JSON.parse(raw);
      if (h.failNextToolOutput && event.item?.type === "function_call_output") {
        h.failNextToolOutput = false;
        throw new Error("tool output transport failed");
      }
      h.sent.push(event);
    }
    ping() {
      if (h.pingFails) throw new Error("transport is unavailable");
      if (h.respondToPing) queueMicrotask(() => this.emit("pong"));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit("close", 1000, Buffer.from("finished"));
    }
    terminate() {
      this.close();
    }
  }
  return { default: Socket };
});
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  or: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  sql: () => "sql",
  relations: () => ({}),
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, key) => (key === "__name" ? name : String(key)) });
  return {
    callLogs: table("calls"),
    signalPresence: table("presence"),
    outboundLeads: table("leads"),
    consentLog: table("consent"),
    outboundPlacements: table("placements"),
    jobs: table("jobs"),
  };
});
vi.mock("../src/lib/server-context", () => {
  const query = (operation = "select", table?: { __name: string }) => {
    let target = table?.__name;
    let values: Record<string, unknown> | undefined;
    let where: unknown;
    const requestedUser = (node: unknown): string | undefined => {
      if (!Array.isArray(node)) return undefined;
      if (node[0] === "userId") return String(node[1]);
      return node.map(requestedUser).find((value) => value !== undefined);
    };
    const requestedValue = (node: unknown, key: string): unknown => {
      if (!Array.isArray(node)) return undefined;
      if (node[0] === key) return node[1];
      return node.map((part) => requestedValue(part, key)).find((value) => value !== undefined);
    };
    const chain: any = {
      from: (source: { __name: string }) => {
        target = source.__name;
        return chain;
      },
      where: (filter: unknown) => {
        where = filter;
        if (target === "presence") h.presenceScopes.push(filter);
        return chain;
      },
      limit: () => chain,
      for: () => chain,
      onConflictDoUpdate: () => chain,
      onConflictDoNothing: () => chain,
      set: (value: Record<string, unknown>) => {
        values = value;
        h.writes.push(value);
        return chain;
      },
      values: (value: Record<string, unknown>) => {
        values = value;
        h.writes.push(value);
        return chain;
      },
      returning: () => chain,
      then: (resolve: (rows: unknown[]) => void, reject?: (error: unknown) => void) =>
        Promise.resolve()
          .then(() => {
            if (target === "calls") {
              const user = requestedUser(where);
              if (user !== undefined && user !== h.callUser) return [];
              if (values?.endedReason === "pre-session-rejected") {
                const owner = requestedValue(where, "openaiSipOwnerToken");
                const phase = requestedValue(where, "openaiSipPhase");
                if (owner !== h.callOwner) return [];
                if (Array.isArray(phase) ? !phase.includes(h.callPhase) : phase !== h.callPhase) {
                  return [];
                }
              }
              if (values?.openaiSipPhase) h.callPhase = String(values.openaiSipPhase);
              if (values?.endedReason) h.callReason = String(values.endedReason);
              return [
                {
                  id: 1n,
                  status: "connected",
                  providerCallId: "openai:rtc_test",
                  direction: h.callDirection,
                  sourceId: h.callSource,
                  phase: h.callPhase,
                  endedReason: h.callReason,
                },
              ];
            }
            if (target !== "presence") return [{ id: 1n, status: "connected" }];
            const user = requestedUser(where);
            if (user !== undefined && user !== h.presenceUser) return [];
            if (operation === "delete") h.presenceStatus = undefined;
            if (values?.status) h.presenceStatus = String(values.status);
            return h.presenceStatus ? [{ id: 1n, status: h.presenceStatus }] : [];
          })
          .then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: () => query(),
    insert: (table: { __name: string }) => query("insert", table),
    update: (table: { __name: string }) => query("update", table),
    delete: (table: { __name: string }) => query("delete", table),
    execute: vi.fn().mockResolvedValue(undefined),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      // Model the shared DB call-control lock across separately loaded runtimes.
      const result = h.transactionTail.then(() => fn(db));
      h.transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  return {
    drizzle: db,
    tenantStore: { run: (_id: string, fn: () => unknown) => fn() },
    fetchWithTimeout: h.provider,
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});
vi.mock("../src/lib/agent-tool-dispatch", () => ({
  dispatchAgentToolCall: h.tool,
}));
vi.mock("../src/lib/agent-runtime", () => ({
  complianceFirstMessagePrefix: () => "I am an AI assistant. ",
  formatCallbackNumberForSpeech: () => "the business",
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: h.environment,
}));
vi.mock("../src/lib/mobile-push", () => ({
  notifyInboundCall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/outbound-call-purpose", () => ({
  isMarketingCallPurpose: () => false,
}));
vi.mock("../src/lib/outbound-status", () => ({ LEAD_STATUS: {} }));
vi.mock("../src/lib/post-call-digest", () => ({
  enqueuePostCallDigest: h.digest,
}));
vi.mock("../src/lib/error-reporter", () => ({ reportError: h.reportError }));
vi.mock("../src/lib/tcpa-consent", () => ({
  buildConsentLedgerRow: vi.fn(),
  CONSENT_RULE_VERSION: "test",
  detectAiDisclosure: () => ({ found: false }),
  detectOptOut: () => ({ kind: "none" }),
  getConsentRuleForPhone: vi.fn(),
}));
vi.mock("../src/lib/call-dnc-suppression", () => ({
  persistTranscriptDncSuppression: vi.fn(),
}));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: h.usage }));
vi.mock("../src/lib/voice-call-funding", () => ({
  reserveVoiceCallFunding: async () => null,
  getVoiceCallFunding: h.funding,
  releaseVoiceCallFunding: h.refundFunding,
  releaseVoiceCallFundingInTransaction: h.refundFunding,
}));
vi.mock("../src/lib/voice-call-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/voice-call-identity")>()),
  resolveVoiceFundingId: h.canonicalFundingId,
}));
vi.mock("../src/lib/voice/funded-carrier-call", () => ({
  enforceFundedCarrierCallLimit: vi.fn(),
  readTerminalCarrierDuration: h.carrierDuration,
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  extendCommittedPlatformCostReservation: h.account,
  getAiTokenQuotaExceeded: vi.fn(() => false),
  reservePlatformCostRecord: vi.fn(),
  releasePlatformCostReservation: vi.fn(),
  commitPlatformCostReservation: vi.fn(),
}));
vi.mock("../src/lib/realtime-spend-reservation", () => ({
  reconcileOpenAISipDurationSpend: vi.fn(),
}));
vi.mock("../src/lib/realtime-provider-usage", () => ({
  createRealtimeUsageRecorder: () => ({
    observe: h.providerUsage,
    flush: h.flushProviderUsage,
  }),
}));
vi.mock("../src/lib/voice/openai-phone-agent-runtime", () => ({
  buildOpenAIRealtimeAgentRuntime: vi.fn(),
}));
vi.mock("../src/lib/voice/ai-disclosure-evidence", () => ({
  AI_DISCLOSURE_EVENTS: [],
  classifyAiDisclosureEvidence: vi.fn(),
  firstAgentTranscript: vi.fn(),
}));

import {
  applyInboundAdmission,
  replayOpenAISipPostCallFinalization,
  runOpenAISipCallSession,
  settleOpenAISipPreSessionFailure,
} from "../src/lib/voice/openai-sip-session";

const call = {
  callId: "rtc_test",
  userId: "tenant",
  agentId: "bot",
  callerNumber: "+12025550101",
  calledNumber: "+12025550102",
};
const runtime = {
  agentName: "Service Bot",
  greeting: "How can I help?",
  session: { type: "realtime", instructions: "Help the customer", tools: [] },
};
const claim = {
  callLogId: 1n,
  recoveryJobId: "job",
  ownerToken: "owner",
  resumed: false,
};
const reservation = {
  auditId: 1n,
  userId: "tenant",
  costUsd: 1,
  adopted: false,
};
const start = () => runOpenAISipCallSession(call, runtime as any, 1n, claim, reservation);
const emit = async (event: Record<string, unknown>) => {
  h.sockets[0].emit("message", Buffer.from(JSON.stringify(event)));
  await vi.advanceTimersByTimeAsync(0);
};
describe("funded inbound runtime construction", () => {
  it("never constructs a paid AI notice for suspended inbound work", () => {
    expect(() =>
      applyInboundAdmission(runtime as any, {
        ...call,
        admission: { mode: "suspended", reason: "coverage" },
      }),
    ).toThrow("cannot start a new AI call");
  });
  it("retains covered after-hours message-taking", () => {
    const result = applyInboundAdmission(runtime as any, {
      ...call,
      admission: { mode: "take_message", reason: "after_hours" },
    });
    expect(result.session.instructions).toContain("AFTER-HOURS MODE");
  });
  it("limits legacy funded recovery to a tool-free 20-second notice", async () => {
    const recovering = {
      ...call,
      admission: {
        mode: "recovery_notice" as const,
        reason: "recovery" as const,
      },
    };
    const notice = applyInboundAdmission(runtime as any, recovering);
    expect(notice.session.tools).toEqual([]);
    expect(notice.session.tool_choice).toBe("none");
    const session = runOpenAISipCallSession(recovering, notice, 1n, claim, reservation);
    await vi.advanceTimersByTimeAsync(20_001);
    await session;
    expect(h.tool).not.toHaveBeenCalled();
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 20 }));
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  vi.stubEnv("OPENAI_API_KEY", "test-only-no-provider-calls");
  vi.stubEnv("OPENAI_SIP_MAX_CALL_SECONDS", "3600");
  h.sockets = [];
  h.sent = [];
  h.writes = [];
  h.account.mockReset().mockResolvedValue(undefined);
  h.providerUsage.mockReset();
  h.flushProviderUsage.mockReset().mockResolvedValue(undefined);
  h.usage.mockReset().mockResolvedValue(undefined);
  h.digest.mockReset().mockResolvedValue({ jobId: "job" });
  h.tool.mockReset().mockResolvedValue({ result: "Approved knowledge found." });
  h.provider.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.environment.mockReset().mockResolvedValue(undefined);
  h.funding.mockReset().mockResolvedValue(null);
  h.canonicalFundingId
    .mockReset()
    .mockImplementation(
      async (_reader: unknown, _userId: string, providerId: string) => providerId,
    );
  h.refundFunding.mockReset().mockResolvedValue(undefined);
  h.carrierDuration.mockReset().mockResolvedValue({ durationSeconds: 120, unanswered: false });
  h.reportError.mockReset();
  h.presenceStatus = "connected";
  h.presenceUser = "tenant";
  h.presenceScopes = [];
  h.transactionTail = Promise.resolve();
  h.respondToPing = true;
  h.pingFails = false;
  h.openFails = false;
  h.failNextToolOutput = false;
  h.callUser = "tenant";
  h.callDirection = "inbound";
  h.callSource = "twilio:CA11111111111111111111111111111111";
  h.callOwner = "owner";
  h.callPhase = "terminal";
  h.callReason = "provider-heartbeat-timeout";
});

describe("native SIP opening delivery", () => {
  it.each(["inbound", "outbound"] as const)(
    "uses the correct %s opening with natural delivery",
    async (direction) => {
      const greeting = "Hi, this is Nora with BotBound. How can I help you?";
      const session = runOpenAISipCallSession(
        { ...call, direction, businessName: "BOTBOUND LLC" },
        { ...runtime, agentName: "Nora", greeting } as any,
        1n,
        claim,
        reservation,
      );
      await vi.advanceTimersByTimeAsync(0);
      const opening = h.sent.find((event) => event.type === "response.create")?.response;
      expect(opening?.instructions).toContain("warm, natural speaking style");
      expect(opening?.instructions).toContain(
        `Say exactly these words and nothing else: ${direction === "inbound" ? "Hi, you're speaking with an AI assistant for Nora at BOTBOUND LLC. How can I help you?" : "I am an AI assistant. Hi, this is Nora with BOTBOUND LLC. You can call us back at the business."}`,
      );
      if (direction === "inbound") {
        // Inbound discloses AI first; the owner's identity line is not repeated.
        expect(opening?.instructions).not.toContain("this is Nora with BotBound");
      }
      expect(opening?.output_modalities).toEqual(["audio"]);
      h.sockets[0].close();
      await session;
    },
  );
});

describe("native SIP semantic tool accounting", () => {
  it("does not continue a completed tool over a newer caller response received during the tool", async () => {
    const held = heldResult<{ result: string }>();
    h.tool.mockReturnValueOnce(held.promise);
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    try {
      await emit({ type: "output_audio_buffer.stopped" });
      await emit({
        type: "response.created",
        response: { id: "response-tool" },
      });
      await emit({
        type: "response.function_call_arguments.done",
        name: "search_agent_knowledge",
        call_id: "tool-held",
        arguments: "{}",
      });
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "completed" },
      });
      expect(h.tool).toHaveBeenCalledOnce();
      const responsesBefore = h.sent.filter((event) => event.type === "response.create").length;

      await emit({
        type: "input_audio_buffer.speech_started",
        item_id: "caller-follow-up",
      });
      await emit({
        type: "input_audio_buffer.speech_stopped",
        item_id: "caller-follow-up",
      });
      await emit({
        type: "response.created",
        response: { id: "response-caller" },
      });
      await emit({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "caller-follow-up",
        transcript: "Please explain the cancellation policy too.",
      });
      held.resolve({ result: "Approved knowledge found." });
      await vi.advanceTimersByTimeAsync(0);

      expect(h.sent).toContainEqual(
        expect.objectContaining({
          item: expect.objectContaining({ call_id: "tool-held" }),
        }),
      );
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore,
      );
      await emit({
        type: "output_audio_buffer.started",
        response_id: "response-caller",
      });
      // An older done and playback stop cannot clear the newer response.
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "completed" },
      });
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "cancelled" },
      });
      await emit({
        type: "output_audio_buffer.stopped",
        response_id: "response-tool",
      });
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore,
      );
      await emit({
        type: "response.done",
        response: { id: "response-caller", status: "completed" },
      });
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore,
      );
      await emit({
        type: "output_audio_buffer.stopped",
        response_id: "response-caller",
      });
      const responses = h.sent.filter((event) => event.type === "response.create");
      expect(responses).toHaveLength(responsesBefore + 1);
      const metadata = responses.at(-1)?.response.metadata;
      expect(metadata.botbound_tool_continuation).toEqual(expect.any(String));
      await emit({
        type: "output_audio_buffer.stopped",
        response_id: "response-caller",
      });
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore + 1,
      );
      await emit({
        type: "response.created",
        response: { id: "response-continuation", metadata },
      });
      await emit({
        type: "response.done",
        response: { id: "response-continuation", status: "completed" },
      });
      await emit({
        type: "output_audio_buffer.stopped",
        response_id: "response-continuation",
      });
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore + 1,
      );
    } finally {
      held.resolve({ result: "Approved knowledge found." });
      h.sockets[0].close();
      await session;
    }
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: expect.stringContaining("Please explain the cancellation policy too."),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("retries a tool continuation the provider never acknowledged instead of staying silent", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    try {
      await emit({ type: "output_audio_buffer.stopped" });
      await emit({
        type: "response.created",
        response: { id: "response-tool" },
      });
      await emit({
        type: "response.function_call_arguments.done",
        name: "search_agent_knowledge",
        call_id: "tool-unacknowledged",
        arguments: "{}",
      });
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "completed" },
      });

      const continuations = () =>
        h.sent.filter(
          (event) =>
            event.type === "response.create" &&
            typeof event.response?.metadata?.botbound_tool_continuation === "string",
        );
      expect(continuations()).toHaveLength(1);
      const firstMetadata = continuations()[0].response.metadata;

      // The provider never sends response.created with that metadata.
      await vi.advanceTimersByTimeAsync(4_001);

      expect(continuations()).toHaveLength(2);
      const retryMetadata = continuations()[1].response.metadata;
      expect(retryMetadata.botbound_tool_continuation).not.toBe(
        firstMetadata.botbound_tool_continuation,
      );

      // The retry is acknowledged: no further attempts.
      await emit({
        type: "response.created",
        response: {
          id: "response-continuation-retry",
          metadata: retryMetadata,
        },
      });
      await emit({
        type: "response.done",
        response: { id: "response-continuation-retry", status: "completed" },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(continuations()).toHaveLength(2);
    } finally {
      h.sockets[0].close();
      await session;
    }
  });

  it.each(["conversation.item.created", "conversation.item.added", "conversation.item.done"])(
    "waits through caller speech and VAD admission, then consumes a result acknowledged by %s",
    async (ackType) => {
      const held = heldResult<{ result: string }>();
      h.tool.mockReturnValueOnce(held.promise);
      const session = start();
      await vi.advanceTimersByTimeAsync(0);
      try {
        await emit({ type: "output_audio_buffer.stopped" });
        await emit({
          type: "response.function_call_arguments.done",
          name: "search_agent_knowledge",
          call_id: "tool-acknowledged",
          arguments: "{}",
        });
        await emit({
          type: "response.done",
          response: { id: "response-tool", status: "completed" },
        });
        const responsesBefore = h.sent.filter((event) => event.type === "response.create").length;
        await emit({
          type: "input_audio_buffer.speech_started",
          item_id: "caller-follow-up",
        });
        held.resolve({ result: "Approved knowledge found." });
        await vi.advanceTimersByTimeAsync(0);
        expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
          responsesBefore,
        );
        await emit({
          type: "input_audio_buffer.speech_stopped",
          item_id: "caller-follow-up",
        });
        await emit({
          type: "input_audio_buffer.committed",
          item_id: "caller-follow-up",
        });
        await emit({ type: "output_audio_buffer.stopped" });
        expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
          responsesBefore,
        );
        for (const type of [ackType, "conversation.item.done"]) {
          await emit({
            type,
            item: {
              type: "function_call_output",
              call_id: "tool-acknowledged",
            },
          });
        }
        await emit({
          type: "response.created",
          response: { id: "response-with-result" },
        });
        await emit({
          type: "response.done",
          response: { id: "response-with-result", status: "completed" },
        });
        await emit({
          type: "output_audio_buffer.stopped",
          response_id: "response-with-result",
        });
        expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
          responsesBefore,
        );
      } finally {
        held.resolve({ result: "Approved knowledge found." });
        h.sockets[0].close();
        await session;
      }
    },
  );

  it("retains an unacknowledged result when an automatic response may have started before publication", async () => {
    const held = heldResult<{ result: string }>();
    h.tool.mockReturnValueOnce(held.promise);
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    try {
      await emit({ type: "output_audio_buffer.stopped" });
      await emit({
        type: "response.function_call_arguments.done",
        name: "search_agent_knowledge",
        call_id: "tool-not-acknowledged",
        arguments: "{}",
      });
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "completed" },
      });
      await emit({
        type: "input_audio_buffer.speech_started",
        item_id: "caller-follow-up",
      });
      await emit({
        type: "input_audio_buffer.committed",
        item_id: "caller-follow-up",
      });
      held.resolve({ result: "Approved knowledge found." });
      await vi.advanceTimersByTimeAsync(0);
      const responsesBefore = h.sent.filter((event) => event.type === "response.create").length;
      await emit({
        type: "response.created",
        response: { id: "response-in-flight" },
      });
      await emit({
        type: "response.done",
        response: { id: "response-in-flight", status: "completed" },
      });
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore + 1,
      );
    } finally {
      held.resolve({ result: "Approved knowledge found." });
      h.sockets[0].close();
      await session;
    }
  });

  it("does not resume a deferred tool after the call closes", async () => {
    const held = heldResult<{ result: string }>();
    h.tool.mockReturnValueOnce(held.promise);
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    await emit({ type: "output_audio_buffer.stopped" });
    await emit({
      type: "response.function_call_arguments.done",
      name: "search_agent_knowledge",
      call_id: "tool-closing",
      arguments: "{}",
    });
    await emit({
      type: "response.done",
      response: { id: "response-tool", status: "completed" },
    });
    const responsesBefore = h.sent.filter((event) => event.type === "response.create").length;
    h.sockets[0].close();
    held.resolve({ result: "Approved knowledge found." });
    await session;
    expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
      responsesBefore,
    );
  });

  it.each(["incomplete", "cancelled"])(
    "does not retry a %s continuation without a new caller turn",
    async (status) => {
      const session = start();
      await vi.advanceTimersByTimeAsync(0);
      try {
        await emit({ type: "output_audio_buffer.stopped" });
        await emit({
          type: "response.function_call_arguments.done",
          name: "search_agent_knowledge",
          call_id: "tool-next-caller",
          arguments: "{}",
        });
        await emit({
          type: "response.done",
          response: { id: "response-tool", status: "completed" },
        });
        const responses = h.sent.filter((event) => event.type === "response.create");
        const metadata = responses.at(-1)?.response.metadata;
        expect(metadata.botbound_tool_continuation).toEqual(expect.any(String));
        await emit({
          type: "response.created",
          response: { id: "response-not-completed", metadata },
        });
        await emit({
          type: "conversation.item.added",
          item: { type: "function_call_output", call_id: "tool-next-caller" },
        });
        await emit({
          type: "response.done",
          response: { id: "response-not-completed", status },
        });
        await emit({
          type: "output_audio_buffer.stopped",
          response_id: "response-not-completed",
        });
        await emit({
          type: "output_audio_buffer.stopped",
          response_id: "response-not-completed",
        });
        expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
          responses.length,
        );

        await emit({
          type: "input_audio_buffer.speech_started",
          item_id: "caller-retry",
        });
        await emit({
          type: "input_audio_buffer.committed",
          item_id: "caller-retry",
        });
        await emit({
          type: "response.created",
          response: { id: "response-next-caller" },
        });
        await emit({
          type: "response.done",
          response: { id: "response-not-completed", status },
        });
        await emit({
          type: "response.done",
          response: { id: "response-next-caller", status: "completed" },
        });
        await emit({
          type: "output_audio_buffer.stopped",
          response_id: "response-next-caller",
        });
        expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
          responses.length,
        );
      } finally {
        h.sockets[0].close();
        await session;
      }
    },
  );

  it.each([
    { type: "error", error: { type: "invalid_request_error" } },
    {
      type: "response.done",
      response: { id: "response-fatal", status: "failed" },
    },
  ])("fences a continuation when $type arrives during a deferred tool", async (fatalEvent) => {
    const held = heldResult<{ result: string }>();
    h.tool.mockReturnValueOnce(held.promise);
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    try {
      await emit({ type: "output_audio_buffer.stopped" });
      await emit({
        type: "response.function_call_arguments.done",
        name: "search_agent_knowledge",
        call_id: "tool-fatal",
        arguments: "{}",
      });
      await emit({
        type: "response.done",
        response: { id: "response-tool", status: "completed" },
      });
      const responsesBefore = h.sent.filter((event) => event.type === "response.create").length;
      await emit(fatalEvent);
      held.resolve({ result: "Approved knowledge found." });
      await session;
      expect(h.sent.filter((event) => event.type === "response.create")).toHaveLength(
        responsesBefore,
      );
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.provider.mock.calls[0][0]).toContain("/hangup");
    } finally {
      held.resolve({ result: "Approved knowledge found." });
      h.sockets[0].close();
      await session;
    }
  });

  it.each([
    [
      "send_email",
      "The email send was not confirmed. Your request was saved for manual review.",
      1,
    ],
    ["send_email", "No email was sent. Your request was saved for manual review.", 1],
    ["send_email", "EMAIL_CONFIRMATION_REQUIRED: Read back the exact address first.", 1],
    [
      "send_email",
      "That action is not enabled for this agent or its required connection is unavailable.",
      1,
    ],
    ["send_email", "Email submitted successfully. Inbox delivery has not been verified.", 0],
    ["create_followup_task", "Your request was saved for manual review.", 0],
  ])("counts %s outcome %s as %i failed call", async (name, result, failed) => {
    h.tool.mockResolvedValue({ toolCallId: "tool-semantic", result });
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    await emit({ type: "output_audio_buffer.stopped" });
    await emit({
      type: "response.function_call_arguments.done",
      name,
      call_id: "tool-semantic",
      arguments: "{}",
    });
    await emit({ type: "response.done", response: { status: "completed" } });
    h.sockets[0].close();
    await session;
    expect(h.tool).toHaveBeenCalledOnce();
    expect(h.writes).toContainEqual(
      expect.objectContaining({ toolCallsTotal: 1, toolCallsFailed: failed }),
    );
  });

  it("does not double-count a failed send when delivering its tool result also fails", async () => {
    h.tool.mockResolvedValue({
      toolCallId: "tool-semantic",
      result: "The email send was not confirmed. Your request was saved for manual review.",
    });
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    await emit({ type: "output_audio_buffer.stopped" });
    h.failNextToolOutput = true;
    await emit({
      type: "response.function_call_arguments.done",
      name: "send_email",
      call_id: "tool-semantic",
      arguments: "{}",
    });
    await emit({ type: "response.done", response: { status: "completed" } });
    h.sockets[0].close();
    await session;
    expect(h.failNextToolOutput).toBe(false);
    expect(h.writes).toContainEqual(
      expect.objectContaining({ toolCallsTotal: 1, toolCallsFailed: 1 }),
    );
  });
});

describe("trusted SIP provider usage observation", () => {
  it("observes billed failed response usage before failure cleanup and flushes it", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    const event = {
      type: "response.done",
      response: {
        id: "resp_failed",
        status: "failed",
        usage: { input_tokens: 100, output_tokens: 10 },
      },
    };
    await emit(event);
    await session;
    expect(h.providerUsage).toHaveBeenCalledWith(event);
    expect(h.flushProviderUsage).toHaveBeenCalledOnce();
  });
});

describe("accepted SIP startup cleanup", () => {
  it.each(["spend_commit_failed", "session_start_failed"] as const)(
    "keeps %s cleanup retryable until provider hangup is confirmed",
    async (reason) => {
      h.callPhase = "claimed";
      await expect(settleOpenAISipPreSessionFailure({ call, claim, reason })).resolves.toBe(true);
      expect(h.presenceStatus).toBe("connected");
      expect(h.writes.some((value) => value.status === "done")).toBe(false);
      expect(h.digest).toHaveBeenCalledWith(
        expect.objectContaining({
          endedReason: "pre-session-rejected",
          pipelineError: reason,
          finalization: {
            provider: "openai_sip",
            callId: call.callId,
            leadId: null,
            openingPlaybackConfirmed: false,
            terminalStateReady: true,
            providerHangupRequired: true,
          },
        }),
        expect.anything(),
        { runAt: expect.any(Date), refreshPending: true },
      );
      const recorded = h.digest.mock.calls.at(-1)![0];
      h.provider.mockResolvedValueOnce({ ok: false, status: 503 });
      await expect(replayOpenAISipPostCallFinalization(recorded)).rejects.toThrow("503");
      expect(h.presenceStatus).toBe("connected");
      expect(h.usage).not.toHaveBeenCalled();
      await expect(replayOpenAISipPostCallFinalization(recorded)).resolves.toBeUndefined();
      expect(h.presenceStatus).toBeUndefined();
      expect(h.provider).toHaveBeenCalledTimes(2);
      expect(h.provider.mock.calls.every(([url]) => url.includes("/hangup"))).toBe(true);
      expect(h.usage).not.toHaveBeenCalled();
      expect(h.account).not.toHaveBeenCalled();
    },
  );

  it("recovers a startup transition committed before its database response was lost", async () => {
    h.callPhase = "running";
    await expect(
      settleOpenAISipPreSessionFailure({
        call,
        claim,
        reason: "session_start_failed",
      }),
    ).resolves.toBe(true);
    expect(h.callPhase).toBe("terminal");
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        finalization: expect.objectContaining({ providerHangupRequired: true }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not settle or queue hangup after a new owner takes over", async () => {
    h.callPhase = "running";
    h.callOwner = "replacement-owner";
    await expect(
      settleOpenAISipPreSessionFailure({
        call,
        claim,
        reason: "session_start_failed",
      }),
    ).resolves.toBe(false);
    expect(h.callPhase).toBe("running");
    expect(h.digest).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.writes.some((value) => value.status === "done")).toBe(false);
  });

  it("does not settle a running session from an earlier admission failure", async () => {
    h.callPhase = "running";
    await expect(
      settleOpenAISipPreSessionFailure({
        call,
        claim,
        reason: "spend_reservation_failed",
      }),
    ).resolves.toBe(false);
    expect(h.digest).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });

  it("keeps a definite pre-accept rejection terminal without post-call delivery", async () => {
    h.callPhase = "claimed";
    await expect(
      settleOpenAISipPreSessionFailure({
        call,
        claim,
        reason: "spend_reservation_failed",
      }),
    ).resolves.toBe(true);
    expect(h.writes).toContainEqual(expect.objectContaining({ status: "done" }));
    expect(h.presenceStatus).toBeUndefined();
    expect(h.digest).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("long business-call lifecycle", () => {
  it("refunds a confirmed failed sideband-open without charging on durable replay", async () => {
    const funding = {
      maxSeconds: 2400,
      prepaidHoldUsd: 0,
      graceMinutes: 10,
      includedMinutes: 30,
      rateUsd: 0.22,
      planId: "voice",
      periodKey: "2026-09",
      startedAtMs: Date.now(),
      deadlineAtMs: Date.now() + 2400000,
    };
    h.funding.mockResolvedValue(funding);
    h.openFails = true;
    const session = runOpenAISipCallSession(
      { ...call, funding },
      runtime as any,
      1n,
      claim,
      reservation,
    );
    await vi.advanceTimersByTimeAsync(1);
    await session;
    const recorded = h.digest.mock.calls.at(-1)![0];
    expect(recorded.finalization.noConversationDelivered).toBe(true);
    expect(recorded.endedReason).toBe("runtime-error");
    expect(h.usage).not.toHaveBeenCalled();
    await replayOpenAISipPostCallFinalization(recorded);
    expect(h.refundFunding).toHaveBeenCalledWith(
      "tenant",
      "openai:rtc_test",
      "confirmed_startup_failure",
    );
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.presenceStatus).toBeUndefined();
  });
  it("enforces the original funding deadline after a controller restart, without billing admission time", async () => {
    const funding = {
      maxSeconds: 1800,
      prepaidHoldUsd: 0,
      graceMinutes: 10,
      includedMinutes: 30,
      rateUsd: 0.22,
      planId: "voice",
      periodKey: "2026-09",
      startedAtMs: Date.now() - 1_790_000,
      deadlineAtMs: Date.now() + 10_000,
    };
    const session = runOpenAISipCallSession(
      { ...call, funding },
      runtime as any,
      1n,
      claim,
      reservation,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 10 }));
    expect(h.provider).toHaveBeenCalled();
  });

  it("uses the complete verified carrier duration for a recovered session", async () => {
    const funding = {
      maxSeconds: 1800,
      prepaidHoldUsd: 1,
      graceMinutes: 10,
      includedMinutes: 30,
      rateUsd: 0.22,
      planId: "voice",
      periodKey: "2026-09",
      startedAtMs: Date.now() - 100_000,
      deadlineAtMs: Date.now() + 1_700_000,
    };
    h.funding.mockResolvedValue(funding);
    h.carrierDuration.mockResolvedValue({
      durationSeconds: 120,
      unanswered: false,
    });
    const session = runOpenAISipCallSession(
      { ...call, funding, recoveredSession: true },
      runtime as any,
      1n,
      { ...claim, resumed: true },
      reservation,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    h.sockets[0].close();
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 120 }));
    expect(h.writes).toContainEqual({ durationSeconds: 120 });
  });
  it("retains its capacity slot when customer usage settlement fails", async () => {
    h.usage.mockRejectedValue(new Error("ledger unavailable"));
    const session = start();
    await vi.advanceTimersByTimeAsync(10_000);
    h.sockets[0].close();
    await session;
    expect(h.presenceStatus).toBe("settling");
    const recorded = h.digest.mock.calls.at(-1)![0];
    await expect(replayOpenAISipPostCallFinalization(recorded)).rejects.toThrow(
      "ledger unavailable",
    );
    expect(h.presenceStatus).toBe("settling");
    h.usage.mockResolvedValue(undefined);
    await replayOpenAISipPostCallFinalization(recorded);
    expect(h.presenceStatus).toBeUndefined();
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        finalization: expect.objectContaining({ terminalStateReady: true }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });
  it.each(["provider5xx", "timeout"] as const)(
    "retains connected-call funding and capacity until uncertain %s hangup is confirmed",
    async (failure) => {
      const funding = {
        maxSeconds: 3600,
        prepaidHoldUsd: 0,
        graceMinutes: 10,
        includedMinutes: 50,
        rateUsd: 0.22,
        planId: "voice",
        periodKey: "paid:in_test:1788360000000",
        startedAtMs: Date.now(),
        deadlineAtMs: Date.now() + 3_600_000,
      };
      h.funding.mockResolvedValue(funding);
      if (failure === "provider5xx") h.provider.mockResolvedValue({ ok: false, status: 503 });
      else h.provider.mockRejectedValue(new Error("provider request timed out"));

      const session = runOpenAISipCallSession(
        { ...call, funding },
        runtime as any,
        1n,
        claim,
        reservation,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      h.sockets[0].readyState = 3;
      h.sockets[0].emit("close", 1006, Buffer.from("connection lost"));
      await session;

      const recorded = h.digest.mock.calls.at(-1)![0];
      expect(recorded).toMatchObject({
        durationSeconds: 10,
        finalization: {
          providerHangupRequired: true,
          terminalStateReady: true,
        },
      });
      expect(h.presenceStatus).toBe("settling");
      expect(h.usage).not.toHaveBeenCalled();
      expect(h.refundFunding).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(180_000);
      await expect(replayOpenAISipPostCallFinalization(recorded)).rejects.toThrow();
      expect(h.presenceStatus).toBe("settling");
      expect(h.usage).not.toHaveBeenCalled();
      expect(h.refundFunding).not.toHaveBeenCalled();

      h.provider.mockResolvedValue({ ok: true, status: 200 });
      await replayOpenAISipPostCallFinalization(recorded);
      expect(h.presenceStatus).toBeUndefined();
      expect(h.usage).toHaveBeenCalledExactlyOnceWith({
        userId: "tenant",
        durationSeconds: 10,
        vapiCallId: "openai:rtc_test",
      });
      expect(h.refundFunding).not.toHaveBeenCalled();
      expect(h.carrierDuration).not.toHaveBeenCalled();

      // Redelivery retains the same usage key/duration for the idempotent ledger;
      // recovery time is never added to customer usage.
      h.provider.mockResolvedValue({ ok: false, status: 404 });
      await replayOpenAISipPostCallFinalization(recorded);
      expect(h.usage).toHaveBeenCalledTimes(2);
      expect(h.usage.mock.calls[1]).toEqual(h.usage.mock.calls[0]);
    },
  );

  it.each(["provider5xx", "timeout"] as const)(
    "durably retains unconfirmed hangup after %s until replay succeeds",
    async (failure) => {
      if (failure === "provider5xx") h.provider.mockResolvedValue({ ok: false, status: 503 });
      else h.provider.mockRejectedValue(new Error("provider request timed out"));
      h.respondToPing = false;
      const session = start();
      await vi.advanceTimersByTimeAsync(75_000);
      await session;
      const recorded = h.digest.mock.calls.at(-1)![0];
      expect(recorded).toMatchObject({
        endedReason: "provider-heartbeat-timeout",
        finalization: {
          providerHangupRequired: true,
          terminalStateReady: true,
        },
      });
      const writesBeforeReplay = h.usage.mock.calls.length;
      await expect(replayOpenAISipPostCallFinalization(recorded)).rejects.toThrow();
      expect(h.usage).toHaveBeenCalledTimes(writesBeforeReplay);
      h.provider.mockResolvedValue({ ok: true, status: 200 });
      await expect(replayOpenAISipPostCallFinalization(recorded)).resolves.toBeUndefined();
      expect(h.usage).toHaveBeenCalledTimes(writesBeforeReplay + 1);
      expect(h.provider.mock.calls.every(([url]) => url.includes("/hangup"))).toBe(true);
    },
  );

  it.each(["transferred", "wrong tenant", "running"] as const)(
    "does not hang up a %s call during queued recovery",
    async (state) => {
      h.callReason = state === "transferred" ? "transferred" : "provider-heartbeat-timeout";
      h.callPhase = state === "running" ? "running" : "terminal";
      const replay = replayOpenAISipPostCallFinalization({
        userId: state === "wrong tenant" ? "other-tenant" : "tenant",
        callLogId: 1n,
        agentId: "bot",
        finalization: {
          provider: "openai_sip",
          callId: "rtc_test",
          openingPlaybackConfirmed: false,
          terminalStateReady: true,
          providerHangupRequired: true,
        },
      });
      if (state === "transferred") await expect(replay).resolves.toBeUndefined();
      else await expect(replay).rejects.toThrow();
      expect(h.provider).not.toHaveBeenCalled();
    },
  );

  it.each(["missed heartbeat", "ping exception", "abnormal close"] as const)(
    "ends the provider call when its sideband suffers a %s",
    async (failure) => {
      const session = start();
      await vi.advanceTimersByTimeAsync(1_000);
      if (failure === "abnormal close") {
        h.sockets[0].readyState = 3;
        h.sockets[0].emit("close", 1006, Buffer.from("transport lost"));
      } else {
        h.respondToPing = false;
        h.pingFails = failure === "ping exception";
        await vi.advanceTimersByTimeAsync(75_000);
      }
      await session;
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.provider.mock.calls[0][0]).toContain("/hangup");
      expect(h.usage).toHaveBeenCalledOnce();
      expect(h.digest).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(h.provider).toHaveBeenCalledOnce();
    },
  );

  it.each([200, 404, 409])(
    "confirms provider termination after a clean sideband close without inventing a call failure (HTTP %s)",
    async (status) => {
      const session = start();
      await vi.advanceTimersByTimeAsync(1_000);
      h.provider.mockResolvedValueOnce({ ok: status === 200, status });
      h.sockets[0].close();
      await session;
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.provider.mock.calls[0][0]).toContain("/hangup");
      expect(h.digest).toHaveBeenCalledWith(
        expect.objectContaining({ endedReason: "provider-disconnected" }),
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it("records an abnormal sideband close as an ordinary ending once the provider reports the call gone", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.provider.mockResolvedValueOnce({ ok: false, status: 404 });
    h.sockets[0].readyState = 3;
    h.sockets[0].emit("close", 1006, Buffer.alloc(0));
    await session;
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toContain("/hangup");
    const recorded = h.digest.mock.calls.at(-1)![0];
    expect(recorded).toMatchObject({
      endedReason: "provider-disconnected",
      pipelineError: null,
    });
    expect(recorded.finalization.providerHangupRequired).toBeFalsy();
    expect(h.usage).toHaveBeenCalledOnce();
    expect(h.carrierDuration).not.toHaveBeenCalled();
    expect(h.reportError).not.toHaveBeenCalled();
  });

  it("accepts a hangup conflict as an ordinary ending only when the carrier confirms the call ended", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.provider.mockResolvedValueOnce({ ok: false, status: 409 });
    h.carrierDuration.mockResolvedValueOnce({
      durationSeconds: 1,
      unanswered: false,
    });
    h.sockets[0].readyState = 3;
    h.sockets[0].emit("close", 1006, Buffer.alloc(0));
    await session;
    expect(h.carrierDuration).toHaveBeenCalledWith("tenant", "openai:rtc_test");
    const recorded = h.digest.mock.calls.at(-1)![0];
    expect(recorded).toMatchObject({
      endedReason: "provider-disconnected",
      pipelineError: null,
    });
    expect(recorded.finalization.providerHangupRequired).toBeFalsy();
  });

  it("keeps a lost connection when a hangup conflict cannot be confirmed as terminal", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.provider.mockResolvedValueOnce({ ok: false, status: 409 });
    h.carrierDuration.mockRejectedValueOnce(new Error("carrier still active"));
    h.sockets[0].readyState = 3;
    h.sockets[0].emit("close", 1006, Buffer.alloc(0));
    await session;
    expect(h.carrierDuration).toHaveBeenCalledOnce();
    expect(h.digest.mock.calls.at(-1)![0]).toMatchObject({
      endedReason: "provider-close-1006",
      pipelineError: "connection",
    });
  });

  it("keeps a lost connection when the provider call was still live at the abnormal close", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.sockets[0].readyState = 3;
    h.sockets[0].emit("close", 1006, Buffer.alloc(0));
    await session;
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.digest.mock.calls.at(-1)![0]).toMatchObject({
      endedReason: "provider-close-1006",
      pipelineError: "connection",
    });
    // A dropped live call must alert, not only log.
    expect(h.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        callId: "openai:rtc_test",
        endedReason: "provider-close-1006",
        tags: { surface: "sip-session", failure: "connection" },
      }),
    );
  });

  it("does not treat a sideband that never opened as an ordinary ending", async () => {
    h.openFails = true;
    h.provider.mockResolvedValue({ ok: false, status: 404 });
    const session = start();
    await vi.advanceTimersByTimeAsync(1);
    await session;
    expect(h.digest.mock.calls.at(-1)![0]).toMatchObject({
      endedReason: "runtime-error",
      pipelineError: "connection",
    });
  });

  it("keeps tools, transcript, ownership leases and rolling spend alive for a full hour, then finalizes once", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    await emit({ type: "output_audio_buffer.stopped" });
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.provider).not.toHaveBeenCalled();
    await emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "turn-late",
      transcript: "Please check the approved policy.",
    });
    await emit({
      type: "response.function_call_arguments.done",
      name: "search_agent_knowledge",
      call_id: "tool-late",
      arguments: '{"query":"policy"}',
    });
    await emit({ type: "response.done", response: { status: "completed" } });
    expect(h.tool).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(40 * 60_000);
    await session;
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.writes.filter((row) => row.openaiSipLeaseExpiresAt === "sql").length).toBeGreaterThan(
      100,
    );
    expect(h.account.mock.calls.at(-1)?.[1]).toBeGreaterThan(3300);
    expect(h.account.mock.calls.at(-1)?.[1]).toBeLessThanOrEqual(3600);
    expect(
      h.sent.some((event) => String(event.session?.instructions || "").includes("one minute")),
    ).toBe(true);
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 3600 }));
    expect(h.usage).toHaveBeenCalledOnce();
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 3600,
        transcript: expect.stringContaining("Please check the approved policy."),
        endedReason: "botbound-max-duration",
      }),
      expect.anything(),
      expect.objectContaining({ refreshPending: true }),
    );
  });
  it("does not bill database cleanup time after the provider call closes", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.account.mockImplementationOnce(() => held);
    const session = start();
    await vi.advanceTimersByTimeAsync(331_000);
    expect(h.account).toHaveBeenCalled();
    h.sockets[0].close();
    await vi.advanceTimersByTimeAsync(120_000);
    release();
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 331 }));
    expect(h.account.mock.calls.every(([, seconds]) => seconds <= 331)).toBe(true);
  });
  it("retries failed rolling accounting and keeps admitted speech live", async () => {
    h.account.mockRejectedValueOnce(new Error("temporary ledger failure"));
    const session = start();
    await vi.advanceTimersByTimeAsync(370_000);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.account).toHaveBeenCalledTimes(2);
    h.sockets[0].close();
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 370 }));
  });
});

async function remoteCallControl() {
  // A separate module instance has its own liveSipSessions map, as Vercel does.
  // Only the mocked database and provider boundary are shared with the worker.
  vi.resetModules();
  return import("../src/lib/voice/openai-sip-session");
}

function heldResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("cross-process SIP transfers", () => {
  it.each(["+12025550103", "sip:other@example.org"])(
    "blocks a funded ordinary outbound REFER to %s",
    async (destination) => {
      const remote = await remoteCallControl();
      h.funding.mockResolvedValue({
        outboundPlacement: true,
        maxSeconds: 120,
        deadlineAtMs: Date.now() + 120000,
      });
      await expect(
        remote.referOpenAISipCall(call.userId, call.callId, destination),
      ).rejects.toMatchObject({
        status: 409,
        code: "OUTBOUND_TRANSFER_UNSUPPORTED",
      });
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.presenceStatus).toBe("connected");
      expect(h.writes.some((value) => value.status === "transferred")).toBe(false);
    },
  );
  it.each(["direction", "signed source", "canonical alias"])(
    "blocks a legacy funding-null outbound call proven by its %s",
    async (evidence) => {
      const remote = await remoteCallControl();
      const canonical = "outbound:11111111-1111-4111-8111-111111111111";
      if (evidence === "direction") h.callDirection = "outbound";
      if (evidence === "signed source") h.callSource = canonical;
      if (evidence === "canonical alias") h.canonicalFundingId.mockResolvedValue(canonical);
      await expect(
        remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
      ).rejects.toMatchObject({
        status: 409,
        code: "OUTBOUND_TRANSFER_UNSUPPORTED",
      });
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.writes.some((value) => value.status === "transferred")).toBe(false);
    },
  );
  it.each(["missing direction", "missing signed source", "foreign call"])(
    "does not REFER with an unverified inbound binding: %s",
    async (evidence) => {
      const remote = await remoteCallControl();
      if (evidence === "missing direction") h.callDirection = null;
      if (evidence === "missing signed source") h.callSource = null;
      if (evidence === "foreign call") h.callUser = "other-tenant";
      await expect(
        remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
      ).rejects.toThrow("inbound source could not be verified");
      expect(h.provider).not.toHaveBeenCalled();
      expect(h.presenceStatus).toBe("connected");
    },
  );
  it("retains a verified inbound transfer without channel funding", async () => {
    const remote = await remoteCallControl();
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toContain("/refer");
    expect(h.presenceStatus).toBe("transferred");
    expect(h.canonicalFundingId).toHaveBeenCalledWith(
      expect.anything(),
      call.userId,
      "openai:rtc_test",
    );
  });
  it("keeps a bounded self-phone test on its verified recipient", async () => {
    const remote = await remoteCallControl();
    h.funding.mockResolvedValue({
      phoneTest: true,
      maxSeconds: 120,
      deadlineAtMs: Date.now() + 120000,
    });
    await expect(
      remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
    ).rejects.toThrow("verified phone");
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.writes.some((value) => value.status === "transferred")).toBe(false);
  });
  it("keeps funded remote REFER capacity until the entire carrier call settles", async () => {
    const remote = await remoteCallControl();
    const funding = {
      maxSeconds: 2400,
      prepaidHoldUsd: 0,
      graceMinutes: 10,
      includedMinutes: 30,
      rateUsd: 0.22,
      planId: "voice",
      periodKey: "2026-09",
      startedAtMs: Date.now(),
      deadlineAtMs: Date.now() + 2400000,
    };
    h.funding.mockResolvedValue(funding);
    h.carrierDuration.mockRejectedValue(new Error("carrier still active"));
    const session = runOpenAISipCallSession(
      { ...call, funding },
      runtime as any,
      1n,
      claim,
      reservation,
    );
    await vi.advanceTimersByTimeAsync(10000);
    h.provider.mockImplementationOnce(async () => {
      h.sockets[0].close();
      return { ok: true, status: 200 };
    });
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    await session;
    const recorded = h.digest.mock.calls.at(-1)![0];
    expect(recorded.finalization.carrierDurationRequired).toBe(true);
    expect(h.presenceStatus).toBe("settling");
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.refundFunding).not.toHaveBeenCalled();
    h.carrierDuration.mockResolvedValue({
      durationSeconds: 150,
      unanswered: false,
    });
    await replayOpenAISipPostCallFinalization(recorded);
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 150 }));
    expect(h.presenceStatus).toBeUndefined();
  });
  it("observes a successful remote REFER, disarms the deadline and finalizes as transferred", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    remote.notifyOpenAISipCallTransferred(call.callId);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.presenceStatus).toBe("transferred");

    await vi.advanceTimersByTimeAsync(25_000);
    await session;
    expect(h.sockets[0].readyState).toBe(3);
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({ endedReason: "transferred" }),
      expect.anything(),
      expect.anything(),
    );
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toContain("/refer");
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.presenceScopes).toContainEqual([
      ["id", "openai:rtc_test"],
      ["userId", "tenant"],
    ]);
  });

  it("keeps provider failures live and never records a successful transfer", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.provider.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(
      remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
    ).rejects.toThrow("503");
    expect(h.presenceStatus).toBe("connected");
    expect(h.writes.some((value) => value.status === "transferred")).toBe(false);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(h.sockets[0].readyState).toBe(1);
    h.sockets[0].close();
    await session;
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({ endedReason: "provider-disconnected" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("retains transfer success when the provider closes sideband before returning REFER success", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(10_000);
    h.provider.mockImplementationOnce(async () => {
      h.sockets[0].close();
      return { ok: true, status: 200 };
    });
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    await session;
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        endedReason: "transferred",
        durationSeconds: 10,
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(h.presenceStatus).toBeUndefined();
    await expect(
      remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
    ).rejects.toThrow("no longer active");
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it.each(["deadline", "runtime error", "missed heartbeat", "abnormal close"] as const)(
    "does not hang up a transfer whose success arrives while the %s waits",
    async (boundary) => {
      const remote = await remoteCallControl();
      const session = start();
      await vi.advanceTimersByTimeAsync(boundary === "deadline" ? 3_599_000 : 1_000);
      const provider = heldResult<{ ok: boolean; status: number }>();
      h.provider.mockImplementationOnce(() => provider.promise);
      const transfer = remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
      await vi.advanceTimersByTimeAsync(0);
      expect(h.provider).toHaveBeenCalledOnce();
      if (boundary === "runtime error") {
        h.sockets[0].emit("error", new Error("sideband disconnected during handoff"));
      } else if (boundary === "missed heartbeat") {
        h.respondToPing = false;
        await vi.advanceTimersByTimeAsync(75_000);
      } else if (boundary === "abnormal close") {
        h.sockets[0].readyState = 3;
        h.sockets[0].emit("close", 1006, Buffer.from("sideband lost during handoff"));
      }
      await vi.advanceTimersByTimeAsync(1_000);
      provider.resolve({ ok: true, status: 200 });
      await transfer;
      await vi.advanceTimersByTimeAsync(0);
      await session;
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.digest).toHaveBeenCalledWith(
        expect.objectContaining({ endedReason: "transferred" }),
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it("rechecks account policy after waiting for call-control ownership", async () => {
    const remote = await remoteCallControl();
    const lock = heldResult<void>();
    h.transactionTail = lock.promise;
    const transfer = remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.environment).not.toHaveBeenCalled();
    h.environment.mockRejectedValue(new Error("Workspace was reclassified"));
    const rejection = expect(transfer).rejects.toThrow("reclassified");
    lock.resolve();
    await rejection;
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.presenceStatus).toBe("connected");
  });

  it("cannot publish a transfer signal for another tenant", async () => {
    const remote = await remoteCallControl();
    await expect(
      remote.referOpenAISipCall("other-tenant", call.callId, "+12025550103"),
    ).rejects.toThrow("no longer active");
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.presenceStatus).toBe("connected");
    expect(h.presenceScopes).toContainEqual([
      ["id", "openai:rtc_test"],
      ["userId", "other-tenant"],
    ]);
  });
});
