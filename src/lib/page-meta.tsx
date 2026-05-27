/**
 * PageMeta — React 19 compatible per-route document title + meta + Open Graph.
 *
 * Each route renders <PageMeta> to update the browser tab title, meta
 * description, canonical URL, Open Graph tags, and optional JSON-LD.
 * We update the existing document head nodes directly so static tags from
 * index.html never win over route-specific canonical/robots values.
 *
 * Usage:
 *   function PrivacyPolicy() {
 *     return (
 *       <>
 *         <PageMeta
 *           title="Privacy Policy"
 *           description="How Wireline handles your data."
 *           path="/privacy"
 *         />
 *         ...content
 *       </>
 *     );
 *   }
 */
import { useEffect } from "react";

interface PageMetaProps {
  /** Plain title — " · Wireline" suffix is appended automatically. */
  title: string;
  description?: string;
  /** Route path (e.g. "/pricing") — used to build canonical URL and og:url. */
  path?: string;
  /** Override the default OG image URL. Defaults to /og-image.png. */
  image?: string;
  /** Add noindex for utility/auth routes that should not appear in search. */
  noIndex?: boolean;
  /** Optional page-level JSON-LD object. */
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const BRAND_SUFFIX = " · Wireline";
const SITE_URL = "https://trywireline.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

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
    : "Wireline — AI Voice & Email Agents for Every Business";
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;
  const ogImage = image || DEFAULT_OG_IMAGE;

  useEffect(() => {
    document.title = fullTitle;
    setMeta("name", "description", description || null);
    setMeta(
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1",
    );
    setCanonical(canonicalUrl || null);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description || null);
    setMeta("property", "og:url", canonicalUrl || null);
    setMeta("property", "og:image", ogImage);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "Wireline");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description || null);
    setMeta("name", "twitter:image", ogImage);
    setStructuredData(structuredData);
  }, [canonicalUrl, description, fullTitle, noIndex, ogImage, structuredData]);

  return null;
}
