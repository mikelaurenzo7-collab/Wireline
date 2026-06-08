/**
 * Spectrum Desk — deterministic HTML scoring and optional challenger pick.
 */
import { assessDesignStudioHtmlQuality } from "./director-design-quality";
import { DESIGN_HTML_MIN_BYTES } from "./director-design-quality";

export interface DesignArchitectCandidateResult {
  architectId: string;
  label: string;
  html: string;
  voteScore: number;
  qualityIssues: string[];
}

/** Higher is better — deterministic jury for parallel UI architect drafts. */
export function scoreDesignCandidateForVote(html: string): number {
  const report = assessDesignStudioHtmlQuality(html);
  let score = 0;

  if (report.polished) score += 100;
  if (report.hasStyleBlock) score += 20;
  if (report.hasPrimaryButton) score += 25;
  if (report.hasHeadline) score += 25;
  score += report.designKitClassHits * 8;

  const sizeBonus = Math.min(
    40,
    Math.floor((report.byteLength / Math.max(DESIGN_HTML_MIN_BYTES, 1)) * 20),
  );
  score += sizeBonus;

  if (/\bwl-hero--photo\b/i.test(html)) score += 15;
  if (/\bwl-section\b/i.test(html)) score += 8;
  if (/<h2[\s>]/i.test(html)) score += 5;
  if (/prefers-reduced-motion/i.test(html)) score += 5;

  score -= report.issues.length * 12;

  return score;
}

export function rankArchitectCandidates(
  entries: Array<{ architectId: string; label: string; html: string }>,
): DesignArchitectCandidateResult[] {
  return entries
    .map((entry) => {
      const quality = assessDesignStudioHtmlQuality(entry.html);
      return {
        architectId: entry.architectId,
        label: entry.label,
        html: entry.html,
        voteScore: scoreDesignCandidateForVote(entry.html),
        qualityIssues: quality.issues,
      };
    })
    .sort((a, b) => b.voteScore - a.voteScore);
}

export function pickWinningArchitectCandidate(
  ranked: DesignArchitectCandidateResult[],
): DesignArchitectCandidateResult | null {
  return ranked[0] ?? null;
}
