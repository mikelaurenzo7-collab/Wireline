import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, type MotionProps } from "motion/react";
import {
  ArrowRight, CheckCircle2, Clock3, PhoneCall, ShieldCheck,
  Mic, Calendar, Ban, Building2, User, Copy, Check,
} from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const REVEAL: MotionProps = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

const PRODUCT_POINTS = [
  {
    icon: PhoneCall,
    title: "Answer every call",
    body: "Give every lead a live-sounding voice agent that can qualify, route, book, and follow up.",
  },
  {
    icon: Clock3,
    title: "Launch quickly",
    body: "Start with a real phone number, a role, and a script. Refine behavior from Agent Studio.",
  },
  {
    icon: ShieldCheck,
    title: "Stay in control",
    body: "Review calls, adjust training, and keep escalation rules clear before customers hit dead ends.",
  },
] as const;

const PERSONAL_SCENARIOS = [
  {
    icon: Mic,
    quote: "Hey Siri, have Wireline call the pharmacy",
    outcome: "Aria called, confirmed your prescription is ready. Pickup by 6pm.",
    tag: "Siri Shortcut",
  },
  {
    icon: Calendar,
    quote: "Dr. Allen's office called",
    outcome: "I rescheduled your 9am to Thursday 2pm and sent a confirmation.",
    tag: "Appointment",
  },
  {
    icon: Ban,
    quote: "Unknown caller — likely spam",
    outcome: "Declined politely. 3 blocked today, 41 this month.",
    tag: "Spam guard",
  },
] as const;

const MODEL_PROVIDERS = [
  { name: "OpenRouter", note: "300+ models, one API" },
  { name: "Anthropic", note: "Claude family" },
  { name: "OpenAI", note: "GPT family" },
  { name: "Google", note: "Gemini family" },
  { name: "xAI", note: "Grok family" },
  { name: "Meta", note: "Llama family" },
] as const;

function SiriChip() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText("wireline://ask");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-2 border border-paper/25 bg-paper/8 px-4 py-2 text-[13px] text-paper hover:bg-paper/15 transition-colors rounded-sm"
    >
      <span className="font-mono">wireline://ask</span>
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-paper/50" />}
    </button>
  );
}

