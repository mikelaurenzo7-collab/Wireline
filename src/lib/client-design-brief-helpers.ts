/**
 * Helpers for parsing client design.md briefs in the Spectrum Desk pipeline.
 */
import {
  formatClientDesignPackForResearch,
  resolveClientDesignPack,
} from "../data/client-design-packs";

export function extractIndustryFromBrief(markdown: string): string {
  const line = markdown.match(/^- Industry:\s*(.+)$/m)?.[1]?.trim();
  if (!line || line === "—") return "";
  return line;
}

/** Industry pack notes injected into research / imagine prompts. */
export function extractIndustryPackNotesFromBrief(markdown: string): string {
  const industry = extractIndustryFromBrief(markdown);
  const pack = resolveClientDesignPack({
    industry,
    operatorMessage: markdown.slice(0, 2000),
  });
  return formatClientDesignPackForResearch(pack);
}
