import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";

const h = vi.hoisted(() => {
  const state = {
    selectRows: [] as Array<Record<string, unknown>>,
    selectError: null as Error | null,
    insertedRow: {} as Record<string, unknown>,
    updatedRow: {} as Record<string, unknown>,
    insertedValues: null as Record<string, unknown> | null,
    updateSets: [] as Array<Record<string, unknown>>,
    deleteCalls: 0,
    elConfigured: true,
    elCreate: vi.fn(async () => ({ id: "el-dict-1", version_id: "el-ver-1" })),
    elDelete: vi.fn(async () => undefined),
  };

  const makeThenable = (resolve: () => Promise<unknown>) => {
    const builder: any = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      values: (v: Record<string, unknown>) => {
        state.insertedValues = v;
        return builder;
      },
      set: (v: Record<string, unknown>) => {
        state.updateSets.push(v);
        return builder;
      },
      returning: () => builder,
      then: (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        resolve().then(onOk, onErr),
    };
    return builder;
  };

  const drizzle = {
    select: vi.fn(() =>
      makeThenable(() =>
        state.selectError ? Promise.reject(state.selectError) : Promise.resolve(state.selectRows),
      ),
    ),
    insert: vi.fn(() => makeThenable(() => Promise.resolve([state.insertedRow]))),
    update: vi.fn(() => makeThenable(() => Promise.resolve([state.updatedRow]))),
    delete: vi.fn(() => {
      state.deleteCalls += 1;
      return makeThenable(() => Promise.resolve([]));
    }),
  };

  return { state, drizzle };
});

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@example.com" };
    next();
  }),
}));

vi.mock("../middleware/api-rate-limits", () => ({
  createRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../db/schema", () => ({
  pronunciationDictionaries: {
    id: "pd.id",
    userId: "pd.userId",
    name: "pd.name",
    entries: "pd.entries",
    active: "pd.active",
    createdAt: "pd.createdAt",
    updatedAt: "pd.updatedAt",
    elevenlabsDictionaryId: "pd.elevenlabsDictionaryId",
    elevenlabsVersionId: "pd.elevenlabsVersionId",
  },
}));

vi.mock("../lib/elevenlabs-client", () => ({
  createPronunciationDictionary: h.state.elCreate,
  deletePronunciationDictionary: h.state.elDelete,
  elevenLabsConfigured: vi.fn(() => h.state.elConfigured),
}));

async function buildApp() {
  const { default: router } = await import("./pronunciation-routes");
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(router);
  mountTestErrorHandler(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.selectRows = [];
  h.state.selectError = null;
  h.state.insertedRow = {
    id: "11111111-2222-3333-4444-555555555555",
    userId: "user-1",
    name: "Medical terms",
    entries: [],
    active: true,
    elevenlabsDictionaryId: null,
    elevenlabsVersionId: null,
  };
  h.state.updatedRow = { id: "11111111-2222-3333-4444-555555555555", name: "Medical terms" };
  h.state.insertedValues = null;
  h.state.updateSets = [];
  h.state.deleteCalls = 0;
  h.state.elConfigured = true;
  h.state.elCreate.mockResolvedValue({ id: "el-dict-1", version_id: "el-ver-1" });
  h.state.elDelete.mockResolvedValue(undefined);
});

