/**
 * Design Studio output quality — polished-HTML heuristics for LLM-generated pages.
 */
import { DESIGN_KIT_CLASS_VOCABULARY } from "./director-design-kit";

/** Minimum bytes for a production-quality landing page (not a wireframe stub). */
export const DESIGN_HTML_MIN_BYTES = 2_048;

/**
 * Reject early wireframe HTML (bare links, no CSS).
 * Production HTML must ship embedded styles — external-only sheets break blob iframe previews.
 */
export function isPolishedDesignHtml(buf: Buffer): boolean {
  if (buf.byteLength < DESIGN_HTML_MIN_BYTES) return false;
  const text = buf.toString("utf8");
  if (!/<html[\s>]|<!doctype\s+html/i.test(text)) return false;

  const hasStyleBlock = /<style[\s>]/i.test(text);
  const inlineStyleCount = (text.match(/\sstyle\s*=/gi) ?? []).length;
  const bareLinkCount = (text.match(/<a\s+[^>]*href/gi) ?? []).length;

  if (bareLinkCount >= 5 && !hasStyleBlock && inlineStyleCount < 3) {
    return false;
  }

  if (hasStyleBlock) return true;
  if (inlineStyleCount >= 8) return true;

  return false;
}

export interface DesignStudioQualityReport {
  polished: boolean;
  byteLength: number;
  hasStyleBlock: boolean;
  usesDesignKit: boolean;
  designKitClassHits: number;
  hasPrimaryButton: boolean;
  hasHeadline: boolean;
  issues: string[];
}

export function assessDesignStudioHtmlQuality(html: string): DesignStudioQualityReport {
  const buf = Buffer.from(html, "utf8");
  const text = html.trim();
  const issues: string[] = [];

  const polished = isPolishedDesignHtml(buf);
  if (!polished) {
    if (buf.byteLength < DESIGN_HTML_MIN_BYTES) {
      issues.push(
        "HTML too small — expand hero, trust row, and embedded CSS to production polish threshold.",
      );
    } else {
      issues.push(
        "Reads as wireframe — add embedded <style>, real buttons, and component styling.",
      );
    }
  }

  const hasStyleBlock = /<style[\s>]/i.test(text);
  if (!hasStyleBlock) {
    issues.push("Missing <style> block — external-only CSS breaks inline preview.");
  }

  const designKitClassHits = DESIGN_KIT_CLASS_VOCABULARY.filter((cls) =>
    new RegExp(`class=["'][^"']*\\b${cls}\\b`, "i").test(text),
  ).length;
  const usesDesignKit = designKitClassHits >= 4;
  if (!usesDesignKit) {
    issues.push(
      `Use Wireline kit classes (found ${designKitClassHits}/${DESIGN_KIT_CLASS_VOCABULARY.length} required patterns) — wl-btn, wl-headline, wl-badge, etc.`,
    );
  }

  const hasPrimaryButton =
    /\bwl-btn--primary\b/i.test(text) || /<button[^>]+class=["'][^"']*btn/i.test(text);
  if (!hasPrimaryButton) {
    issues.push("Primary CTA must use wl-btn wl-btn--primary (min 48px height).");
  }

  const hasHeadline = /\bwl-headline\b/i.test(text) || /<h1[\s>]/i.test(text);
  if (!hasHeadline) {
    issues.push("Missing hero headline (h1 or .wl-headline).");
  }

  return {
    polished,
    byteLength: buf.byteLength,
    hasStyleBlock,
    usesDesignKit,
    designKitClassHits,
    hasPrimaryButton,
    hasHeadline,
    issues,
  };
}

export function designQualityPasses(report: DesignStudioQualityReport): boolean {
  return report.polished && report.usesDesignKit && report.hasPrimaryButton && report.hasHeadline;
}

export function formatDesignQualityRevisionNotes(report: DesignStudioQualityReport): string {
  return report.issues.map((issue) => `- ${issue}`).join("\n");
}
