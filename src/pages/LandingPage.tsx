import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, type MotionProps } from "motion/react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Ear,
  Globe,
  Mail,
  MessageSquare,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Rocket,
  ScrollText,
  Sparkles,
} from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import HeroCallPreview from "../components/marketing/HeroCallPreview";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";
import { WIRELINE_FEATURES } from "../data/wireline-knowledge";
import { WEDGES, type VerticalKey } from "../data/vertical-wedges";
import { STRIPE_PLANS } from "../lib/plan-catalog";

/* ── Source-of-truth derived data ─────────────────────────────────── */

const PERSONAL_PLAN = STRIPE_PLANS.find((p) => p.id === "personal");
const PAID_PLANS = STRIPE_PLANS.filter((p) => p.price_usd_monthly > 0);

const STATS = [
  { value: "24/7", label: "Availability" },
  { value: "<10m", label: "First agent live" },
  { value: "~800ms", label: "Voice response" },
  { value: `$${PERSONAL_PLAN?.price_usd_monthly ?? 49}`, label: "Entry plan / mo" },
] as const;

const TRUST_BADGES = ["TLS 1.3", "SOC 2 in progress", "HIPAA controls", "Stripe billing"] as const;

const CAPABILITY_ICONS = [PhoneIncoming, PhoneOutgoing, Mail, MessageSquare, Activity] as const;

const HOW_IT_WORKS = [
  {
    icon: Globe,
    title: "Paste your website",
    body: "Wireline reads your site and drafts the whole playbook — business profile, FAQs, scheduling rules, and escalation paths — before you type a word.",
  },
  {
    icon: ScrollText,
    title: "Approve the playbook",
    body: "Pick a voice and a vibe — warm, playful, or authoritative. Your agent holds one personality for the entire call and never claims an action it can't take.",
  },
  {
    icon: Rocket,
    title: "Go live on a real number",
    body: "A dedicated voice number is provisioned instantly — no Twilio account, no developers. Inbound, outbound, email, and SMS from the same fleet.",
  },
] as const;

const COCKPIT_POINTS = [
  {
    icon: Ear,
    title: "Listen in & whisper-coach",
    body: "Drop into any live call silently, or whisper guidance only your agent hears — mid-sentence course corrections without the caller ever knowing.",
  },
  {
    icon: ScrollText,
    title: "Every word on the record",
    body: "Full transcripts, sentiment, and outcomes on every interaction. When an agent escalates or takes a message, you see exactly why.",
  },
  {
    icon: Sparkles,
    title: "A fleet that gets sharper",
    body: "The self-improvement loop mines lessons from your highest-scoring calls and feeds them back into the playbook — every call sharpens the next.",
  },
] as const;

const INDUSTRIES: ReadonlyArray<{ slug: VerticalKey; label: string }> = [
  { slug: "home-services", label: "Home Services" },
  { slug: "medical", label: "Medical" },
  { slug: "legal", label: "Legal" },
  { slug: "real-estate", label: "Real Estate" },
  { slug: "insurance", label: "Insurance" },
  { slug: "restaurants", label: "Restaurants" },
  { slug: "sales", label: "Sales Teams" },
  { slug: "personal", label: "Personal" },
];

