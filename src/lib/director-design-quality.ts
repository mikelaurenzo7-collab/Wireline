/**
 * Design Studio output quality — polished-HTML heuristics for LLM-generated pages.
 */
import { DESIGN_KIT_CLASS_VOCABULARY } from "./director-design-kit";
import { DESIGN_KIT_MARKER } from "./director-design-kit-inject";

/** Minimum bytes for a production-quality landing page (not a wireframe stub). */
export const DESIGN_HTML_MIN_BYTES = 4_096;

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
  hasKitMarker: boolean;
  customPalette: boolean;
  hasResponsiveQuery: boolean;
  hasVisualRichness: boolean;
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

  const hasKitMarker = text.includes(DESIGN_KIT_MARKER);
  const designKitClassHits = DESIGN_KIT_CLASS_VOCABULARY.filter((cls) =>
    new RegExp(`class=["'][^"']*\\b${cls}\\b`, "i").test(text),
  ).length;
  const usesDesignKit = hasKitMarker && designKitClassHits >= 5;
  if (!hasKitMarker) {
    issues.push("Missing Wireline Design Kit CSS marker — embed full kit in <style>.");
  } else if (designKitClassHits < 5) {
    issues.push(
      `Use Wireline kit classes (found ${designKitClassHits}/${DESIGN_KIT_CLASS_VOCABULARY.length} patterns) — wl-btn, wl-headline, wl-badge, etc.`,
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

  // New strict checks for Sonnet
  const customPalette = !/--wl-primary:\s*#1e3a5f/i.test(text) && !/--wl-bg:\s*#f7f3eb/i.test(text);
  if (!customPalette) {
    issues.push("Palette not customized — still using default navy/beige. Override :root variables based on the brief.");
  }

  const hasResponsiveQuery = /@media/i.test(text);
  if (!hasResponsiveQuery) {
    issues.push("Missing responsive behavior — add at least one @media query.");
  }

  const hasVisualRichness = /box-shadow:.*rgba/i.test(text) || /gradient/i.test(text) || /backdrop-filter/i.test(text);
  if (!hasVisualRichness) {
    issues.push("Design is too flat — add box-shadow, linear-gradient, or other visual richness.");
  }

  return {
    polished,
    byteLength: buf.byteLength,
    hasStyleBlock,
    usesDesignKit,
    designKitClassHits,
    hasPrimaryButton,
    hasHeadline,
    hasKitMarker,
    customPalette,
    hasResponsiveQuery,
    hasVisualRichness,
    issues,
  };
}

export function designQualityPasses(report: DesignStudioQualityReport): boolean {
  return (
    report.polished &&
    report.hasStyleBlock &&
    report.usesDesignKit &&
    report.hasPrimaryButton &&
    report.hasHeadline &&
    report.customPalette &&
    report.hasResponsiveQuery &&
    report.hasVisualRichness
  );
}

/** Lighter gate for pass-1 fast lane — ship a preview users can iterate on in chat. */
export function designQualityPassesFastLane(report: DesignStudioQualityReport): boolean {
  const kitOk = report.designKitClassHits >= 3;
  return report.polished && kitOk && report.hasHeadline && report.hasStyleBlock;
}

export function formatDesignQualityRevisionNotes(report: DesignStudioQualityReport): string {
  return report.issues.map((issue) => `- ${issue}`).join("\n");
}