describe("GET /api/pronunciation-dicts", () => {
  it("lists the tenant's dictionaries with the configured flag", async () => {
    h.state.selectRows = [{ id: "d1", name: "Legal" }];
    const app = await buildApp();
    const res = await request(app).get("/api/pronunciation-dicts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dictionaries: [{ id: "d1", name: "Legal" }], configured: true });
  });

  it("returns an empty list when the table is missing (42P01) instead of erroring", async () => {
    const missing = new Error('relation "wireline_pronunciation_dictionaries" does not exist');
    (missing as any).code = "42P01";
    h.state.selectError = missing;
    const app = await buildApp();
    const res = await request(app).get("/api/pronunciation-dicts");

    expect(res.status).toBe(200);
    expect(res.body.dictionaries).toEqual([]);
  });
});

describe("POST /api/pronunciation-dicts", () => {
  it("rejects a missing name with 400", async () => {
    const app = await buildApp();
    const res = await request(app).post("/api/pronunciation-dicts").send({ entries: [] });

    expect(res.status).toBe(400);
  });

  it("rejects more than the max entries with 400", async () => {
    const app = await buildApp();
    const entries = Array.from({ length: 501 }, (_, i) => ({
      from: `w${i}`,
      to: "x",
      kind: "alias",
    }));
    const res = await request(app).post("/api/pronunciation-dicts").send({ name: "Big", entries });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Too many entries/);
  });

  it("creates a dictionary, dedupes entries, and syncs to ElevenLabs", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/pronunciation-dicts")
      .send({
        name: "Medical terms",
        entries: [
          { from: "EKG", to: "E K G", kind: "alias" },
          { from: "EKG", to: "electrocardiogram", kind: "alias" }, // dupe: last write wins
          { from: " ", to: "blank", kind: "alias" }, // blank from: dropped
        ],
      });

    expect(res.status).toBe(200);
    expect(h.state.insertedValues?.entries).toEqual([
      { from: "EKG", to: "electrocardiogram", kind: "alias" },
    ]);
    expect(h.state.elCreate).toHaveBeenCalledTimes(1);
    expect(res.body.dictionary.elevenlabsDictionaryId).toBe("el-dict-1");
    expect(res.body.dictionary.elevenlabsVersionId).toBe("el-ver-1");
  });

  it("still returns the dictionary when the ElevenLabs sync fails", async () => {
    h.state.elCreate.mockRejectedValueOnce(new Error("EL down"));
    const app = await buildApp();
    const res = await request(app)
      .post("/api/pronunciation-dicts")
      .send({ name: "Medical terms", entries: [{ from: "EKG", to: "E K G", kind: "alias" }] });

    expect(res.status).toBe(200);
    expect(res.body.dictionary.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(res.body.dictionary.elevenlabsDictionaryId).toBeNull();
  });

  it("skips the ElevenLabs sync for empty drafts", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/pronunciation-dicts")
      .send({ name: "Draft", entries: [] });

    expect(res.status).toBe(200);
    expect(h.state.elCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/pronunciation-dicts/:id", () => {
  it("returns 404 for a dictionary owned by another tenant", async () => {
    h.state.selectRows = [];
    const app = await buildApp();
    const res = await request(app).patch("/api/pronunciation-dicts/some-id").send({ name: "X" });

    expect(res.status).toBe(404);
  });

  it("recreates the ElevenLabs dictionary when entries change", async () => {
    h.state.selectRows = [
      {
        id: "dict-1",
        userId: "user-1",
        name: "Legal",
        entries: [],
        elevenlabsDictionaryId: "old-el-id",
      },
    ];
    const app = await buildApp();
    const res = await request(app)
      .patch("/api/pronunciation-dicts/dict-1")
      .send({ entries: [{ from: "voir dire", to: "vwahr deer", kind: "alias" }] });

    expect(res.status).toBe(200);
    expect(h.state.elDelete).toHaveBeenCalledWith("old-el-id");
    expect(h.state.elCreate).toHaveBeenCalledTimes(1);
    const set = h.state.updateSets[0];
    expect(set.elevenlabsDictionaryId).toBe("el-dict-1");
    expect(set.elevenlabsVersionId).toBe("el-ver-1");
  });

  it("rejects an over-long name with 400", async () => {
    h.state.selectRows = [{ id: "dict-1", userId: "user-1", name: "Legal", entries: [] }];
    const app = await buildApp();
    const res = await request(app)
      .patch("/api/pronunciation-dicts/dict-1")
      .send({ name: "x".repeat(81) });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/pronunciation-dicts/:id", () => {
  it("returns 404 when the dictionary does not exist", async () => {
    h.state.selectRows = [];
    const app = await buildApp();
    const res = await request(app).delete("/api/pronunciation-dicts/missing");

    expect(res.status).toBe(404);
    expect(h.state.deleteCalls).toBe(0);
  });

  it("removes the local row even when the ElevenLabs delete fails", async () => {
    h.state.selectRows = [
      { id: "dict-1", userId: "user-1", name: "Legal", elevenlabsDictionaryId: "el-x" },
    ];
    h.state.elDelete.mockRejectedValueOnce(new Error("EL 500"));
    const app = await buildApp();
    const res = await request(app).delete("/api/pronunciation-dicts/dict-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(h.state.deleteCalls).toBe(1);
  });
});
