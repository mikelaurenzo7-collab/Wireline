/**
 * src/lib/qa-score-provenance.ts
 *
 * Which of the two QA scorers produced the score on a call log.
 *
 * There are two, and until now they collided in a way that silently disabled
 * the better one:
 *
 *  1. A **heuristic**, written synchronously by the Vapi end-of-call handler
 *     from the analysis output it already has — 60 base, plus/minus sentiment
 *     and intent, minus 10 if a regex spots "missed"/"should have" in the
 *     coaching note. It costs nothing extra and gives the account holder a
 *     badge the moment the call ends.
 *
 *  2. The **rubric**, the real thing: a five-dimension, evidence-cited Claude
 *     assessment (greeting / discovery / solution / objection / closing, 0-20
 *     each) run asynchronously by the `auto_qa_score` job, which also chains
 *     `adaptive_optimization` when the score is poor — the agent-learning loop.
 *
 * The job's idempotency guard was `if (call.qaScore != null) return`. The
 * heuristic always populated `qaScore` first, on every call, so that guard was
 * always true and the rubric never ran once. The badge account holders read as
 * a quality assessment was a regex, and the learning loop behind it was dead.
 *
 * The guard needs to distinguish "already scored" from "scored provisionally",
 * so both writers now stamp their provenance. Legacy rows carry no stamp and
 * are correctly treated as provisional: they have the heuristic's shape, not
 * the rubric's, so the rubric may still upgrade them.
 */

export const QA_SCORE_SOURCE_HEURISTIC = "heuristic" as const;
export const QA_SCORE_SOURCE_RUBRIC = "rubric" as const;

export type QaScoreSource = typeof QA_SCORE_SOURCE_HEURISTIC | typeof QA_SCORE_SOURCE_RUBRIC;

/** The five dimensions only the rubric produces. */
const RUBRIC_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;

/**
 * True when this breakdown is a completed rubric assessment.
 *
 * Checks the stamp first, then falls back to shape. The shape fallback is what
 * makes this safe to deploy without a backfill: every row written before the
 * stamp existed is a heuristic row, and none of them carry the five
 * dimensions.
 */
export function qaBreakdownIsRubric(breakdown: unknown): boolean {
  if (!breakdown || typeof breakdown !== "object") return false;
  const record = breakdown as Record<string, unknown>;
  if (record.source === QA_SCORE_SOURCE_RUBRIC) return true;
  if (record.source === QA_SCORE_SOURCE_HEURISTIC) return false;
  return RUBRIC_DIMENSIONS.every((dimension) => typeof record[dimension] === "number");
}

/**
 * Should the rubric run for a call whose stored breakdown is this?
 *
 * Yes unless the rubric has already produced one. A provisional heuristic
 * score is precisely the case the rubric exists to upgrade.
 */
export function qaRubricShouldRun(breakdown: unknown): boolean {
  return !qaBreakdownIsRubric(breakdown);
}
