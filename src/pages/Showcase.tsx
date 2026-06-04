/**
 * /showcase — agent templates for prospects.
 *
 * Each card is a pre-tuned persona a prospect can audition by calling
 * its live line, then deploy with one click. The marquee entry is the
 * "Singing Receptionist" (Mira): call her and she answers with a sung
 * jingle, then "catches herself" with a normal professional greeting.
 *
 * Why this exists: it gives prospects a low-pressure menu of "call this
 * number to hear exactly what an agent for your business sounds like" —
 * the most convincing path from "I'm curious" to "let me sign up."
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Phone, Sparkles, Volume2 } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { WIRELINE_DEMO_AGENTS, type ContactAgent } from "../data/contact-agents";
import { SHOWCASE_AGENTS, type ShowcaseAgent } from "../data/showcase-agents";

/**
 * Single showcase card. The marquee persona (Mira, the singing
 * receptionist) is a call-to-hear-live experience — she sings the
 * moment you connect, then catches herself with a normal greeting.
 * We surface her first-message script so prospects know what to
 * expect, then hand off to a tap-to-dial CTA.
 */
function ShowcaseCard({ agent }: { agent: ShowcaseAgent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="glass card-shimmer border border-ink/[0.1] p-6 sm:p-8 transition-all duration-300 hover:border-brand/30 hover:shadow-[0_12px_48px_rgba(139,63,214,0.08)]"
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-12 h-12 flex items-center justify-center shrink-0"
          style={{ background: agent.tint }}
          aria-hidden="true"
        >
          <Sparkles className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand mb-1.5">
            {agent.role}
          </p>
          <h3 className="font-display italic text-2xl sm:text-3xl text-ink leading-tight">
            {agent.name}
          </h3>
          <p className="text-[12px] text-ink/55 mt-1">Voice: {agent.voiceLabel}</p>
        </div>
      </div>

      <p className="text-sm sm:text-base text-ink/75 leading-relaxed mb-4">{agent.tagline}</p>

      <div className="bg-ink/[0.04] border border-ink/[0.08] p-4 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55 mb-2">
          After the jingle, she says
        </p>
        <p className="text-sm text-ink/90 italic leading-relaxed">"{agent.firstMessage}"</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a href={`tel:${agent.tel}`} className="marketing-btn-primary min-h-[48px] text-sm">
          <Phone className="w-3.5 h-3.5" />
          Call {agent.name} to hear her sing
        </a>
        <span className="font-mono text-[13px] text-ink/55">{agent.display}</span>
      </div>
    </motion.div>
  );
}

function PhoneLineCard({ agent, label }: { agent: ContactAgent; label: string }) {
  return (
    <a
      href={`tel:${agent.tel}`}
      className="group marketing-panel p-4 min-h-[56px] transition-all hover:border-brand/30 hover:shadow-[0_8px_24px_-16px_rgba(79,30,123,0.2)]"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 flex items-center justify-center shrink-0"
          style={{ background: `${agent.tint}1f`, color: agent.tint }}
        >
          <Phone className="w-4 h-4" strokeWidth={2.3} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/55 mb-1">
            {label} · {agent.name}
          </p>
          <p className="font-display italic text-lg leading-tight text-ink line-clamp-2">
            {agent.role}
          </p>
          <p className="mt-1 font-mono text-[12px] text-ink/75">{agent.display}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-ink/35 group-hover:text-ink group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
    </a>
  );
}

export default function Showcase() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
      <PageMeta
        title="Showcase — Live AI Agent Demos · Wireline"
        description="Call Wireline's voice agents live before signing up. The marquee fun demo: a singing receptionist who sings the moment you connect, then catches herself with a normal greeting."
        path="/showcase"
      />

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-10 sm:pt-8 sm:pb-14 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-4">
            The playable showcase
          </p>
          <h1 className="marketing-hero-title text-4xl sm:text-5xl mb-6">
            Audition the agents before you deploy one.
          </h1>
          <p className="marketing-hero-lead max-w-2xl mx-auto">
            Every template below is a real Wireline persona — same voice engine, same brain, same
            hand-off rules. Call any line to hear it live. Like what you hear? Spin up your own.
          </p>
        </motion.div>
      </section>

      {/* Showcase cards */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <Volume2 className="w-4 h-4 text-brand" strokeWidth={2.2} aria-hidden="true" />
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
            Give her a ring
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5">
          {SHOWCASE_AGENTS.map((agent) => (
            <ShowcaseCard key={agent.tel} agent={agent} />
          ))}
        </div>
      </section>

      {/* Vertical demo agents — one role-play line per industry Wireline
          sells into. The Wireline *team* lines deliberately do NOT appear
          here: this is a public page, and routing genuine support to a
          real specialist should require being a customer (landing hero) or
          signed in (/help console). Demos are the right thing to put in
          front of every curious visitor. Laid out 3-up so the 6 cards form
          a clean, even 3-on-3 block — pairs with Mira as the marquee card
          above. */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
            Demo lines by industry
          </span>
          <span className="h-px flex-1 bg-ink/[0.12]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {WIRELINE_DEMO_AGENTS.map((agent) => (
            <PhoneLineCard key={agent.tel} agent={agent} label="Demo" />
          ))}
        </div>
        <p className="mt-5 text-[12px] text-ink/55 text-center">
          Each line role-plays one industry so you can hear exactly what your callers would
          experience. They never reach a real person — they're demos.
        </p>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-8 text-center">
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-4 text-balance">
          Deploy your own in under a minute.
        </h2>
        <p className="marketing-hero-lead mx-auto mb-6">
          Pick a voice. Drop a knowledge base. Wireline writes the system prompt + first-message for
          you. Live in production with a real number, 14-day free trial, no credit card.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup" className="marketing-btn-primary">
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/compare" className="marketing-btn-secondary">
            Compare vs competitors
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
