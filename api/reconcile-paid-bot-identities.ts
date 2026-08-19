import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { and, asc, eq, inArray } from "drizzle-orm";

import * as schema from "../src/db/schema";
import { ensurePaidBotIdentity } from "../src/lib/paid-bot-identity";
import { drizzle, log } from "../src/lib/server-context";
import { getErrorMessage } from "../src/lib/server-utils";

const PAID_PLANS = ["starter", "team", "business", "enterprise"] as const;
const ACTIVE_STATUSES = ["active", "trialing"] as const;
const DEFAULT_BATCH = 10;
const MAX_BATCH = 25;

function bearerToken(req: IncomingMessage): string {
  const value = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req: IncomingMessage): boolean {
  const expected = String(process.env.CRON_SECRET || "").trim();
  const supplied = bearerToken(req);
  return Boolean(expected && supplied && constantTimeEqual(supplied, expected));
}

function batchSize(req: IncomingMessage): number {
  const raw = new URL(req.url || "/", "https://botbound.internal").searchParams.get("limit");
  const parsed = Number(raw || DEFAULT_BATCH);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH;
  return Math.max(1, Math.min(MAX_BATCH, Math.floor(parsed)));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("allow", "GET, POST");
    send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!authorized(req)) {
    send(res, 401, { ok: false, code: "UNAUTHORIZED" });
    return;
  }

  const limit = batchSize(req);
  const rows = await drizzle
    .select({
      agentId: schema.agents.id,
      userId: schema.agents.userId,
      name: schema.agents.name,
      plan: schema.subscriptions.plan,
    })
    .from(schema.agents)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.agents.userId))
    .where(
      and(
        inArray(schema.subscriptions.plan, [...PAID_PLANS]),
        inArray(schema.subscriptions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(asc(schema.agents.createdAt))
    .limit(limit);

  const results: Array<{
    agentId: string;
    plan: string | null;
    ok: boolean;
    phone?: string | null;
    email?: string | null;
    error?: string;
  }> = [];

  for (const row of rows) {
    try {
      const identity = await ensurePaidBotIdentity({
        userId: row.userId,
        agentId: row.agentId,
      });
      results.push({
        agentId: row.agentId,
        plan: row.plan,
        ok: true,
        phone: identity.phone,
        email: identity.email,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      log.error("Paid Bot identity reconciliation failed", {
        agentId: row.agentId,
        userId: row.userId,
        plan: row.plan,
        error: message,
      });
      results.push({ agentId: row.agentId, plan: row.plan, ok: false, error: message });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  send(res, failed ? 207 : 200, {
    ok: failed === 0,
    processed: results.length,
    failed,
    results,
  });
}
