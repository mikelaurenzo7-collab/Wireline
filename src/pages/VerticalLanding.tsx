import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Phone, ShieldCheck } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { type VerticalKey, type VerticalConfig, WEDGES } from "../data/vertical-wedges";

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

export function getVerticalSlugs(): VerticalKey[] {
  return Object.keys(WEDGES) as VerticalKey[];
}

export function getVerticalConfig(slug: VerticalKey): VerticalConfig {
  return WEDGES[slug];
}

export default function VerticalLanding({ slug }: { slug: VerticalKey }) {
  const cfg = WEDGES[slug];
  const isPersonal = slug === "personal";
  if (!cfg) return null;

  const primaryLabel = isPersonal ? "Create your assistant" : "Build your call coverage";
  const secondaryLabel = isPersonal ? "Hear a personal demo" : cfg.secondaryCta.label;
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
          { "@type": "ListItem", position: 1, name: "Wireline", item: "https://trywireline.com/" },
          {
            "@type": "ListItem",
            position: 2,
            name: cfg.metaTitle.split("—")[0].trim() || slug,
            item: `https://trywireline.com/for/${slug}`,
          },
        ],
      },
    ],
  };

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title={cfg.metaTitle}
        description={cfg.metaDescription}
        path={`/for/${slug}`}
        structuredData={structuredData}
      />

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">{isPersonal ? "Personal call help" : cfg.eyebrow}</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">{cfg.headline}</h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            {cfg.subhead}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink
              href={cfg.primaryCta.href}
              className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold"
            >
              {primaryLabel} <ArrowRight className="h-4 w-4" />
            </CtaLink>
            <CtaLink
              href={cfg.secondaryCta.href}
              className="marketing-btn-secondary min-h-12 px-6 text-[15px] font-semibold"
            >
              <Phone className="h-4 w-4" /> {secondaryLabel}
            </CtaLink>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              You approve the job and boundaries
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              You get the useful result back
            </span>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div className="wl-stitch-stat-box w-fit font-mono text-[13px] text-muted-foreground">
            <span className="wl-stitch-status-dot" aria-hidden />
            <strong className="text-foreground">{cfg.statValue}</strong>
          </div>
          <p className="max-w-3xl text-[15px] leading-7 text-muted-foreground">{cfg.statLabel}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="max-w-2xl">
          <p className="wl-stitch-eyebrow">Useful coverage</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            {isPersonal
              ? "Hand off the calls that keep following you around."
              : "Give every important call a clear next step."}
          </h2>
        </div>
        <div className="mt-9 grid gap-3 md:grid-cols-2">
          {cfg.pains.map((pain) => {
            const Icon = pain.icon;
            return (
              <article key={pain.title} className="wl-stitch-card p-5 sm:p-6">
                <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-.025em] text-foreground">
                  {pain.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{pain.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start">
          <div>
            <p className="wl-stitch-eyebrow">Call behavior</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              {isPersonal
                ? "You set the words and the limits."
                : "Your process, handled consistently."}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              {isPersonal
                ? "Give Wireline the task, what it may share, and where it should stop. You can review the outcome, take over, or keep the call private to your assistant."
                : "Give Wireline the approved facts, rules, and escalation path. It follows the same operating boundaries on every conversation."}
            </p>
          </div>
          <div className="wl-stitch-card border-l-4 border-l-primary p-6 sm:p-8">
            <p className="wl-stitch-label">Example opening</p>
            <blockquote className="mt-4 text-lg leading-8 tracking-[-.02em] text-foreground">
              {cfg.scriptPreview}
            </blockquote>
            <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
              {isPersonal
                ? "Your assistant uses the instruction you approve before the call. It should never invent identity details, agree to a commitment, or go beyond the boundaries you set."
                : "The script is grounded in the facts, rules, and escalation path you set in Studio and Knowledge."}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="wl-stitch-eyebrow">Frequently asked</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            {isPersonal
              ? "The questions people ask before handing off a call."
              : "The questions account holders ask before going live."}
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

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="wl-stitch-card border-primary bg-primary p-7 text-primary-foreground sm:p-10">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/75">
                  <ShieldCheck className="h-4 w-4" />
                  You stay in control
                </span>
                <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                  {isPersonal
                    ? "Start with the call you keep putting off."
                    : "Start with the workflow your team needs covered."}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/75">
                  {isPersonal
                    ? "Create a private assistant, set its call rules, and let it return the answer without taking over your day."
                    : "Set the role, connect the tools, define permissions, and keep a person ready for the moments that need one."}
                </p>
              </div>
              <CtaLink
                href={cfg.primaryCta.href}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-white px-5 text-sm font-semibold text-primary"
              >
                {primaryLabel} <ArrowRight className="h-4 w-4" />
              </CtaLink>
            </div>
          </div>
          <div className="mt-5 rounded border border-border bg-background p-5 text-center">
            <p className="wl-stitch-label">One Wireline, two ways to use it</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {isPersonal
                ? "Use Wireline for your own calls today. Add a business workspace later if you need customer coverage, team routing, or operational review."
                : "Run Wireline for customer coverage today. Personal call delegation remains available when you need an assistant for your own tasks too."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm font-semibold text-primary">
              <Link to="/for/personal" className="hover:underline">
                For you →
              </Link>
              <Link to="/solutions/support" className="hover:underline">
                For business →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
