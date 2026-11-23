import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  MailCheck,
  Phone,
  PhoneIncoming,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { type PainIconName, type VerticalKey, WEDGES } from "../data/vertical-wedges";

/** The one place pain icon names become components (see vertical-wedges.ts). */
const PAIN_ICONS: Record<PainIconName, LucideIcon> = {
  Calendar,
  Clock,
  DollarSign,
  MailCheck,
  Phone,
  PhoneIncoming,
  Shield,
  Sparkles,
};

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

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {cfg.eyebrow}
            </p>
            <h1 className="marketing-hero-title mx-auto">{cfg.headline}</h1>
            <p className="wl-public-copy mx-auto max-w-2xl">{cfg.metaDescription}</p>
            <div className="marketing-hero__actions">
              <CtaLink
                href={cfg.primaryCta.href}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                {cfg.primaryCta.label}
              </CtaLink>
              <Link
                to="/pricing"
                className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
              >
                See Pricing
              </Link>
            </div>
          </header>

          <ul className="wl-features-pillars" aria-label="What Your Bot Handles">
            {cfg.pains.map(({ icon, title, body }) => {
              const Icon = PAIN_ICONS[icon];
              return (
                <li key={title} className="wl-features-pillar">
                  <div className="landing-prestige__card-head">
                    <span className="landing-prestige__card-icon" aria-hidden="true">
                      <Icon className="size-4" />
                    </span>
                    <h2 className="wl-features-pillar__title">{title}</h2>
                  </div>
                  <p className="wl-features-pillar__body">{body}</p>
                </li>
              );
            })}
          </ul>

          <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-6 text-muted-foreground">
            {cfg.trustLine}
          </p>

          <section aria-labelledby="vertical-faq" className="mx-auto mt-14 max-w-2xl">
            <h2 id="vertical-faq" className="text-center text-xl font-semibold">
              Common Questions
            </h2>
            <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
              {cfg.faqs.map(({ q, a }) => (
                <details key={q} className="group px-5">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold wl-focus-ring-halo [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-4 text-sm leading-6 text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="mx-auto mt-14 max-w-2xl text-center">
            <p className="text-3xl font-semibold">{cfg.statValue}</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {cfg.statLabel}
            </p>
            <div className="marketing-hero__actions">
              <CtaLink
                href={cfg.primaryCta.href}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                {cfg.primaryCta.label}
              </CtaLink>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
