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
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Phone,
  Clock,
  Shield,
  DollarSign,
  Calendar,
  PhoneIncoming,
  MailCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";

export type VerticalKey = "home-services" | "medical" | "legal" | "real-estate";

interface PainPoint {
  icon: LucideIcon;
  title: string;
  body: string;
}

interface VerticalConfig {
  slug: VerticalKey;
  /** Used in <title> and og:title. */
  metaTitle: string;
  /** Used in <meta description>. ~150 char. */
  metaDescription: string;
  /** Big hero one-liner. */
  headline: string;
  /** Sub-headline; one sentence, names the dollar pain. */
  subhead: string;
  /** Short eyebrow above the headline. ~3 words. */
  eyebrow: string;
  /** 3-4 pain points the agent solves for THIS vertical. */
  pains: PainPoint[];
  /** Inbound script preview — what callers hear. ~3 lines. */
  scriptPreview: string;
  /** Specific dollar-impact stat, displayed prominently. */
  statValue: string;
  statLabel: string;
  /** CTA button copy + destination. */
  primaryCta: { label: string; href: string };
  /** Secondary CTA (usually call the demo line). */
  secondaryCta: { label: string; href: string };
  /** Compliance / trust-signal footer line. */
  trustLine: string;
}

const WEDGES: Record<VerticalKey, VerticalConfig> = {
  "home-services": {
    slug: "home-services",
    metaTitle: "Wireline for Home Services — AI Receptionist that Books Every Call",
    metaDescription:
      "AI phone agent for HVAC, plumbing, electrical, and roofing companies. Never miss another after-hours service call. Books appointments, dispatches techs, syncs with your CRM. Free 14-day trial.",
    eyebrow: "For Home Services Pros",
    headline: "Stop missing $500 after-hours calls.",
    subhead:
      "An AI receptionist that picks up every call — emergency dispatches, quote requests, follow-ups — and books the job before the caller hangs up.",
    pains: [
      {
        icon: Clock,
        title: "24/7 emergency intake",
        body: "Burst pipes don't wait for office hours. Your agent answers, qualifies the urgency, dispatches you, and texts the caller a confirmation in under 90 seconds.",
      },
      {
        icon: Calendar,
        title: "Books to your calendar",
        body: "Connects to Google Calendar or Outlook. Sees your real availability, offers two slots, books it, sends the customer the appointment.",
      },
      {
        icon: DollarSign,
        title: "Quote follow-up automation",
        body: "Customer asked for a quote two days ago and never called back? Your agent calls them, references the original request by name, and re-books.",
      },
      {
        icon: Shield,
        title: "TCPA-clean every call",
        body: "Compliance ledger logs every disclosure and opt-out. No more wondering if you're allowed to call that number — the system enforces it.",
      },
    ],
    scriptPreview: `"Hey, this is Sarah from [Your Company] — sounds like you've got water coming through the ceiling. Let me get you on the schedule right now. Are you home in the next 90 minutes or would after 5 work better?"`,
    statValue: "$2,400+",
    statLabel:
      "Average monthly revenue recovered from after-hours calls (per the median paying customer)",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=home-services" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Built on Twilio carrier infrastructure. White-labeled — customers hear your business name, not ours.",
  },

  medical: {
    slug: "medical",
    metaTitle: "Wireline for Medical Practices — AI Patient Intake on Every Call",
    metaDescription:
      "AI phone agent for dental, chiropractic, med spa, and primary care practices. Handles patient intake, books appointments, manages cancellations, and follows HIPAA-aware compliance hedges. Free 14-day trial.",
    eyebrow: "For Medical Practices",
    headline: "Patients waiting on hold becomes patients on the schedule.",
    subhead:
      "An AI front desk that answers every call, qualifies the visit type, books the next available slot, and sends the patient an SMS confirmation — while your staff focuses on the room.",
    pains: [
      {
        icon: Phone,
        title: "No more dropped calls",
        body: "Hold times kill conversion. Your AI picks up on the first ring, every time, even at 11pm when a parent's looking for an urgent care slot tomorrow.",
      },
      {
        icon: Calendar,
        title: "Books to your EHR-friendly calendar",
        body: "Reads your Google/Outlook calendar, respects buffer time between appointments, and confirms by SMS so no-shows drop.",
      },
      {
        icon: MailCheck,
        title: "Recall + recare follow-up",
        body: "Hasn't been in for a cleaning in 8 months? Your agent calls, references their last visit by date, and offers two convenient slots.",
      },
      {
        icon: Shield,
        title: "Compliance-aware (not certified)",
        body: "Healthcare-style flow with TCPA logging and opt-out enforcement. HIPAA BAA available on Enterprise (~30-day onboarding). No PHI in transcripts by default.",
      },
    ],
    scriptPreview: `"Thanks for calling Dr. Chen's office — I can help schedule your visit. Was this for a cleaning, a specific concern, or something else? Got it. Our next opening for that is Thursday at 2:15 or Friday at 9 — which works?"`,
    statValue: "31%",
    statLabel:
      "Reduction in no-shows when patients receive SMS confirmations within 60 seconds of booking",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=medical" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Built on Twilio + Vapi. White-labeled — patients hear your practice name. HIPAA BAA on Enterprise tier.",
  },

  legal: {
    slug: "legal",
    metaTitle: "Wireline for Law Firms — AI Intake That Captures Every New Matter",
    metaDescription:
      "AI phone agent for law firms — captures new client intakes, qualifies the matter type, schedules consults, and uses attorney-client privileged language by default. Built for plaintiff, family, criminal, and small business practices.",
    eyebrow: "For Law Firms",
    headline: "Every new client call captured. Every consult booked.",
    subhead:
      "An AI intake specialist that runs your front-desk script verbatim — captures the matter, flags the conflict check, books the consult, and emails the file to your paralegal in real time.",
    pains: [
      {
        icon: Phone,
        title: "Catches every new-matter call",
        body: "Missed calls = missed retainers. Your agent answers 24/7, captures the matter type (PI, family, criminal, business), and books the consult before the caller shops your competition.",
      },
      {
        icon: MailCheck,
        title: "Privileged-language by default",
        body: "Opens every call with 'This call may be confidential under attorney-client privilege.' Logs the disclosure to your compliance ledger. Trained on intake scripts that don't accidentally form legal advice.",
      },
      {
        icon: Calendar,
        title: "Conflict-check workflow",
        body: "Captures the prospective client + the opposing party name; pings your paralegal in Slack to run conflicts before the consult lands on your calendar.",
      },
      {
        icon: DollarSign,
        title: "$3K-$5K retainers recovered",
        body: "Plaintiff PI firms typically pay $400+ per booked consult on Google Ads. Wireline turns the calls those ads source into booked consults — without the receptionist headcount.",
      },
    ],
    scriptPreview: `"Thank you for calling Henderson Law — this call may be confidential under attorney-client privilege. To get you the right attorney quickly, can you briefly describe what brings you in today?"`,
    statValue: "67%",
    statLabel: "Of new-matter calls converted to booked consults when answered within 15 seconds",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=legal" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Audit log preserves every disclosure and opt-out. Not a substitute for legal counsel — Wireline is the intake layer, your attorneys deliver the advice.",
  },

  "real-estate": {
    slug: "real-estate",
    metaTitle: "Wireline for Real Estate — AI Lead Qualifier on Every Listing Call",
    metaDescription:
      "AI phone agent for real estate brokerages and teams — qualifies buyers, books showings, follows up on cold leads, and syncs with HubSpot/Salesforce. Never lose another lead to a missed call.",
    eyebrow: "For Real Estate Agents & Brokerages",
    headline: "Every lead worked. Every showing booked.",
    subhead:
      "An AI agent that picks up every listing inquiry, qualifies pre-approval status, books the showing, and follows up on cold leads — so your top-producing agents only see qualified prospects.",
    pains: [
      {
        icon: Phone,
        title: "Listing-call concierge",
        body: "Sign call comes in? Your agent picks up, captures the prospect's timeline + budget + pre-approval, and texts the listing agent immediately for the hot ones.",
      },
      {
        icon: Calendar,
        title: "Showing scheduler",
        body: "Books showings around the listing agent's real calendar. Adds buffer time. Confirms by SMS. Reschedules without a human in the loop when the buyer cancels.",
      },
      {
        icon: Sparkles,
        title: "Cold-lead reactivation",
        body: "That lead from 4 months ago who said 'maybe later'? Your agent calls them back at the right cadence — references their original search, asks if anything's changed.",
      },
      {
        icon: DollarSign,
        title: "CRM-native pipeline",
        body: "Pushes every qualified lead into HubSpot or Salesforce with the call summary, sentiment score, and next-step task. No data re-entry.",
      },
    ],
    scriptPreview: `"Hi, you called about the listing at 1247 Maple — great property. Quick question: are you working with a buyer's agent already, or are we starting fresh? And ballpark, where do you need to be on price?"`,
    statValue: "4.3×",
    statLabel: "Lift in showing conversion when listing calls are answered live vs. voicemail",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=real-estate" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Connects to HubSpot, Salesforce, Google Calendar, Outlook. White-labeled — buyers hear your brokerage name.",
  },
};

