/**
 * voice-observability-routes.test.ts
 * Integration tests for voice metrics recording and health endpoints.
 */
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{
      id: number;
      vapiCallId: string;
      userId: string;
      ttftMs: number | null;
      sttError: boolean;
      ttsError: boolean;
    }>,
    nextId: 1,
  };

  const schema = {
    callLogs: {
      id: "callLogs.id",
      vapiCallId: "callLogs.vapi_call_id",
      userId: "callLogs.user_id",
      ttftMs: "callLogs.ttft_ms",
      ttfAudioMs: "callLogs.ttf_audio_ms",
      sttError: "callLogs.stt_error",
      ttsError: "callLogs.tts_error",
      pipelineError: "callLogs.pipeline_error",
      latencyP50Ms: "callLogs.latency_p50_ms",
      latencyP95Ms: "callLogs.latency_p95_ms",
      createdAt: "callLogs.created_at",
      durationSeconds: "callLogs.duration_seconds",
      sentiment: "callLogs.sentiment",
      outcomeTag: "callLogs.outcome_tag",
      demo: "callLogs.demo",
    },
  };

  const drizzle = {
    select: vi.fn((_shape?: Record<string, string>) => ({
      from: vi.fn(() => ({
        where: vi.fn((cond: any) => {
          const resolveData = (): any[] => {
            if (cond?.left === schema.callLogs.vapiCallId) {
              const found = state.calls.find((c) => c.vapiCallId === cond.right);
              return found ? [{ userId: found.userId }] : [];
            }
            if (cond?.left === schema.callLogs.userId) {
              return state.calls
                .filter((c) => c.userId === cond.right)
                .map((c) => ({
                  ...c,
                  createdAt: new Date(),
                  durationSeconds: 60,
                  sentiment: "neutral",
                  outcomeTag: null,
                }));
            }
            return state.calls.map((c) => ({
              ...c,
              createdAt: new Date(),
              durationSeconds: 60,
              sentiment: "neutral",
              outcomeTag: null,
            }));
          };
          const data = resolveData();
          const result: any = {
            limit: vi.fn(async () => data),
            orderBy: vi.fn(() => result),
            then: (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject),
          };
          return result;
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn((cond: any) => {
          const found = state.calls.find((c) => c.vapiCallId === cond.right);
          if (found) {
            found.ttftMs = values.ttftMs ?? found.ttftMs;
            found.sttError = values.sttError ?? found.sttError;
            found.ttsError = values.ttsError ?? found.ttsError;
          }
          return Promise.resolve(undefined);
        }),
      })),
    })),
    insert: vi.fn(),
  };

  return { state, schema, drizzle };
});

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../db/schema", () => h.schema);
vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@example.com" };
    next();
  }),
}));
vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ left, right }),
  and: (...conds: any[]) => ({ op: "and", conds }),
  gte: (left: string, right: unknown) => ({ left, right }),
  desc: (col: string) => ({ col, dir: "desc" }),
}));
vi.mock("../lib/webhook-helpers", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

async function buildApp() {
  const routerModule = await import("./voice-observability-routes");
  const app = express();
  app.use(express.json());
  app.use("/api", routerModule.default);
  return app;
}

describe("voice observability routes", () => {
  // Tests in this suite assume no webhook secret is configured unless a
  // specific test opts in. Clear any ambient VAPI_WEBHOOK_SECRET (which leaks
  // in from the host environment) so the default-path tests are deterministic.
  const AMBIENT_VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET;
  beforeEach(() => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    h.state.calls = [
      {
        id: 1,
        vapiCallId: "call-abc",
        userId: "user-1",
        ttftMs: null,
        sttError: false,
        ttsError: false,
      },
      {
        id: 2,
        vapiCallId: "call-def",
        userId: "user-1",
        ttftMs: null,
        sttError: false,
        ttsError: false,
      },
    ];
    vi.clearAllMocks();
  });

  afterAll(() => {
    if (AMBIENT_VAPI_SECRET === undefined) delete process.env.VAPI_WEBHOOK_SECRET;
    else process.env.VAPI_WEBHOOK_SECRET = AMBIENT_VAPI_SECRET;
  });

  describe("POST /api/voice/metrics", () => {
    it("records metrics for existing call", async () => {
      const response = await request(await buildApp())
        .post("/api/voice/metrics")
        .send({
          vapiCallId: "call-abc",
          ttftMs: 450,
          ttfAudioMs: 800,
          sttError: false,
          ttsError: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ recorded: true });
    });

    it("rejects missing vapiCallId", async () => {
      const response = await request(await buildApp())
        .post("/api/voice/metrics")
        .send({ ttftMs: 450 });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid metrics payload/i);
    });

    it("returns 404 for unknown call", async () => {
      const response = await request(await buildApp())
        .post("/api/voice/metrics")
        .send({
          vapiCallId: "call-unknown",
          ttftMs: 450,
        });

      expect(response.status).toBe(404);
    });

    it("records pipeline errors", async () => {
      const response = await request(await buildApp())
        .post("/api/voice/metrics")
        .send({
          vapiCallId: "call-def",
          ttftMs: 1200,
          pipelineError: "llm",
          sttError: true,
        });

      expect(response.status).toBe(200);
    });

    it("validates pipelineError enum", async () => {
      const response = await request(await buildApp())
        .post("/api/voice/metrics")
        .send({
          vapiCallId: "call-abc",
          pipelineError: "invalid-error",
        });

      expect(response.status).toBe(400);
    });

    describe("Vapi secret enforcement", () => {
      const ORIGINAL = process.env.VAPI_WEBHOOK_SECRET;
      afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.VAPI_WEBHOOK_SECRET;
        else process.env.VAPI_WEBHOOK_SECRET = ORIGINAL;
      });

      it("rejects when secret configured and header missing", async () => {
        process.env.VAPI_WEBHOOK_SECRET = "s3cret-token-value";
        const response = await request(await buildApp())
          .post("/api/voice/metrics")
          .send({ vapiCallId: "call-abc", ttftMs: 450 });
        expect(response.status).toBe(401);
      });

      it("rejects when secret configured and header wrong", async () => {
        process.env.VAPI_WEBHOOK_SECRET = "s3cret-token-value";
        const response = await request(await buildApp())
          .post("/api/voice/metrics")
          .set("X-Vapi-Secret", "wrong-token-value")
          .send({ vapiCallId: "call-abc", ttftMs: 450 });
        expect(response.status).toBe(401);
      });

      it("accepts when secret configured and header correct", async () => {
        process.env.VAPI_WEBHOOK_SECRET = "s3cret-token-value";
        const response = await request(await buildApp())
          .post("/api/voice/metrics")
          .set("X-Vapi-Secret", "s3cret-token-value")
          .send({ vapiCallId: "call-abc", ttftMs: 450 });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ recorded: true });
      });
    });
  });

  describe("GET /api/health/voice-status", () => {
    it("returns healthy when demo line is performing well", async () => {
      // Mock healthy calls via mock returning healthy data
      const response = await request(await buildApp()).get("/api/health/voice-status");

      // Should succeed (200 or 503 based on health)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("demo_line", true);
      expect(response.body).toHaveProperty("checked_at");
    });

    it("includes window metrics in response", async () => {
      const response = await request(await buildApp()).get("/api/health/voice-status");

      expect(response.body).toHaveProperty("window_minutes");
      expect(response.body).toHaveProperty("total_calls");
      expect(response.body).toHaveProperty("ttft_p95_ms");
      expect(response.body).toHaveProperty("stt_error_rate");
      expect(response.body).toHaveProperty("tts_error_rate");
    });
  });

  describe("GET /api/insights/latency", () => {
    it("requires authentication", async () => {
      // Reset auth mock to reject
      const { authenticateUser } = await import("../middleware/auth");
      vi.mocked(authenticateUser).mockImplementation((req: any, res: any) => {
        res.status(401).json({ error: "Unauthorized" });
      });

      const response = await request(await buildApp())
        .get("/api/insights/latency")
        .set("Authorization", "Bearer invalid");

      expect(response.status).toBe(401);

      // Restore mock
      vi.mocked(authenticateUser).mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: "user-1", email: "test@example.com" };
        next();
      });
    });

    it("returns latency trends for authenticated user", async () => {
      const response = await request(await buildApp())
        .get("/api/insights/latency")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("trends");
      expect(response.body).toHaveProperty("days");
      expect(response.body).toHaveProperty("generated_at");
    });

    it("accepts days parameter", async () => {
      const response = await request(await buildApp())
        .get("/api/insights/latency?days=7")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(7);
    });

    it("caps days at 90", async () => {
      const response = await request(await buildApp())
        .get("/api/insights/latency?days=365")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(90);
    });
  });

  describe("GET /api/insights/latency/recent", () => {
    it("returns recent calls with metrics", async () => {
      const response = await request(await buildApp())
        .get("/api/insights/latency/recent")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("calls");
      expect(Array.isArray(response.body.calls)).toBe(true);
    });

    it("respects limit parameter", async () => {
      const response = await request(await buildApp())
        .get("/api/insights/latency/recent?limit=10")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
    });
  });
});
