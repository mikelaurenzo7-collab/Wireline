/**
 * Client-safe deep-analysis heuristic for Director fleet mode.
 * Kept separate from director-planner so the browser bundle never pulls
 * claude-structured / claude-audit (Node-only AsyncLocalStorage).
 */
import { wantsCodeDeliverable, wantsWebsiteDeliverable } from "./director-deliverables";

export { wantsLongDeliverable } from "./director-deliverables";

/**
 * In-account fleet review using seeded fleet + stats — not external market research.
 * Stays on Sonnet unless the operator toggles Deep (Opus + adaptive thinking).
 */
export function wantsFleetAudit(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (wantsOpusModel(t)) return false;
  return (
    /\b(audit|review|health[\s-]?check)\b.*\b(fleet|agents?)\b/i.test(t) ||
    /\b(fleet|agents?)\b.*\b(audit|review|fix first|what should i fix|priorit(?:y|ies)|health)\b/i.test(
      t,
    )
  );
}

export function buildFleetAuditGuidance(): string {
  return `## Fleet audit (this turn — speed priority)
Keep the reply skimmable: one-line verdict, top 3 prioritized fixes, optional one-line callouts on standout agents. Target ~250–400 words. Ground every point in the fleet list and stats above — no generic filler. Do not run live web research or propose outbound comms unless clearly warranted.`;
}

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
  /** Routine fleet audit — cap output for sub-minute Sonnet turns. */
  fleetAudit?: boolean;
}): number {
  if (input.fleetAudit && !input.opus) {
    return 1600;
  }
  if (input.openRouter) {
    return input.longDeliverable ? 8192 : 4096;
  }
  if (input.opus) {
    return input.longDeliverable ? 8192 : 4000;
  }
  return input.longDeliverable ? 8192 : 2800;
}
