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
import { Mail, ArrowRight, Sparkles } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import IntegrationLogos from "../components/layout/IntegrationLogos";

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

export default function About() {
  return (
    <div className="min-h-dvh relative bg-paper text-ink">
      <PageMeta
        title="About Wireline — Built by an Operator, for Operators"
        description="Wireline is a solo-founder voice-AI platform built by Mike Laurenzo. Mission, principles, and the infra stack that powers every customer call."
        path="/about"
      />

      {/* Aurora */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[25%] -left-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[20%] -right-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <header className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-14 py-5 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "#4F1E7B",
              boxShadow:
                "0 4px 14px -4px rgba(79, 30, 123 ,0.55), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <WirelineMark className="w-4 h-4 text-on-brand" strokeWidth={130} />
          </div>
          <span className="font-display italic text-xl text-ink">Wireline</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/pricing"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/compare"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Compare
          </Link>
          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:opacity-90 transition-opacity"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pt-12 pb-16 sm:pt-20 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-4 font-medium">
            The mission
          </p>
          <h1 className="font-display italic text-5xl sm:text-6xl leading-[1.05] tracking-tight text-ink text-balance mb-6">
            Every business deserves a 24/7 front desk that actually answers.
          </h1>
          <p className="text-base sm:text-lg text-ink/75 leading-relaxed max-w-2xl">
            Wireline is the AI agent platform for businesses that pick up the phone — service
            companies, clinics, law firms, agencies, retail, anyone with a customer on the other end
            of a call or an inbox. We built it because the cheapest hour an owner can buy back is
            the hour they spend triaging calls and emails.
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
          className="rounded-3xl glass border border-brand/25 p-5 sm:p-8 flex flex-col sm:flex-row items-start gap-4 sm:gap-6"
        >
          <div
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "#4F1E7B",
              boxShadow: "0 8px 24px -8px rgba(79,30,123,0.4)",
            }}
          >
            <WirelineMark className="w-8 h-8 sm:w-10 sm:h-10 text-on-brand" strokeWidth={120} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.4em] text-brand/80 mb-2 font-medium">
              Founder
            </p>
            <h2 className="font-display italic text-3xl text-ink mb-3">Mike Laurenzo</h2>
            <p className="text-sm text-ink/80 leading-relaxed mb-3">
              Mike is a builder, leader, competitor — and an operator before he was a founder.
              Wireline started as a tool he wanted for his own businesses: an AI agent that picks up
              every call, every email, every text, and treats the customer like the owner would if
              the owner had unlimited time.
            </p>
            <p className="text-sm text-ink/80 leading-relaxed">
              He runs Wireline as a team of one by design. Shipping decisions don't go through
              committee. Customers talk to the person who builds the product. Bugs reported in the
              morning are usually fixed by lunch.
            </p>
            <a
              href="mailto:trywireline@yahoo.com"
              className="inline-flex items-center gap-2 mt-4 text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
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
              className="rounded-2xl glass border border-white/10 p-5"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style={{ background: "#4F1E7B" }}
              >
                <Sparkles className="w-4 h-4 text-on-brand" strokeWidth={2} />
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
        <p className="text-sm sm:text-base text-ink/75 leading-relaxed mb-6 max-w-2xl">
          Wireline is built on the strongest infra layer money can buy. Every paying customer
          inherits the reliability + capability of these platforms at no incremental cost.
        </p>
        <div className="rounded-2xl glass border border-white/10 p-5 sm:p-6">
          <IntegrationLogos />
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          Let's get your front desk back.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          14-day free trial. Phone number included. No credit card. Cancel anytime.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="tel:+16305811834"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            Call demo line
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-black/8 py-8 px-4 sm:px-6 lg:px-10 xl:px-14 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/60">
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
    </div>
  );
}
