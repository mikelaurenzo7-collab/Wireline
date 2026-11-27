import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";

const h = vi.hoisted(() => ({
  xaiUrl: "",
  tool: vi.fn(),
  toolTenant: [] as Array<string | undefined>,
  policy: vi.fn(async () => undefined),
  fencePerforms: true,
  fences: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  assertPrivateVoiceSimulationAllowed: h.policy,
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async (input: {
    perform: () => Promise<unknown>;
    [key: string]: unknown;
  }) => {
    h.fences.push({ ...input, perform: undefined });
    return h.fencePerforms
      ? { performed: true, result: await input.perform() }
      : { performed: false };
  },
}));
vi.mock("../src/lib/background-work", () => ({
  runInBackground: (_label: string, work: () => Promise<unknown>) => void work(),
}));

vi.mock("../src/lib/server-context", async () => {
  const tenantStore = new AsyncLocalStorage<string>();
  return {
    tenantStore,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    serialQueryBatch: vi.fn(),
    drizzle: {
      // Settings, then the owner row.
      transaction: async () => [
        [{ businessName: "Acme Plumbing", workspaceDisplayName: null }],
        [{ fullName: "Pat Owner" }],
      ],
    },
  };
});
vi.mock("../src/lib/voice/openai-phone-agent-runtime", () => ({
  buildOpenAIRealtimeAgentRuntime: vi.fn(async (input: { surface: string }) => ({
    agentId: "bot-a",
    agentName: "Riley",
    voice: "marin",
    customVoice: null,
    greeting: "Thanks for calling Acme Plumbing. How can I help?",
    surface: input.surface,
    session: {
      instructions: "You are Riley.\nPRIVATE TEST: This is a private browser test.",
      tools: [
        {
          type: "function",
          name: "search_agent_knowledge",
          description: "Search approved Training.",
          parameters: { type: "object", properties: {} },
        },
      ],
      tool_choice: "auto",
      audio: { input: {}, output: { voice: "marin" } },
    },
  })),
}));
vi.mock("../src/lib/voice/openai-live-agent-service", async () => {
  const { tenantStore } = await import("../src/lib/server-context");
  return {
    runOpenAILiveVoiceTool: (input: unknown) => {
      h.toolTenant.push(tenantStore.getStore());
      return h.tool(input);
    },
  };
});
vi.mock("../src/lib/voice/realtime-provider", async (original) => ({
  ...(await original<typeof import("../src/lib/voice/realtime-provider")>()),
  get XAI_REALTIME_WEBSOCKET_URL() {
    return h.xaiUrl;
  },
}));

import { tenantStore } from "../src/lib/server-context";
import { buildOpenAIRealtimeAgentRuntime } from "../src/lib/voice/openai-phone-agent-runtime";
import {
  activeRehearsalRelayCount,
  closeRehearsalRelays,
  createXAIRehearsalRelay,
  endAllRehearsalRelays,
  handleRehearsalRelayUpgrade,
  rehearsalVoiceProvider,
  stopRehearsalRelay,
  XAI_REHEARSAL_RELAY_PATH,
  XAI_REHEARSAL_RELAY_PROTOCOL,
  XAIRehearsalUnavailableError,
} from "../src/lib/voice/xai-rehearsal-relay";

type Sent = Record<string, unknown>;

let xai: WebSocketServer;
let xaiSockets: WebSocket[] = [];
let xaiReceived: Sent[] = [];
let xaiRequests: Array<{ url: string; authorization: string }> = [];
let xaiMode: "accept" | "reject" = "accept";
let app: Server;
let appOrigin = "";

