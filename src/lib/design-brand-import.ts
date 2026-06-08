/**
 * Brand context import for Wireline Design — website URL scrape + Figma token merge.
 */
import { eq } from "drizzle-orm";
import { drizzle, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { isSsrfUrl } from "./webhook-validators";
import { fetchFigmaBrandTokens, parseFigmaFileKey } from "./figma-service";
import { loadDesignProfile, updateDesignProfile } from "./design-profile";

const MAX_HTML_BYTES = 512_000;

export interface WebsiteBrandExtract {
  title?: string;
  description?: string;
  themeColor?: string;
  colors: string[];
  fontFamilies: string[];
}

export function extractBrandFromHtml(html: string, _pageUrl: string): WebsiteBrandExtract {
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const themeMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);

  const colors = new Set<string>();
  if (themeMatch?.[1]) colors.add(themeMatch[1].trim());

  const hexMatches = html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  for (const hex of hexMatches.slice(0, 24)) colors.add(hex);

  const fontFamilies = new Set<string>();
  const fontMatches = html.match(/font-family:\s*([^;}{]+)/gi) ?? [];
  for (const raw of fontMatches.slice(0, 12)) {
    const family = raw
      .replace(/font-family:\s*/i, "")
      .trim()
      .replace(/['"]/g, "");
    if (family) fontFamilies.add(family.split(",")[0]?.trim() ?? family);
  }

  const linkFontMatches = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi) ?? [];
  for (const link of linkFontMatches) {
    const family = decodeURIComponent(link.split("family=")[1]?.split("&")[0] ?? "")
      .replace(/\+/g, " ")
      .trim();
    if (family) fontFamilies.add(family);
  }

  return {
    title: titleMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    themeColor: themeMatch?.[1]?.trim(),
    colors: [...colors].slice(0, 16),
    fontFamilies: [...fontFamilies].slice(0, 8),
  };
}

export async function importBrandFromWebsite(
  userId: string,
  url: string,
): Promise<{ profileUpdated: boolean; extract: WebsiteBrandExtract }> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("URL is required");
  if (isSsrfUrl(trimmed)) throw new Error("URL is not allowed for security reasons.");

  const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  const fetchUrl = parsed.toString();

  const r = await fetchWithTimeout(
    fetchUrl,
    {
      headers: {
        "User-Agent": "WirelineDesignBot/1.0 (+https://trywireline.com)",
        Accept: "text/html",
      },
      redirect: "follow",
    },
    15_000,
  );

  if (!r.ok) throw new Error(`Could not fetch website (${r.status})`);

  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new Error("Website HTML exceeds size limit for brand import.");
  }

  const extract = extractBrandFromHtml(buf.toString("utf8"), fetchUrl);
  const existing = await loadDesignProfile(userId);

  const styleLines = [
    existing.styleNotes.trim(),
    extract.themeColor ? `Theme color: ${extract.themeColor}` : "",
    extract.colors.length > 0 ? `Colors found: ${extract.colors.join(", ")}` : "",
    extract.fontFamilies.length > 0 ? `Font families: ${extract.fontFamilies.join(", ")}` : "",
    `Imported from ${parsed.hostname} on ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean);

  await updateDesignProfile(userId, {
    companyBlurb: extract.description || existing.companyBlurb || parsed.hostname,
    styleNotes: styleLines.join("\n"),
  });

  await drizzle
    .update(schema.designProfiles)
    .set({
      tokenManifest: {
        sourceUrl: fetchUrl,
        colors: extract.colors,
        fontFamilies: extract.fontFamilies,
        themeColor: extract.themeColor,
        importedAt: new Date().toISOString(),
      },
    })
    .where(eq(schema.designProfiles.userId, userId));

  return { profileUpdated: true, extract };
}

export async function importBrandFromFigmaFile(
  userId: string,
  fileKeyOrUrl: string,
): Promise<{ fileKey: string; tokens: Awaited<ReturnType<typeof fetchFigmaBrandTokens>> }> {
  const fileKey = parseFigmaFileKey(fileKeyOrUrl);
  if (!fileKey) throw new Error("Invalid Figma file URL or key.");

  const tokens = await fetchFigmaBrandTokens(userId, fileKey);
  const existing = await loadDesignProfile(userId);

  const styleLines = [
    existing.styleNotes.trim(),
    tokens.fileName ? `Figma file: ${tokens.fileName}` : "",
    tokens.colors.length > 0 ? `Figma colors: ${tokens.colors.join(", ")}` : "",
    tokens.typography.length > 0 ? `Figma typography: ${tokens.typography.join(", ")}` : "",
    tokens.components.length > 0
      ? `Figma components: ${tokens.components.slice(0, 12).join(", ")}`
      : "",
  ].filter(Boolean);

  await updateDesignProfile(userId, { styleNotes: styleLines.join("\n") });

  await drizzle
    .update(schema.designProfiles)
    .set({
      tokenManifest: {
        figmaFileKey: fileKey,
        colors: tokens.colors,
        typography: tokens.typography,
        components: tokens.components,
        fileName: tokens.fileName,
        importedAt: new Date().toISOString(),
      },
    })
    .where(eq(schema.designProfiles.userId, userId));

  return { fileKey, tokens };
}
