import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Write = { patch: Record<string, unknown>; json: { sql: string; params: unknown[] } | null };
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  /** The Bot's stored variables before a request, and what the write returns after it. */
  variables: null as Record<string, unknown> | null,
  afterWrite: null as Record<string, unknown> | null,
  writes: [] as Write[],
  synth: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method} ${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ agentMutationRateLimit: () => {} }));
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: vi.fn(),
  runTrainingImage: vi.fn(),
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/voice/voice-sample", () => ({
  isVoiceSampleAvailable: () => true,
  synthesizeVoiceSample: (...args: unknown[]) => h.synth(...args),
  voiceSampleLine: (name: string) => name,
}));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { SQL } = await import("drizzle-orm");
  const dialect = new PgDialect();
  const owns = (where: Parameters<typeof dialect.sqlToQuery>[0]) => {
    const { params } = dialect.sqlToQuery(where);
    return params[0] === "bot-a" && params[1] === "tenant-a";
  };
  return {
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    drizzle: {
      select: () => ({
        from: () => ({
          where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => ({
            limit: async () =>
              owns(where)
                ? [{ id: "bot-a", name: "Front Desk", businessVariables: h.variables }]
                : [],
          }),
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => ({
            returning: async () => {
              if (!owns(where)) return [];
              const value = patch.businessVariables;
              const query = value instanceof SQL ? dialect.sqlToQuery(value) : null;
              h.writes.push({
                patch,
                json: query && { sql: query.sql, params: query.params },
              });
              return [
                {
                  voiceId: patch.voiceId,
                  provider: patch.voiceProvider,
                  phoneVoiceId: patch.phoneVoiceId,
                  phoneVoiceProvider: patch.phoneVoiceProvider,
                  businessVariables: h.afterWrite,
                },
              ];
            },
          }),
        }),
      }),
    },
  };
});
import "../src/routes/agent-routes-v2";

const CLONE_KEY = "wirelineLiveCustomVoice";
const LIBRARY_KEY = "botboundPhoneCatalogVoice";
const VOICE_KEY = "botboundPhoneVoice";
const DELIVERY_KEY = "botboundCallDelivery";
const COLUMN = '"wireline_agents"."business_variables"';

function call(route: string, input: { body?: unknown; query?: unknown; userId?: string } = {}) {
  const json = vi.fn();
  const send = vi.fn();
  const result = h.routes.get(route)!(
    {
      user: { id: input.userId ?? "tenant-a" },
      params: { id: "bot-a" },
      body: input.body ?? {},
      query: input.query ?? {},
    },
    { json, send, setHeader: vi.fn() },
  );
  return { result, json, send };
}
const saveVoice = (body: unknown, userId?: string) =>
  call("patch /api/agent-config/:id/voice", { body, userId });
const saveDelivery = (body: unknown, userId?: string) =>
  call("patch /api/agent-config/:id/voice/delivery", { body, userId });
const sample = (query: unknown) => call("get /api/agent-config/:id/voice/sample", { query });

beforeEach(() => {
  h.variables = null;
  h.afterWrite = null;
  h.writes = [];
  h.synth.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
});
afterEach(() => vi.unstubAllEnvs());