const waitFor = async (predicate: () => boolean, label: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const env = { XAI_API_KEY: "xai-test-key" } as NodeJS.ProcessEnv;

beforeAll(async () => {
  xai = new WebSocketServer({ port: 0 });
  xai.on("connection", (socket, request) => {
    xaiSockets.push(socket);
    xaiRequests.push({
      url: request.url || "",
      authorization: String(request.headers.authorization || ""),
    });
    socket.on("message", (raw) => {
      const event = JSON.parse(String(raw)) as Sent;
      xaiReceived.push(event);
      if (event.type !== "session.update") return;
      socket.send(
        JSON.stringify(
          xaiMode === "accept"
            ? { type: "session.updated", session: event.session }
            : { type: "error", error: { code: "invalid_voice", message: "Unknown voice" } },
        ),
      );
    });
  });
  await new Promise((resolve) => xai.once("listening", resolve));
  h.xaiUrl = `ws://127.0.0.1:${(xai.address() as AddressInfo).port}/v1/realtime`;

  app = createServer();
  app.on("upgrade", (request, socket, head) => {
    if (request.url === XAI_REHEARSAL_RELAY_PATH)
      handleRehearsalRelayUpgrade(request, socket, head);
    else socket.destroy();
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  appOrigin = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterEach(() => {
  endAllRehearsalRelays();
  for (const socket of xaiSockets) socket.terminate();
  xaiSockets = [];
  xaiReceived = [];
  xaiRequests = [];
  xaiMode = "accept";
  h.tool.mockReset();
  h.toolTenant = [];
  h.policy.mockReset().mockResolvedValue(undefined);
  h.fencePerforms = true;
  h.fences = [];
});

afterAll(async () => {
  await new Promise((resolve) => xai.close(resolve));
  await new Promise((resolve) => app.close(resolve));
});

function attach(ticket: string, origin = appOrigin) {
  const browser = new WebSocket(
    `${appOrigin.replace("http", "ws")}${XAI_REHEARSAL_RELAY_PATH}`,
    [XAI_REHEARSAL_RELAY_PROTOCOL, `ticket.${ticket}`],
    { origin },
  );
  const events: Sent[] = [];
  const audio: Buffer[] = [];
  browser.on("message", (data, isBinary) => {
    if (isBinary) audio.push(data as Buffer);
    else events.push(JSON.parse(String(data)) as Sent);
  });
  return { browser, events, audio };
}

function toXai(event: Sent) {
  xaiSockets[0]!.send(JSON.stringify(event));
}

describe("xAI rehearsal provider choice", () => {
  it("follows the phone provider, with its own opt-out and a missing-key fallback", () => {
    expect(rehearsalVoiceProvider({ XAI_API_KEY: "k" } as NodeJS.ProcessEnv)).toEqual({
      provider: "xai",
    });
    expect(
      rehearsalVoiceProvider({
        XAI_API_KEY: "k",
        WIRELINE_REHEARSAL_VOICE_PROVIDER: "openai",
      } as NodeJS.ProcessEnv),
    ).toEqual({ provider: "openai", reason: "rehearsal_opt_out" });
    expect(
      rehearsalVoiceProvider({
        XAI_API_KEY: "k",
        WIRELINE_PHONE_VOICE_PROVIDER: "openai",
      } as NodeJS.ProcessEnv),
    ).toEqual({ provider: "openai", reason: "phone_on_openai" });
    expect(rehearsalVoiceProvider({} as NodeJS.ProcessEnv)).toEqual({
      provider: "openai",
      reason: "xai_not_configured",
    });
  });
});

describe("xAI rehearsal relay", () => {
  it("configures the phone runtime's private-test session with the caller's voice", async () => {
    const relay = await tenantStore.run("tenant-1", () =>
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
    );
    expect(vi.mocked(buildOpenAIRealtimeAgentRuntime)).toHaveBeenCalledWith({
      userId: "user-1",
      agentId: "bot-a",
      surface: "browser_test",
    });
    expect(relay.callId).toMatch(/^xai-rehearsal:[a-f0-9]{32}$/);
    expect(relay.keyFingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(relay.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(relay.maxDurationSeconds).toBe(300);
    // The saved OpenAI voice maps to the same xAI voice a caller hears.
    expect(relay.voice).toBe("carina");
    expect(xaiRequests[0]!.authorization).toBe("Bearer xai-test-key");
    expect(xaiRequests[0]!.url).toContain("model=grok-voice-");

    const update = xaiReceived.find((event) => event.type === "session.update")!;
    const session = update.session as Record<string, any>;
    expect(session.voice).toBe("carina");
    expect(session.instructions).toContain("PRIVATE TEST");
    expect(session.instructions).toContain("Do not restart the introduction");
    expect(session.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_agent_knowledge",
    ]);
    expect(session.turn_detection).toEqual({ type: "server_vad" });
    expect(session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24_000 });
    expect(session.audio.output.format).toEqual({ type: "audio/pcm", rate: 24_000 });
    expect(session.audio.output.speed).toBe(1.1);
    expect(session.audio.input.transcription.keyterms).toEqual(["Riley", "Acme Plumbing"]);
  });

  it("speaks the phone opening, relays audio both ways, and runs knowledge on the server", async () => {
    h.tool.mockResolvedValue({ found: true, matches: [{ content: "Open 8 to 5." }] });
    const relay = await tenantStore.run("tenant-1", () =>
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
    );
    const { browser, events, audio } = attach(relay.ticket);
    await waitFor(() => events.some((event) => event.type === "bot_text"), "opening");

    expect(events[0]).toMatchObject({ type: "ready", sampleRate: 24_000 });
    const opening = "Hi, I'm Riley, and I'm an AI assistant with Acme Plumbing. How can I help?";
    expect(events[1]).toEqual({ type: "bot_text", id: "opening", text: opening, final: true });
    await waitFor(
      () => xaiReceived.some((event) => event.type === "conversation.item.create"),
      "force",
    );
    expect(xaiReceived.at(-1)).toEqual({
      type: "conversation.item.create",
      item: {
        type: "force_message",
        role: "assistant",
        interruptible: false,
        content: [{ type: "output_text", text: opening }],
      },
    });

    // The provider's echo of the opening is not shown twice.
    toXai({ type: "response.created", response: { id: "resp-open" } });
    const botAudio = Buffer.alloc(480, 7);
    toXai({
      type: "response.output_audio.delta",
      response_id: "resp-open",
      item_id: "item-open",
      delta: botAudio.toString("base64"),
    });
    toXai({
      type: "response.output_audio_transcript.delta",
      response_id: "resp-open",
      item_id: "item-open",
      delta: "Hi, I'm Riley,",
    });
    toXai({
      type: "response.output_audio_transcript.done",
      response_id: "resp-open",
      item_id: "item-open",
      transcript: opening,
    });
    toXai({
      type: "response.done",
      response: { id: "resp-open", status: "completed", output: [] },
    });
    await waitFor(() => events.some((event) => event.type === "turn_done"), "opening done");
    expect(audio[0]).toEqual(botAudio);
    expect(events.filter((event) => event.type === "bot_text")).toHaveLength(1);
    expect(events.find((event) => event.type === "turn_done")).toEqual({
      type: "turn_done",
      completed: true,
    });

    // Microphone frames become provider audio appends.
    const mic = Buffer.alloc(960, 3);
    browser.send(mic);
    await waitFor(
      () => xaiReceived.some((event) => event.type === "input_audio_buffer.append"),
      "append",
    );
    expect(xaiReceived.find((event) => event.type === "input_audio_buffer.append")).toEqual({
      type: "input_audio_buffer.append",
      audio: mic.toString("base64"),
    });

    toXai({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "caller-1",
      transcript: "When are you open?",
    });
    toXai({
      type: "response.function_call_arguments.done",
      response_id: "resp-2",
      call_id: "call-1",
      name: "search_agent_knowledge",
      arguments: JSON.stringify({ query: "hours" }),
    });
    await waitFor(
      () => xaiReceived.some((event) => event.type === "response.create"),
      "tool continuation",
    );
    expect(h.tool).toHaveBeenCalledWith({
      userId: "user-1",
      agentId: "bot-a",
      name: "search_agent_knowledge",
      arguments: { query: "hours" },
    });
    // The lookup runs in the owner's tenant scope, not the socket's.
    expect(h.toolTenant).toEqual(["tenant-1"]);
    const output = xaiReceived.find(
      (event) => (event.item as Sent | undefined)?.type === "function_call_output",
    );
    expect(output).toEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({ found: true, matches: [{ content: "Open 8 to 5." }] }),
      },
    });
    expect(events).toContainEqual({
      type: "caller_text",
      id: "caller-1",
      text: "When are you open?",
      final: true,
    });
    expect(events).toContainEqual({ type: "thinking", active: true });
    expect(events).toContainEqual({ type: "thinking", active: false });

    // A real reply is shown, and the owner can talk over it.
    toXai({ type: "response.created", response: { id: "resp-3" } });
    toXai({
      type: "response.output_audio.delta",
      response_id: "resp-3",
      item_id: "item-3",
      delta: Buffer.alloc(48_000, 1).toString("base64"),
    });
    toXai({
      type: "response.output_audio_transcript.delta",
      response_id: "resp-3",
      item_id: "item-3",
      delta: "We open at eight.",
    });
    await waitFor(
      () => events.some((event) => event.type === "bot_text" && event.id === "item-3"),
      "reply transcript",
    );
    toXai({ type: "input_audio_buffer.speech_started" });
    await waitFor(() => events.some((event) => event.type === "interrupt"), "interrupt");
    await waitFor(
      () => xaiReceived.some((event) => event.type === "conversation.item.truncate"),
      "truncate",
    );
    const truncate = xaiReceived.find((event) => event.type === "conversation.item.truncate")!;
    expect(truncate).toMatchObject({ item_id: "item-3", content_index: 0 });
    expect(Number(truncate.audio_end_ms)).toBeLessThan(1_000);
    // Late audio from the interrupted reply never reaches the browser.
    const before = audio.length;
    toXai({
      type: "response.output_audio.delta",
      response_id: "resp-3",
      item_id: "item-3",
      delta: Buffer.alloc(480, 9).toString("base64"),
    });

    browser.send(JSON.stringify({ type: "user_text", text: "  Do you do drains?  " }));
    await waitFor(
      () => xaiReceived.some((event) => (event.item as Sent | undefined)?.type === "message"),
      "typed line",
    );
    expect(audio.length).toBe(before);
    expect(
      xaiReceived.find((event) => (event.item as Sent | undefined)?.type === "message"),
    ).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Do you do drains?" }],
      },
    });
    browser.close();
    await waitFor(() => activeRehearsalRelayCount() === 0, "browser close ends the session");
  });

  it("accepts a ticket once, from this site only", async () => {
    const relay = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env });
    const foreign = attach(relay.ticket, "https://evil.example");
    const refused = await new Promise<number>((resolve) =>
      foreign.browser.on("unexpected-response", (_request, response) =>
        resolve(response.statusCode || 0),
      ),
    );
    expect(refused).toBe(403);

    const first = attach(relay.ticket);
    await waitFor(() => first.events.some((event) => event.type === "ready"), "ready");
    const replay = attach(relay.ticket);
    const status = await new Promise<number>((resolve) =>
      replay.browser.on("unexpected-response", (_request, response) =>
        resolve(response.statusCode || 0),
      ),
    );
    expect(status).toBe(401);
    first.browser.close();
  });

  it("ends the exact session for its owner and tells the browser why", async () => {
    const relay = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env });
    const { browser, events } = attach(relay.ticket);
    await waitFor(() => events.some((event) => event.type === "ready"), "ready");
    expect(stopRehearsalRelay({ userId: "someone-else", callId: relay.callId })).toBe(true);
    expect(activeRehearsalRelayCount()).toBe(1);
    expect(stopRehearsalRelay({ userId: "user-1", callId: "openai-call" })).toBe(false);

    const closed = new Promise((resolve) => browser.once("close", resolve));
    expect(stopRehearsalRelay({ userId: "user-1", callId: relay.callId })).toBe(true);
    await closed;
    expect(events.at(-1)).toEqual({ type: "ended", reason: "stopped" });
    expect(activeRehearsalRelayCount()).toBe(0);
    await waitFor(() => xaiSockets[0]!.readyState === WebSocket.CLOSED, "provider closed");
  });

  it("tells owners when the server restarts mid-rehearsal", async () => {
    const relay = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env });
    const { browser, events } = attach(relay.ticket);
    await waitFor(() => events.some((event) => event.type === "ready"), "ready");
    const closed = new Promise((resolve) => browser.once("close", resolve));
    endAllRehearsalRelays("restarting");
    await closed;
    expect(events.at(-1)).toEqual({
      type: "ended",
      reason: "restarting",
      message: "BotBound is updating. Start the rehearsal again in a moment.",
    });
  });

  it("reports provider rejection as unavailable so the browser can fall back", async () => {
    xaiMode = "reject";
    const error = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(XAIRehearsalUnavailableError);
    expect((error as XAIRehearsalUnavailableError).reason).toBe("session_rejected");
    expect(activeRehearsalRelayCount()).toBe(0);

    const missingKey = await createXAIRehearsalRelay({
      userId: "user-1",
      agentId: "bot-a",
      env: {} as NodeJS.ProcessEnv,
    }).catch((reason: unknown) => reason);
    expect((missingKey as XAIRehearsalUnavailableError).reason).toBe("xai_not_configured");
  });

  it("limits each owner to two rehearsals, counting ones still being opened", async () => {
    const results = await Promise.allSettled([
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const refused = results.find((result) => result.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toMatchObject({
      status: 429,
      code: "REHEARSAL_ALREADY_ACTIVE",
    });
    expect(activeRehearsalRelayCount()).toBe(2);
  });

  it("applies the account-environment policy and the account-deletion fence", async () => {
    await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env });
    expect(h.policy).toHaveBeenCalledWith("user-1", "xai_rehearsal_relay");
    expect(h.fences[0]).toMatchObject({
      userId: "user-1",
      operation: "xai_rehearsal_relay_create",
      retainOnSuccess: true,
    });

    h.policy.mockRejectedValueOnce(Object.assign(new Error("No environment"), { status: 403 }));
    await expect(
      createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }),
    ).rejects.toThrow("No environment");
    h.fencePerforms = false;
    await expect(
      createXAIRehearsalRelay({ userId: "user-2", agentId: "bot-a", env }),
    ).rejects.toMatchObject({ status: 409 });
    expect(activeRehearsalRelayCount()).toBe(1);
  });

  it("commits spend when the browser attaches and returns it if the browser never does", async () => {
    const order: string[] = [];
    const spend = {
      commit: vi.fn(async () => {
        order.push("commit");
      }),
      release: vi.fn(async () => {
        order.push("release");
      }),
    };
    const attached = await createXAIRehearsalRelay({
      userId: "user-1",
      agentId: "bot-a",
      env,
      spend,
    });
    expect(spend.commit).not.toHaveBeenCalled();
    const { events } = attach(attached.ticket);
    await waitFor(() => events.some((event) => event.type === "ready"), "ready");
    expect(order).toEqual(["commit"]);
    stopRehearsalRelay({ userId: "user-1", callId: attached.callId });
    expect(spend.release).not.toHaveBeenCalled();

    // A browser that cannot connect stops the session through its ticket.
    const unused = { commit: vi.fn(async () => undefined), release: vi.fn(async () => undefined) };
    const never = await createXAIRehearsalRelay({
      userId: "user-1",
      agentId: "bot-a",
      env,
      spend: unused,
    });
    stopRehearsalRelay({ userId: "user-1", callId: never.callId });
    expect(unused.commit).not.toHaveBeenCalled();
    expect(unused.release).toHaveBeenCalledOnce();

    // A commit that fails ends the session before anything is heard.
    const failing = {
      commit: vi.fn(async () => {
        throw new Error("budget row locked");
      }),
      release: vi.fn(async () => undefined),
    };
    const refused = await createXAIRehearsalRelay({
      userId: "user-1",
      agentId: "bot-a",
      env,
      spend: failing,
    });
    const blocked = attach(refused.ticket);
    await waitFor(() => blocked.events.some((event) => event.type === "ended"), "ended");
    expect(blocked.events).toEqual([
      {
        type: "ended",
        reason: "spend_unavailable",
        message:
          "BotBound could not confirm this rehearsal against your allowance. Try again shortly.",
      },
    ]);
    expect(failing.release).toHaveBeenCalledOnce();
  });
});

