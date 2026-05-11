/**
 * src/middleware/audit-middleware.ts
 *
 * Audit middleware — sets up an AsyncLocalStorage context BEFORE the
 * route handler runs. Every Claude API round trip inside the handler
 * records itself into the context. On `res.finish`, fire-and-forget
 * insert into wireline_audit_log so the user's flow is never blocked.
 */

import { db, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as claudeBrain from "../lib/claude-brain";
import { recordDailySpend, evaluateSpend } from "../lib/spend-guards";

export function withAudit(actionPrefix: string) {
  return (req: any, res: any, next: any) => {
    const ctx = claudeBrain.createAuditContext();
    res.on("finish", () => {
      if (ctx.records.length === 0) return;
      if (!req?.user?.id) return; // not authed → don't write
      if (res.statusCode >= 500) return; // don't bill failed Claude calls
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");

      const rows = ctx.records.map((r) => ({
        user_id: req.user.id,
        action: actionPrefix ? `${actionPrefix}.${subpath}` : subpath,
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
          r.model
        ),
        latency_ms: r.latency_ms,
        metadata: { method: req.method, path: req.path },
      }));

      const deltaUsd = rows.reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
      
      // Fire-and-forget; we don't want the user's flow to wait on this.
      Promise.resolve(db.from("wireline_audit_log").insert(rows))
        .then(({ error }: any) => {
          if (error) {
            log.error("Audit insert failed", { error: getErrorMessage(error) });
            return;
          }
          // After the spend is persisted, evaluate against the budget and
          // fire spend.warning / spend.exceeded webhooks if a threshold
          // crossed. Also fire-and-forget — never block the response.
          recordDailySpend(deltaUsd);
          evaluateSpend(req.user.id, deltaUsd).catch((err: any) =>
            log.error("evaluateSpend exception", { error: getErrorMessage(err) })
          );
        })
        .catch((err: any) => log.error("Audit insert exception", { error: getErrorMessage(err) }));
    });
    claudeBrain.runInAuditContext(ctx, () => next());
  };
}
