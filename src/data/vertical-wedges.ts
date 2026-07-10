import {
  Clock,
  Calendar,
  DollarSign,
  Shield,
  Phone,
  MailCheck,
  PhoneIncoming,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { TRUST_DISCLOSURE_FAQ } from "../lib/product-copy";
import { signupHrefForWedge } from "../lib/signup-intent";

export type VerticalKey =
  | "home-services"
  | "medical"
  | "legal"
  | "real-estate"
  | "personal"
  | "insurance"
  | "restaurants"
  | "sales";

export interface PainPoint {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface VerticalConfig {
  slug: VerticalKey;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subhead: string;
  eyebrow: string;
  pains: PainPoint[];
  scriptPreview: string;
  statValue: string;
  statLabel: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  trustLine: string;
  faqs: { q: string; a: string }[];
}

export const WEDGES: Record<VerticalKey, VerticalConfig> = {
  "home-services": {
    slug: "home-services",
    metaTitle: "Wireline for Home Services | AI Receptionist that Books Every Call",
    metaDescription:
      "AI voice + email agent for HVAC, plumbing, electrical, and roofing teams. Answer after-hours calls, book jobs, and follow up through Conversation Balance.",
    eyebrow: "For Home Services Pros",
    headline: "Stop missing $500 after-hours calls.",
    subhead:
      "Picks up every call and books before the caller hangs up. Emergency dispatches. Quote requests. Follow ups.",
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
        body: "Compliance ledger logs every disclosure and opt out. No more wondering if you are allowed to call that number. The system enforces it.",
      },
    ],
    scriptPreview: `"Hey, this is Sarah from [Your Company]. Sounds like you have water coming through the ceiling. Let me get you on the schedule right now. Are you home in the next 90 minutes or would after 5 work better?"`,
    statValue: "24 / 7",
    statLabel:
      "Always answers. Including the 6pm pipe burst that books a $500 emergency job your competitor missed.",
    primaryCta: { label: "Create home services agent", href: signupHrefForWedge("home-services") },
    secondaryCta: { label: "Call inbound CS demo", href: "tel:+16306425927" },
    trustLine:
      "Built on enterprise grade carrier infrastructure. White labeled. Customers hear your business name, not ours.",
    faqs: [
      {
        q: "Will customers know they're talking to an AI?",
        a: 'Wireline agents are configured around your disclosure policy and jurisdiction rules. Most home services tenants run them as a named receptionist — for example "Sarah from Premier HVAC" — with your business name. When disclosure is required or enabled, it is logged automatically. TCPA compliance is logged either way.',
      },
      {
        q: "What happens if the agent doesn't know the answer?",
        a: "The agent says it does not have that detail handy and offers to either text or email the customer once it is looked up, or transfer to you live. Configure the escalation number per shift in Settings. No guessing. No hallucinations. Refuses gracefully when uncertain.",
      },
      {
        q: "Can it actually dispatch me on an emergency?",
        a: "Yes. Configure on call rotations and the agent triages by urgency keyword. Water. Smoke. Sparks. No heat. Pages you via SMS or call. Schedules a same day arrival window. Texts the customer the ETA. Optional auto add to the Jobber or ServiceTitan calendar.",
      },
      {
        q: "How much does it cost vs. an answering service?",
        a: "Most after hours answering services charge one to two dollars per minute or two to four hundred dollars per month per business. Wireline Personal starts with one active agent and Conversation Balance, while Team and Business sell shared operating capacity. The agent actually books jobs instead of just taking messages.",
      },
    ],
  },

  medical: {
    slug: "medical",
    metaTitle: "Wireline for Medical Practices | AI Patient Intake on Every Call",
    metaDescription:
      "AI voice + email agent for dental, med spa, chiropractic, and primary care practices. Book appointments and manage intake. Call the medical demo.",
    eyebrow: "For Medical Practices",
    headline: "Patients on hold become patients on the schedule.",
    subhead:
      "An AI front desk that answers every call. Qualifies the visit type. Books the next available slot. Sends the patient an SMS confirmation. While your staff focuses on the room.",
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
    scriptPreview: `"Thanks for calling Dr. Chen's office. I can help schedule your visit. Was this for a cleaning, a specific concern, or something else? Got it. Our next opening for that is Thursday at 2:15 or Friday at 9. Which works?"`,
    statValue: "First ring",
    statLabel:
      "Patients on hold drop calls. Wireline picks up before the first ring. Every call. Every hour.",
    primaryCta: { label: "Call medical demo", href: "tel:+16173134469" },
    secondaryCta: { label: "Create medical agent", href: signupHrefForWedge("medical") },
    trustLine:
      "Built on enterprise voice infrastructure. White labeled. Patients hear your practice name. Use Enterprise onboarding for workflows that require a signed BAA.",
    faqs: [
      {
        q: "Is Wireline HIPAA-compliant?",
        a: "Wireline runs healthcare style intake flows today. TCPA disclosure logging. Opt out enforcement. And no PHI in transcripts by default. Use Enterprise onboarding for workflows that require a signed BAA. We are honest. Do not claim certified until certified.",
      },
      {
        q: "Can it actually book to my existing schedule?",
        a: "Yes. Connect Google Calendar or Outlook in Settings. The agent reads real availability. Respects buffer time you set. Books the patient. And sends an SMS confirmation. Reschedules and cancellations flow back to the calendar automatically.",
      },
      {
        q: "What about insurance verification?",
        a: "The agent captures insurance carrier + member ID during intake and writes it to the appointment record. Live eligibility checks via Change Healthcare / Availity are on the roadmap for the Enterprise tier — for now, your front desk verifies before the visit using captured data.",
      },
      {
        q: "Will patients accept an AI receptionist?",
        a: "The acceptance win is no-hold-time: a warm agent that uses your practice name and resolves routine scheduling quickly feels better than waiting on the line. Disclosure choices and consent language should match your practice policy and applicable rules.",
      },
    ],
  },

  legal: {
    slug: "legal",
    metaTitle: "Wireline for Law Firms | AI Intake That Captures Every New Matter",
    metaDescription:
      "AI voice + email intake for law firms. Capture new matters, qualify urgency, schedule consults, and route conflict checks. Call the legal demo.",
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
    scriptPreview: `"Thank you for calling Henderson Law. This call may be confidential under attorney client privilege. To get you the right attorney quickly, can you briefly describe what brings you in today?"`,
    statValue: "Conflict-checked",
    statLabel:
      "Captures the prospective client + the opposing party name; pings your paralegal in Slack before the consult lands on the attorney's calendar.",
    primaryCta: { label: "Call legal demo", href: "tel:+15727269365" },
    secondaryCta: { label: "Create legal intake agent", href: signupHrefForWedge("legal") },
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
    metaTitle: "Wireline for Real Estate | AI Lead Qualifier on Every Listing Call",
    metaDescription:
      "AI voice + email agent for real estate teams. Qualify buyers, book showings, revive cold leads, and sync CRM notes.",
    eyebrow: "For Real Estate Agents & Brokerages",
    headline: "Every lead worked. Every showing booked.",
    subhead:
      "An AI agent that picks up every listing inquiry. Qualifies pre approval status. Books the showing. And follows up on cold leads. So your top producing agents only see qualified prospects.",
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
    scriptPreview: `"Hi. You called about the listing at 1247 Maple. Great property. Quick question. Are you working with a buyers agent already, or are we starting fresh? And ballpark, where do you need to be on price?"`,
    statValue: "Same day",
    statLabel:
      "Pre-qualified buyers get a same-day showing slot. Cold leads get nurtured via text until they're warm — your top agents only see the ready ones.",
    primaryCta: { label: "Create real estate agent", href: signupHrefForWedge("real-estate") },
    secondaryCta: { label: "Call real estate demo", href: "tel:+19733638874" },
    trustLine:
      "Connects to HubSpot, Salesforce, Google Calendar, Outlook. White-labeled — buyers hear your brokerage name.",
    faqs: [
      {
        q: "Will it know my listings?",
        a: "Yes. Connect your MLS feed or paste listing URLs into the agent's knowledge base. The agent answers price, beds/baths, square footage, neighborhood basics from real data — and pivots to scheduling a showing when the caller shows real interest.",
      },
      {
        q: "Does it work for a single agent or full brokerage?",
        a: "Both. Solo operators can start with Personal: one Wireline number, one active agent, and Conversation Balance. Brokerages use Team, Business, or Enterprise capacity to assign different numbers to different listing agents, with a brokerage-level fallback when the listing agent is in a showing.",
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

  personal: {
    slug: "personal",
    metaTitle: "Wireline for Everyone — Your AI Handles the Calls You Hate",
    metaDescription:
      "Personal AI phone agent for calls you avoid: appointments, customer service, billing disputes, returns, and follow-ups. Personal live work runs through Conversation Balance.",
    eyebrow: "For everyone who hates the phone",
    headline: "Never make an awkward call again.",
    subhead:
      "Your personal AI calls the debt collector, books the dentist, disputes the cable bill, schedules the appointment, and handles the conversation you've been avoiding for three weeks. You text it what you need; it dials, talks, and reports back.",
    pains: [
      {
        icon: Clock,
        title: "Debt negotiation calls",
        body: "Past-due collector keeps calling? Tell your agent the amount, the offer you can afford, and your approved script. The agent dials, stays within those bounds, asks for terms in writing, and reports back without promising a specific outcome.",
      },
      {
        icon: Calendar,
        title: "Appointment booking you keep putting off",
        body: "Doctor's appointment three weeks overdue. Dentist cleaning. Salon. Auto shop. Veterinarian. Restaurant reservation for Saturday. Tell your agent the window that works and the office to call — it handles the back-and-forth and texts you the confirmation.",
      },
      {
        icon: DollarSign,
        title: "Returns, billing disputes, customer service",
        body: "Cable bill suddenly jumped $40. Online order arrived broken. Insurance won't approve the claim. These are the calls that take an hour on hold and end with you frustrated. Your agent waits on hold, escalates politely, and logs whatever resolution the provider offers.",
      },
      {
        icon: Shield,
        title: "Phone anxiety, social avoidance, neurodivergence",
        body: "Phone calls are uniquely hard for a lot of people — autistic adults, ADHD'ers, people with social anxiety, hearing-impaired users. Wireline is the accessibility tool that doesn't pretend to be one. The agent does the call; you keep your day.",
      },
    ],
    scriptPreview:
      "Hi, this is Alex calling on behalf of Michael Laurenzo regarding account ending in 4421. Michael authorized me to ask whether your team can consider a $1,200 one-time payment offer and send any available terms in writing. If that is not something you can review, who should I speak with?",
    statValue: "Yours",
    statLabel:
      "Your AI, calling on your behalf. You text it what you need; it dials, talks, and reports back. You stay off the call.",
    primaryCta: { label: "Wire personal agent", href: signupHrefForWedge("personal") },
    secondaryCta: { label: "Call our demo line", href: "tel:+15642389455" },
    trustLine:
      "Your agent only does what you authorize. Every call is recorded, transcribed, and visible to you in your dashboard before, during, and after. You can hang it up, override mid-call, or take over yourself at any time.",
    faqs: [
      {
        q: "Is it actually legal for an AI to make calls on my behalf?",
        a: "Wireline is a tool you authorize to place calls with your script and limits. Rules vary by call type, state, and account, so do not treat this as legal advice; configure calls using your own guidance. The agent identifies that it is calling on your behalf and records what happened.",
      },
      {
        q: "Can it really negotiate debt? Won't the collector just hang up on a robot?",
        a: "Wireline can call with your authorized offer, ask whether the collector can review it, and request written terms if they are available. Settlement outcomes are not guaranteed, creditors and collectors set their own policies, and this is not legal or financial advice. If a caller refuses to engage, the agent logs that and follows your escalation instructions.",
      },
      {
        q: "What about voicemail / hold music / phone trees? Doesn't that break it?",
        a: 'Your agent handles all of it. Navigates IVR menus by saying "agent" or pressing the right digits. Stays on hold without complaining for 45+ minutes if needed. Leaves voicemails using your script. Re-dials missed calls. This is exactly what AI is good at — the boring, infinite-patience parts of a phone call.',
      },
      {
        q: "How is this different from just having a friend or family member call for me?",
        a: "Available 24/7. Doesn't owe you a favor afterwards. Never gets tired or annoyed. Records and summarizes calls where lawful and configured, so you can review exactly what happened. Personal live work is funded through Conversation Balance instead of a subscription. Privacy: nobody in your life needs to know you avoid these calls.",
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
      "AI voice + email agent for insurance agencies. Capture quote intake, FNOL details, renewal follow-up, and producer-ready notes.",
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
    primaryCta: { label: "Create insurance agent", href: signupHrefForWedge("insurance") },
    secondaryCta: { label: "Call insurance demo", href: "tel:+19044601596" },
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
        a: "Most answering services charge $400-1,200/month plus per-call fees and just take messages. Wireline agents qualify the lead, book the renewal review, and email you a producer-ready intake, with Personal funded through Conversation Balance and teams covered by shared capacity.",
      },
    ],
  },

  restaurants: {
    slug: "restaurants",
    metaTitle: "Wireline for Restaurants — AI Phone Host for Reservations + Takeout",
    metaDescription:
      "AI voice + email host for restaurants. Take reservations, capture takeout orders, handle event inquiries, and follow up by SMS.",
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
    primaryCta: { label: "Create restaurant agent", href: signupHrefForWedge("restaurants") },
    secondaryCta: { label: "Call demo concierge", href: "tel:+15642389455" },
    trustLine:
      "Caller hears your restaurant's name + brand voice. We can clone your hostess's actual voice with consent — 60 seconds of sample audio.",
    faqs: [
      {
        q: "Will it integrate with Resy / OpenTable / Tock?",
        a: 'Yes - connects via the platform API to read availability and write reservations. Caller hears "I have 7pm or 8:15pm - which works?" using your real floor map, not an estimate. Core integrations are available in Team and Business; custom reservation policy belongs in Enterprise.',
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
    metaTitle: "Wireline for Sales Teams — Revenue Recovery Phone Agents",
    metaDescription:
      "Compliance-first phone agents for sales teams. Speed-to-lead, quote follow-up, warm reactivation, and governed outbound queues with approved CRM actions.",
    eyebrow: "For Sales Teams",
    headline: "Your sales agent works the queue while your team works the deals.",
    subhead:
      "Calls new leads fast, qualifies cleanly, books meetings, and logs every outcome — from speed-to-lead and missed-call recovery to governed warm follow-up from approved lead lists.",
    pains: [
      {
        icon: Phone,
        title: "Governed outbound follow-up",
        body: "Work approved lead queues with consent provenance, calling windows, and retry caps. Agent dials, navigates gatekeepers, runs your qualifier script, books the next-step meeting, and logs every outcome for review.",
      },
      {
        icon: Clock,
        title: "Speed-to-lead under 60 seconds",
        body: "Inbound demo request hits your form at 10:47pm. Agent calls within seconds. Qualifies the lead, books the discovery call for your AE the next morning. Faster response beats next-day callbacks on high-intent leads.",
      },
      {
        icon: Calendar,
        title: "Calendar-aware booking",
        body: "Reads your reps' real Google/Outlook availability. Offers 2-3 specific slots. Books it. Sends calendar invites with prep materials. No back-and-forth scheduling email tennis.",
      },
      {
        icon: Shield,
        title: "TCPA-clean outbound",
        body: "Compliance ledger logs every disclosure, opt-out, and DNC honor. Workspace call windows and attempt caps are enforced before dial. Federal and internal DNC checks run on every outbound attempt.",
      },
    ],
    scriptPreview: `"Hi, this is Casey calling from [Your Company]. I saw you downloaded our [resource] last week — got 2 minutes to see if what we do is even a fit before I book any of your team's time?"`,
    statValue: "< 60s",
    statLabel:
      "Target speed-to-lead on inbound form and demo requests. Governed queues handle warm follow-up with consent, caps, and full audit trail.",
    primaryCta: { label: "Create sales agent", href: signupHrefForWedge("sales") },
    secondaryCta: { label: "Call outbound sales demo", href: "tel:+14692571581" },
    trustLine:
      "Connects to HubSpot and Salesforce. Approved actions sync to your connected CRM. Apollo enrichment available in beta.",
    faqs: [
      {
        q: "Won't prospects know it's AI?",
        a: TRUST_DISCLOSURE_FAQ,
      },
      {
        q: "How does it handle gatekeepers?",
        a: 'Like a trained SDR: asks for the right person by name, offers a brief reason, asks for voicemail if blocked. The agent has a "gatekeeper navigation" mode that politely re-approaches up to 3 times before logging the lead as "gatekeeper-blocked" for your team to manually push past.',
      },
      {
        q: "What about CRM logging?",
        a: "Approved actions sync to your connected CRM: contact, outcome (qualified / not qualified / no-answer / call-back), transcript, recording link, and next-step booked. HubSpot and Salesforce are supported today; Apollo for enrichment is in beta. Custom CRMs via webhook.",
      },
      {
        q: "How is this different from Apollo / Outreach AI features?",
        a: "Those are email-first sequencers with AI assist. Wireline is voice-first: real human-sounding conversations at scale. The two complement each other — Apollo for the email side, Wireline for the dials. We integrate with both.",
      },
    ],
  },
};
