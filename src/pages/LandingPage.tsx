/**
 * `/` — Wireline's dedicated marketing landing page.
 *
 * Strategic context: AuthPortal used to double as marketing surface
 * AND sign-in form, but the auth panel ate 46% of the viewport on
 * desktop and crowded out the marketing pitch. With outbound DM
 * campaigns + investor diligence both routing visitors here first,
 * the home page needs to be the strongest possible expression of
 * the product — not a cramped split-screen.
 *
 * Marketing on / — auth lives at /signin and /signup. Two-click flow
 * to signup is unchanged: hero CTA → /signup → form. The mobile
 * conversion path was already two-click; this just clarifies the
 * desktop experience.
 *
 * Design language matches /pricing, /compare, /about, and the
 * /for/<wedge> pages — same aurora backdrop, same brand tokens,
 * same italic display headlines. The whole public surface should
 * feel like one product, not five separate templates.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  MailCheck,
  Radio,
  Sparkles,
  Check,
  Shield,
  Workflow,
  Headphones,
  Users,
  BarChart3,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const FEATURE_PILLARS = [
  {
    icon: PhoneIncoming,
    title: "Inbound, 24/7",
    desc: "Pick up every call — answer questions, book appointments, dispatch on emergencies, capture intent. Never miss a $500 caller again.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound that books",
    desc: "Upload a CSV, pick a playbook, launch auto-dial. Qualified meetings on your calendar by morning — not by your sales rep grinding the phones.",
  },
  {
    icon: MailCheck,
    title: "Email agents",
    desc: "Triage your inbox, reply on-brand, follow up on quotes, escalate the ones you need to see. Cuts the inbox toil to zero.",
  },
  {
    icon: Radio,
    title: "Live supervisor cockpit",
    desc: "Listen to every call in real time, see transcripts, inject coaching mid-call, take over when it matters. Trust through transparency.",
  },
];

const VERTICALS = [
  {
    slug: "home-services",
    label: "Home Services",
    blurb: "HVAC · Plumbing · Electrical · Roofing",
  },
  { slug: "medical", label: "Medical Practices", blurb: "Dental · Chiro · Med Spa · Primary Care" },
  { slug: "legal", label: "Law Firms", blurb: "Plaintiff · Family · Criminal · Business" },
  { slug: "real-estate", label: "Real Estate", blurb: "Brokerages · Teams · Independent Agents" },
];

const PRINCIPLES = [
  {
    icon: Workflow,
    title: "Horizontal platform",
    body: "Voice + SMS + email in one console. One agent, every channel. Cross-channel context shared by default.",
  },
  {
    icon: Headphones,
    title: "Frontier reasoning",
    body: "Best-in-class LLM stack tuned for high-stakes conversation. Competitors default to mid-tier models for cost.",
  },
  {
    icon: Shield,
    title: "TCPA-clean by default",
    body: "Every disclosure + opt-out logged with rule version + state. Auditable on demand. Not a black-box service.",
  },
  {
    icon: Users,
    title: "Per-tenant tailoring",
    body: "Personality, directives, knowledge, voice, flow composer, integration scope — all per-agent. No generic personas.",
  },
];

/**
 * Live trust ticker — mirrors AuthPortal's but trimmed. Pulls from
 * /api/public/stats; auto-hides below 5 agents so the early-stage
 * platform doesn't read as pre-revenue.
 */
/**
 * Live stats strip pulled from /api/public/stats — replaces the
 * previous single-line ticker. Three real-time metrics + one static
 * brand promise; together they kill the empty space at the top of
 * the hero AND give first-time visitors immediate credibility:
 *   - active agents      (network is alive, not a demo)
 *   - calls this month   (volume is real, not vanity)
 *   - businesses on it   (other people trusted this; social proof)
 *   - response time      (~200ms is the moat number after the
 *                          showcase latency push)
 *
 * Renders skeleton dots until /api/public/stats answers, so the
 * hero never jumps. Fails gracefully — if the API errors, the
 * whole strip hides and the hero collapses to its prior layout.
 */
