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
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { type PainIconName, type VerticalKey, WEDGES } from "../data/vertical-wedges";

/**
 * Name -> component, kept here rather than in the wedge data so that module
 * stays free of lucide-react. See the note on PainIconName: the data module is
 * reachable from server.ts, and importing icon components there put the whole
 * icon barrel into every serverless cold start.
 */
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

export default function VerticalLanding({ slug }: { slug: VerticalKey }) {
  const cfg = WEDGES[slug];
  const isPersonal = slug === "personal";
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
            name: "Wireline",
            item: "https://trywireline.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            // metaTitles use either an em-dash or a pipe to separate the crumb
            // from the SEO tail — split on both so pipe-titled verticals don't
            // emit the entire title as the breadcrumb name.
            name: cfg.metaTitle.split(/\s*[\u2014|]\s*/)[0].trim() || slug,
            item: `https://trywireline.com/for/${slug}`,
          },
        ],
      },
    ],
  };

  return (
    <MarketingPageFrame>
      <PageMeta
        title={cfg.metaTitle}
        description={cfg.metaDescription}
        path={`/for/${slug}`}
        structuredData={structuredData}
      />

      {/* Headline, actions, and the pains they answer, on one screen. A wedge
          page's headline names a problem; making the reader scroll past an
          empty viewport to reach the problem is the wrong first move. */}
      <section className="marketing-section marketing-section--screen mx-auto max-w-6xl">
        <div className="mb-9 text-center">
          <h1 className="marketing-hero-title mx-auto max-w-[20ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
            {cfg.headline}
          </h1>
          <div className="marketing-hero__actions mt-7">
            <Link
              to={cfg.primaryCta.href}
              className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
            >
              {cfg.primaryCta.label}
            </Link>
            <Link
              to={cfg.secondaryCta.href}
              className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
            >
              {cfg.secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cfg.pains.map((pain) => {
            const Icon = PAIN_ICONS[pain.icon];
            const title = isPersonal ? PERSONAL_PAIN_TITLES[pain.title] || pain.title : pain.title;
            return (
              <article
                key={pain.title}
                className="wl-stitch-card marketing-pain-card flex flex-col items-center gap-4 p-5 text-center sm:p-6"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-muted text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-[-.025em] text-foreground">
                    {title}
                  </h3>
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
              {isPersonal
                ? "You shape the voice and the handoff."
                : "Your process, handled consistently."}
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

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto max-w-6xl">
          <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
            <div className="grid justify-items-center gap-7 text-center">
              <div className="max-w-2xl">
                <h2 className="text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                  {isPersonal
                    ? "Start with the call you keep putting off."
                    : "Start with the workflow your team needs covered."}
                </h2>
              </div>
              <CtaLink
                href={cfg.primaryCta.href}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-[var(--wireline-color-text-primary)] px-5 text-sm font-semibold text-[var(--wireline-color-canvas-default)]"
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