const FAQS = [
  {
    q: "What exactly is Wireline?",
    a: "Wireline is a horizontal AI agent platform. One fleet of agents answers your inbound calls, works your outbound list, replies to email, and handles SMS — trained on your playbook, live on real phone numbers, and watched from a single supervisor cockpit. You deploy your first agent in under 10 minutes, no developers required.",
  },
  {
    q: "Will it sound like a robot?",
    a: `No. Each agent has one set personality, voice, and cadence — you pick its vibe (warm, playful, or authoritative) once, and it holds that same character for the entire call instead of lurching between tones. It still adapts to whatever the caller asks, in a natural human voice. End-to-end response latency lands around 700–900 ms, well under the "did they hang up?" threshold, so conversations feel like talking to your sharpest rep.`,
  },
  {
    q: "What happens when the agent can't do something?",
    a: `It tells the truth. Wireline agents run a hard rule: never claim an action they don't have a tool for. Instead of fabricating a booking or a transfer and hanging up, the agent takes a message, escalates to a human, or books a callback — and every one of those moments is visible in the live cockpit.`,
  },
  {
    q: "Does it work for my industry?",
    a: "Yes. The platform is horizontal, but the onboarding is vertical: home services, medical, legal, real estate, insurance, restaurants, and outbound sales all have purpose-built starting points. Paste your website URL and Wireline drafts the business profile, FAQs, and escalation rules for you to approve.",
  },
  {
    q: "Can I try it before I buy?",
    a: "Two ways. Call Jordan or Jake from the hero above — no signup. Or start a 14-day free trial from the header: no credit card, deploy a real agent on a real number, run live calls, and cancel before the trial ends with no charge.",
  },
  {
    q: "Is my data secure?",
    a: "Wireline ships SOC 2-ready architecture with TLS 1.3 in transit, encrypted secrets at rest, per-tenant data isolation, full audit logs, configurable data retention, and a documented Do-Not-Call list. Business and Enterprise plans add SSO and audit-log export.",
  },
] as const;

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { to: "/pricing", label: "Pricing" },
      { to: "/showcase", label: "Demos" },
      { to: "/compare", label: "Compare" },
      { to: "/developers", label: "Developers" },
      { to: "/status", label: "Status" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/blog", label: "Blog" },
      { to: "/security", label: "Security" },
      { to: "/support", label: "Support" },
      { to: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
    ],
  },
];

/* ── Shared editorial atoms ───────────────────────────────────────── */

