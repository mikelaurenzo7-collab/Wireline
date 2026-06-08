import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { generateToken } from "../../src/lib/auth-service";
import { SESSION_COOKIE_NAME } from "../../src/lib/session-cookie";
import * as schema from "../../src/db/schema";
import { mountRouteTestRequestContext, mountTestErrorHandler } from "../helpers/express-test-app";

const hasDb = Boolean(process.env.POSTGRES_URL);

function sessionCookie(userId: string, email: string): string {
  const token = generateToken({ id: userId, email });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function apiOrigin(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

describe.skipIf(!hasDb)("agent tenant isolation (live Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  let app: express.Application;
  let drizzle: typeof import("../../src/lib/server-context").drizzle;

  const userA = randomUUID();
  const userB = randomUUID();
  const emailA = `tenant-iso-a-${runId}@wireline-iso.test`;
  const emailB = `tenant-iso-b-${runId}@wireline-iso.test`;
  const agentA = `tenant-iso-agent-a-${runId}`;
  const agentB = `tenant-iso-agent-b-${runId}`;

  beforeAll(async () => {
    if (!process.env.INTERNAL_JWT_SECRET || process.env.INTERNAL_JWT_SECRET.length < 32) {
      process.env.INTERNAL_JWT_SECRET = "integration-test-jwt-secret-32-chars-min";
    }

    const serverContext = await import("../../src/lib/server-context");
    drizzle = serverContext.drizzle;

    await drizzle.insert(schema.users).values([
      { id: userA, email: emailA, emailVerifiedAt: new Date() },
      { id: userB, email: emailB, emailVerifiedAt: new Date() },
    ]);
    await drizzle.insert(schema.agents).values([
      { id: agentA, userId: userA, name: `Isolation Agent A ${runId}` },
      { id: agentB, userId: userB, name: `Isolation Agent B ${runId}` },
    ]);

    const agentRouter = (await import("../../src/routes/agent-routes")).default;
    app = express();
    mountRouteTestRequestContext(app);
    app.use(express.json());
    app.use(agentRouter);
    mountTestErrorHandler(app);
  });

  afterAll(async () => {
    if (!drizzle) return;
    await drizzle
      .delete(schema.personality)
      .where(inArray(schema.personality.agentId, [agentA, agentB]));
    await drizzle
      .delete(schema.directives)
      .where(inArray(schema.directives.agentId, [agentA, agentB]));
    await drizzle
      .delete(schema.knowledge)
      .where(inArray(schema.knowledge.agentId, [agentA, agentB]));
    await drizzle.delete(schema.agents).where(inArray(schema.agents.id, [agentA, agentB]));
    await drizzle.delete(schema.users).where(inArray(schema.users.id, [userA, userB]));
  });

  it("returns 404 when tenant A reads tenant B agent config", async () => {
    const res = await request(app)
      .get(`/api/agent-config/${agentB}`)
      .set("Cookie", sessionCookie(userA, emailA))
      .set("Origin", apiOrigin());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/agent not found/i);
  });

  it("returns 404 when tenant A trains against tenant B agent", async () => {
    const res = await request(app)
      .post("/api/train/save")
      .set("Cookie", sessionCookie(userA, emailA))
      .set("Origin", apiOrigin())
      .send({
        agentId: agentB,
        extracted: { directives: [{ content: "malicious", priority: 1 }] },
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/agent not found/i);
  });

  it("returns 404 when tenant A updates tenant B agent", async () => {
    const res = await request(app)
      .put(`/api/agents/${agentB}`)
      .set("Cookie", sessionCookie(userA, emailA))
      .set("Origin", apiOrigin())
      .send({ name: "Hijacked" });
    expect(res.status).toBe(404);
  });

  it("lists only owned agents for each tenant session", async () => {
    const resA = await request(app)
      .get("/api/agents")
      .set("Cookie", sessionCookie(userA, emailA))
      .set("Origin", apiOrigin());
    expect(resA.status).toBe(200);
    const idsA = (resA.body.agents || []).map((a: { id: string }) => a.id);
    expect(idsA).toContain(agentA);
    expect(idsA).not.toContain(agentB);

    const resB = await request(app)
      .get("/api/agents")
      .set("Cookie", sessionCookie(userB, emailB))
      .set("Origin", apiOrigin());
    expect(resB.status).toBe(200);
    const idsB = (resB.body.agents || []).map((a: { id: string }) => a.id);
    expect(idsB).toContain(agentB);
    expect(idsB).not.toContain(agentA);
  });
});
