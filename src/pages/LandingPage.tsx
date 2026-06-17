import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, type MotionProps } from "motion/react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Ear,
  Mail,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";
import { WIRELINE_FEATURES } from "../data/wireline-knowledge";
import { WEDGES } from "../data/vertical-wedges";
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

const FAQS = [
  {
    q: "What exactly is Wireline?",
    a: "Wireline is a horizontal AI agent platform. One fleet of agents answers your inbound calls, works your outbound list, replies to email, and handles SMS — trained on your playbook, shaped in a Studio where you pick each agent's voice and brain, live on real phone numbers, and watched from a single supervisor cockpit. You deploy your first agent in under 10 minutes, no developers required.",
  },
  {
    q: "Will it sound like a robot?",
    a: `No. Each agent has one set personality, voice, and cadence — you pick its vibe (warm, playful, or authoritative) once, and it holds that same character for the entire call instead of lurching between tones. The Studio's voice-character sliders let you drag stability, style, and expressiveness until it sounds like your shop. End-to-end response latency lands around 700–900 ms, well under the "did they hang up?" threshold, so conversations feel like talking to your sharpest rep.`,
  },
  {
    q: "Can I pick which AI model my agents run on?",
    a: "Yes — per agent. Every agent starts on Wireline's latency-tuned default, and the Studio lets you swap any individual agent onto Claude, Gemini, GPT, or Grok. Speed badges flag heavier models before they slow a live call, and a temperature dial sets how focused or expressive each agent plays it.",
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

const REVEAL: MotionProps = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
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

        {/* ─── Hero Section ─── */}
        <section
          data-testid="hero-section"
          className="relative pt-36 pb-24 overflow-hidden border-b border-ink/[0.08]"
        >
          {/* Ambient Background Glow */}
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at top right, rgba(255,191,0,0.1) 0%, transparent 70%)" }}></div>
          
          <div className="max-w-[1280px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Hero Left Content */}
            <div className="lg:col-span-7 flex flex-col gap-8 z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-ink/[0.08] bg-white/40 w-fit">
                <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/70">Network Status: Sovereign</span>
              </div>
              
              <h1 className="font-display text-[clamp(2.5rem,5.5vw,5.5rem)] leading-[0.92] tracking-[-0.05em] text-ink">
                The Sovereign AI Voice Network, <br />
                <span className="text-brand italic font-light">Built for the Autonomous Era.</span>
              </h1>
              
              <p className="font-sans text-[clamp(1rem,1.35vw,1.25rem)] leading-relaxed text-ink/70 max-w-2xl">
                Wireline provides telecomm-grade infrastructure for autonomous AI agents. We ensure secure, zero-latency voice interactions by bypassing traditional commercial networks.
              </p>

              {/* Voice Bubble Widget from Stitch */}
              <div className="inline-flex items-center gap-4 bg-white/50 p-6 rounded-md border border-ink/[0.08] shadow-sm transition-transform hover:-translate-y-0.5 max-w-xl">
                <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="font-display text-lg sm:text-xl italic text-ink">
                  "Siri, have Wireline call the pharmacy and refill my prescription."
                </span>
              </div>

              <div className="flex items-center gap-6 mt-4">
                <Link
                  to="/signup"
                  data-testid="hero-primary-cta"
                  className="inline-flex min-h-12 items-center justify-center bg-brand text-white px-8 py-4 rounded-full text-[14px] font-semibold transition-all duration-300 hover:bg-brand-deep hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(139,63,214,0.3)] active:scale-95"
                >
                  Start free trial
                </Link>
                <Link
                  to="/showcase"
                  data-testid="hero-showcase-link"
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-ink/[0.14] bg-white/50 px-8 py-4 rounded-full text-[14px] font-semibold text-ink transition-all duration-300 hover:bg-white/70 hover:-translate-y-1 active:scale-95"
                >
                  Hear live demos
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>

              <div
                data-testid="hero-trust-badges"
                className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/[0.1] pt-5"
                aria-label="Security and compliance"
              >
                {TRUST_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink/50"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero Right Mockup / Live Agent Demos */}
            <div className="lg:col-span-5 relative flex justify-center order-2 lg:order-1 mt-12 lg:mt-0">
              <div className="relative w-full max-w-[320px] bg-ink rounded-[3rem] border-[8px] border-ink/[0.1] shadow-2xl p-4 overflow-hidden animate-float">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-ink rounded-b-2xl z-10" />
                <div className="h-[600px] w-full bg-[#0a0a0a] rounded-[2.2rem] flex flex-col items-center justify-center text-white p-6 relative overflow-hidden">
                  
                  {/* Status Indicator */}
                  <div className="mb-auto mt-8 text-center w-full z-10">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/20 border border-brand/40 text-[10px] uppercase tracking-widest text-brand mb-2">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      Live Agent Demo
                    </div>
                    <div className="font-display text-2xl text-paper mt-1">Interactive Call</div>
                  </div>

                  {/* Browser Call Widgets Embedded In Mockup Screen */}
                  <div className="w-full space-y-4 my-auto z-10">
                    {csDemo && (
                      <div className="bg-white/5 border border-white/10 rounded-md p-4 text-center hover:bg-white/10 transition-colors">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-paper/60 mb-2">Jordan · Inbound CS</p>
                        <BrowserCallWidget
                          agentName={csDemo.name}
                          buttonLabel={`Call Inbound Agent`}
                        />
                      </div>
                    )}
                    {salesDemo && (
                      <div className="bg-white/5 border border-white/10 rounded-md p-4 text-center hover:bg-white/10 transition-colors">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-paper/60 mb-2">Jake · Outbound Sales</p>
                        <BrowserCallWidget
                          agentName={salesDemo.name}
                          buttonLabel={`Call Outbound Agent`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Audio Waveform Visualization */}
                  <div className="mt-auto mb-6 flex items-center justify-center gap-1 h-12 w-full z-10">
                    {[0.1, 0.4, 0.2, 0.6, 0.3, 0.5, 0.1, 0.4, 0.2].map((delay, idx) => (
                      <motion.div
                        key={idx}
                        animate={{ height: [12, 48, 12], opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay }}
                        className="w-1 bg-brand rounded-full"
                      />
                    ))}
                  </div>

                  <div className="w-full text-center text-[11px] text-paper/40 z-10">
                    Routing via Sovereign Node 09
                  </div>
                </div>
              </div>
              {/* Blur backdrop behind phone */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-brand/5 rounded-full blur-3xl"></div>
            </div>
          </div>
        </section>

        {/* ─── Proof Section ─── */}
        <section data-testid="proof-section" className="py-20 lg:py-24 border-b border-ink/[0.08]">
          <div className="max-w-[1280px] mx-auto px-6 md:px-12">
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-ink/[0.08] bg-ink/[0.08] lg:grid-cols-4">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-paper p-8 sm:p-10"
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

        {/* ─── Performance & Carrier Fidelity Section ─── */}
        <section className="relative bg-[#FBF8F0]/70 py-24 lg:py-32 overflow-hidden border-b border-ink/[0.08]">
          <div className="max-w-[1280px] mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            
            {/* Visualizer and stats */}
            <div>
              <h2 className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] tracking-[-0.03em] text-ink mb-6">
                Carrier-grade fidelity. <br />
                <span className="italic font-light text-brand">Zero abstraction.</span>
              </h2>
              <p className="font-sans text-base leading-relaxed text-ink/75 mb-10 max-w-xl">
                Traditional VoIP is built for humans who can tolerate jitter. Wireline is built for AI—where every millisecond of latency disrupts the transformer's logic. We peer directly with Tier-1 carriers to ensure your voice agents never miss a syllable.
              </p>
              
              <ul className="space-y-6">
                <li className="flex items-start gap-4">
                  <span className="grid h-8 w-8 place-items-center bg-brand/10 text-brand">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="font-display text-lg tracking-tight text-ink font-semibold">End-to-end encrypted sovereign routing</h4>
                    <p className="text-[13px] text-ink/65 mt-1">Direct interconnect pathways isolated from public internet volatility.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="grid h-8 w-8 place-items-center bg-brand/10 text-brand">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="font-display text-lg tracking-tight text-ink font-semibold">Bypass public internet congestion</h4>
                    <p className="text-[13px] text-ink/65 mt-1">Direct SIP bindings and SMPP edge connections prevent routing jumps.</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Performance Grid from Stitch */}
            <div className="space-y-6">
              <div className="p-6 bg-white/40 border border-ink/[0.08] hover:border-brand/30 transition-all rounded-md shadow-sm">
                <span className="font-mono text-[10px] tracking-widest text-brand uppercase block mb-3 font-semibold">Latency</span>
                <div className="font-display text-3xl font-bold text-ink mb-1">&lt;50ms</div>
                <p className="text-[13px] text-ink/60">Global average round-trip time across our backbone.</p>
              </div>

              <div className="p-6 bg-white/40 border border-ink/[0.08] hover:border-brand/30 transition-all rounded-md shadow-sm">
                <span className="font-mono text-[10px] tracking-widest text-brand uppercase block mb-3 font-semibold">Jitter</span>
                <div className="font-display text-3xl font-bold text-ink mb-1">1.2ms</div>
                <p className="text-[13px] text-ink/60">Rock-solid packet consistency for flawless voice synthesis.</p>
              </div>

              <div className="p-6 bg-white/40 border border-ink/[0.08] hover:border-brand/30 transition-all rounded-md shadow-sm">
                <span className="font-mono text-[10px] tracking-widest text-brand uppercase block mb-3 font-semibold">Uptime</span>
                <div className="font-display text-3xl font-bold text-ink mb-1">99.999%</div>
                <p className="text-[13px] text-ink/60">Enterprise SLA backed by redundant carrier-direct nodes.</p>
              </div>
            </div>

          </div>
        </section>

        {/* ─── Editorial Image Break ─── */}
        <section className="max-w-[1280px] mx-auto px-6 md:px-12 py-24">
          <div className="relative w-full aspect-[21/9] overflow-hidden rounded-md border border-ink/[0.08] shadow-sm">
            <img 
              className="w-full h-full object-cover grayscale brightness-[0.70] hover:grayscale-0 transition-all duration-700" 
              alt="A cinematic, high-contrast shot of a server farm at night, illuminated by soft violet neon lights." 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD0_jHiRcOrnyfGPOOPO6LGgtMiMIRfuJUvl8f4-SLT0dv9FugQ6I67LWQlMKt7CmTP-xQbfm6V8ko4_QDHzfN19bHfhRV6vXddU4fE1jCNwLUmFm8UB_gO3F8sVnsP5ed_IpTruzHziDf5Tshsp3riRr3RspmRnDNcTk991B-I9srH8SWUUFJzhDOa48SvR0BFHxAjgCZB4lqnmFxP8QsqEGgCvT2vRi-lEu5p7OtE3IAPgyWLNHtBGUuydMvqHovQywyPI6iagg" 
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/60 to-transparent flex items-center p-12">
              <div className="max-w-md">
                <h3 className="font-display text-2xl sm:text-3xl text-paper mb-4 leading-tight font-semibold">Built for what comes next.</h3>
                <p className="text-paper/80 font-sans text-[14px] leading-relaxed">The future isn't visual—it's auditory and autonomous. Wireline is the dial-tone for the next billion AI agents.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Capabilities — one fleet, every channel ────────────── */}
        <section data-testid="capabilities-section" className="py-20 lg:py-28 border-t border-ink/[0.08]">
          <div className="mx-auto w-full max-w-7xl px-6 md:px-12">
            <SectionHead
              eyebrow="One fleet, every channel"
              title="Five jobs your fleet takes off your plate on day one."
              lede="The same agents, the same playbook, the same memory of every customer — across phone, email, and SMS. No per-channel vendors to stitch together."
            />

            <div className="grid grid-cols-1 gap-px border border-ink/[0.08] bg-ink/[0.08] md:grid-cols-2 xl:grid-cols-5">
              {WIRELINE_FEATURES.map((feature, i) => {
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

        {/* ─── Bento Grid Sections ─── */}
        <section className="max-w-[1280px] mx-auto px-6 md:px-12 pb-32">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Direct Carrier Peering */}
            <div className="md:col-span-8 bg-[#FBF8F0]/90 p-10 sm:p-12 border border-ink/[0.08] rounded-md flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="font-display text-2xl sm:text-3xl mb-4 font-semibold text-ink">Direct Carrier Peering</h4>
                <p className="font-sans text-base leading-relaxed text-ink/70 max-w-xl">
                  We don't use the public internet for the 'Last Mile'. Wireline peers directly with cellular networks at the edge, reducing hop counts and eliminating ISP throttling.
                </p>
              </div>
              <div className="mt-12 flex gap-12 border-t border-ink/[0.08] pt-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-brand uppercase tracking-wider mb-1">Region</span>
                  <span className="font-display text-xl text-ink">Global Edge</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-brand uppercase tracking-wider mb-1">Protocol</span>
                  <span className="font-display text-xl text-ink">W-SIP S1</span>
                </div>
              </div>
            </div>
            {/* Privacy Card */}
            <div className="md:col-span-4 bg-brand p-10 sm:p-12 rounded-md text-paper flex flex-col justify-between shadow-md">
              <div className="w-12 h-12 rounded-full border border-paper/20 flex items-center justify-center mb-8 bg-white/10">
                <ShieldCheck className="w-6 h-6 text-paper" />
              </div>
              <div>
                <h4 className="font-display text-xl sm:text-2xl mb-4 font-semibold text-paper">Privacy First</h4>
                <p className="font-sans text-sm leading-relaxed text-paper/85">
                  Voice metadata is encrypted at the source and never stored. Our sovereign infrastructure ensures no commercial ISP can intercept agent communications.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Supervisor Cockpit Section ─── */}
        <section data-testid="cockpit-section" className="bg-ink py-20 text-paper lg:py-28">
          <div className="mx-auto grid w-full max-w-7xl px-6 md:px-12 grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <SectionHead
                dark
                align="left"
                eyebrow="The supervisor cockpit"
                title="Autonomous never means unsupervised."
                lede="Live Ops is your trading floor: every call on the board, every agent accountable, every escalation one click from a human."
              />

              <div className="-mt-4 space-y-7">
                {[
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
                ].map((point) => (
                  <motion.div key={point.title} {...REVEAL} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center border border-paper/[0.14] bg-paper/[0.04] text-paper/85">
                      <point.icon className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
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

        {/* ─── Pricing Teaser Section ─── */}
        <section data-testid="pricing-teaser-section" className="py-20 lg:py-28">
          <div className="mx-auto w-full max-w-7xl px-6 md:px-12">
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
                        <span className="border border-paper/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/75">
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
                      className={`mt-6 inline-flex min-h-11 items-center justify-center text-[13px] font-semibold transition-all duration-300 rounded-full hover:-translate-y-1 active:scale-95 ${
                        highlight
                          ? "bg-brand text-white hover:bg-brand-deep hover:shadow-[0_8px_30px_rgba(139,63,214,0.4)] animate-pulse-glow"
                          : "border border-ink/[0.16] bg-white/50 backdrop-blur-md text-ink hover:bg-white/70 hover:shadow-[0_8px_30px_rgba(26,22,20,0.1)]"
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

        {/* ─── FAQ ─── */}
        <section data-testid="faq-section" className="border-t border-ink/[0.08] py-20 lg:py-28">
          <div className="mx-auto w-full max-w-3xl px-6 md:px-12">
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

        {/* ─── Final CTA ─── */}
        <section
          data-testid="final-cta-section"
          className="relative overflow-hidden bg-ink py-20 text-paper lg:py-28 border-t border-ink/[0.08]"
        >
          <div className="relative z-10 mx-auto w-full max-w-4xl text-center px-6">
            <motion.div {...REVEAL}>
              <Eyebrow dark>Right now, a call is going to voicemail</Eyebrow>
              <h2 className="mt-5 font-display text-[clamp(2.4rem,5.6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] text-paper text-balance font-semibold">
                Your next missed call doesn&rsquo;t have to be.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-paper/60 sm:text-base">
                Deploy a trained agent on a real number before your coffee cools. 14 days free, no
                card, cancel in one click.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-paper px-7 text-[14px] font-semibold text-ink transition-transform duration-200 hover:-translate-y-px rounded-full"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {csDemo && (
                  <a
                    href={`tel:${csDemo.tel}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-paper/[0.22] px-7 text-[14px] font-semibold text-paper transition-colors hover:bg-paper/[0.06] rounded-full"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    Call a live agent — {csDemo.display}
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ─── Footer ─── */}
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