function LiveTrustStrip() {
  const [stats, setStats] = useState<{
    agents_online: number;
    calls_this_month: number;
    tenants: number;
  } | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setErrored(true));
  }, []);

  if (errored) return null;

  const Cell = ({ value, label, pulse }: { value: string; label: string; pulse?: boolean }) => (
    <div className="flex items-baseline gap-2">
      {pulse && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse self-center" />
      )}
      <span className="font-display italic text-xl sm:text-2xl text-ink tabular-nums">{value}</span>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.28em] text-muted/70">
        {label}
      </span>
    </div>
  );

  // Skeleton bar — same height as the hydrated one, no layout shift.
  if (!stats) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 sm:gap-x-8 gap-y-2 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-24 rounded bg-ink/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 sm:gap-x-8 gap-y-2 mb-5">
      <Cell value={stats.agents_online.toLocaleString()} label="agents live" pulse />
      <Cell value={stats.calls_this_month.toLocaleString()} label="calls this month" />
      <Cell value={stats.tenants.toLocaleString()} label="businesses on Wireline" />
      <Cell value="~200ms" label="avg response" />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen relative bg-paper text-ink">
      <PageMeta
        title="Wireline — AI Agents for Every Customer Conversation"
        description="The horizontal AI agent platform for businesses that pick up the phone. Voice, SMS, and email in one console. Bundled phone numbers. Supervisor cockpit. Built for home services, medical, legal, real estate, and every other service business."
      />

      {/* Aurora — same restrained palette as the rest of the public surface */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[25%] -left-[15%] w-[45vw] h-[45vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.12), transparent 65%)",
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[20%] -right-[15%] w-[45vw] h-[45vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Top brand bar */}
      <header className="relative z-10 px-6 lg:px-10 py-5 flex items-center justify-between">
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
        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/pricing"
            className="hidden sm:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/compare"
            className="hidden sm:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Compare
          </Link>
          <Link
            to="/about"
            className="hidden md:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            About
          </Link>
          <Link
            to="/signin"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:opacity-90 transition-opacity"
          >
            Start free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pt-10 pb-12 sm:pt-16 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <LiveTrustStrip />
          {/* Headline scales: 4xl on 360-390px so it never orphans a
              word, 5xl from sm (640px), 6xl from md, 7xl from lg. The
              <br /> on "for every" lives inside a span hidden on
              mobile — phones flow it naturally, desktop gets the
              two-line poetry. */}
          <h1 className="font-display italic text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.04] sm:leading-[1.02] tracking-tight text-ink text-balance mt-4 mb-6">
            <span className="text-brand">AI agents</span> for every
            <span className="hidden sm:inline">
              <br />
            </span>{" "}
            customer conversation.
          </h1>
          <p className="text-base sm:text-lg text-ink/75 max-w-2xl leading-relaxed mb-8">
            Wireline runs your inbound calls, outbound dialing, and email follow-up across one fleet
            of AI agents — trained on your playbook, available 24/7, and improving with every
            conversation. Dedicated voice number included on every plan.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="tel:+16305811834"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
            >
              <Phone className="w-4 h-4" />
              Call our demo line
            </a>
          </div>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 text-[10px] uppercase tracking-[0.3em] text-muted/70">
            <li className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" /> Phone number included
            </li>
            <li className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" /> No credit card to start
            </li>
            <li className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" /> Cancel anytime
            </li>
          </ul>
        </motion.div>
      </section>

      {/* Feature pillars */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURE_PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="rounded-2xl glass border border-white/10 p-5"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "#4F1E7B" }}
                >
                  <Icon className="w-5 h-5 text-on-brand" strokeWidth={2} />
                </div>
                <h3 className="font-display italic text-xl text-ink mb-1.5 leading-tight">
                  {pillar.title}
                </h3>
                <p className="text-sm text-ink/70 leading-relaxed">{pillar.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Vertical wedges */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          Built for every service business
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-2 text-balance">
          Lead with your industry — keep the platform.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-2xl mb-8 leading-relaxed">
          Wireline runs the same way for clinics, contractors, agencies, retail, insurance, finance,
          hospitality, and SaaS. We lead each industry with copy and flows tuned to their dollar
          pain — but the platform underneath is horizontal by design.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {VERTICALS.map((v, i) => (
            <motion.div
              key={v.slug}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link
                to={`/for/${v.slug}`}
                className="block rounded-2xl glass border border-white/10 p-5 hover:border-brand/40 hover:bg-white/3 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-display italic text-lg text-ink">{v.label}</h3>
                  <ArrowRight className="w-4 h-4 text-muted/40 group-hover:text-brand transition-colors mt-1" />
                </div>
                <p className="text-[11px] text-muted/75 leading-relaxed">{v.blurb}</p>
              </Link>
            </motion.div>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-muted/55 mt-5 text-center">
          + every other vertical · we configure around your business in minutes
        </p>
      </section>

      {/* How it works — three-step strip between vertical wedges and
          the demo grid. Lives here intentionally: visitors who picked
          their vertical above need to see "OK, what do I actually
          DO?" before being asked to call a demo line. Three steps,
          no marketing fluff, every step links to the place that
          executes it. Fills ~280px of dead vertical and earns the
          empty space back with operator-clarifying content. */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          How it works
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8 text-balance">
          Live in under 10 minutes.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {/* Subtle connecting line on desktop — gives the three
              cards a flow without committing to a heavy timeline UI. */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-brand/0 via-brand/25 to-brand/0"
          />
          {[
            {
              n: "01",
              title: "Pick your industry",
              body: "Choose from medical, legal, real estate, insurance, agencies, home services, and more. Wireline ships pre-tuned playbooks, vocabulary, and compliance posture for every vertical.",
              href: "/pricing",
              cta: "See plans",
            },
            {
              n: "02",
              title: "Connect a number",
              body: "We provision a dedicated phone number with your plan — or port your existing one. Forward your calls, or use the new number as your primary. Live within minutes.",
              href: "/signup",
              cta: "Start free trial",
            },
            {
              n: "03",
              title: "Wireline answers",
              body: "Inbound, outbound, SMS, and email — one fleet of agents, one cockpit. Watch every call live, jump in to whisper coach, or let the agent close the loop solo.",
              href: "/compare",
              cta: "Why us vs Air / Synthflow",
            },
          ].map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative rounded-2xl glass border border-white/10 p-5 sm:p-6 hover:border-brand/30 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-on-brand font-display italic text-sm tabular-nums shrink-0"
                  style={{ background: "#4F1E7B" }}
                >
                  {step.n}
                </div>
                <h3 className="font-display italic text-lg sm:text-xl text-ink leading-tight">
                  {step.title}
                </h3>
              </div>
              <p className="text-[13px] sm:text-sm text-ink/70 leading-relaxed mb-4">{step.body}</p>
              <Link
                to={step.href}
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
              >
                {step.cta}
                <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Demo agents grid */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          Talk to a live agent right now
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-2 text-balance">
          Four demo lines, ten personas, zero scheduling.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-2xl mb-8 leading-relaxed">
          Call any number below and you're on a real Wireline agent — same engine your customers
          would hear. The first four are our internal CS team; the next six are vertical role-plays
          so you can hear what the platform sounds like for your industry.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...WIRELINE_CONTACT_AGENTS.slice(0, 4), ...WIRELINE_DEMO_AGENTS.slice(0, 6)].map(
            (agent) => (
              <a
                key={agent.tel}
                href={`tel:${agent.tel}`}
                className="block rounded-2xl glass border border-white/10 p-4 hover:border-brand/40 hover:bg-white/3 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: agent.tint }}
                  >
                    <Phone className="w-4 h-4 text-on-brand" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-ink truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted/70 font-mono shrink-0">
                        {agent.display}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted/75 leading-snug mt-0.5 line-clamp-2">
                      {agent.role}
                    </p>
                  </div>
                </div>
              </a>
            ),
          )}
        </div>
      </section>

      {/* What makes Wireline different */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          The moat
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8 text-balance">
          Why Wireline beats the rest.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRINCIPLES.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="rounded-2xl glass border border-white/10 p-5"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: "#4F1E7B" }}
                >
                  <Icon className="w-4 h-4 text-on-brand" strokeWidth={2} />
                </div>
                <h3 className="font-display italic text-lg text-ink mb-1.5 leading-tight">
                  {p.title}
                </h3>
                <p className="text-[13px] text-ink/70 leading-relaxed">{p.body}</p>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to="/compare"
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
          >
            See the side-by-side vs Air, Synthflow, Vapi
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Integration logos / infra moat */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium text-center">
          Backed by the strongest infra layer money can buy
        </p>
        <div className="rounded-3xl glass border border-white/10 p-6 sm:p-8">
          <IntegrationLogos />
        </div>
      </section>

      {/* FAQ — sits between infra/email-composer and the pricing
          teaser so the most-blocking objections get answered BEFORE
          the visitor sees a price tag. Native <details> so each
          row is keyboard-accessible without extra JS, and the
          accordion closes on its own when the visitor opens
          another row's question. Six questions covers ~80% of the
          inbound objections we hear in sales calls. */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium text-center">
          Questions before you start
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8 text-balance text-center">
          What everyone asks first.
        </h2>
        <div className="rounded-3xl glass border border-white/10 overflow-hidden">
          {[
            {
              q: "Does it actually sound human on the phone?",
              a: "Yes — but listen, don't take our word. Call (630) 581-1834 right now. That's Liam, one of our showcase agents, running the same engine your tenants get. He uses ElevenLabs Flash for voice, Claude Sonnet 4.6 for reasoning, and a ~200ms end-to-turn latency budget. If he doesn't sound human within the first 10 seconds, send us the recording and we'll refund whatever plan you're on.",
            },
            {
              q: "How long does it take to go live?",
              a: "Under 10 minutes for the standard path. Pick your vertical, claim a number (we provision in 60 seconds), upload your knowledge base (PDFs, URLs, FAQ docs), and the agent is answering. Porting an existing number adds 1–3 business days but the agent is live on a temporary number while we wait.",
            },
            {
              q: "What about HIPAA, PCI, GDPR?",
              a: "Compliance modes are first-class. Each agent can opt into HIPAA (PHI handling + verified-caller gating), PCI (cardholder data routed to a tokenized payment link, never repeated), or GDPR (recording disclosures + opt-out honoring). Enterprise tier ships a signed BAA. Compliance directives are injected into the system prompt at runtime, not relied on as soft guidance.",
            },
            {
              q: "Does it work with my CRM and calendar?",
              a: "HubSpot, Salesforce, Pipedrive, Zoho, Gmail, Outlook, Google Calendar, and Calendly are first-party integrations. Anything else we hit via webhooks or Zapier. The agent writes call summaries, contact updates, and meeting bookings back to your source of truth — no copy-paste, no babysitting.",
            },
            {
              q: "What happens when the agent doesn't know?",
              a: "Three fallbacks, in order: (1) the agent reads from your knowledge base if there's a match, (2) it offers a clean handoff to a human you designate (warm transfer, SMS, or scheduled callback), (3) it captures the question, logs it, and sends you a summary so the next caller gets a better answer. Never fabricates.",
            },
            {
              q: "Can I switch from Air / Synthflow / Vapi?",
              a: "Yes — and we'll do it for you on Enterprise. Bring your existing prompt, your knowledge base, your phone numbers, and your CRM mapping. Our migration team rebuilds your fleet on Wireline in a parallel environment, lets you A/B test against your current platform, then ports your numbers when you're satisfied. Average switch time: 4 business days.",
            },
          ].map((item, i, arr) => (
            <details
              key={i}
              className={`group ${i < arr.length - 1 ? "border-b border-white/8" : ""}`}
            >
              <summary className="cursor-pointer list-none px-5 sm:px-6 py-4 min-h-[56px] flex items-start justify-between gap-4 hover:bg-white/3 transition-colors touch-manipulation">
                <span className="text-sm sm:text-[15px] text-ink font-medium leading-snug pt-0.5">
                  {item.q}
                </span>
                <span className="shrink-0 mt-1.5 w-5 h-5 rounded-full border border-brand/40 flex items-center justify-center text-brand text-xs group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <div className="px-5 sm:px-6 pb-5 -mt-1 text-[13px] sm:text-sm text-ink/70 leading-relaxed">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-20 text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-3 font-medium">
          Pricing
        </p>
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-4 text-balance">
          Plans from <span className="text-brand">$49/mo</span> — phone number included on every
          tier.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          No separate Twilio bill. No hidden minutes overage at low volume. 14-day free trial, no
          credit card to start.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            See plans
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            Start free trial
          </Link>
        </div>
      </section>

      {/* Final CTA + founder note */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          Get your front desk back.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          Wireline is built by an operator for operators. Bugs reported in the morning are usually
          fixed by lunch. Talk to the person who builds the product — that's the founder.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            Start 14-day free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/about"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Read the founder note →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-black/8 py-8 px-6 lg:px-10 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/60">
          <Link to="/" className="hover:text-ink transition-colors font-medium">
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
          <Link to="/about" className="hover:text-ink transition-colors">
            About
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
        <p className="text-[9px] text-muted/45 text-center mt-3 leading-relaxed">
          TLS encrypted · Carrier-grade Twilio infrastructure · TCPA compliance ledger · GDPR & CCPA
          aware
        </p>
      </footer>
    </div>
  );
}
