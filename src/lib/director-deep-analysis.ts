/**
 * Client-safe deep-analysis heuristic for Director fleet mode.
 * Kept separate from director-planner so the browser bundle never pulls
 * claude-structured / claude-audit (Node-only AsyncLocalStorage).
 */
import { wantsCodeDeliverable, wantsWebsiteDeliverable } from "./director-deliverables";

export { wantsLongDeliverable } from "./director-deliverables";

/** Opus for heavy docs/research — without forcing slow adaptive thinking. */
export function wantsOpusModel(message: string): boolean {
  if (wantsWebsiteDeliverable(message)) return false;
  if (
    wantsCodeDeliverable(message) &&
    !/\b(business\s+plan|architecture|spec|prd)\b/i.test(message)
  ) {
    return false;
  }
  return /\b(business\s+plan|competitive\s+analysis|competitors?|competitor\s+(?:research|analysis|landscape|scan)|market\s+research|go-to-market|gtm\s+plan|strateg(?:y|ize|ise)|strategic\s+plan|investor\s+(?:memo|deck)|pitch\s+deck|industry\s+(?:report|landscape)|swot|pricing in my market)\b/i.test(
    message,
  );
}

/**
 * Detects copy that benefits from the Deep analysis toggle (Opus + adaptive thinking).
 * Routing uses `forceDeep` only — this helper is for tests/docs, not auto-escalation.
 */
export function wantsDeepAnalysis(message: string): boolean {
  return /\b(audit|deep[\s-]?dive|analy[sz]e (everything|all|the (whole|entire))|review (everything|all|the (whole|entire))|full (review|analysis|audit)|optimi[sz]e (everything|all|the (whole|entire))|benchmark\s+(?:my|the|our)\s+fleet)\b/i.test(
    message,
  );
}

/** Output budget for structured Director turns (fleet + stream). */
export function resolveDirectorMaxTokens(input: {
  opus: boolean;
  longDeliverable: boolean;
  openRouter?: boolean;
}): number {
  if (input.openRouter) {
    return input.longDeliverable ? 8192 : 4096;
  }
  if (input.opus) {
    return input.longDeliverable ? 8192 : 4000;
  }
  return input.longDeliverable ? 8192 : 2800;
}
