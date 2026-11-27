import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Write = { patch: Record<string, unknown>; sql: string | null; params: unknown[] };
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  /** The Bot's stored variables. Each write below is applied to them, as the database would. */
  variables: null as Record<string, unknown> | null,
  writes: [] as Write[],
  locks: [] as string[],
  transactions: 0,
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

const CLONE_KEY = "wirelineLiveCustomVoice";
const LIBRARY_KEY = "botboundPhoneCatalogVoice";
const VOICE_KEY = "botboundPhoneVoice";
const DELIVERY_KEY = "botboundCallDelivery";
const COLUMN = '"wireline_agents"."business_variables"';
/** A stored value that is not an object is read as an empty one, never as an error. */
const STORED = `CASE WHEN jsonb_typeof(${COLUMN}) = 'object' THEN ${COLUMN} ELSE '{}'::jsonb END`;
const SQL_PICK = `jsonb_set((${STORED}) - $1 - $2, ARRAY[$3], $4::jsonb)`;
const SQL_UNPICK = `((${STORED}) - $1 - $2) - $3`;
const SQL_DELIVERY = `jsonb_set(${STORED}, ARRAY[$1], $2::jsonb)`;

vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { SQL } = await import("drizzle-orm");
  const dialect = new PgDialect();
  type Where = Parameters<typeof dialect.sqlToQuery>[0];
  const owns = (where: Where) => {
    const { params } = dialect.sqlToQuery(where);
    return params[0] === "bot-a" && params[1] === "tenant-a";
  };
  const object = () =>
    h.variables && typeof h.variables === "object" && !Array.isArray(h.variables)
      ? { ...h.variables }
      : {};
  // The three statements the routes send, applied the way PostgreSQL applies them.
  const apply = (sql: string, params: unknown[]) => {
    const next = object();
    if (sql === SQL_DELIVERY) {
      next[String(params[0])] = JSON.parse(String(params[1]));
    } else if (sql === SQL_PICK) {
      delete next[String(params[0])];
      delete next[String(params[1])];
      next[String(params[2])] = JSON.parse(String(params[3]));
    } else if (sql === SQL_UNPICK) {
      for (const key of params) delete next[String(key)];
    } else {
      throw new Error(`Unexpected statement: ${sql}`);
    }
    h.variables = next;
  };
  const select = () => ({
    from: () => ({
      where: (where: Where) => {
        const rows = async () =>
          owns(where)
            ? [
                {
                  id: "bot-a",
                  name: "Front Desk",
                  businessVariables: structuredClone(h.variables),
                },
              ]
            : [];
        const query = {
          limit: () => query,
          for: (mode: string) => {
            h.locks.push(mode);
            return query;
          },
          then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            rows().then(resolve, reject),
        };
        return query;
      },
    }),
  });
  const update = () => ({
    set: (patch: Record<string, unknown>) => ({
      where: (where: Where) => {
        const write = async () => {
          if (!owns(where)) return [];
          const value = patch.businessVariables;
          const query = value instanceof SQL ? dialect.sqlToQuery(value) : null;
          h.writes.push({ patch, sql: query?.sql ?? null, params: query?.params ?? [] });
          if (query) apply(query.sql, query.params);
          return [
            {
              voiceId: patch.voiceId,
              provider: patch.voiceProvider,
              phoneVoiceId: patch.phoneVoiceId,
              phoneVoiceProvider: patch.phoneVoiceProvider,
            },
          ];
        };
        return {
          returning: () => write(),
          then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            write().then(resolve, reject),
        };
      },
    }),
  });
  return {
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    drizzle: {
      select,
      update,
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        h.transactions += 1;
        return work({ select, update });
      },
    },
  };
});
import "../src/routes/agent-routes-v2";

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
const stored = () => (h.variables?.[DELIVERY_KEY] ?? null) as Record<string, any> | null;

