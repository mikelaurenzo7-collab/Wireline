import { useEffect } from "react";

interface PageMetaProps {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  imageAlt?: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const BRAND_SUFFIX = " | Wireline";
const SITE_URL = "https://trywireline.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_IMAGE_ALT =
  "Wireline voice agents for calls, texts, follow-up, browser context, email, and integrations";
const DEFAULT_TITLE = "Wireline | AI phone agents that answer, act, and report back";
const DEFAULT_DESCRIPTION =
  "Wireline creates, trains, and runs AI phone agents for personal calls and business front desks — answering calls, booking appointments, taking messages, and following up.";

function absoluteUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

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
  imageAlt,
  noIndex,
  structuredData,
}: PageMetaProps) {
  const fullTitle = title
    ? /\bWireline\b/i.test(title)
      ? title
      : `${title}${BRAND_SUFFIX}`
    : DEFAULT_TITLE;
  const resolvedDescription = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = path ? `${SITE_URL}${path}` : SITE_URL;
  const ogImage = absoluteUrl(image, DEFAULT_OG_IMAGE);
  const resolvedImageAlt = imageAlt || DEFAULT_IMAGE_ALT;

  useEffect(() => {
    document.title = fullTitle;
    setMeta("name", "description", resolvedDescription);
    setMeta("name", "application-name", "Wireline");
    setMeta(
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1",
    );
    setCanonical(canonicalUrl);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", resolvedDescription);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", ogImage);
    setMeta("property", "og:image:alt", resolvedImageAlt);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "Wireline");
    setMeta("property", "og:locale", "en_US");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@wirelineapp");
    setMeta("name", "twitter:creator", "@wirelineapp");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", resolvedDescription);
    setMeta("name", "twitter:image", ogImage);
    setMeta("name", "twitter:image:alt", resolvedImageAlt);
    setStructuredData(structuredData);
  }, [canonicalUrl, fullTitle, noIndex, ogImage, resolvedDescription, resolvedImageAlt, structuredData]);

  return null;
}
