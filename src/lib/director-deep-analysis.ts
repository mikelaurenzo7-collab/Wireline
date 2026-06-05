/**
 * Client-safe deep-analysis heuristic for Director fleet mode.
 * Kept separate from director-planner so the browser bundle never pulls
 * claude-structured / claude-audit (Node-only AsyncLocalStorage).
 */

/** Does this turn warrant Opus + adaptive thinking? */
export function wantsDeepAnalysis(message: string): boolean {
  return /\b(audit|deep[\s-]?dive|analy[sz]e (everything|all|the (whole|entire))|review (everything|all|the (whole|entire))|full (review|analysis|audit)|strateg(y|ize|ise|ic plan)|optimi[sz]e (everything|all|the (whole|entire))|benchmark)\b/i.test(
    message,
  );
}
