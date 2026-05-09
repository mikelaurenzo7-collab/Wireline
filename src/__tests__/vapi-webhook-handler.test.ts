/**
 * Vapi webhook handler contracts.
 *
 * Mirrors the /api/vapi-webhook dispatch logic from server.ts without
 * importing the module. Focuses on auth, subscription gating, and
 * assistant-request handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mirror handler types ──────────────────────────────────────────────────────
type Agent = { user_id: string };
type UserSettings = { subscription_status: string; voice_llm_provider: string; voice_llm_model: string };

type HandlerDeps = {
  findAgent: (agentId: string) => Promise<Agent | null>;
  findSettings: (userId: string) => Promise<UserSettings | null>;
  buildAssistantConfig: (agentId: string, userId: string, settings: UserSettings, message: any) => Promise<any>;
  writeCallLog: (userId: string, agentId: string, payload: any) => Promise<void>;
};

type WebhookResponse = {
  status: number;
  body: Record<string, unknown>;
};

const WEBHOOK_SECRET = "wireline-test-secret";

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function handleVapiWebhook(
  headers: Record<string, string | undefined>,
  query: { agentId?: string },
  body: { message?: { type: string; call?: any; [k: string]: any } },
  deps: HandlerDeps,
): Promise<WebhookResponse> {
  const provided =
    (headers["x-vapi-secret"] ?? headers["x-vapi-signature"] ?? "");

  if (!timingSafeEq(provided, WEBHOOK_SECRET)) {
    return { status: 401, body: { error: "Invalid webhook signature." } };
  }

  const webhookAgentId = query.agentId ?? "default-agent";
  const agent = await deps.findAgent(webhookAgentId);
  if (!agent) return { status: 404, body: { error: "Agent not found" } };

  const userSettings = await deps.findSettings(agent.user_id);
  const subscriptionStatus = userSettings?.subscription_status ?? "active";

  if (subscriptionStatus !== "active") {
    const { message } = body;
    if (message?.type === "assistant-request") {
      return {
        status: 200,
        body: {
          assistant: {
            firstMessage: "We're sorry, but the automated service for this line is currently suspended. Please contact the administrator.",
            model: {
              provider: "google",
              model: "gemini-1.5-flash",
              systemPrompt: "Tell the user the service is suspended, and gracefully end the call.",
            },
          },
        },
      };
    }
    return { status: 403, body: { error: "Access Denied: Inactive Subscription" } };
  }

  const { message } = body;

  if (message?.type === "assistant-request") {
    try {
      const config = await deps.buildAssistantConfig(webhookAgentId, agent.user_id, userSettings!, message);
      return { status: 200, body: { assistant: config } };
    } catch {
      return { status: 500, body: { error: "Failed to build assistant config" } };
    }
  }

  if (message?.type === "end-of-call-report") {
    try {
      await deps.writeCallLog(agent.user_id, webhookAgentId, message);
    } catch {
      // Vapi requires 200; we log and continue.
    }
    return { status: 200, body: {} };
  }

  return { status: 200, body: {} };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockFindAgent = vi.fn<(agentId: string) => Promise<Agent | null>>();
const mockFindSettings = vi.fn<(userId: string) => Promise<UserSettings | null>>();
const mockBuildAssistantConfig = vi.fn<(agentId: string, userId: string, settings: UserSettings, message: any) => Promise<any>>();
const mockWriteCallLog = vi.fn<(userId: string, agentId: string, payload: any) => Promise<void>>();

const deps: HandlerDeps = {
  findAgent: mockFindAgent,
  findSettings: mockFindSettings,
  buildAssistantConfig: mockBuildAssistantConfig,
  writeCallLog: mockWriteCallLog,
};

const VALID_HEADERS = { "x-vapi-secret": WEBHOOK_SECRET };
const VALID_QUERY = { agentId: "agent-123" };
const ACTIVE_SETTINGS: UserSettings = { subscription_status: "active", voice_llm_provider: "google", voice_llm_model: "gemini-1.5-flash" };
const AGENT: Agent = { user_id: "user-abc" };

beforeEach(() => {
  mockFindAgent.mockReset();
  mockFindSettings.mockReset();
  mockBuildAssistantConfig.mockReset();
  mockWriteCallLog.mockReset();
  mockFindAgent.mockResolvedValue(AGENT);
  mockFindSettings.mockResolvedValue(ACTIVE_SETTINGS);
  mockBuildAssistantConfig.mockResolvedValue({ firstMessage: "Hello!" });
  mockWriteCallLog.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Vapi webhook — authentication", () => {
  it("returns 401 when x-vapi-secret header is missing", async () => {
    const result = await handleVapiWebhook({}, VALID_QUERY, {}, deps);
    expect(result.status).toBe(401);
    expect(mockFindAgent).not.toHaveBeenCalled();
  });

  it("returns 401 when x-vapi-secret is wrong", async () => {
    const result = await handleVapiWebhook({ "x-vapi-secret": "wrong-secret" }, VALID_QUERY, {}, deps);
    expect(result.status).toBe(401);
  });

  it("accepts the secret via x-vapi-signature header (fallback)", async () => {
    const result = await handleVapiWebhook(
      { "x-vapi-signature": WEBHOOK_SECRET },
      VALID_QUERY,
      { message: { type: "assistant-request" } },
      deps,
    );
    expect(result.status).toBe(200);
  });
});

describe("Vapi webhook — agent resolution", () => {
  it("returns 404 when the agent is not found", async () => {
    mockFindAgent.mockResolvedValue(null);
    const result = await handleVapiWebhook(VALID_HEADERS, VALID_QUERY, {}, deps);
    expect(result.status).toBe(404);
    expect(result.body.error).toMatch(/Agent not found/i);
  });

  it("looks up the agent by the agentId query param", async () => {
    await handleVapiWebhook(VALID_HEADERS, { agentId: "agent-xyz" }, { message: { type: "status-update" } }, deps);
    expect(mockFindAgent).toHaveBeenCalledWith("agent-xyz");
  });
});

describe("Vapi webhook — subscription gate", () => {
  it("returns 200 with suspended message for assistant-request when subscription is inactive", async () => {
    mockFindSettings.mockResolvedValue({ ...ACTIVE_SETTINGS, subscription_status: "past_due" });
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "assistant-request" } },
      deps,
    );
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).toMatch(/suspended/i);
    expect(mockBuildAssistantConfig).not.toHaveBeenCalled();
  });

  it("returns 403 for non-assistant-request messages when subscription is inactive", async () => {
    mockFindSettings.mockResolvedValue({ ...ACTIVE_SETTINGS, subscription_status: "canceled" });
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "end-of-call-report" } },
      deps,
    );
    expect(result.status).toBe(403);
  });
});

describe("Vapi webhook — assistant-request", () => {
  it("returns 200 with assistant config for a valid assistant-request", async () => {
    const config = { firstMessage: "Hi there!", model: { provider: "google" } };
    mockBuildAssistantConfig.mockResolvedValue(config);
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "assistant-request" } },
      deps,
    );
    expect(result.status).toBe(200);
    expect(result.body.assistant).toEqual(config);
  });

  it("passes agentId, userId, settings, and message to buildAssistantConfig", async () => {
    const message = { type: "assistant-request", call: { customer: { number: "+15551234567" } } };
    await handleVapiWebhook(VALID_HEADERS, VALID_QUERY, { message }, deps);
    expect(mockBuildAssistantConfig).toHaveBeenCalledWith("agent-123", "user-abc", ACTIVE_SETTINGS, message);
  });

  it("returns 500 if buildAssistantConfig throws", async () => {
    mockBuildAssistantConfig.mockRejectedValue(new Error("DB error"));
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "assistant-request" } },
      deps,
    );
    expect(result.status).toBe(500);
  });
});

describe("Vapi webhook — end-of-call-report", () => {
  it("returns 200 and writes a call log", async () => {
    const message = {
      type: "end-of-call-report",
      call: { id: "call-001", duration: 120 },
      summary: "Discussed pricing.",
    };
    const result = await handleVapiWebhook(VALID_HEADERS, VALID_QUERY, { message }, deps);
    expect(result.status).toBe(200);
    expect(mockWriteCallLog).toHaveBeenCalledWith("user-abc", "agent-123", message);
  });

  it("still returns 200 even if writeCallLog throws (Vapi requires 200 always)", async () => {
    mockWriteCallLog.mockRejectedValue(new Error("DB write failed"));
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "end-of-call-report" } },
      deps,
    );
    expect(result.status).toBe(200);
  });
});

describe("Vapi webhook — unknown message types", () => {
  it("returns 200 for unrecognised message types without calling helpers", async () => {
    const result = await handleVapiWebhook(
      VALID_HEADERS,
      VALID_QUERY,
      { message: { type: "speech-update" } },
      deps,
    );
    expect(result.status).toBe(200);
    expect(mockBuildAssistantConfig).not.toHaveBeenCalled();
    expect(mockWriteCallLog).not.toHaveBeenCalled();
  });

  it("returns 200 for a webhook with no message field", async () => {
    const result = await handleVapiWebhook(VALID_HEADERS, VALID_QUERY, {}, deps);
    expect(result.status).toBe(200);
  });
});
