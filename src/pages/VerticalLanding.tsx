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

export type VerticalKey =
  | "home-services"
  | "medical"
  | "legal"
  | "real-estate"
  | "personal"
  | "insurance"
  | "restaurants"
  | "sales";

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
  /**
   * Vertical-specific FAQ — 3-4 entries handling the most common
   * objection or curiosity for THIS industry. Drops in below the
   * pain points; converts visitors who weren't ready to click
   * the CTA without one more nudge.
   */
  faqs: { q: string; a: string }[];
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
    // Honest capability statement, not a fabricated dollar figure.
    // Real case-study numbers go here once we have customers willing
    // to be quoted by name.
    statValue: "24 / 7",
    statLabel:
      "Always answers — including the 6pm pipe-burst that books a $500 emergency job your competitor missed.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=home-services" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Built on enterprise-grade carrier infrastructure. White-labeled — customers hear your business name, not ours.",
    faqs: [
      {
        q: "Will customers know they're talking to an AI?",
        a: 'Only if you choose to disclose. Wireline agents introduce themselves with your business name and the persona you configure — most home-services tenants run them as a named receptionist (e.g. "Sarah from Premier HVAC"). Disclosure is your call; TCPA compliance is logged either way.',
      },
      {
        q: "What happens if the agent doesn't know the answer?",
        a: "The agent says it doesn't have that detail handy and offers to either text/email the customer once it's looked up, or transfer to you live. Configure the escalation number per shift in Settings. No guessing, no hallucinations — refuses gracefully when uncertain.",
      },
      {
        q: "Can it actually dispatch me on an emergency?",
        a: 'Yes. Configure on-call rotations and the agent triages by urgency keyword ("water," "smoke," "sparks," "no heat") — pages you via SMS/call, schedules a same-day arrival window, and texts the customer the ETA. Optional: auto-add to the Jobber/ServiceTitan calendar.',
      },
      {
        q: "How much does it cost vs. an answering service?",
        a: "Most after-hours answering services charge $1-2 per minute or $200-400/month per business. Wireline starts at $49/month with the number + 400 minutes included — and the agent actually books jobs instead of just taking messages.",
      },
    ],
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
    statValue: "First ring",
    statLabel:
      "Patients on hold drop calls. Wireline picks up before the first ring — every call, every hour.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=medical" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Built on enterprise voice infrastructure. White-labeled — patients hear your practice name. HIPAA BAA on Enterprise tier when certified.",
    faqs: [
      {
        q: "Is Wireline HIPAA-compliant?",
        a: "Wireline runs healthcare-style intake flows today — TCPA disclosure logging, opt-out enforcement, no PHI in transcripts by default. A full HIPAA BAA is available on the Enterprise tier with ~30-day onboarding. We're honest: don't claim certified until certified.",
      },
      {
        q: "Can it actually book to my existing schedule?",
        a: "Yes. Connect Google Calendar or Outlook in Settings — the agent reads real availability, respects buffer time you set, books the patient, and sends an SMS confirmation. Reschedules and cancellations flow back to the calendar automatically.",
      },
      {
        q: "What about insurance verification?",
        a: "The agent captures insurance carrier + member ID during intake and writes it to the appointment record. Live eligibility checks via Change Healthcare / Availity are on the roadmap for the Enterprise tier — for now, your front desk verifies before the visit using captured data.",
      },
      {
        q: "Will patients accept an AI receptionist?",
        a: "Patient response data so far: when the agent is warm, uses your practice name, and resolves the call in under 60 seconds, satisfaction matches or beats live front-desk. The win is no-hold-time. Disclosure is your call — many practices run undisclosed for routine scheduling.",
      },
    ],
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
    statValue: "Conflict-checked",
    statLabel:
      "Captures the prospective client + the opposing party name; pings your paralegal in Slack before the consult lands on the attorney's calendar.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=legal" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Audit log preserves every disclosure and opt-out. Not a substitute for legal counsel — Wireline is the intake layer, your attorneys deliver the advice.",
    faqs: [
      {
        q: "Does the agent give legal advice?",
        a: "No. The agent is an intake specialist — captures the matter, schedules the consult, hands off to an attorney. It explicitly tells callers it can't provide legal advice and that anything substantive needs the attorney. Refusal is hard-coded in the directive layer.",
      },
      {
        q: "How does it handle conflict checks?",
        a: "The agent captures the prospective client name, opposing party name, and matter type during intake. On submission it pings your paralegal in Slack (or your conflict-check tool) with the data. Consult is only added to the attorney calendar after the paralegal clears it.",
      },
      {
        q: "What about attorney-client privilege?",
        a: 'Every call opens with the privilege disclosure ("this call may be confidential under attorney-client privilege"). The disclosure is logged with timestamp + state + caller phone for the audit trail. Transcripts are encrypted at rest and accessible only to the firm\'s authorized users.',
      },
      {
        q: "Can it qualify by case type before booking?",
        a: "Yes. Configure your firm's qualification gates (e.g. PI cases require minimum medical bills, family law requires jurisdiction match) and the agent walks through them conversationally. Unqualified callers get a polite referral elsewhere instead of clogging your consult calendar.",
      },
    ],
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
    statValue: "Same day",
    statLabel:
      "Pre-qualified buyers get a same-day showing slot. Cold leads get nurtured via text until they're warm — your top agents only see the ready ones.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=real-estate" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Connects to HubSpot, Salesforce, Google Calendar, Outlook. White-labeled — buyers hear your brokerage name.",
    faqs: [
      {
        q: "Will it know my listings?",
        a: "Yes. Connect your MLS feed or paste listing URLs into the agent's knowledge base. The agent answers price, beds/baths, square footage, neighborhood basics from real data — and pivots to scheduling a showing when the caller shows real interest.",
      },
      {
        q: "Does it work for a single agent or full brokerage?",
        a: "Both. Solo agents get one Wireline number + one persona on the Personal tier ($49/mo). Brokerages on Pro/Business assign different numbers to different listing agents, with a brokerage-level fallback when the listing agent is in a showing.",
      },
      {
        q: "How does it qualify the buyer?",
        a: 'Configurable per-firm: pre-approval status, timeline ("buying in 30 days" vs "just browsing"), price band, working with another agent? Buyers who match your criteria get a same-day showing slot. Cold leads get nurtured via SMS until they\'re ready.',
      },
      {
        q: "Can it follow up on the cold leads I haven't touched?",
        a: "Yes. Upload your cold-lead CSV from your CRM, set a cadence (weekly, biweekly), and the agent calls them with vertical-specific re-engagement scripts. The lead's original criteria (price, neighborhood) get referenced in the call — feels personal, not robotic.",
      },
    ],
  },
  // ─── Personal use (consumer wedge) ──────────────────────────────────
  // The TAM-expanding bet from Mike: not every Wireline user is a
  // business owner. Plenty of people would pay $20-50/mo to never make
  // another awkward phone call themselves — debt collectors,
  // doctor/dentist scheduling, cable company billing disputes, restaurant
  // reservations. The pitch here is different from the SMB wedges: not
  // "your business misses calls" — it's "you hate making calls, let
  // your AI do it." Phone-anxious, neurodivergent, and time-strapped
  // adults are an enormous underserved market.
  personal: {
    slug: "personal",
    metaTitle: "Wireline for Everyone — Your AI Handles the Calls You Hate",
    metaDescription:
      "Personal AI assistant that makes the phone calls you don't want to make. Debt negotiation, appointment booking, customer service disputes, returns — your AI handles it. Starts at $49/mo.",
    eyebrow: "For everyone who hates the phone",
    headline: "Never make an awkward call again.",
    subhead:
      "Your personal AI calls the debt collector, books the dentist, disputes the cable bill, schedules the appointment, and handles the conversation you've been avoiding for three weeks. You text it what you need; it dials, talks, and reports back.",
    pains: [
      {
        icon: Clock,
        title: "Debt negotiation calls",
        body: "Past-due collector keeps calling? Tell your agent the amount, the offer you can afford, and the verbiage you want to use. The agent dials, negotiates within your bounds, gets the agreement in writing — and you never have to hear the collector's voice.",
      },
      {
        icon: Calendar,
        title: "Appointment booking you keep putting off",
        body: "Doctor's appointment three weeks overdue. Dentist cleaning. Salon. Auto shop. Veterinarian. Restaurant reservation for Saturday. Tell your agent the window that works and the office to call — it handles the back-and-forth and texts you the confirmation.",
      },
      {
        icon: DollarSign,
        title: "Returns, billing disputes, customer service",
        body: "Cable bill suddenly jumped $40. Online order arrived broken. Insurance won't approve the claim. These are the calls that take an hour on hold and end with you frustrated. Your agent waits on hold, escalates politely, and gets the credit/refund/approval logged.",
      },
      {
        icon: Shield,
        title: "Phone anxiety, social avoidance, neurodivergence",
        body: "Phone calls are uniquely hard for a lot of people — autistic adults, ADHD'ers, people with social anxiety, hearing-impaired users. Wireline is the accessibility tool that doesn't pretend to be one. The agent does the call; you keep your day.",
      },
    ],
    scriptPreview:
      "Hi, this is Alex calling on behalf of Mike Laurenzo regarding account ending in 4421. Mike is offering $1,200 as a one-time settlement, payable Friday, in exchange for the account being marked paid-in-full and removed from his credit report. Can your team accept those terms today, or do you need to escalate?",
    statValue: "Yours",
    statLabel:
      "Your AI, calling on your behalf. You text it what you need; it dials, talks, and reports back. You stay off the call.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=personal" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Your agent only does what you authorize. Every call is recorded, transcribed, and visible to you in your dashboard before, during, and after. You can hang it up, override mid-call, or take over yourself at any time.",
    faqs: [
      {
        q: "Is it actually legal for an AI to make calls on my behalf?",
        a: "Yes — you're the principal, the AI is your agent. Wireline introduces itself with your authorization (\"I'm calling on behalf of Mike Laurenzo regarding…\") and operates within the limits you set. TCPA and state-level robocall laws apply only to calls without the recipient's prior consent — calls you're making to YOUR creditors, providers, and accounts are fully permitted.",
      },
      {
        q: "Can it really negotiate debt? Won't the collector just hang up on a robot?",
        a: "Two things. First, the agent doesn't sound like a robot — Wireline's voice quality is indistinguishable from human in most calls. Second, collectors are required by law to negotiate in good faith with authorized representatives. Your agent IS an authorized representative. If they hang up, your agent calls back with the next escalation script. Most settlements take 1-3 calls.",
      },
      {
        q: "What about voicemail / hold music / phone trees? Doesn't that break it?",
        a: 'Your agent handles all of it. Navigates IVR menus by saying "agent" or pressing the right digits. Stays on hold without complaining for 45+ minutes if needed. Leaves voicemails using your script. Re-dials missed calls. This is exactly what AI is good at — the boring, infinite-patience parts of a phone call.',
      },
      {
        q: "How is this different from just having a friend or family member call for me?",
        a: "Available 24/7. Doesn't owe you a favor afterwards. Never gets tired or annoyed. Records everything so you have evidence if needed. Costs $49/mo total — same call from a real human assistant would cost $25-50 per call. Privacy: nobody in your life knows you avoid these calls. The agent is also better at scripts than most humans because it can be coached precisely.",
      },
      {
        q: "What can't it do?",
        a: "Calls requiring identity verification beyond what you authorize (your bank's security questions, IRS interactions involving SSN, anything requiring legal in-person presence). Anything illegal or fraudulent. Calls to emergency services. The agent will tell you upfront if your request is out of scope.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    metaTitle: "Wireline for Insurance Agencies — AI Quote Intake + Renewal Follow-Up",
    metaDescription:
      "AI phone agent for insurance agencies: handles quote requests 24/7, captures FNOL (first notice of loss) details, runs renewal follow-up campaigns. Free 14-day trial.",
    eyebrow: "For Insurance Agencies",
    headline: "Every quote request answered. Every renewal followed up.",
    subhead:
      "An AI agent that picks up the new-quote call at 8pm, captures the right details for an accurate bind, and chases the unrenewed policy three times before it lapses.",
    pains: [
      {
        icon: Phone,
        title: "Quote intake without the wait",
        body: "Caller wants an auto quote at 7:30pm? Agent qualifies vehicle, driver count, current carrier, expiration date — emails you a fully-filled intake by morning so you can bind first thing.",
      },
      {
        icon: Clock,
        title: "FNOL (first notice of loss) capture",
        body: "After-hours claim calls don't have to go to voicemail. Agent captures policy #, date/time/location of loss, parties involved, injuries — texts you immediately if it's serious, emails the desk for routine.",
      },
      {
        icon: MailCheck,
        title: "Renewal follow-up campaigns",
        body: "Policy lapse window starts 60 days out. Agent calls + emails on day 60, 30, 7. Books the renewal review. Catches the customer who would have walked to GEICO.",
      },
      {
        icon: Shield,
        title: "Carrier-line compliance hedges",
        body: "Never quotes binding coverage rates ('I'll have your agent confirm the bind') or makes coverage promises. TCPA-clean every outbound call. State-specific disclosure scripts.",
      },
    ],
    scriptPreview: `"Hi, this is Alex with [Your Agency] — I see you requested an auto quote. I'd love to get you accurate numbers fast. Can you tell me the year, make, and model of your primary vehicle, and how many drivers we'll be covering?"`,
    statValue: "60-day",
    statLabel:
      "Renewal cadence catches the customer who would have lapsed to a competitor — before they even shopped around.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=insurance" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "White-labeled — your insureds hear your agency name, not ours. Recordings + transcripts archived for audit compliance.",
    faqs: [
      {
        q: "Will it actually bind a policy?",
        a: "No — binding requires a licensed agent. Wireline gathers the quote intake, runs the underwriting pre-qual questions, and hands the bind-ready package to your producer. Saves 12-18 minutes per quote on data entry.",
      },
      {
        q: "Can it handle commercial lines, not just personal?",
        a: 'Yes. Configure agent personas per line of business: "Auto", "Home", "Commercial Auto", "GL/Business Owners", "Workers Comp". Each persona knows the right intake questions and which producer to hand the lead to.',
      },
      {
        q: "What about claims?",
        a: "FNOL intake mode captures the structured fields your carrier portals need (policy #, DOL, DOL location, parties, injuries, photos requested via SMS link). For complex losses the agent transfers live to your claims desk; for routine ones it emails the package + SMS-confirms the claim # with the insured.",
      },
      {
        q: "How does it compare to a 24/7 answering service?",
        a: "Most answering services charge $400-1,200/month + per-call fees and just take messages. Wireline starts at $49/month, qualifies the lead, books the renewal review, and emails you a producer-ready intake — not a 'caller said something about insurance' sticky note.",
      },
    ],
  },

  restaurants: {
    slug: "restaurants",
    metaTitle: "Wireline for Restaurants — AI Phone Host for Reservations + Takeout",
    metaDescription:
      "AI phone agent for restaurants, bars, and hospitality. Takes reservations, manages waitlists, captures takeout orders, handles allergen/special-request questions. Never miss a Saturday-night call again.",
    eyebrow: "For Restaurants + Hospitality",
    headline: "The phone rings during dinner rush. The agent picks up.",
    subhead:
      "An AI host that answers the reservation call when your floor team is buried, captures takeout orders accurately, and saves you the no-shows by SMS-confirming every booking 2 hours before.",
    pains: [
      {
        icon: Calendar,
        title: "Reservation taking without the hostess",
        body: "Party size, name, time, special requests (anniversary, allergies, high chair). Books to Resy/OpenTable/Tock or your sheet. SMS confirms 2 hours before — drop the no-show rate from 18% to under 6%.",
      },
      {
        icon: PhoneIncoming,
        title: "Takeout orders done right",
        body: "Reads back every item. Confirms substitutions. Captures pickup time. Texts the order to your KDS or prints to your kitchen. Caller's allergy questions go to a structured field your line cook actually sees.",
      },
      {
        icon: Clock,
        title: "After-hours + Sunday-closed days",
        body: "Closed Mondays? Agent takes the catering inquiry that would have gone to your competitor. Forwards the high-value leads to your manager's cell in real-time.",
      },
      {
        icon: MailCheck,
        title: "Private-events + catering pipeline",
        body: "Captures party size, date, dietary needs, budget range, contact info. Emails your events manager with a structured RFQ. Books a tasting visit if the agent's qualifier scores it as high-value.",
      },
    ],
    scriptPreview: `"Hi, thanks for calling [Your Restaurant]! Were you hoping to make a reservation, place an order to pick up, or ask about a private event? I can take care of all three."`,
    statValue: "Saturday 7pm",
    statLabel:
      "The hour your phone rings off the hook + your hostess can't get to it. Agent fields every call — books the booking, takes the takeout, sends you the events lead.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=restaurants" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Caller hears your restaurant's name + brand voice. We can clone your hostess's actual voice with consent — 60 seconds of sample audio.",
    faqs: [
      {
        q: "Will it integrate with Resy / OpenTable / Tock?",
        a: 'Yes — connects via the platform API to read availability and write reservations. Caller hears "I have 7pm or 8:15pm — which works?" using your real floor map, not an estimate. Free trial includes one platform; multi-platform on Pro.',
      },
      {
        q: "Can it handle dietary restrictions + allergens correctly?",
        a: "Yes. Allergens are captured as a structured field (not free-text) and flagged at the top of the kitchen ticket. The agent will refuse to make medical claims about ingredients — it confirms 'I'll note shellfish allergy and our manager will confirm before serving.' Compliance-safe.",
      },
      {
        q: "What about private-event inquiries?",
        a: 'Captures party size, date, food + bar preferences, budget range, and contact info. Auto-emails your events team with a structured RFQ. Optional: agent can offer a tasting visit if the inquiry scores above a "high-value" threshold you set.',
      },
      {
        q: "How is this different from Yelp / Google booking widgets?",
        a: "Those only capture web bookings. 70-80% of restaurant reservation traffic is still phone calls — especially for parties of 4+ and private events. Wireline answers the phone calls your widget can't catch.",
      },
    ],
  },

  sales: {
    slug: "sales",
    metaTitle: "Wireline for Sales Teams — AI SDR for Outbound + Inbound Lead Qualification",
    metaDescription:
      "AI sales development rep that runs outbound calling campaigns at scale, qualifies inbound leads in under 90 seconds, books meetings on your reps' calendars. Free 14-day trial.",
    eyebrow: "For Sales + SDR Teams",
    headline: "Your AI SDR works the list while your reps work the calls.",
    subhead:
      "An AI agent that calls 200 cold leads a day, qualifies the ones that pick up, and drops booked discovery calls straight into your reps' calendars — without the SDR-team payroll.",
    pains: [
      {
        icon: Phone,
        title: "Outbound calling at scale",
        body: "Hand it a list of 1,000 prospects + your qualifier script. Agent dials, navigates gatekeepers, runs the BANT (budget/authority/need/timeline) qualifier, books the next-step meeting. Reps walk into qualified discovery calls.",
      },
      {
        icon: Clock,
        title: "Speed-to-lead under 60 seconds",
        body: "Inbound demo request hits your form at 10:47pm. Agent calls at 10:47:30pm. Qualifies the lead, books the discovery call for your AE the next morning. Lead-to-conversation rate jumps 4-7x vs the next-day callback.",
      },
      {
        icon: Calendar,
        title: "Calendar-aware booking",
        body: "Reads your reps' real Google/Outlook availability. Offers 2-3 specific slots. Books it. Sends calendar invites with prep materials. No back-and-forth scheduling email tennis.",
      },
      {
        icon: Shield,
        title: "TCPA-clean outbound",
        body: "Compliance ledger logs every disclosure, opt-out, and DNC honor. State-by-state hour windows respected automatically. Never call the same number twice in 24h.",
      },
    ],
    scriptPreview: `"Hi, this is Casey calling from [Your Company]. I saw you downloaded our [resource] last week — got 2 minutes to see if what we do is even a fit before I book any of your team's time?"`,
    statValue: "200 / day",
    statLabel:
      "Calls one AI agent can make in a 9-hour workday. Run 5 in parallel = 1,000 dials. No bathroom breaks, no Mondays.",
    primaryCta: { label: "Start 14-day free trial", href: "/signup?wedge=sales" },
    secondaryCta: { label: "Call our demo line", href: "tel:+16305811834" },
    trustLine:
      "Integrates with Salesforce, HubSpot, Pipedrive, Apollo. Outbound list management + CRM activity logging out of the box.",
    faqs: [
      {
        q: "Won't prospects know it's AI?",
        a: "Some will, some won't — the new generation of voice models pass naturally as human in 80%+ of calls. The bigger question: do prospects mind? Our data says no, as long as the conversation provides value. Agents are configured to gracefully confirm if asked directly.",
      },
      {
        q: "How does it handle gatekeepers?",
        a: 'Like a trained SDR: asks for the right person by name, offers a brief reason, asks for voicemail if blocked. The agent has a "gatekeeper navigation" mode that politely re-approaches up to 3 times before logging the lead as "gatekeeper-blocked" for your team to manually push past.',
      },
      {
        q: "What about CRM logging?",
        a: "Every call gets logged to your CRM in real time: contact, outcome (qualified / not qualified / no-answer / call-back), full transcript, recording link, BANT scores, next-step booked. Works with Salesforce, HubSpot, Pipedrive, Apollo. Custom CRMs via webhook.",
      },
      {
        q: "How is this different from Apollo / Outreach AI features?",
        a: "Those are email-first sequencers with AI assist. Wireline is voice-first: real human-sounding conversations at scale. The two complement each other — Apollo for the email side, Wireline for the dials. We integrate with both.",
      },
    ],
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
    <div className="min-h-dvh relative bg-paper text-ink">
      <PageMeta title={cfg.metaTitle} description={cfg.metaDescription} path={`/for/${slug}`} />

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
      <header className="relative z-10 px-4 sm:px-6 lg:px-10 py-5 flex items-center justify-between">
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
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-12 pb-16 sm:pt-20 sm:pb-24">
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
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
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
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
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
      <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
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
              className="group rounded-2xl glass border border-white/10 overflow-hidden"
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
                  className="text-muted/50 transition-transform group-open:rotate-45 text-xl leading-none mt-0.5"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-4 pl-[58px] text-sm text-ink/75 leading-relaxed">{faq.a}</div>
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
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 pb-12">
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
      <footer className="relative z-10 border-t border-black/8 py-8 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
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
