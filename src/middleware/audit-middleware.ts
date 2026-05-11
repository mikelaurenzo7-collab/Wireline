/**
 * src/middleware/audit-middleware.ts
 *
 * Audit middleware — sets up an AsyncLocalStorage context BEFORE the
 * route handler runs. Every Claude API round trip inside the handler
 * records itself into the context. On `res.finish`, fire-and-forget
 * persist into wireline_audit_log + quota counters so the user's flow
 * is never blocked.
 */

import { db, log, quotaTracker } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as claudeBrain from "../lib/claude-brain";
import type { ClaudeCallMeta } from "../lib/claude-brain";
import { recordDailySpend, evaluateSpend } from "../lib/spend-guards";

/**
 * Persist Claude usage rows + quota + monthly spend hooks. Shared by HTTP
 * /api/claude (withAudit) and the synchronous Vapi post-call analyzer.
 */
export async function persistClaudeAuditRecords(opts: {
  userId: string;
  /** wireline_audit_log.action — dotted slug */
  action: string;
  records: ClaudeCallMeta[];
  /** Merged into every row.metadata */
  requestMeta?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.records.length) return;
  const rows = opts.records.map((r) => ({
    user_id: opts.userId,
    action: opts.action,
    provider: r.provider,
    model: r.model,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cache_read_tokens: r.cache_read_tokens,
    cache_create_tokens: r.cache_create_tokens,
    cost_usd: claudeBrain.estimateCost(
      {
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        cache_read_input_tokens: r.cache_read_tokens,
        cache_creation_input_tokens: r.cache_create_tokens,
      },
      r.model,
    ),
    latency_ms: r.latency_ms,
    metadata: { ...(opts.requestMeta || {}) },
  }));

  const deltaUsd = rows.reduce((s: number, r: { cost_usd?: unknown }) => s + Number(r.cost_usd || 0), 0);
  const { error } = await db.from("wireline_audit_log").insert(rows);
  if (error) {
    log.error("Audit insert failed", { error: getErrorMessage(error) });
    return;
  }
  const tokenDelta = opts.records.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0);
  if (tokenDelta > 0) {
    try {
      const decision = await quotaTracker.checkAndIncrement(opts.userId, "claude_tokens_daily", tokenDelta);
      if (!decision.allowed) {
        log.warn("Claude token quota exceeded after call — usage may exceed plan cap", {
          user_id: opts.userId,
          limit: decision.limit,
          used: decision.used,
        });
      }
    } catch (err: unknown) {
      log.warn("Claude token quota increment failed", { user_id: opts.userId, error: getErrorMessage(err) });
    }
  }
  recordDailySpend(deltaUsd);
  await evaluateSpend(opts.userId, deltaUsd).catch((err: unknown) =>
    log.error("evaluateSpend exception", { error: getErrorMessage(err) }),
  );
}

export function withAudit(actionPrefix: string) {
  return (req: any, res: any, next: any) => {
    const ctx = claudeBrain.createAuditContext();
    res.on("finish", () => {
      if (ctx.records.length === 0) return;
      if (!req?.user?.id) return;
      if (res.statusCode >= 500) return;
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      void persistClaudeAuditRecords({
        userId: req.user.id,
        action: actionPrefix ? `${actionPrefix}.${subpath}` : subpath,
        records: ctx.records,
        requestMeta: { method: req.method, path: req.path },
      }).catch((err: unknown) => log.error("Audit persist exception", { error: getErrorMessage(err) }));
    });
    claudeBrain.runInAuditContext(ctx, () => next());
  };
}