beforeEach(() => {
  h.variables = null;
  h.writes = [];
  h.locks = [];
  h.transactions = 0;
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
    expect(h.writes[0].sql).toBe(SQL_PICK);
    expect(h.writes[0].params).toEqual([CLONE_KEY, LIBRARY_KEY, VOICE_KEY, '"luna"']);
    // The cloned voice goes, the pick is set, and nothing else is touched.
    expect(h.variables).toEqual({ unrelated: true, [VOICE_KEY]: "luna" });
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
  it("clears a voice picked by name and leaves pace and pronunciations alone", async () => {
    h.variables = { [VOICE_KEY]: "luna", [DELIVERY_KEY]: { speakingRate: 1.2 } };
    const { result, json } = saveVoice({ voiceId: "cedar", provider: "openai" });
    await result;
    expect(h.writes[0].patch).toMatchObject({ voiceId: "cedar", voiceProvider: "openai" });
    expect(h.writes[0].sql).toBe(SQL_UNPICK);
    expect(h.variables).toEqual({ [DELIVERY_KEY]: { speakingRate: 1.2 } });
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
    expect(h.variables).toEqual({});
  });

  it("leaves a Bot with no stored choices without any", async () => {
    const { result } = saveVoice({ voiceId: "cedar", provider: "openai" });
    await result;
    expect(h.writes[0].patch).not.toHaveProperty("businessVariables");
    expect(h.variables).toBeNull();
  });
});

