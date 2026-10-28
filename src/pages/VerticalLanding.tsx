import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageMeta } from "../lib/page-meta";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { type VerticalKey, WEDGES } from "../data/vertical-wedges";

function isExternalHref(href: string): boolean {
  return /^(tel:|mailto:|https?:)/.test(href);
}

function CtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

export default function VerticalLanding({
  slug,
  canonicalPath = `/for/${slug}`,
}: {
  slug: VerticalKey;
  canonicalPath?: string;
}) {
  const cfg = WEDGES[slug];
  if (!cfg) return null;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: BOTBOUND_BRAND_NAME,
        item: `${BOTBOUND_PRODUCTION_ORIGIN}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: cfg.headline,
        item: `${BOTBOUND_PRODUCTION_ORIGIN}${canonicalPath}`,
      },
    ],
  };

  return (
    <MarketingPageFrame>
      <PageMeta
        title={cfg.metaTitle}
        description={cfg.metaDescription}
        path={canonicalPath}
        structuredData={structuredData}
      />

      <section className="marketing-section marketing-section--screen mx-auto flex max-w-3xl flex-col items-center justify-center text-center">
        <h1 className="marketing-hero-title mx-auto">{cfg.headline}</h1>
        <p className="mx-auto mt-8 max-w-md text-lg leading-8 text-muted-foreground">
          Create a Bot. Add another whenever you want one.
        </p>
        <div className="marketing-hero__actions mt-10">
          <CtaLink
            href={cfg.primaryCta.href}
            className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
          >
            Create a Bot
          </CtaLink>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