describe("xAI rehearsal replies", () => {
  async function openedRelay(timing = { replyAckMs: 150, autoResponseMs: 150 }) {
    const relay = await createXAIRehearsalRelay({
      userId: "user-1",
      agentId: "bot-a",
      env,
      timing,
    });
    const browser = attach(relay.ticket);
    await waitFor(() => browser.events.some((event) => event.type === "ready"), "ready");
    toXai({ type: "response.created", response: { id: "resp-open" } });
    toXai({ type: "response.done", response: { id: "resp-open", status: "completed" } });
    await waitFor(() => browser.events.some((event) => event.type === "turn_done"), "opening");
    return browser;
  }
  const replyRequests = () =>
    xaiReceived.filter((event) => event.type === "response.create") as Array<{
      response?: { metadata?: { botbound_rehearsal_reply?: string } };
    }>;
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("asks for the reply to a lookup only once its response ends, and retries a lost acknowledgement", async () => {
    h.tool.mockResolvedValue({ found: true, matches: [] });
    await openedRelay();
    toXai({ type: "response.created", response: { id: "resp-tool" } });
    toXai({
      type: "response.function_call_arguments.done",
      response_id: "resp-tool",
      call_id: "call-1",
      name: "search_agent_knowledge",
      arguments: "{}",
    });
    await waitFor(
      () => xaiReceived.some((event) => (event.item as Sent)?.type === "function_call_output"),
      "lookup result",
    );
    await pause(40);
    // xAI would refuse a second active response.
    expect(replyRequests()).toHaveLength(0);
    toXai({ type: "response.done", response: { id: "resp-tool", status: "completed" } });
    await waitFor(() => replyRequests().length === 1, "reply request");
    const first = replyRequests()[0]!.response?.metadata?.botbound_rehearsal_reply;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);

    // No acknowledgement: the request is retried with a new tag.
    await waitFor(() => replyRequests().length === 2, "retry");
    const second = replyRequests()[1]!.response?.metadata?.botbound_rehearsal_reply;
    expect(second).not.toBe(first);
    toXai({
      type: "response.created",
      response: { id: "resp-reply", metadata: { botbound_rehearsal_reply: second } },
    });
    await pause(450);
    expect(replyRequests()).toHaveLength(2);
  });

  it("counts any reply that starts after a request as its answer, tagged or not", async () => {
    const browser = await openedRelay();
    browser.browser.send(JSON.stringify({ type: "user_text", text: "Hours?" }));
    await waitFor(() => replyRequests().length === 1, "reply request");
    // xAI starts the reply without echoing the tag.
    toXai({ type: "response.created", response: { id: "resp-untagged" } });
    toXai({
      type: "response.done",
      response: {
        id: "resp-untagged",
        status: "completed",
        output: [{ type: "message", role: "assistant" }],
      },
    });
    await pause(450);
    // No retry: the Bot answers the line once.
    expect(replyRequests()).toHaveLength(1);
    // The relay tells the browser this reply answered the owner.
    expect(browser.events).toContainEqual({
      type: "turn_done",
      completed: true,
      answeredOwner: true,
    });
    // The opening's own turn never counts as answering the owner.
    expect(browser.events.find((event) => event.type === "turn_done")).toEqual({
      type: "turn_done",
      completed: true,
    });
  });

  it("never lets a response without an id block later replies", async () => {
    const browser = await openedRelay();
    toXai({ type: "response.created", response: {} });
    toXai({ type: "response.done", response: { id: "resp-other", status: "completed" } });
    browser.browser.send(JSON.stringify({ type: "user_text", text: "Still there?" }));
    await waitFor(() => replyRequests().length === 1, "reply request");
  });

  it("marks a spoken reply as answering the owner once the owner has spoken", async () => {
    const browser = await openedRelay();
    toXai({ type: "input_audio_buffer.speech_started" });
    toXai({ type: "input_audio_buffer.speech_stopped" });
    toXai({ type: "response.created", response: { id: "resp-answer" } });
    toXai({
      type: "response.done",
      response: {
        id: "resp-answer",
        status: "completed",
        output: [{ type: "message", role: "assistant" }],
      },
    });
    await waitFor(
      () => browser.events.some((event) => event.answeredOwner === true),
      "answered turn",
    );
  });

  it("lets xAI answer the owner by itself instead of adding a second reply", async () => {
    h.tool.mockResolvedValue({ found: true, matches: [] });
    await openedRelay({ replyAckMs: 150, autoResponseMs: 2_000 });
    toXai({ type: "input_audio_buffer.speech_started" });
    toXai({ type: "input_audio_buffer.speech_stopped" });
    toXai({
      type: "response.function_call_arguments.done",
      call_id: "call-2",
      name: "search_agent_knowledge",
      arguments: "{}",
    });
    await waitFor(
      () => xaiReceived.some((event) => (event.item as Sent)?.type === "function_call_output"),
      "lookup result",
    );
    // xAI's own reply to the owner starts and sees the result.
    toXai({ type: "response.created", response: { id: "resp-auto" } });
    toXai({ type: "response.done", response: { id: "resp-auto", status: "completed" } });
    await pause(250);
    expect(replyRequests()).toHaveLength(0);
  });

  it("interrupts the Bot for a typed line and answers once the interrupted reply ends", async () => {
    const browser = await openedRelay();
    toXai({ type: "response.created", response: { id: "resp-talking" } });
    browser.browser.send(JSON.stringify({ type: "user_text", text: "One" }));
    browser.browser.send(JSON.stringify({ type: "user_text", text: "Two" }));
    await waitFor(
      () => xaiReceived.filter((event) => (event.item as Sent)?.type === "message").length === 2,
      "both typed lines",
    );
    // Neither line is dropped, the Bot is cut off, and one reply covers both.
    expect(xaiReceived.filter((event) => event.type === "response.cancel")).toHaveLength(2);
    expect(browser.events).toContainEqual({ type: "interrupt" });
    expect(replyRequests()).toHaveLength(0);
    toXai({ type: "response.done", response: { id: "resp-talking", status: "cancelled" } });
    await waitFor(() => replyRequests().length === 1, "reply after the interruption");
  });
});

