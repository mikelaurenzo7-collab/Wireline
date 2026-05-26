/**
 * PageMeta — React 19 compatible per-route document title + meta + Open Graph.
 *
 * React 19 hoists <title>, <meta>, and <link> elements rendered inside
 * components up to the document <head> automatically. Each route renders
 * <PageMeta> to update the browser tab title, meta description, canonical
 * URL, and Open Graph tags for rich social sharing — no third-party library.
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

interface PageMetaProps {
  /** Plain title — " · Wireline" suffix is appended automatically. */
  title: string;
  description?: string;
  /** Route path (e.g. "/pricing") — used to build canonical URL and og:url. */
  path?: string;
  /** Override the default OG image URL. Defaults to /og-image.png. */
  image?: string;
}

const BRAND_SUFFIX = " · Wireline";
const SITE_URL = "https://trywireline.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Renders <title>, <meta name="description">, <link rel="canonical">,
 * and Open Graph tags directly into the document <head> via React 19's
 * document metadata hoisting. Falls back gracefully in older React
 * versions (the elements just render in place, harmlessly).
 */
export function PageMeta({ title, description, path, image }: PageMetaProps) {
  const fullTitle = title ? `${title}${BRAND_SUFFIX}` : "Wireline — AI Voice & Email Agents for Every Business";
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;
  const ogImage = image || DEFAULT_OG_IMAGE;

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {/* Open Graph — enables rich previews on LinkedIn, Slack, iMessage, etc. */}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Wireline" />
      {/* Twitter/X card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
    </>
  );
}
