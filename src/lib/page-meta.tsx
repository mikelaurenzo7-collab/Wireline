/**
 * usePageMeta — React 19 compatible per-route document title + meta description.
 *
 * React 19 hoists <title> and <meta> elements rendered inside components
 * up to the document <head> automatically. This hook returns a <PageMeta>
 * component that each route can render to update the browser tab title,
 * social og:title, and meta description without a third-party library.
 *
 * Usage:
 *   function PrivacyPolicy() {
 *     return (
 *       <>
 *         <PageMeta title="Privacy Policy" description="..." />
 *         ...content
 *       </>
 *     );
 *   }
 */

interface PageMetaProps {
  /** Plain title — " · Wireline" suffix is appended automatically. */
  title: string;
  description?: string;
}

const BRAND_SUFFIX = " · Wireline";

/**
 * Renders <title> and <meta name="description"> directly into the document
 * <head> via React 19's document metadata hoisting. Falls back gracefully
 * in older React versions (the elements just render in place, harmlessly).
 */
export function PageMeta({ title, description }: PageMetaProps) {
  const fullTitle = title ? `${title}${BRAND_SUFFIX}` : "Wireline — AI Voice & Email Agents for Every Business";
  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
    </>
  );
}
