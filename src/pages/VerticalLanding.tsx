import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Calendar,
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
  const isEverydayCalls = slug === "personal";
  if (!cfg) return null;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: cfg.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
      {
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
            name: cfg.metaTitle.split(/\s*[\u2014|]\s*/)[0].trim() || slug,
            item: `${BOTBOUND_PRODUCTION_ORIGIN}${canonicalPath}`,
          },
        ],
      },
    ],
  };

  return (
    <MarketingPageFrame stickyCta stickyCtaHref={cfg.primaryCta.href}>
      <PageMeta
        title={cfg.metaTitle}
        description={cfg.metaDescription}
        path={canonicalPath}
        structuredData={structuredData}
      />

      <section className="marketing-section marketing-section--screen mx-auto max-w-6xl">
        <div className="mb-9 text-center">
          <h1 className="marketing-hero-title mx-auto text-[clamp(1.9rem,3.4vw,2.9rem)]">
            {cfg.headline}
          </h1>
          <div className="marketing-hero__actions mt-7">
            <CtaLink
              href={cfg.primaryCta.href}
              className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
            >
              {cfg.primaryCta.label}
            </CtaLink>
            <CtaLink
              href={cfg.secondaryCta.href}
              className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
            >
              {cfg.secondaryCta.label}
            </CtaLink>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cfg.pains.map((pain) => {
            const Icon = PAIN_ICONS[pain.icon];
            return (
              <article
                key={pain.title}
                className="wl-stitch-card marketing-pain-card flex flex-col items-center gap-4 p-5 text-center sm:p-6"
              >
                <span className="wl-accent-icon-chip grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-[-.025em] text-foreground">
                    {pain.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{pain.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="wl-stitch-display text-balance">
              {isEverydayCalls
                ? "You Shape the Voice and the Handoff"
                : "Your Process, Handled Consistently"}
            </h2>
          </div>
          <div className="wl-stitch-card marketing-script-card border-t-4 border-t-primary p-6 text-center sm:p-8">
            <blockquote
              className="text-lg leading-8 tracking-[-.02em] text-foreground"
              data-wireline-preserve-case
            >
              {cfg.scriptPreview}
            </blockquote>
          </div>
        </div>
      </section>

      <section className="marketing-section mx-auto max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="wl-stitch-display text-balance">
            {isEverydayCalls ? "Questions Before You Start" : "Questions Before You Go Live"}
          </h2>
        </div>
        <div className="mt-8 space-y-3">
          {cfg.faqs.map((faq) => (
            <details key={faq.q} className="group wl-stitch-card overflow-hidden">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                <span>{faq.q}</span>
                <span
                  aria-hidden="true"
                  className="text-lg text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="border-t border-border px-5 py-4 text-sm leading-6 text-muted-foreground">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto max-w-6xl">
          <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
            <div className="grid justify-items-center gap-7 text-center">
              <div className="max-w-2xl">
                <h2 className="text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                  {isEverydayCalls
                    ? "Start with One Everyday Task"
                    : "Start with the Workflow Your Team Needs Covered"}
                </h2>
              </div>
              <CtaLink
                href={cfg.primaryCta.href}
                className="marketing-btn-primary min-h-12 gap-2 px-5 text-sm font-semibold"
              >
                {cfg.primaryCta.label} <ArrowRight className="h-4 w-4" />
              </CtaLink>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
