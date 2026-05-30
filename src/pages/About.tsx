/**
 * /about — founder story, mission, infra moat.
 *
 * The "team of one" framing is honest and a feature, not a bug.
 * Investors doing diligence will Google "who built this." Cold
 * customers want to know there's a human accountable when their
 * agent misbehaves. Both audiences land here.
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Mail, ArrowRight, Sparkles, Phone, Plus } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

const FAQS = [
  {
    q: "What exactly is Wireline?",
    a: "Wireline is a horizontal AI agent platform. One fleet of agents answers your inbound calls, works your outbound list, replies to email, and handles SMS — trained on your playbook, live on real phone numbers, and watched from a single supervisor cockpit. You deploy your first agent in under 10 minutes, no developers required.",
  },
  {
    q: "Will it sound like a robot?",
    a: 'No. Each agent has one set personality, voice, and cadence — you pick its vibe (warm, playful, or authoritative) once, and it holds that same character for the entire call instead of lurching between tones. End-to-end response latency lands around 700–900 ms, well under the "did they hang up?" threshold, so conversations feel like talking to your sharpest rep.',
  },
  {
    q: "What happens when the agent can't do something?",
    a: "It tells the truth. Wireline agents run a hard rule: never claim an action they don't have a tool for. Instead of fabricating a booking or a transfer and hanging up, the agent takes a message, escalates to a human, or books a callback — and every one of those moments is visible in the live cockpit.",
  },
  {
    q: "Does it work for my industry?",
    a: "Yes. The platform is horizontal, but the onboarding is vertical: home services, medical, legal, real estate, insurance, restaurants, and outbound sales all have purpose-built starting points. Paste your website URL and Wireline drafts the business profile, FAQs, and escalation rules for you to approve.",
  },
  {
    q: "Can I try it before I buy?",
    a: "Two ways. Call any live demo agent from your phone right now — no signup. Or start a 14-day free trial with no credit card, deploy a real agent on a real number, run live calls, and cancel before the trial ends with no charge.",
  },
  {
    q: "Is my data secure?",
    a: "Wireline ships SOC 2-ready architecture with TLS 1.3 in transit, encrypted secrets at rest, per-tenant data isolation, full audit logs, configurable data retention, and a documented Do-Not-Call list. Business and Enterprise plans add SSO and audit-log export.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Build the product the customer would build for themselves.",
    body: "Every feature in Wireline came out of a real conversation about a real business — not a roadmap whiteboard. If a paying client asks for something and it's true to the platform, it ships within a week.",
  },
  {
    title: "Honesty over polish.",
    body: "Wireline isn't HIPAA-certified yet. We say so out loud. Marcus's medical-intake demo is labeled \"healthcare-style demo, not HIPAA-certified.\" Investors and clients both reward that kind of clarity.",
  },
  {
    title: "Solo founder, faster ship.",
    body: "No committees, no consensus rituals. When something breaks, the person who built it fixes it within the hour. When a customer wants something new, the person you talk to is the person who decides.",
  },
  {
    title: "Horizontal platform, vertical wedge.",
    body: "Wireline runs the same way for home services, medical, legal, real estate, agencies, retail. We lead outbound with vertical-specific copy because it converts, but the platform is built for any business that picks up the phone.",
  },
];

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

export default function About() {
  return (
    <>
      <PageMeta
        title="About Wireline — Built by an Operator, for Operators"
        description="Wireline is a solo-founder AI voice + email agent platform built by Michael Laurenzo. Mission, principles, and the infra stack behind every customer conversation."
        path="/about"
        structuredData={FAQ_STRUCTURED_DATA}
      />

      <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24">
        {/* Hero */}
        <section className="relative z-10 max-w-5xl mx-auto pt-4 pb-16 sm:pt-8 sm:pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-4">
              The mission
            </p>
            <h1 className="marketing-hero-title mb-6">
              Every business deserves a 24/7 front desk that actually answers.
            </h1>
            <p className="marketing-hero-lead mx-auto">
              Wireline is the AI agent platform for businesses that pick up the phone — service
              companies, clinics, law firms, agencies, retail, anyone with a customer on the other
              end of a call or an inbox. We built it because the cheapest hour an owner can buy back
              is the hour they spend triaging calls and emails.
            </p>
          </motion.div>
        </section>

        {/* Founder card */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass border border-brand/20 p-5 sm:p-8 flex flex-col sm:flex-row items-start gap-4 sm:gap-6"
          >
            <div
              className="w-14 h-14 sm:w-20 sm:h-20 flex items-center justify-center shrink-0"
              style={{
                background: "#8B3FD6",
                boxShadow: "0 8px 24px -8px rgba(107,43,153,0.4)",
              }}
              aria-hidden="true"
            >
              <WirelineMark className="w-8 h-8 sm:w-10 sm:h-10 text-white" strokeWidth={120} />
            </div>
            <div className="flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand mb-2">
                Founder
              </p>
              <h2 className="font-display italic text-3xl text-ink mb-3">Michael Laurenzo</h2>
              <p className="text-sm text-ink/80 leading-relaxed mb-3">
                Michael is a builder, leader, competitor — and an operator before he was a founder.
                Wireline started as a tool he wanted for his own businesses: an AI agent that picks
                up every call, every email, every text, and treats the customer like the owner would
                if the owner had unlimited time.
              </p>
              <p className="text-sm text-ink/80 leading-relaxed">
                He runs Wireline as a team of one by design. Shipping decisions don't go through
                committee. Customers talk to the person who builds the product. Bugs reported in the
                morning are usually fixed by lunch.
              </p>
              <a
                href="mailto:trywireline@yahoo.com"
                className="inline-flex items-center gap-2 mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-brand hover:text-[#8B3FD6] transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                trywireline@yahoo.com
              </a>
            </div>
          </motion.div>
        </section>

        {/* Operating principles */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8">
            How Wireline operates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PRINCIPLES.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="glass border border-ink/[0.08] p-5 transition-all duration-300 hover:border-brand/30"
              >
                <div
                  className="w-8 h-8 flex items-center justify-center mb-3"
                  style={{ background: "#8B3FD6" }}
                  aria-hidden="true"
                >
                  <Sparkles className="w-4 h-4 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-display italic text-xl text-ink mb-1.5 leading-tight">
                  {p.title}
                </h3>
                <p className="text-sm text-ink/70 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Infra moat / backed by */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-3">The infra moat</h2>
          <p className="text-sm sm:text-base text-ink/65 leading-relaxed mb-6 max-w-2xl">
            Wireline is built on the strongest infra layer money can buy. Every paying customer
            inherits the reliability + capability of these platforms at no incremental cost.
          </p>
          <div className="glass border border-ink/[0.08] p-5 sm:p-6">
            <IntegrationLogos />
          </div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-2">
            Questions, answered
          </h2>
          <p className="text-sm text-ink/65 mb-8">Everything you&rsquo;d ask before signing up.</p>
          <div className="border-t border-ink/[0.12]">
            {FAQS.map((faq, i) => (
              <motion.details
                key={faq.q}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                className="group border-b border-ink/[0.12]"
              >
                <summary className="flex items-start justify-between gap-4 py-4 lg:py-5 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                  <span className="font-display italic text-lg lg:text-xl text-ink leading-snug">
                    {faq.q}
                  </span>
                  <Plus
                    aria-hidden="true"
                    className="w-5 h-5 shrink-0 mt-1 text-ink/45 transition-transform duration-300 group-open:rotate-45 group-hover:text-brand"
                  />
                </summary>
                <p className="text-ink/70 leading-relaxed text-[15px] pb-5 pr-8 max-w-prose">
                  {faq.a}
                </p>
              </motion.details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-16 text-center">
          <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
            Let's get your front desk back.
          </h2>
          <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
            14-day free trial. Phone number included. No credit card. Cancel anytime.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2.5 bg-brand text-white font-medium text-sm px-7 py-3.5 hover:bg-[#8B3FD6] transition-colors duration-300"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="tel:+16305811834"
              className="inline-flex items-center gap-2 border border-ink/15 text-ink font-medium text-sm px-7 py-3.5 hover:border-brand/30 hover:text-brand transition-colors duration-300"
            >
              <Phone className="w-4 h-4" />
              Call demo line
            </a>
          </div>
        </section>

        <footer className="relative z-10 border-t border-black/8 py-8 px-4 sm:px-6 lg:px-10 xl:px-14 max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/70">
            <Link to="/" className="hover:text-ink transition-colors">
              Wireline
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/pricing" className="hover:text-ink transition-colors">
              Pricing
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/compare" className="hover:text-ink transition-colors">
              Compare
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="hover:text-ink transition-colors">
              Terms
            </Link>
          </div>
        </footer>
      </MarketingPageFrame>
    </>
  );
}
