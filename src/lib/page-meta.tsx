import { useEffect } from "react";

interface PageMetaProps {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const BRAND_SUFFIX = " - Wireline";
const SITE_URL = "https://trywireline.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_TITLE = "Wireline - Wire your agent";
const DEFAULT_DESCRIPTION =
  "Wireline builds trained voice agents that answer, route, book, follow up, and text the outcome for solo business agents, call centers, and sales teams. Start outbound-first, then choose inbound or hybrid modes.";

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  const selector = `meta[${attr}="${key}"]`;
  let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  let tag = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!href) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function setStructuredData(data: PageMetaProps["structuredData"]) {
  const id = "wireline-page-jsonld";
  let tag = document.head.querySelector(`#${id}`) as HTMLScriptElement | null;
  if (!data) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("script");
    tag.id = id;
    tag.type = "application/ld+json";
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

export function PageMeta({
  title,
  description,
  path,
  image,
  noIndex,
  structuredData,
}: PageMetaProps) {
  const fullTitle = title
    ? /\bWireline\b/i.test(title)
      ? title
      : `${title}${BRAND_SUFFIX}`
    : DEFAULT_TITLE;
  const resolvedDescription = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;
  const ogImage = image || DEFAULT_OG_IMAGE;

  useEffect(() => {
    document.title = fullTitle;
    setMeta("name", "description", resolvedDescription);
    setMeta(
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1",
    );
    setCanonical(canonicalUrl || null);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", resolvedDescription);
    setMeta("property", "og:url", canonicalUrl || null);
    setMeta("property", "og:image", ogImage);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "Wireline");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", resolvedDescription);
    setMeta("name", "twitter:image", ogImage);
    setStructuredData(structuredData);
  }, [canonicalUrl, fullTitle, noIndex, ogImage, resolvedDescription, structuredData]);

  return null;
}