describe("picking a built-in phone voice by name", () => {
  it("stores the voice beside its closest saved voice, in one statement", async () => {
    h.variables = { [CLONE_KEY]: { cloneId: "clone-1" }, unrelated: true };
    const { result, json } = saveVoice({ voiceId: " Luna ", provider: "phone" });
    await result;
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].patch).toMatchObject({
      // One of the ten saved voices, for the backup engine and every older reader.
      voiceId: "marin",
      voiceProvider: "openai",
      phoneVoiceId: null,
      phoneVoiceProvider: null,
    });
    // The cloned and library voices go, the pick is set, and nothing else is touched.
    expect(h.writes[0].json).toEqual({
      sql: `jsonb_set(COALESCE(${COLUMN}, '{}'::jsonb) - $1 - $2, ARRAY[$3], $4::jsonb)`,
      params: [CLONE_KEY, LIBRARY_KEY, VOICE_KEY, '"luna"'],
    });
    expect(json).toHaveBeenCalledWith({
      success: true,
      voice: {
        voiceId: "marin",
        provider: "openai",
        phoneVoiceId: null,
        phoneVoiceProvider: null,
        phoneCall: { provider: "xai", voice: "luna" },
        phoneVoice: "luna",
        rehearsalHearsPhoneVoice: expect.any(Boolean),
      },
      customVoiceCleared: true,
    });
  });

  it("refuses a name that is not in the catalog, and any other list", async () => {
    for (const body of [
      { voiceId: "marin", provider: "phone" },
      { voiceId: "", provider: "phone" },
      { voiceId: "luna", provider: "presenter" },
      { voiceId: "luna", provider: "" },
    ]) {
      await expect(saveVoice(body).result, JSON.stringify(body)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(h.writes).toHaveLength(0);
  });

  it("refuses the catalog when calls cannot speak it, rather than saving a voice nobody hears", async () => {
    vi.stubEnv("WIRELINE_PHONE_VOICE_PROVIDER", "openai");
    await expect(saveVoice({ voiceId: "luna", provider: "phone" }).result).rejects.toMatchObject({
      status: 409,
    });
    expect(h.writes).toHaveLength(0);
  });

  it("cannot change another workspace's Bot", async () => {
    await expect(
      saveVoice({ voiceId: "luna", provider: "phone" }, "tenant-b").result,
    ).rejects.toMatchObject({ status: 404 });
    expect(h.writes).toHaveLength(0);
  });
});

describe("picking one of the ten saved voices", () => {
  it("clears a voice picked by name, so the saved voice decides again", async () => {
    h.variables = { [VOICE_KEY]: "luna", [DELIVERY_KEY]: { speakingRate: 1.2 } };
    const { result, json } = saveVoice({ voiceId: "cedar", provider: "openai" });
    await result;
    expect(h.writes[0].patch).toMatchObject({ voiceId: "cedar", voiceProvider: "openai" });
    // The pace and pronunciations are not voices and are left alone.
    expect(h.writes[0].json).toEqual({
      sql: `(COALESCE(${COLUMN}, '{}'::jsonb) - $1 - $2) - $3`,
      params: [CLONE_KEY, LIBRARY_KEY, VOICE_KEY],
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        customVoiceCleared: false,
        voice: expect.objectContaining({
          voiceId: "cedar",
          phoneCall: { provider: "xai", voice: "castor" },
          phoneVoice: "castor",
        }),
      }),
    );
  });

  it("reports a cloned or library voice it switched off", async () => {
    h.variables = { [LIBRARY_KEY]: { provider: "cartesia", id: "voice-123456" } };
    const { result, json } = saveVoice({ voiceId: "cedar", provider: "openai" });
    await result;
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ customVoiceCleared: true }));
  });

  it("leaves a Bot with no stored choices without any", async () => {
    const { result } = saveVoice({ voiceId: "cedar", provider: "openai" });
    await result;
    expect(h.writes[0].patch).not.toHaveProperty("businessVariables");
  });
});