const REVEAL: MotionProps = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-2 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.25em] ${
        dark ? "text-paper/55" : "text-ink/65"
      }`}
    >
      <span className="h-1.5 w-1.5 bg-brand" aria-hidden="true" />
      {children}
    </p>
  );
}

function SectionHead({
  eyebrow,
  title,
  lede,
  dark = false,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  dark?: boolean;
  align?: "center" | "left";
}) {
  return (
    <motion.div
      {...REVEAL}
      className={`mb-12 lg:mb-16 ${align === "center" ? "text-center" : "text-left"}`}
    >
      <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-4 font-display text-[clamp(1.8rem,4.2vw,3.4rem)] leading-[1.02] tracking-[-0.03em] text-balance ${
          dark ? "text-paper" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={`mt-5 text-[15px] sm:text-base leading-relaxed ${
            align === "center" ? "mx-auto" : ""
          } max-w-2xl ${dark ? "text-paper/60" : "text-ink/65"}`}
        >
          {lede}
        </p>
      )}
    </motion.div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  const csDemo = LANDING_PUBLIC_DEMO_AGENTS.find((a) => a.name === "Jordan");
  const salesDemo = LANDING_PUBLIC_DEMO_AGENTS.find((a) => a.name === "Jake");

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice & Email Agents for Every Business"
        description="Deploy AI voice + email agents on real phone numbers in under 10 minutes. Inbound, outbound, and inbox — one fleet, your playbook, 24/7."
        path="/"
        structuredData={FAQ_STRUCTURED_DATA}
      />
      <div className="marketing-surface relative min-h-dvh bg-paper">
        <PublicSiteHeader active="home" />

        {/* ─── Hero — executive product scene with gutter robots ──── */}
        <section
          data-testid="hero-section"
          className="relative overflow-hidden border-b border-ink/[0.08] bg-paper pt-24 sm:pt-28 lg:pt-32 pb-14 lg:pb-20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.34] [background-image:linear-gradient(to_right,rgba(26,22,20,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(26,22,20,0.04)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-16 h-px bg-ink/[0.08]"
          />
          <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,0.78fr)] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl text-left"
            >
              <span className="inline-flex items-center gap-2 border border-ink/[0.12] bg-white/[0.35] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-ink/72 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset]">
                <span className="h-1.5 w-1.5 bg-brand" aria-hidden="true" />
                Phone · Email · SMS
              </span>

              <h1 className="mt-7 max-w-4xl font-display text-[clamp(3rem,7vw,7.1rem)] leading-[0.88] tracking-[-0.075em] text-ink text-balance">
                AI agents that answer every customer like your best rep.
              </h1>

              <p className="mt-7 max-w-2xl text-[clamp(1rem,1.45vw,1.28rem)] leading-relaxed text-ink/68">
                Deploy a trained agent fleet on real phone numbers in minutes. Handle inbound calls,
                qualify leads, book appointments, send follow-ups, and keep every interaction
                visible from one supervisor cockpit.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/signup"
                  data-testid="hero-primary-cta"
                  className="inline-flex min-h-12 items-center justify-center bg-ink px-6 text-[14px] font-semibold text-paper transition-transform duration-200 hover:-translate-y-px"
                >
                  Start free trial
                </Link>
                <Link
                  to="/showcase"
                  data-testid="hero-showcase-link"
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-ink/[0.14] bg-white/[0.28] px-6 text-[14px] font-semibold text-ink transition-colors hover:bg-white/60"
                >
                  Hear live demos
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>

              <div
                data-testid="hero-trust-badges"
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/[0.1] pt-5"
                aria-label="Security and compliance"
              >
                {TRUST_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-ink/58"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </motion.div>

            <div className="relative lg:pt-7">
              <div
                aria-hidden="true"
                className="absolute -left-4 -top-4 h-16 w-16 border-l border-t border-ink/[0.14]"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-5 -right-4 h-20 w-20 border-b border-r border-ink/[0.14]"
              />
              <HeroCallPreview />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mx-auto mt-12 w-full max-w-4xl"
          >
            <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-ink/48">
              Live demo — no signup
            </p>

            <div className="grid grid-cols-1 gap-3 border border-ink/[0.1] bg-[#FBF8F0]/90 p-3 shadow-[0_1px_0_rgba(255,255,255,0.75)_inset] sm:grid-cols-2 sm:p-4">
              {csDemo && (
                <div className="flex flex-col items-center border border-ink/[0.08] bg-white/[0.48] p-4 text-center transition-colors duration-200 hover:bg-white/[0.68]">
                  <p className="mb-3 text-[12px] font-semibold tracking-tight text-ink/70">
                    Jordan · Inbound Support
                  </p>
                  <BrowserCallWidget
                    agentName={csDemo.name}
                    buttonLabel={`Talk to ${csDemo.name}`}
                  />
                  <a
                    href={`tel:${csDemo.tel}`}
                    className="mt-3.5 font-mono text-[13px] tracking-tight text-brand transition-colors hover:text-brand/80"
                  >
                    {csDemo.display}
                  </a>
                </div>
              )}
              {salesDemo && (
                <div className="flex flex-col items-center border border-ink/[0.08] bg-white/[0.48] p-4 text-center transition-colors duration-200 hover:bg-white/[0.68]">
                  <p className="mb-3 text-[12px] font-semibold tracking-tight text-ink/70">
                    Jake · Outbound Sales
                  </p>
                  <BrowserCallWidget
                    agentName={salesDemo.name}
                    buttonLabel={`Talk to ${salesDemo.name}`}
                  />
                  <a
                    href={`tel:${salesDemo.tel}`}
                    className="mt-3.5 font-mono text-[13px] tracking-tight text-brand transition-colors hover:text-brand/80"
                  >
                    {salesDemo.display}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* ─── Proof band ─────────────────────────────────────────── */}
        <section data-testid="proof-section" className="border-b border-ink/[0.08] py-14 lg:py-20">
          <div className="mx-auto w-full max-w-7xl">
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-ink/[0.08] bg-ink/[0.08] lg:grid-cols-4">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-paper p-7 sm:p-9 lg:p-11"
                >
                  <p className="font-display text-[clamp(2rem,4.4vw,3.6rem)] leading-none tracking-tight text-ink">
                    {stat.value}
                  </p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/65 sm:text-[11px]">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Capabilities — one fleet, every channel ────────────── */}
        <section data-testid="capabilities-section" className="py-20 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <SectionHead
              eyebrow="One fleet, every channel"
              title="Five jobs your fleet takes off your plate on day one."
              lede="The same agents, the same playbook, the same memory of every customer — across phone, email, and SMS. No per-channel vendors to stitch together."
            />

            <div className="grid grid-cols-1 gap-px border border-ink/[0.08] bg-ink/[0.08] md:grid-cols-2 xl:grid-cols-5">
              {WIRELINE_FEATURES.map((feature, i) => {
                const Icon = CAPABILITY_ICONS[i] ?? Activity;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="group flex flex-col bg-paper p-6 transition-colors duration-200 hover:bg-white/[0.55] lg:p-7"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center border border-ink/[0.12] bg-white/[0.45] text-brand">
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.2em] text-ink/35">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-lg leading-snug tracking-tight text-ink lg:text-xl">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-ink/65">
                      {feature.blurb}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── How it works ───────────────────────────────────────── */}
        <section
          data-testid="how-it-works-section"
          className="border-y border-ink/[0.08] bg-[#FBF8F0]/70 py-20 lg:py-28"
        >
          <div className="mx-auto w-full max-w-6xl">
            <SectionHead
              eyebrow="Under 10 minutes"
              title="From website to working agent in three steps."
              lede="No developers, no prompt engineering, no phone-system migration. If you can paste a URL, you can deploy a fleet."
            />

            <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6 lg:gap-10">
              {HOW_IT_WORKS.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  className="relative border-t-2 border-brand/70 pt-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-3xl leading-none text-ink/25 lg:text-4xl">
                      {i + 1}
                    </span>
                    <span className="grid h-9 w-9 place-items-center border border-ink/[0.12] bg-white/[0.5] text-brand">
                      <step.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl tracking-tight text-ink lg:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink/65">{step.body}</p>
                </motion.div>
              ))}
            </div>

            <motion.div {...REVEAL} className="mt-12 text-center">
              <Link
                to="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-7 text-[14px] font-semibold text-paper transition-transform duration-200 hover:-translate-y-px"
              >
                Deploy your first agent
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink/45">
                14-day trial · No card required
              </p>
            </motion.div>
          </div>
        </section>

        {/* ─── Supervisor cockpit — dark band ─────────────────────── */}
        <section data-testid="cockpit-section" className="bg-ink py-20 text-paper lg:py-28">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <SectionHead
                dark
                align="left"
                eyebrow="The supervisor cockpit"
                title="Autonomous never means unsupervised."
                lede="Live Ops is your trading floor: every call on the board, every agent accountable, every escalation one click from a human."
              />

              <div className="-mt-4 space-y-7">
                {COCKPIT_POINTS.map((point) => (
                  <motion.div key={point.title} {...REVEAL} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center border border-paper/[0.14] bg-paper/[0.04] text-paper/85">
                      <point.icon
                        className="h-[18px] w-[18px]"
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h3 className="font-display text-lg tracking-tight text-paper">
                        {point.title}
                      </h3>
                      <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-paper/60">
                        {point.body}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Static cockpit board mock */}
            <motion.div
              {...REVEAL}
              aria-hidden="true"
              className="border border-paper/[0.12] bg-[#221C19] shadow-[0_30px_80px_-50px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-center justify-between border-b border-paper/[0.1] px-5 py-3.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/55">
                  Live Ops · Floor
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  3 on call
                </span>
              </div>

              <div className="divide-y divide-paper/[0.07]">
                {[
                  {
                    agent: "Sarah",
                    line: "Inbound · booking Sat 9:30",
                    time: "0:42",
                    tone: "warm",
                  },
                  {
                    agent: "Jake",
                    line: "Outbound · qualifying lead (BANT)",
                    time: "2:18",
                    tone: "playful",
                  },
                  {
                    agent: "Jordan",
                    line: "Support · warranty question",
                    time: "1:05",
                    tone: "warm",
                  },
                ].map((row) => (
                  <div key={row.agent} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center bg-brand font-display text-sm text-white">
                      {row.agent[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-paper/90">
                        {row.agent}
                        <span className="ml-2 border border-brand/30 bg-brand/[0.12] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-paper/70">
                          {row.tone}
                        </span>
                      </p>
                      <p className="truncate text-[11.5px] text-paper/50">{row.line}</p>
                    </div>
                    <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-paper/60">
                      <PhoneCall className="h-3 w-3 text-emerald-400" />
                      {row.time}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-paper/[0.1] bg-paper/[0.03] px-5 py-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/40">
                  Whisper to Sarah
                </p>
                <p className="mt-1.5 text-[12.5px] italic text-paper/70">
                  &ldquo;Offer the 2:15 slot first — morning crew is booked.&rdquo;
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ─── Industries ─────────────────────────────────────────── */}
        <section data-testid="industries-section" className="py-20 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <SectionHead
              eyebrow="Vertical onboarding"
              title="Horizontal platform. Purpose-built starting points."
              lede="Every industry gets its own playbook, demo agent, and escalation rules — not a generic script with your name pasted in."
            />

            <div className="grid grid-cols-1 gap-px border border-ink/[0.08] bg-ink/[0.08] sm:grid-cols-2 xl:grid-cols-4">
              {INDUSTRIES.map(({ slug, label }, i) => {
                const wedge = WEDGES[slug];
                return (
                  <motion.div
                    key={slug}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: (i % 4) * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-paper"
                  >
                    <Link
                      to={`/for/${slug}`}
                      className="group flex h-full flex-col p-6 transition-colors duration-200 hover:bg-white/[0.55] lg:p-7"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
                          {label}
                        </span>
                        <ArrowUpRight
                          className="h-4 w-4 text-ink/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-4 font-display text-[17px] leading-snug tracking-tight text-ink lg:text-lg">
                        {wedge.headline}
                      </p>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Integrations ───────────────────────────────────────── */}
        <section
          data-testid="integrations-section"
          className="border-y border-ink/[0.08] bg-[#FBF8F0]/70 py-16 lg:py-20"
        >
          <div className="mx-auto w-full max-w-5xl">
            <SectionHead eyebrow="Your stack" title="Plugs into the tools you already run." />
            <IntegrationLogos compact />
          </div>
        </section>

        {/* ─── Pricing teaser ─────────────────────────────────────── */}
        <section data-testid="pricing-teaser-section" className="py-20 lg:py-28">
          <div className="mx-auto w-full max-w-7xl">
            <SectionHead
              eyebrow="Honest unit economics"
              title="Priced like a tool, not a headcount."
              lede="Every plan includes dedicated voice numbers — no Twilio account, no per-seat games. Start free for 14 days on any tier."
            />

            <div className="grid grid-cols-1 gap-px border border-ink/[0.08] bg-ink/[0.08] sm:grid-cols-2 xl:grid-cols-4">
              {PAID_PLANS.map((plan, i) => {
                const highlight = plan.id === "pro";
                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex flex-col p-6 lg:p-7 ${
                      highlight ? "bg-ink text-paper" : "bg-paper text-ink"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3
                        className={`font-mono text-[11px] uppercase tracking-[0.22em] ${
                          highlight ? "text-paper/70" : "text-ink/60"
                        }`}
                      >
                        {plan.name}
                      </h3>
                      {highlight && (
                        <span className="border border-paper/25 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-paper/75">
                          Most popular
                        </span>
                      )}
                    </div>
                    <p className="mt-4 font-display text-4xl leading-none tracking-tight">
                      ${plan.price_usd_monthly.toLocaleString()}
                      <span
                        className={`ml-1 align-baseline font-sans text-[13px] font-normal ${
                          highlight ? "text-paper/55" : "text-ink/50"
                        }`}
                      >
                        /mo
                      </span>
                    </p>
                    <ul
                      className={`mt-5 flex-1 space-y-2.5 text-[13px] leading-snug ${
                        highlight ? "text-paper/75" : "text-ink/70"
                      }`}
                    >
                      {[
                        `${plan.max_agents} AI agent${plan.max_agents === 1 ? "" : "s"} (voice + email)`,
                        `${plan.voice_minutes_monthly.toLocaleString()} voice minutes / month`,
                        `${plan.included_phone_numbers} dedicated number${
                          plan.included_phone_numbers === 1 ? "" : "s"
                        } included`,
                      ].map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <Check
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              highlight ? "text-emerald-400" : "text-brand"
                            }`}
                            strokeWidth={2.4}
                            aria-hidden="true"
                          />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={`/signup?plan=${plan.id}`}
                      className={`mt-6 inline-flex min-h-11 items-center justify-center text-[13px] font-semibold transition-transform duration-200 hover:-translate-y-px ${
                        highlight
                          ? "bg-paper text-ink"
                          : "border border-ink/[0.16] bg-white/[0.35] text-ink hover:bg-white/60"
                      }`}
                    >
                      Start free trial
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            <motion.p {...REVEAL} className="mt-8 text-center text-[13px] text-ink/60">
              Need 100+ agents, SAML SSO, or an SLA?{" "}
              <Link
                to="/pricing"
                className="font-semibold text-brand underline-offset-4 hover:underline"
              >
                See full pricing &amp; Enterprise
              </Link>
            </motion.p>
          </div>
        </section>

        {/* ─── FAQ ────────────────────────────────────────────────── */}
        <section data-testid="faq-section" className="border-t border-ink/[0.08] py-20 lg:py-28">
          <div className="mx-auto w-full max-w-3xl">
            <SectionHead
              eyebrow="Questions, answered"
              title="Everything you'd ask your best rep."
            />

            <div className="border-t border-ink/[0.12]">
              {FAQS.map((faq, i) => (
                <motion.details
                  key={faq.q}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                  className="group border-b border-ink/[0.12]"
                  data-testid={`faq-item-${i}`}
                >
                  <summary className="flex cursor-pointer list-none select-none items-start justify-between gap-4 px-1 py-5 lg:py-6 [&::-webkit-details-marker]:hidden">
                    <span className="pr-4 font-display text-base leading-snug text-ink sm:text-lg lg:text-xl">
                      {faq.q}
                    </span>
                    <Plus
                      aria-hidden="true"
                      className="mt-1 h-5 w-5 shrink-0 text-ink/45 transition-transform duration-300 group-open:rotate-45 group-hover:text-brand"
                    />
                  </summary>
                  <p className="max-w-prose pb-6 pr-8 text-[13px] leading-relaxed text-ink/70 sm:text-[15px]">
                    {faq.a}
                  </p>
                </motion.details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA band ─────────────────────────────────────── */}
        <section
          data-testid="final-cta-section"
          className="relative overflow-hidden bg-ink py-20 text-paper lg:py-28"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.25] [background-image:linear-gradient(to_right,rgba(239,233,220,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(239,233,220,0.045)_1px,transparent_1px)] [background-size:72px_72px]"
          />
          <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
            <motion.div {...REVEAL}>
              <Eyebrow dark>Right now, a call is going to voicemail</Eyebrow>
              <h2 className="mt-5 font-display text-[clamp(2.4rem,5.6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] text-paper text-balance">
                Your next missed call doesn&rsquo;t have to be.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-paper/60 sm:text-base">
                Deploy a trained agent on a real number before your coffee cools. 14 days free, no
                card, cancel in one click.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-paper px-7 text-[14px] font-semibold text-ink transition-transform duration-200 hover:-translate-y-px"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {csDemo && (
                  <a
                    href={`tel:${csDemo.tel}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-paper/[0.22] px-7 text-[14px] font-semibold text-paper transition-colors hover:bg-paper/[0.06]"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    Call a live agent — {csDemo.display}
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer
          data-testid="landing-footer"
          className="border-t border-paper/[0.08] bg-ink text-paper"
        >
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12 lg:py-20">
            <div className="mb-16 grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
              <div className="col-span-2 md:col-span-1">
                <p className="mb-3 font-display text-2xl text-paper/90">Wireline</p>
                <p className="max-w-xs text-[13px] leading-relaxed text-paper/55">
                  AI voice + email agents for every business. One fleet, your playbook, 24/7.
                </p>
              </div>
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/45">
                    {col.title}
                  </p>
                  <ul className="space-y-2.5">
                    {col.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          className="text-[13px] text-paper/60 transition-colors hover:text-paper"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-start justify-between gap-4 border-t border-paper/[0.08] pt-8 md:flex-row md:items-center">
              <p className="font-mono text-[11px] tracking-[0.08em] text-paper/40">
                &copy; {new Date().getFullYear()} Wireline Inc.
              </p>
              <Link
                to="/signin"
                data-testid="footer-signin"
                className="text-[13px] text-paper/55 transition-colors hover:text-paper"
              >
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