export default function LandingPage() {
  const csDemo =
    LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") ||
    LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline | AI Voice Agents for Personal & Business"
        description="Wireline handles your personal calls and powers your business floor — AI voice agents that answer, qualify, book, and follow up. Real phone numbers, no credit card."
        image="/og-image.jpg"
      />

      <div className="marketing-launch min-h-screen bg-paper font-sans text-ink selection:bg-primary/20 selection:text-ink overflow-x-hidden">
        <PublicSiteHeader active="home" />

        <main
          id="main-content"
          className="relative mx-auto max-w-7xl px-5 pb-24 pt-36 sm:px-6 sm:pt-40 md:px-12 space-y-24"
        >
          {/* ─── Hero ─── */}
          <section className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div
              {...REVEAL}
              className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Personal & business · live agent platform
              </div>

              <h1 className="font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.045em] text-ink text-balance">
                Your phone, finally{" "}
                <span className="italic">working for you.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink/70 lg:mx-0">
                Wireline handles your personal calls — blocking spam, rescheduling doctors, calling
                the pharmacy — and runs a fleet of AI agents for your business floor around the
                clock. Human-fast. Never off-script.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  to="/signup"
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-md bg-brand px-7 text-sm font-semibold text-white shadow-[0_18px_50px_-28px_rgba(139,63,214,0.9)] transition hover:bg-brand-deep"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/showcase"
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-md border border-ink/12 bg-paper px-7 text-sm font-semibold text-ink transition hover:border-brand/30 hover:bg-paper-warm/50"
                >
                  Call a demo agent
                  <PhoneCall className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink/62 lg:justify-start">
                {[
                  "Real phone numbers",
                  "Personal & business plans",
                  "No credit card to start",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-brand" />
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              {...REVEAL}
              transition={{ ...REVEAL.transition, delay: 0.08 }}
              className="mx-auto w-full max-w-xl"
            >
              <div className="rounded-md border border-ink/10 bg-paper shadow-[0_24px_80px_-56px_rgba(26,22,20,0.55)]">
                <div className="border-b border-ink/10 px-5 py-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                    Try it in browser
                  </p>
                  <p className="mt-1 text-sm text-ink/62">
                    Talk to a live Wireline demo agent before creating an account.
                  </p>
                </div>
                <div className="p-5 sm:p-6">
                  <BrowserCallWidget agentName={csDemo.name} />
                </div>
              </div>
            </motion.div>
          </section>

          {/* ─── Product points ─── */}
          <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PRODUCT_POINTS.map(({ icon: Icon, title, body }) => (
              <motion.article
                key={title}
                {...REVEAL}
                className="rounded-md border border-ink/10 bg-paper p-6 shadow-[0_18px_48px_-42px_rgba(26,22,20,0.55)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md border border-brand/15 bg-brand/8 text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-display text-2xl italic text-ink">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-ink/66">{body}</p>
              </motion.article>
            ))}
          </section>

          {/* ─── For you, personally ─── */}
          <section>
            <motion.div {...REVEAL} className="mb-10">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand mb-3">
                For you, personally
              </p>
              <h2 className="font-display text-3xl sm:text-4xl italic text-ink text-balance leading-tight">
                It just handles it.
              </h2>
              <p className="mt-3 max-w-xl text-base text-ink/66 leading-relaxed">
                Aria works in the background — screening calls, scheduling appointments, and running
                errands on your behalf. Your phone stays quiet. Nothing slips.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
              {PERSONAL_SCENARIOS.map(({ icon: Icon, quote, outcome, tag }, i) => (
                <motion.div
                  key={tag}
                  {...REVEAL}
                  transition={{ ...REVEAL.transition, delay: i * 0.07 }}
                  className="rounded-md border border-ink/10 bg-paper p-6 shadow-[0_18px_48px_-42px_rgba(26,22,20,0.55)] hover:border-brand/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md border border-brand/15 bg-brand/8 text-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand/70 border border-brand/20 bg-brand/5 px-2 py-1 rounded-sm">
                      {tag}
                    </span>
                  </div>
                  <p className="font-display text-[17px] italic text-ink leading-snug mb-3">
                    "{quote}"
                  </p>
                  <div className="border-l-2 border-brand/40 pl-3">
                    <p className="text-sm leading-relaxed text-ink/70">
                      <span className="font-semibold text-brand">Aria:</span> {outcome}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div {...REVEAL} className="flex flex-wrap gap-3">
              {[
                { l: "DoorDash driver calling", o: "Gave gate code #4821" },
                { l: "Mom called twice", o: "Rang through immediately" },
                { l: "Home-screen widget", o: "Today's calls at a glance" },
                { l: "CarPlay", o: "Hands-free summaries" },
                { l: "Apple Watch", o: "Aria's status on your wrist" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-sm border border-ink/10 bg-paper-warm/30 px-4 py-2 text-sm"
                >
                  <span className="text-ink/70 italic">"{s.l}"</span>
                  <span className="mx-2 text-ink/30">→</span>
                  <span className="font-semibold text-brand text-xs">{s.o}</span>
                </div>
              ))}
            </motion.div>
          </section>

          {/* ─── Siri band ─── */}
          <section className="rounded-md overflow-hidden border border-ink/10 bg-ink">
            <div className="px-6 py-10 sm:px-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/50 mb-2">
                  Siri Shortcuts · CarPlay · Widgets
                </p>
                <p className="font-display text-2xl italic text-paper leading-tight text-balance">
                  "Hey Siri, ask Wireline what you handled today."
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 md:items-end shrink-0">
                <SiriChip />
                <Link
                  to="/signup?plan=personal"
                  className="inline-flex items-center gap-2 rounded-md bg-paper text-ink px-5 py-2.5 text-sm font-semibold hover:bg-paper/90 transition-colors"
                >
                  Set up personal line <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          {/* ─── Model marketplace ─── */}
          <section className="rounded-md border border-ink/10 bg-paper-warm/25 px-6 py-12 sm:px-10">
            <motion.div {...REVEAL} className="mx-auto max-w-3xl text-center mb-10">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand mb-4">
                No model lock-in
              </p>
              <h2 className="font-display text-[clamp(2rem,4vw,3rem)] italic leading-[1.05] tracking-[-0.03em] text-ink text-balance">
                Hundreds of models. <span className="text-brand">One agent.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink/66">
                Route every conversation to the right model — from frontier reasoning to fast,
                low-cost responders — across OpenRouter, Anthropic, OpenAI, Google, xAI, and Meta.
                Pick a model per agent in Agent Studio, or let Wireline auto-route.
              </p>
            </motion.div>

            <motion.div
              {...REVEAL}
              transition={{ ...REVEAL.transition, delay: 0.08 }}
              className="mx-auto max-w-4xl grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-8"
            >
              {MODEL_PROVIDERS.map((p) => (
                <div
                  key={p.name}
                  className="rounded-md border border-ink/10 bg-paper p-4 text-left shadow-[0_12px_32px_-30px_rgba(26,22,20,0.55)]"
                >
                  <p className="font-display text-base text-ink">{p.name}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45">
                    {p.note}
                  </p>
                </div>
              ))}
            </motion.div>

            <div className="mx-auto max-w-2xl grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-ink/10 bg-paper p-5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-brand/8 border border-brand/15 flex items-center justify-center shrink-0 text-brand mt-0.5">
                  <User className="w-4 h-4" />
                </div>
                <p className="text-sm text-ink/75 leading-relaxed">
                  <span className="font-semibold text-ink">Personal:</span> your assistant
                  auto-routes — you never think about models.
                </p>
              </div>
              <div className="rounded-md border border-ink/10 bg-paper p-5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-brand/8 border border-brand/15 flex items-center justify-center shrink-0 text-brand mt-0.5">
                  <Building2 className="w-4 h-4" />
                </div>
                <p className="text-sm text-ink/75 leading-relaxed">
                  <span className="font-semibold text-ink">Business:</span> set a model +
                  temperature per agent, with bounded overrides and provider gating.
                </p>
              </div>
            </div>
          </section>

          {/* ─── Integrations ─── */}
          <section className="rounded-md border border-ink/10 bg-paper-warm/25 px-6 py-10 text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              Works with the tools your team already uses
            </p>
            <div className="mt-8 opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0">
              <IntegrationLogos />
            </div>
          </section>
        </main>

        <footer className="border-t border-ink/10 bg-paper px-5 py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-ink/55 md:flex-row">
            <div>© {new Date().getFullYear()} Wireline</div>
            <div className="flex gap-6">
              <Link className="hover:text-brand transition-colors" to="/terms">Terms</Link>
              <Link className="hover:text-brand transition-colors" to="/privacy">Privacy</Link>
              <Link className="hover:text-brand transition-colors" to="/status">Status</Link>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Systems online
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
