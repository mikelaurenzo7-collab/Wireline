/** Legacy enrichment persisted these error markers with a fabricated zero score. */
export const LEGACY_CALL_REVIEW_FAILURE_NOTES = [
  "Gemini API key not configured",
  "Analysis failed",
] as const;

export function isLegacyCallReviewFailure(value: string | null | undefined): boolean {
  const note = value?.trim();
  return (
    note === LEGACY_CALL_REVIEW_FAILURE_NOTES[0] || note === LEGACY_CALL_REVIEW_FAILURE_NOTES[1]
  );
}

/** Hide exact legacy provider-failure markers without changing real call notes. */
export function displayCallReviewNote(value: string | null | undefined): string | null {
  const note = value?.trim();
  if (!note || isLegacyCallReviewFailure(note)) return null;
  return note;
}

/** Keep stored evidence, but do not publish fabricated legacy enrichment. */
type CallAnalysisRow = {
  coachingNote: string | null;
  leadScore: number | null;
  intentLabel: string | null;
  sentiment: string | null;
};

export function presentCallAnalysis<T extends CallAnalysisRow>(call: T) {
  if (!isLegacyCallReviewFailure(call.coachingNote)) return call;
  return { ...call, coachingNote: null, leadScore: null, intentLabel: null, sentiment: null };
}

/** Provider ids may join internal outcome evidence but never enter the client report. */
export function presentCallReport<T extends CallAnalysisRow & { vapiCallId?: string | null }>(
  call: T,
) {
  const { vapiCallId: _providerCallId, ...report } = presentCallAnalysis(call);
  return report;
}