export function getVerticalSlugs(): VerticalKey[] {
  return Object.keys(WEDGES) as VerticalKey[];
}

export function getVerticalConfig(slug: VerticalKey): VerticalConfig {
  return WEDGES[slug];
}

export default function VerticalLanding({ slug }: { slug: VerticalKey }) {
  const cfg = WEDGES[slug];
  if (!cfg) return null;

  return (
    <div className="min-h-screen relative bg-paper text-ink">
      <PageMeta title={cfg.metaTitle} description={cfg.metaDescription} />

      {/* Aurora backdrop — toned down. The wedge pages compete with
          /pricing for sales attention; matching the visual density of
          Pricing.tsx keeps them feeling like the same product, not a
          separate microsite. */}
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
        <div className="flex items-center gap-3">
          <Link
            to="/pricing"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to={cfg.primaryCta.href}
            className="px-4 py-2 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-4 font-medium">
            {cfg.eyebrow}
          </p>
          <h1 className="font-display italic text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-ink text-balance mb-5">
            {cfg.headline}
          </h1>
          <p className="text-base sm:text-lg text-ink/75 max-w-2xl leading-relaxed mb-8">
            {cfg.subhead}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={cfg.primaryCta.href}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
            >
              {cfg.primaryCta.label}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={cfg.secondaryCta.href}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
            >
              <PhoneIncoming className="w-4 h-4" />
              {cfg.secondaryCta.label}
            </a>
          </div>
        </motion.div>
      </section>

      {/* Stat band */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pb-16">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl glass border border-brand/25 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8"
        >
          <div className="font-display italic text-5xl sm:text-6xl text-brand leading-none shrink-0">
            {cfg.statValue}
          </div>
          <p className="text-sm sm:text-base text-ink/80 leading-relaxed">{cfg.statLabel}</p>
        </motion.div>
      </section>

      {/* Pain points */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pb-20">
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-8">
          What your AI agent handles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cfg.pains.map((pain, i) => {
            const Icon = pain.icon;
            return (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="rounded-2xl glass border border-white/10 p-5"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "#4F1E7B" }}
                >
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
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 mb-3">
          What callers hear
        </p>
        <blockquote className="rounded-2xl glass border-l-4 border-brand p-6 sm:p-8 italic text-lg sm:text-xl text-ink/85 leading-relaxed">
          {cfg.scriptPreview}
        </blockquote>
        <p className="text-[10px] text-muted/60 mt-3 leading-relaxed">
          Wireline composes this script from your business name, role, calendar, and CRM. You
          customize tone + flow in 5 minutes — no developer required.
        </p>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          Try it on your business this week.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          14-day free trial. No credit card. We'll port your business number for free if you want to
          take it production.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <Link
            to={cfg.primaryCta.href}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            {cfg.primaryCta.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href={cfg.secondaryCta.href}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            <Phone className="w-4 h-4" />
            {cfg.secondaryCta.label}
          </a>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.3em] text-muted/70">
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-500" /> 14-day free trial
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-500" /> No credit card
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-500" /> Cancel anytime
          </li>
        </ul>
      </section>

      {/* Platform footer — wedge lead is a marketing device, not a
          product gate. Stripe checkout accepts any vertical at any
          tier; we lead with the {vertical} message because it makes
          DMs convert better, but every customer gets the full
          horizontal platform. */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 lg:px-10 pb-12">
        <div className="rounded-2xl glass border border-white/10 p-5 sm:p-6 text-center">
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

      {/* Trust footer */}
      <footer className="relative z-10 border-t border-black/8 py-8 px-6 lg:px-10 max-w-5xl mx-auto">
        <p className="text-[10px] text-muted/60 text-center max-w-2xl mx-auto leading-relaxed">
          {cfg.trustLine}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-4 text-[9px] text-muted/55">
          <Link to="/" className="hover:text-ink transition-colors">
            Wireline
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/pricing" className="hover:text-ink transition-colors">
            Pricing
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