describe("xAI rehearsal shutdown", () => {
  // Runs last: closing is permanent for this process, as in production.
  it("opens no new relays and refuses attaches once the process is closing", async () => {
    const open = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env });
    const { browser, events } = attach(open.ticket);
    await waitFor(() => events.some((event) => event.type === "ready"), "ready");
    const closed = new Promise((resolve) => browser.once("close", resolve));
    closeRehearsalRelays();
    await closed;
    expect(events.at(-1)).toMatchObject({ type: "ended", reason: "restarting" });
    const late = await createXAIRehearsalRelay({ userId: "user-1", agentId: "bot-a", env }).catch(
      (reason: unknown) => reason,
    );
    expect(late).toBeInstanceOf(XAIRehearsalUnavailableError);
    expect((late as XAIRehearsalUnavailableError).reason).toBe("restarting");
    const refused = attach("x".repeat(43));
    const status = await new Promise<number>((resolve) =>
      refused.browser.on("unexpected-response", (_request, response) =>
        resolve(response.statusCode || 0),
      ),
    );
    expect(status).toBe(503);
  });
});

describe("xAI rehearsal wiring contracts", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("asks for xAI first, keeps every rehearsal gate, and falls back with a logged reason", () => {
    const route = read("src/routes/live-voice-routes.ts");
    // The relay branch sits behind the same middleware chain as WebRTC.
    expect(route).toContain(
      '    if (!("sdp" in req.body)) {\n      await startRelayedRehearsal(req, res, windowSeconds);',
    );
    // Without xAI the probe is answered before any quota is taken.
    expect(route).toContain(
      "validateBody(sessionSchema),\n  answerWebRtcWithoutRelay,\n  simulationMinuteQuota,",
    );
    const probe = route.slice(route.indexOf("function answerWebRtcWithoutRelay("));
    expect(probe).toContain('res.json({ transport: "webrtc", reason: choice.reason });');
    const helper = route.slice(route.indexOf("async function startRelayedRehearsal("));
    expect(helper).toContain("await releaseSimulationMinuteQuota(req).catch(() => undefined);");
    // Commit and release run later, outside the request, in its tenant scope.
    expect(helper).toContain("const tenant = tenantStore.getStore() ?? req.user.id;");
    expect(helper).toContain(
      "commit: () => tenantStore.run(tenant, () => commitRealtimeSessionSpend(reservation)),",
    );
    expect(helper).toContain(
      "tenantStore.run(tenant, () =>\n            releaseRealtimeSessionSpendAfterFailure(",
    );
    expect(helper).toContain('new XAIRehearsalUnavailableError("not_attached"),');
    expect(helper).toContain('log.warn("Voice rehearsal fell back to OpenAI Realtime"');
    expect(helper).toContain("if (!(error instanceof XAIRehearsalUnavailableError)) throw error;");
    // The cleanup capability is proven before spend is reserved or a session opens.
    expect(helper.indexOf("createLiveVoiceCleanupIssuer()")).toBeLessThan(
      helper.indexOf("reserveRealtimeSessionSpend("),
    );
    expect(helper.indexOf("reserveRealtimeSessionSpend(")).toBeLessThan(
      helper.indexOf("createXAIRehearsalRelay({"),
    );
    expect(helper).toContain('{ provider: "xai" },');
    expect(helper).toContain(
      "await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);",
    );
  });

  it("stops relayed rehearsals locally, ends them at shutdown, and gates their upgrade", () => {
    const cleanup = read("src/lib/voice/live-voice-cleanup.ts");
    expect(cleanup.indexOf("stopRehearsalRelay({")).toBeLessThan(
      cleanup.indexOf("await hangupOpenAIRealtimeCall({"),
    );
    const server = read("server.ts");
    const shutdown = server.slice(server.indexOf("function gracefulShutdown("));
    expect(shutdown.indexOf("closeRehearsalRelays();")).toBeGreaterThan(-1);
    expect(shutdown.indexOf("closeRehearsalRelays();")).toBeLessThan(
      shutdown.indexOf("closeServerAndDrain(server, graceMs)"),
    );
    const upgrades = read("src/services/supervisor-websocket-service.ts");
    expect(upgrades.indexOf("renderTrafficEnabled()")).toBeLessThan(
      upgrades.indexOf("Object.hasOwn(otherRoutes, pathname)"),
    );
  });
});
