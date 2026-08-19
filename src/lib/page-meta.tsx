import { useEffect } from "react";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "./brand";

interface PageMetaProps {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const BRAND_SUFFIX = ` | ${BOTBOUND_BRAND_NAME}`;
const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || BOTBOUND_PRODUCTION_ORIGIN).replace(/\/+$/, "");
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_TITLE = "BotBound | Put Your Bot on the Line";
const DEFAULT_DESCRIPTION = "AI employees for calls, texts, and email.";

function brandTitle(value: string): string {
  return value.replace(/\bWireline\b/gi, BOTBOUND_BRAND_NAME).replace(/\bBotbound\b/gi, BOTBOUND_BRAND_NAME);
}

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  const selector = `meta[${attr}="${key}"]`;
  let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!content) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement("meta"); tag.setAttribute(attr, key); document.head.appendChild(tag); }
  tag.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  let tag = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!href) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement("link"); tag.setAttribute("rel", "canonical"); document.head.appendChild(tag); }
  tag.setAttribute("href", href);
}

function setStructuredData(data: PageMetaProps["structuredData"]) {
  const id = "botbound-page-jsonld";
  document.head.querySelector("#wireline-page-jsonld")?.remove();
  let tag = document.head.querySelector(`#${id}`) as HTMLScriptElement | null;
  if (!data) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement("script"); tag.id = id; tag.type = "application/ld+json"; document.head.appendChild(tag); }
  tag.textContent = JSON.stringify(data);
}

export function PageMeta({ title, description, path, image, noIndex, structuredData }: PageMetaProps) {
  const normalizedTitle = brandTitle(title || "");
  const fullTitle = normalizedTitle
    ? normalizedTitle.toLowerCase().includes(BOTBOUND_BRAND_NAME.toLowerCase())
      ? normalizedTitle
      : `${normalizedTitle}${BRAND_SUFFIX}`
    : DEFAULT_TITLE;
  const resolvedDescription = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;
  const ogImage = image
    ? /^https?:\/\//i.test(image)
      ? image
      : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`
    : DEFAULT_OG_IMAGE;

  useEffect(() => {
    document.title = fullTitle;
    setMeta("name", "description", resolvedDescription);
    setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1");
    setCanonical(canonicalUrl || null);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", resolvedDescription);
    setMeta("property", "og:url", canonicalUrl || SITE_URL);
    setMeta("property", "og:image", ogImage);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", resolvedDescription);
    setMeta("name", "twitter:image", ogImage);
    setStructuredData(structuredData);
  }, [canonicalUrl, fullTitle, noIndex, ogImage, resolvedDescription, structuredData]);

  return null;
}
