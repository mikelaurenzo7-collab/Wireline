/**
 * Vertical-wedge landing pages — one shared component, N configs.
 *
 * Strategic context: Wireline is a horizontal platform (works for any
 * business that handles inbound calls + emails), but outbound efficiency
 * lifts 5-10x when the wedge message is specific. A DM that opens with
 * "AI receptionist for HVAC owners that never misses a $500 after-hours
 * call" converts dramatically better than "we do AI agents for service
 * businesses." Each wedge gets its own URL so the DM links land on
 * vertical-specific copy without committing the brand to a vertical.
 *
 * Stripe checkout stays open to everyone — the wedge is a marketing
 * device, not a product gate.
 *
 * Adding a new wedge: drop a new entry in `WEDGES`, route it from
 * App.tsx. ~20 lines per vertical.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, PhoneIncoming, Phone, Check } from "lucide-react";
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
  if (!cfg) return null;
  // Combine FAQ + Breadcrumb in a single @graph so Google can pick up
  // both rich-result types from one JSON-LD block.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: cfg.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
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
            name: cfg.metaTitle.split("—")[0].trim() || slug,
            item: `https://trywireline.com/for/${slug}`,
          },
        ],
      },
    ],
  };

  return (
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
      <PageMeta
        title={cfg.metaTitle}
        description={cfg.metaDescription}
        path={`/for/${slug}`}
        structuredData={structuredData}
      />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-14 sm:pt-10 sm:pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-eyebrow text-brand mb-4">{cfg.eyebrow}</p>
          <h1 className="marketing-hero-title text-4xl sm:text-5xl lg:text-6xl mb-5">
            {cfg.headline}
          </h1>
          <p className="marketing-hero-lead max-w-2xl mx-auto mb-8">{cfg.subhead}</p>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3">
            <CtaLink
              href={cfg.primaryCta.href}
              className="marketing-btn-primary w-full sm:w-auto min-h-[48px]"
            >
              {cfg.primaryCta.label}
              <ArrowRight className="w-4 h-4" />
            </CtaLink>
            <a
              href={cfg.secondaryCta.href}
              className="marketing-btn-secondary w-full sm:w-auto min-h-[48px]"
            >
              <PhoneIncoming className="w-4 h-4" />
              {cfg.secondaryCta.label}
            </a>
          </div>
        </motion.div>
      </section>

      {/* Stat band */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="wl-panel border border-brand/25 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8"
        >
          <div className="font-display italic text-5xl sm:text-6xl text-brand leading-none shrink-0 stat-shimmer">
            {cfg.statValue}
          </div>
          <p className="text-sm sm:text-base text-ink/80 leading-relaxed">{cfg.statLabel}</p>
        </motion.div>
      </section>

      {/* Pain points */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8">
          What your AI agent handles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-children">
          {cfg.pains.map((pain, i) => {
            const Icon = pain.icon;
            return (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="wl-panel card-shimmer border border-white/10 p-5 transition-all duration-300 hover:border-brand/30"
              >
                <div className="w-10 h-10 flex items-center justify-center mb-3 bg-brand">
                  <Icon className="w-5 h-5 text-on-brand" strokeWidth={2} />
                </div>
                <h3 className="font-display italic text-xl text-ink mb-1.5">{pain.title}</h3>
                <p className="text-sm text-ink/70 leading-relaxed">{pain.body}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Script preview */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        <p className="app-section-title/70 mb-3">What callers hear</p>
        <blockquote className="wl-panel border-l-4 border-brand p-6 sm:p-8 italic text-lg sm:text-xl text-ink/85 leading-relaxed">
          {cfg.scriptPreview}
        </blockquote>
        <p className="text-[10px] text-muted/70 mt-3 leading-relaxed">
          Wireline composes this script from your business name, role, calendar, and CRM. You
          customize tone + flow in 5 minutes — no developer required.
        </p>
      </section>

      {/* FAQ — vertical-specific objection handling. Renders inline
          accordion-style so the visitor doesn't have to scroll past
          to the CTA. Each Q&A is the answer to the most common
          conversion blocker in THIS vertical. */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          Frequently asked
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8 text-balance">
          The things {cfg.eyebrow.toLowerCase().replace(/^for /, "")} ask before they sign up.
        </h2>
        <div className="space-y-3">
          {cfg.faqs.map((faq, i) => (
            <motion.details
              key={faq.q}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group wl-panel border border-white/10 overflow-hidden"
            >
              <summary className="cursor-pointer list-none px-5 py-4 sm:py-4 min-h-[56px] flex items-start gap-3 hover:bg-white/3 transition-colors touch-manipulation">
                <span className="text-[10px] uppercase tracking-[0.3em] text-brand/70 mt-1 shrink-0 font-mono">
                  Q{i + 1}
                </span>
                <span className="flex-1 text-sm sm:text-base text-ink font-medium leading-snug">
                  {faq.q}
                </span>
                <span
                  aria-hidden="true"
                  className="text-muted/70 transition-transform group-open:rotate-45 text-xl leading-none mt-0.5"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-4 pl-4 md:pl-[58px] text-sm text-ink/75 leading-relaxed">
                {faq.a}
              </div>
            </motion.details>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          Try it on your business this week.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          14-day free trial. No credit card. We'll port your business number for free if you want to
          take it production.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <CtaLink
            href={cfg.primaryCta.href}
            className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-brand to-brand-deep text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            {cfg.primaryCta.label}
            <ArrowRight className="w-4 h-4" />
          </CtaLink>
          <a
            href={cfg.secondaryCta.href}
            className="inline-flex items-center gap-2 px-5 py-3 wl-panel border border-border text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            <Phone className="w-4 h-4" />
            {cfg.secondaryCta.label}
          </a>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.3em] text-muted/70">
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-brand" /> 14-day free trial
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-brand" /> No credit card
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-brand" /> Cancel anytime
          </li>
        </ul>
      </section>

      {/* Platform footer — wedge lead is a marketing device, not a
          product gate. Stripe checkout accepts any vertical at any
          tier; we lead with the {vertical} message because it makes
          DMs convert better, but every customer gets the full
          horizontal platform. */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 pb-12">
        <div className="wl-panel border border-white/10 p-5 sm:p-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.35em] text-brand/80 mb-2">
            Built for every service business
          </p>
          <p className="text-sm sm:text-base text-ink/80 leading-relaxed max-w-2xl mx-auto">
            Wireline runs the same way for clinics, agencies, contractors, retail, insurance,
            finance, hospitality, and SaaS. We lead the conversation with{" "}
            {cfg.eyebrow.toLowerCase().replace(/^for /, "")} because the ROI is concrete and easy to
            explain — but the platform is horizontal by design. Bring any inbound-call or
            email-driven business and Wireline configures around it in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-4 text-[10px] uppercase tracking-[0.28em] text-muted/70">
            <Link to="/for/home-services" className="hover:text-brand transition-colors">
              Home Services
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/for/medical" className="hover:text-brand transition-colors">
              Medical
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/for/legal" className="hover:text-brand transition-colors">
              Legal
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/for/real-estate" className="hover:text-brand transition-colors">
              Real Estate
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/pricing" className="hover:text-brand transition-colors">
              Every other vertical →
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-8">
        <p className="text-caption text-center max-w-2xl mx-auto leading-relaxed">
          {cfg.trustLine}
        </p>
      </section>
    </MarketingPageFrame>
  );
}
