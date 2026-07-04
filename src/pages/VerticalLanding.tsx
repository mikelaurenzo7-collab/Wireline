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

const PERSONAL_PAIN_TITLES: Record<string, string> = {
  "Debt negotiation calls": "Debt negotiation",
  "Appointment booking you keep putting off": "Appointments",
  "Returns, billing disputes, customer service": "Billing disputes",
  "Phone anxiety, social avoidance, neurodivergence": "Phone anxiety",
};

const PERSONAL_FAQ_TITLES: Record<string, string> = {
  "Is it actually legal for an AI to make calls on my behalf?": "Can AI call for me?",
  "Can it really negotiate debt? Won't the collector just hang up on a robot?":
    "Can it negotiate debt?",
  "What about voicemail / hold music / phone trees? Doesn't that break it?":
    "Phone trees, voicemail, hold music?",
  "How is this different from just having a friend or family member call for me?":
    "Why not ask a friend?",
  "What can't it do?": "What can't it do?",
};

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

  const primaryLabel = isPersonal ? "Create agent" : "Build call coverage";
  const secondaryLabel = isPersonal ? "Hear demo" : cfg.secondaryCta.label;
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

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-12 text-center sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <p className="wl-stitch-eyebrow">{isPersonal ? "Personal call help" : cfg.eyebrow}</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">{cfg.headline}</h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            {isPersonal
              ? "Offload the calls that follow you around."
              : "Every important call gets a clear next step."}
          </p>
          <div className="mt-7 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
            <CtaLink
              href={cfg.primaryCta.href}
              className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
            >
              {primaryLabel} <ArrowRight className="h-4 w-4" />
            </CtaLink>
            <CtaLink
              href={cfg.secondaryCta.href}
              className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
            >
              <Phone className="h-4 w-4" /> {secondaryLabel}
            </CtaLink>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Your voice
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              Clear outcomes
            </span>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto grid max-w-3xl justify-items-center gap-4 text-center">
          <div className="wl-stitch-stat-box w-fit font-mono text-[var(--wireline-typography-caption-size)] text-muted-foreground">
            <span className="wl-stitch-status-dot" aria-hidden />
            <strong className="text-foreground">{cfg.statValue}</strong>
          </div>
          <p className="max-w-2xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
            {isPersonal
              ? "Text what you need. It calls, handles the back-and-forth, and reports back."
              : cfg.statLabel}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="wl-stitch-eyebrow">Useful coverage</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            {isPersonal
              ? "Hand off the calls that keep following you around."
              : "Give every important call a clear next step."}
          </h2>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {cfg.pains.map((pain) => {
            const Icon = pain.icon;
            const title = isPersonal ? PERSONAL_PAIN_TITLES[pain.title] || pain.title : pain.title;
            return (
              <article
                key={pain.title}
                className="wl-stitch-card marketing-pain-card flex items-center gap-4 p-5 sm:p-6"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-muted text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="text-lg font-semibold tracking-[-.025em] text-foreground">
                  {title}
                </h3>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="wl-stitch-eyebrow">Call behavior</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              {isPersonal
                ? "You shape the voice and the handoff."
                : "Your process, handled consistently."}
            </h2>
          </div>
          <div className="wl-stitch-card marketing-script-card border-l-4 border-l-primary p-6 sm:p-8">
            <p className="wl-stitch-label">Example opening</p>
            <blockquote
              className="mt-4 text-lg leading-8 tracking-[-.02em] text-foreground"
              data-wireline-preserve-case
            >
              {cfg.scriptPreview}
            </blockquote>
            <p
              className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted-foreground"
              data-wireline-preserve-case
            >
              Your voice. Your knowledge. Your control.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="wl-stitch-eyebrow">Frequently asked</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            {isPersonal ? "Questions before you hand off a call." : "Questions before you go live."}
          </h2>
        </div>
        <div className="mt-8 space-y-3">
          {cfg.faqs.map((faq) => {
            const question = isPersonal ? PERSONAL_FAQ_TITLES[faq.q] || faq.q : faq.q;
            return (
              <details key={faq.q} className="group wl-stitch-card overflow-hidden">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-semibold text-foreground">
                  <span>{question}</span>
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
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
            <div className="grid justify-items-center gap-7 text-center">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--wireline-color-text-secondary)]">
                  <ShieldCheck className="h-4 w-4" />
                  You stay in control
                </span>
                <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                  {isPersonal
                    ? "Start with the call you keep putting off."
                    : "Start with the workflow your team needs covered."}
                </h2>
              </div>
              <CtaLink
                href={cfg.primaryCta.href}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-[var(--wireline-color-text-primary)] px-5 text-sm font-semibold text-[var(--wireline-color-canvas-default)]"
              >
                {primaryLabel} <ArrowRight className="h-4 w-4" />
              </CtaLink>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