describe("saving call delivery", () => {
  it("merges only the part that changed into what is stored", async () => {
    h.afterWrite = {
      [VOICE_KEY]: "luna",
      [DELIVERY_KEY]: { speakingRate: 1.2, recognizedNames: ["Siobhan"] },
    };
    const { result, json } = saveDelivery({ speakingRate: 1.2 });
    await result;
    expect(h.writes).toHaveLength(1);
    expect(Object.keys(h.writes[0].patch)).toEqual(["businessVariables"]);
    const { sql, params } = h.writes[0].json!;
    // An existing object is merged into; anything else there is replaced by a fresh one.
    expect(sql).toBe(
      `jsonb_set(COALESCE(${COLUMN}, '{}'::jsonb), ARRAY[$1], (CASE WHEN jsonb_typeof(${COLUMN}->$2) = 'object' THEN ${COLUMN}->$3 ELSE '{}'::jsonb END) || $4::jsonb)`,
    );
    expect(params).toEqual([DELIVERY_KEY, DELIVERY_KEY, DELIVERY_KEY, '{"speakingRate":1.2}']);
    expect(json).toHaveBeenCalledWith({
      success: true,
      delivery: { speakingRate: 1.2, pronunciations: [], recognizedNames: ["Siobhan"] },
    });
  });

  it("stores pronunciations and names cleaned, and shows the platform pace when none is chosen", async () => {
    h.afterWrite = {
      [DELIVERY_KEY]: { pronunciations: [{ word: "Nguyen", say: "Win" }] },
    };
    const { result, json } = saveDelivery({ pronunciations: [{ word: " Nguyen ", say: "Win" }] });
    await result;
    expect(h.writes[0].json!.params.at(-1)).toBe(
      '{"pronunciations":[{"word":"Nguyen","say":"Win"}]}',
    );
    expect(json).toHaveBeenCalledWith({
      success: true,
      delivery: {
        speakingRate: 1.1,
        pronunciations: [{ word: "Nguyen", say: "Win" }],
        recognizedNames: [],
      },
    });
  });

  it("refuses a bad save before touching the Bot", async () => {
    for (const body of [
      {},
      { speakingRate: 1.15 },
      { pronunciations: [{ word: "Same", say: "same" }] },
      { recognizedNames: ["Siobhan", "siobhan"] },
    ]) {
      await expect(saveDelivery(body).result, JSON.stringify(body)).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(saveDelivery({ speakingRate: 1.2 }, "tenant-b").result).rejects.toMatchObject({
      status: 404,
    });
    expect(h.writes).toHaveLength(0);
  });
});

describe("hearing a built-in voice", () => {
  it("plays any catalog voice at the Bot's own pace, with its pronunciations", async () => {
    h.variables = {
      [DELIVERY_KEY]: { speakingRate: 0.9, pronunciations: [{ word: "Desk", say: "Desque" }] },
    };
    const { result, send } = sample({ voice: "Luna", provider: "phone" });
    await result;
    expect(h.synth).toHaveBeenCalledWith("luna", "Front Desk", {
      speakingRate: 0.9,
      pronunciations: [{ word: "Desk", say: "Desque" }],
    });
    expect(send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it("lets a named pace be heard before it is saved, and ignores any other number", async () => {
    await sample({ voice: "luna", provider: "phone", pace: "1.3" }).result;
    expect(h.synth).toHaveBeenLastCalledWith("luna", "Front Desk", {
      speakingRate: 1.3,
      pronunciations: [],
    });
    await sample({ voice: "luna", provider: "phone", pace: "5" }).result;
    // No pace chosen and none named: the pace every call uses by default.
    expect(h.synth).toHaveBeenLastCalledWith("luna", "Front Desk", {
      speakingRate: 1.1,
      pronunciations: [],
    });
  });

  it("still plays a saved voice as the phone voice closest to it", async () => {
    await sample({ voice: "cedar" }).result;
    expect(h.synth).toHaveBeenLastCalledWith("castor", "Front Desk", {
      speakingRate: 1.1,
      pronunciations: [],
    });
  });

  it("refuses a voice from the wrong list", async () => {
    await expect(sample({ voice: "marin", provider: "phone" }).result).rejects.toMatchObject({
      status: 400,
    });
    await expect(sample({ voice: "luna", provider: "openai" }).result).rejects.toMatchObject({
      status: 400,
    });
    await expect(sample({ voice: "luna", provider: "other" }).result).rejects.toMatchObject({
      status: 400,
    });
    expect(h.synth).not.toHaveBeenCalled();
  });
});
