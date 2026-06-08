/**
 * Design Studio output quality — aligned with Stitch polished-HTML heuristics.
 */
import { isPolishedStitchHtml, STITCH_HTML_MIN_BYTES } from "./google-stitch-mcp-client";
import { DESIGN_KIT_CLASS_VOCABULARY } from "./director-design-kit";

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

  const polished = isPolishedStitchHtml(buf);
  if (!polished) {
    if (buf.byteLength < STITCH_HTML_MIN_BYTES) {
      issues.push(
        "HTML too small — expand hero, trust row, and embedded CSS to Stitch polish threshold.",
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