describe("saving call delivery", () => {
  it("keeps what another screen added, because each save is one change to what is stored now", async () => {
    // The setup guide adds a word. The workspace behind it still shows an empty list.
    await saveDelivery({ addPronunciation: { word: " Nguyen ", say: "Win" } }).result;
    const second = saveDelivery({ addPronunciation: { word: "Siobhan", say: "Shi-vawn" } });
    await second.result;
    expect(stored()!.pronunciations).toEqual([
      { word: "Nguyen", say: "Win" },
      { word: "Siobhan", say: "Shi-vawn" },
    ]);
    // The reply carries the whole list, so the older screen catches up.
    expect(second.json).toHaveBeenCalledWith({
      success: true,
      delivery: {
        speakingRate: 1.1,
        pronunciations: [
          { word: "Nguyen", say: "Win" },
          { word: "Siobhan", say: "Shi-vawn" },
        ],
        recognizedNames: [],
        ownGreeting: false,
      },
    });
    // Read and written under one row lock, and only this key is written.
    expect(h.transactions).toBe(2);
    expect(h.locks).toEqual(["update", "update"]);
    expect(h.writes.map((write) => write.sql)).toEqual([SQL_DELIVERY, SQL_DELIVERY]);
    expect(h.writes.every((write) => Object.keys(write.patch).join() === "businessVariables")).toBe(
      true,
    );
  });

  it("changes one part and keeps the rest, and a voice picked meanwhile", async () => {
    h.variables = {
      [VOICE_KEY]: "luna",
      [DELIVERY_KEY]: { recognizedNames: ["Siobhan"], pronunciations: [] },
    };
    const { result, json } = saveDelivery({ speakingRate: 1.2 });
    await result;
    expect(h.variables).toEqual({
      [VOICE_KEY]: "luna",
      [DELIVERY_KEY]: { speakingRate: 1.2, pronunciations: [], recognizedNames: ["Siobhan"] },
    });
    expect(json).toHaveBeenCalledWith({
      success: true,
      delivery: {
        speakingRate: 1.2,
        pronunciations: [],
        recognizedNames: ["Siobhan"],
        ownGreeting: false,
      },
    });
  });

  it("turns the owner's own greeting on and off without touching the rest", async () => {
    h.variables = { [DELIVERY_KEY]: { speakingRate: 0.9, recognizedNames: ["Siobhan"] } };
    const on = saveDelivery({ ownGreeting: true });
    await on.result;
    expect(stored()).toEqual({
      speakingRate: 0.9,
      pronunciations: [],
      recognizedNames: ["Siobhan"],
      ownGreeting: true,
    });
    expect(on.json).toHaveBeenCalledWith({
      success: true,
      delivery: {
        speakingRate: 0.9,
        pronunciations: [],
        recognizedNames: ["Siobhan"],
        ownGreeting: true,
      },
    });
    await saveDelivery({ ownGreeting: false }).result;
    expect(stored()).toEqual({
      speakingRate: 0.9,
      pronunciations: [],
      recognizedNames: ["Siobhan"],
    });
    await expect(saveDelivery({ ownGreeting: "yes" }).result).rejects.toMatchObject({
      status: 400,
    });
  });

  it("changes how a listed word is said instead of listing it twice", async () => {
    h.variables = { [DELIVERY_KEY]: { pronunciations: [{ word: "Nguyen", say: "Win" }] } };
    await saveDelivery({ addPronunciation: { word: "NGUYEN", say: "Wen" } }).result;
    expect(stored()!.pronunciations).toEqual([{ word: "NGUYEN", say: "Wen" }]);
  });

  it("removes one entry, and treats a repeated add or remove as already done", async () => {
    h.variables = {
      [DELIVERY_KEY]: {
        pronunciations: [
          { word: "Nguyen", say: "Win" },
          { word: "Siobhan", say: "Shi-vawn" },
        ],
        recognizedNames: ["Acme", "Ridge"],
      },
    };
    await saveDelivery({ removePronunciation: "nguyen" }).result;
    await saveDelivery({ removePronunciation: "nguyen" }).result;
    await saveDelivery({ removeRecognizedName: "ACME" }).result;
    await saveDelivery({ addRecognizedName: "ridge" }).result;
    expect(stored()).toEqual({
      pronunciations: [{ word: "Siobhan", say: "Shi-vawn" }],
      recognizedNames: ["Ridge"],
    });
  });

  it("stops at the most one Bot can keep, without writing", async () => {
    h.variables = {
      [DELIVERY_KEY]: {
        pronunciations: Array.from({ length: 40 }, (_, i) => ({
          word: `Word${i}`,
          say: `Say${i}`,
        })),
        recognizedNames: Array.from({ length: 40 }, (_, i) => `Name${i}`),
      },
    };
    await expect(
      saveDelivery({ addPronunciation: { word: "Extra", say: "Ex-tra" } }).result,
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("40 is the most") });
    await expect(saveDelivery({ addRecognizedName: "Extra" }).result).rejects.toMatchObject({
      status: 400,
    });
    // A word already listed can still be respelled at the limit.
    await saveDelivery({ addPronunciation: { word: "Word3", say: "Third" } }).result;
    expect(h.writes).toHaveLength(1);
    expect(stored()!.pronunciations[3]).toEqual({ word: "Word3", say: "Third" });
  });

  it("refuses a pronunciation that could change the required call opening", async () => {
    for (const word of ["AI assistant", "recorded", "Assistant calling for Ridge", "seven"]) {
      await expect(
        saveDelivery({ addPronunciation: { word, say: "something else" } }).result,
        word,
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("required call opening"),
      });
    }
    expect(h.writes).toHaveLength(0);
    expect(h.transactions).toBe(0);
  });

  it("refuses a bad save before touching the Bot", async () => {
    for (const body of [
      {},
      { speakingRate: 1.15 },
      { speakingRate: 1.2, addRecognizedName: "Acme" },
      { addPronunciation: { word: "Same", say: "same" } },
      { addPronunciation: { word: "Nguyen" } },
      { addRecognizedName: "!!!" },
      { removePronunciation: "" },
      { pronunciations: [{ word: "Nguyen", say: "Win" }] },
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

  it("saves into a stored value that was never an object", async () => {
    h.variables = ["not", "an", "object"] as never;
    await saveDelivery({ addRecognizedName: "Acme" }).result;
    expect(h.variables).toEqual({
      [DELIVERY_KEY]: { pronunciations: [], recognizedNames: ["Acme"] },
    });
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

  it("leaves out a stored pronunciation that could change the required opening", async () => {
    h.variables = {
      [DELIVERY_KEY]: {
        pronunciations: [
          { word: "AI", say: "a real" },
          { word: "Desk", say: "Desque" },
        ],
      },
    };
    await sample({ voice: "luna", provider: "phone" }).result;
    expect(h.synth).toHaveBeenLastCalledWith("luna", "Front Desk", {
      speakingRate: 1.1,
      pronunciations: [{ word: "Desk", say: "Desque" }],
    });
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
