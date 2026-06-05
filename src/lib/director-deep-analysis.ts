/**
 * Client-safe deep-analysis heuristic for Director fleet mode.
 * Kept separate from director-planner so the browser bundle never pulls
 * claude-structured / claude-audit (Node-only AsyncLocalStorage).
 */
import { wantsLongDeliverable } from "./director-deliverables";

export { wantsLongDeliverable } from "./director-deliverables";

/** Does this turn warrant Opus + adaptive thinking? */
export function wantsDeepAnalysis(message: string): boolean {
  if (wantsLongDeliverable(message)) return true;
  return /\b(audit|deep[\s-]?dive|analy[sz]e (everything|all|the (whole|entire))|review (everything|all|the (whole|entire))|full (review|analysis|audit)|strateg(y|ize|ise|ic plan)|optimi[sz]e (everything|all|the (whole|entire))|benchmark|competitor(?:s)?(?:\s+and|\s+vs)?\s+pricing|industry\s+(?:report|landscape)|swot)\b/i.test(
    message,
  );
}

/** Output budget for structured Director turns (fleet + stream). */
export function resolveDirectorMaxTokens(input: {
  deep: boolean;
  longDeliverable: boolean;
  openRouter?: boolean;
}): number {
  if (input.openRouter) {
    return input.longDeliverable ? 8192 : 4096;
  }
  if (input.deep) {
    return input.longDeliverable ? 8192 : 4000;
  }
  return input.longDeliverable ? 4000 : 2800;
}
