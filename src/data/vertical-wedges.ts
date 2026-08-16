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

/**
 * Icons are NAMED here, not imported.
 *
 * `server.ts` imports PRERENDERED_MARKETING_ROUTES from marketing-route-meta,
 * which imports WEDGES from this file for the `/for/:slug` titles. When the
 * pain icons were `LucideIcon` component references, that one import chain
 * pulled the whole lucide-react barrel — and React component machinery — into
 * every serverless cold start, to serve a list of route strings. It also gave
 * the marketing data its own 26 kB client chunk.
 *
 * The mapping from name to component lives in the one React component that
 * actually renders them, so this module stays plain data.
 */
export type PainIconName =
  | "Calendar"
  | "Clock"
  | "DollarSign"
  | "MailCheck"
  | "Phone"
  | "PhoneIncoming"
  | "Shield"
  | "Sparkles";

export interface PainPoint {
  icon: PainIconName;
  title: string;
  body: string;
}

export interface VerticalConfig {
  slug: VerticalKey;
  metaTitle: string;
  metaDescription: string;
  headline: string;
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
    metaTitle: "Wireline for Home Services | Voice Receptionist and Follow Up",
    metaDescription:
      "Voice + email agent for HVAC, plumbing, electrical, and roofing teams. Answer after hours calls, book jobs, and follow up through Runtime Balance.",
    eyebrow: "For Home Services Pros",
    headline: "Turn after hours calls into scheduled work",
    pains: [
      {
        icon: "Clock",
        title: "24/7 emergency intake",
        body: "Burst pipes don't wait for office hours. Your agent can answer, qualify the urgency, alert the person on call, and text the caller a confirmation.",
      },
      {
        icon: "Calendar",
        title: "Books to your calendar",
        body: "Connects to Google Calendar or Outlook. Sees your real availability, offers two slots, books it, sends the customer the appointment.",
      },
      {
        icon: "DollarSign",
        title: "Quote follow up automation",
        body: "Customer asked for a quote two days ago and never called back? Your agent calls them, references the original request by name, and rebooks.",
      },
      {
        icon: "Shield",
        title: "Consent and DNC guardrails",
        body: "Configured disclosures, opt outs, calling windows, attempt caps, and DNC checks are logged and enforced for outbound work.",
      },
    ],
    scriptPreview: `"Hey, this is Sarah from [Your Company]. Sounds like you have water coming through the ceiling. Let me get you on the schedule right now. Are you home in the next 90 minutes or would after 5 work better?"`,
    statValue: "24 / 7",
    statLabel:
      "Built for the after hours calls, urgent requests, and quote follow ups your team chooses to route.",
    primaryCta: { label: "Create home services agent", href: signupHrefForWedge("home-services") },
    secondaryCta: { label: "Call customer service demo", href: "tel:+16306425927" },
    trustLine:
      "Uses your configured company identity. Final caller ID display depends on carrier, network, device, and completed identity review.",
    faqs: [
      {
        q: "Will customers know they're talking to an AI?",
        a: 'Wireline agents use the company identity, disclosure language, and jurisdiction rules you configure, for example "Sarah from Premier HVAC." Configured disclosure and consent events are logged for review; your team remains responsible for the policy and its legal sufficiency.',
      },
      {
        q: "What happens if the agent doesn't know the answer?",
        a: "The agent says it does not have that detail handy and offers to either text or email the customer once it is looked up, or transfer to you live. Configure the escalation number per shift in Settings. It is designed to decline uncertain details, follow your escalation rules, and leave a reviewable record.",
      },
      {
        q: "Can it actually dispatch me on an emergency?",
        a: "Configure on call routing and approved urgency rules such as water, smoke, sparks, or no heat. The workflow can alert staff and offer available Google or Outlook calendar windows; emergency dispatch, arrival promises, and direct field service write back stay with the tools and people you approve.",
      },
      {
        q: "How much does it cost vs. an answering service?",
        a: "Wireline plans start at $19/month with included voice minutes and prepaid Runtime Balance for usage beyond the plan allowance. Compare the full workflow, connected tools, and follow up (not only the per minute rate) against any answering service you use today.",
      },
    ],
  },

  medical: {
    slug: "medical",
    metaTitle: "Wireline for Medical Practices | Voice Intake and Scheduling",
    metaDescription:
      "Voice + email agent for dental, med spa, chiropractic, and primary care practices. Book appointments and manage intake. Call the medical demo.",
    eyebrow: "For Medical Practices",
    headline: "Patients on hold become patients on the schedule",
    pains: [
      {
        icon: "Phone",
        title: "No more dropped calls",
        body: "Route overflow or after hours calls to an agent that gathers the visit reason, follows your urgency rules, and offers configured next steps.",
      },
      {
        icon: "Calendar",
        title: "Books to your connected calendar",
        body: "Reads connected Google or Outlook availability, respects configured buffers, and can send an SMS confirmation.",
      },
      {
        icon: "MailCheck",
        title: "Recall + recare follow up",
        body: "Hasn't been in for a cleaning in 8 months? Your agent calls, references their last visit by date, and offers two convenient slots.",
      },
      {
        icon: "Shield",
        title: "Compliance aware (not certified)",
        body: "Healthcare sensitive intake controls include consent logging, opt out enforcement, recording off by default, and configurable retention. Do not use Wireline for PHI unless a signed BAA and approved configuration are confirmed in writing.",
      },
    ],
    scriptPreview: `"Thanks for calling Dr. Chen's office. I can help schedule your visit. Was this for a cleaning, a specific concern, or something else? Got it. Our next opening for that is Thursday at 2:15 or Friday at 9. Which works?"`,
    statValue: "After hours",
    statLabel:
      "Route the calls your team cannot answer so configured intake and scheduling can continue after hours.",
    primaryCta: { label: "Call medical demo", href: "tel:+16173134469" },
    secondaryCta: { label: "Create medical agent", href: signupHrefForWedge("medical") },
    trustLine:
      "Uses your configured practice identity, subject to carrier display support. Do not use Wireline for PHI unless a signed BAA and approved configuration are confirmed in writing.",
    faqs: [
      {
        q: "Is Wireline HIPAA compliant?",
        a: "No. Wireline offers healthcare sensitive guardrails, but does not claim HIPAA compliance or certification. Do not use it for PHI unless Wireline confirms a signed BAA and approved configuration in writing.",
      },
      {
        q: "Can it actually book to my existing schedule?",
        a: "Connect Google Calendar or Outlook in Settings. The agent can read available times, respect configured buffers, book supported events, and send confirmations. Rescheduling behavior depends on the connected calendar and workflow you approve.",
      },
      {
        q: "What about insurance verification?",
        a: "The agent can capture the insurance fields you approve during intake and route them with the appointment record. It does not verify eligibility today; your staff must validate coverage in the systems you already use.",
      },
      {
        q: "Will patients accept an AI receptionist?",
        a: "The acceptance win is no hold time: a warm agent that uses your practice name and resolves routine scheduling quickly feels better than waiting on the line. Disclosure choices and consent language should match your practice policy and applicable rules.",
      },
    ],
  },

  legal: {
    slug: "legal",
    metaTitle: "Wireline for Law Firms | Voice Intake and Consult Routing",
    metaDescription:
      "Voice + email intake for law firms. Capture new matters, qualify urgency, schedule consults, and route conflict checks. Call the legal demo.",
    eyebrow: "For Law Firms",
    headline: "Give every routed intake a clear next step",
    pains: [
      {
        icon: "Phone",
        title: "Structured new matter intake",
        body: "Route overflow or after hours calls to an agent that captures matter type, urgency, contact details, and the next approved intake step.",
      },
      {
        icon: "MailCheck",
        title: "Firm approved intake language",
        body: "Uses the disclaimer and intake language your firm approves. Wireline does not determine whether privilege exists and is configured not to provide legal advice.",
      },
      {
        icon: "Calendar",
        title: "Conflict check workflow",
        body: "Captures prospective client and opposing party names, then routes the record for staff conflict review before any workflow you mark as requiring clearance.",
      },
      {
        icon: "DollarSign",
        title: "Protect valuable intake demand",
        body: "Turn paid and organic call demand into structured, reviewable intake while your team keeps control of qualification and engagement decisions.",
      },
    ],
    scriptPreview: `"Thank you for calling Henderson Law. I can collect some initial information for the firm's review. This intake does not provide legal advice or create an attorney client relationship. Can you briefly describe what brings you in today?"`,
    statValue: "Review ready",
    statLabel:
      "Captures the prospective client, opposing party, and matter type, then routes the record to your designated reviewer.",
    primaryCta: { label: "Call legal demo", href: "tel:+15727269365" },
    secondaryCta: { label: "Create legal intake agent", href: signupHrefForWedge("legal") },
    trustLine:
      "Audit log preserves every disclosure and opt out. Not a substitute for legal counsel. Wireline is the intake layer, your attorneys deliver the advice.",
    faqs: [
      {
        q: "Does the agent give legal advice?",
        a: "No. The agent is an intake specialist: captures the matter, schedules the consult, hands off to an attorney. It explicitly tells callers it can't provide legal advice and that anything substantive needs the attorney. Refusal is hardcoded in the directive layer.",
      },
      {
        q: "How does it handle conflict checks?",
        a: "The agent captures the prospective client name, opposing party name, and matter type. It can route that record through connected Slack or your approved handoff path. Your firm remains responsible for running and clearing conflicts before engagement or scheduling when required.",
      },
      {
        q: "What about attorney client privilege?",
        a: "Wireline cannot determine whether attorney client privilege applies. Your firm supplies the approved disclaimer, recording policy, retention settings, and staff access rules; configured disclosures are logged for review.",
      },
      {
        q: "Can it qualify by case type before booking?",
        a: "Yes. Configure your firm's qualification gates (e.g. PI cases require minimum medical bills, family law requires jurisdiction match) and the agent walks through them conversationally. Unqualified callers get a polite referral elsewhere instead of clogging your consult calendar.",
      },
    ],
  },

  "real-estate": {
    slug: "real-estate",
    metaTitle: "Wireline for Real Estate | Voice Listing Call Qualification",
    metaDescription:
      "Voice + email agent for real estate teams. Qualify buyers, book showings, revive cold leads, and sync CRM notes.",
    eyebrow: "For Real Estate",
    headline: "Work more listing calls without losing control",
    pains: [
      {
        icon: "Phone",
        title: "Listing call concierge",
        body: "Sign call comes in? Your agent picks up, captures the prospect's timeline + budget + preapproval, and texts the listing agent immediately for the hot ones.",
      },
      {
        icon: "Calendar",
        title: "Showing scheduler",
        body: "Books showings around the listing agent's real calendar. Adds buffer time. Confirms by SMS. Can update supported calendar events when the connected workflow and your rules allow it.",
      },
      {
        icon: "Sparkles",
        title: "Cold lead reactivation",
        body: "That lead from 4 months ago who said 'maybe later'? Your agent calls them back at the right cadence, references their original search, asks if anything's changed.",
      },
      {
        icon: "DollarSign",
        title: "CRM native pipeline",
        body: "Can push qualified leads into connected HubSpot or Salesforce records with the call summary and approved next step task.",
      },
    ],
    scriptPreview: `"Hi. You called about the listing at 1247 Maple. Great property. Quick question. Are you working with a buyers agent already, or are we starting fresh? And ballpark, where do you need to be on price?"`,
    statValue: "Calendar aware",
    statLabel:
      "Qualified buyers can receive approved showing options from the connected calendar; follow up cadence and staff handoff remain configurable.",
    primaryCta: { label: "Create real estate agent", href: signupHrefForWedge("real-estate") },
    secondaryCta: { label: "Call real estate demo", href: "tel:+19733638874" },
    trustLine:
      "Supports connected HubSpot, Salesforce, Google Calendar, and Outlook paths. Buyers hear the brokerage identity you configure, subject to carrier display behavior.",
    faqs: [
      {
        q: "Will it know my listings?",
        a: "Yes. Paste listing URLs or details into the agent's knowledge base and it answers price, beds/baths, square footage, and neighborhood basics from that source, then pivots to scheduling a showing when the caller shows real interest. Direct MLS feed sync is on the roadmap.",
      },
      {
        q: "Does it work for a single agent or full brokerage?",
        a: "Both. Solo agents can start with one active agent and the phone capacity included in their plan; larger teams can add capacity and configure brokerage level routing. Runtime Balance covers supported usage beyond included plan allowances.",
      },
      {
        q: "How does it qualify the buyer?",
        a: "Configure the qualification fields your firm approves: preapproval status, timeline, price band, and whether the buyer is already represented. Matching callers can receive approved calendar options; follow up by SMS runs only through the cadence and consent rules you enable.",
      },
      {
        q: "Can it follow up on the cold leads I haven't touched?",
        a: "Import an approved lead list, choose a cadence, and supply the reengagement script and consent basis. When source fields such as price or neighborhood are present, the workflow can use them as context; results and contactability vary.",
      },
    ],
  },

  personal: {
    slug: "personal",
    metaTitle: "Wireline for Everyone | A Voice Agent for Calls You Avoid",
    metaDescription:
      "A personal voice agent for calls you avoid: appointments, customer service, billing disputes, returns, and follow ups. Starts at $19/mo, with Runtime Balance covering anything beyond your included minutes.",
    eyebrow: "For everyone who hates the phone",
    headline: "Hand off the calls you keep avoiding",
    pains: [
      {
        icon: "Clock",
        title: "Authorized billing and collections calls",
        body: "Past due collector keeps calling? Tell your agent the amount, the offer you can afford, and your approved script. The agent dials, stays within those bounds, asks for terms in writing, and reports back without promising a specific outcome.",
      },
      {
        icon: "Calendar",
        title: "Appointment booking you keep putting off",
        body: "Doctor's appointment three weeks overdue. Dentist cleaning. Salon. Auto shop. Veterinarian. Restaurant reservation for Saturday. Tell your agent the window that works and the office to call. It handles the back and forth and texts you the confirmation.",
      },
      {
        icon: "DollarSign",
        title: "Returns, billing disputes, customer service",
        body: "Cable bill suddenly jumped $40. Online order arrived broken. Insurance won't approve the claim. These are the calls that take an hour on hold and end with you frustrated. Your agent waits on hold, escalates politely, and logs whatever resolution the provider offers.",
      },
      {
        icon: "Shield",
        title: "Phone anxiety, social avoidance, neurodivergence",
        body: "Phone calls can be especially difficult for autistic and ADHD adults, people with social anxiety, and people with hearing disabilities. Wireline can handle an authorized call and return a readable summary; it is not an emergency or certified accessibility service.",
      },
    ],
    scriptPreview:
      "Hi, this is Alex calling on behalf of [Your Name] regarding account ending in 0000. [Your Name] authorized me to ask whether your team can consider a $1,200 one time payment offer and send any available terms in writing. If that is not something you can review, who should I speak with?",
    statValue: "Yours",
    statLabel:
      "Your voice agent calls on your behalf. You say what you need; it dials, talks, and reports back. You stay off the call.",
    primaryCta: { label: "Create personal agent", href: signupHrefForWedge("personal") },
    secondaryCta: { label: "Call our demo line", href: "tel:+15642389455" },
    trustLine:
      "Your agent follows the brief and limits you provide. Call outcomes are logged; recording is optional and off by default. You can stop active work or change the instructions at any time.",
    faqs: [
      {
        q: "Is it actually legal for an AI to make calls on my behalf?",
        a: "Wireline is a tool you authorize to place calls with your script and limits. Rules vary by call type, state, and account, so do not treat this as legal advice; configure calls using your own guidance. The agent identifies that it is calling on your behalf and records what happened.",
      },
      {
        q: "Can it really negotiate debt? Won't the collector just hang up on a robot?",
        a: "Wireline calls with your authorized offer, asks whether the collector can review it, and requests written terms when available. If a caller refuses to engage, it logs that and follows your escalation instructions. Outcomes aren't guaranteed, and this isn't legal or financial advice.",
      },
      {
        q: "What about voicemail / hold music / phone trees? Doesn't that break it?",
        a: "Your agent can navigate common IVR menus, wait on hold within configured call limits, leave an approved voicemail, and retry when your workflow allows. Some providers require identity checks or block automated callers, so outcomes vary.",
      },
      {
        q: "How is this different from just having a friend or family member call for me?",
        a: "It is ready when you choose to launch it, follows the same brief consistently, and returns a written outcome. Recording is optional and should be enabled only where lawful.",
      },
      {
        q: "What can't it do?",
        a: "Calls requiring identity verification beyond what you authorize (your bank's security questions, IRS interactions involving SSN, anything that legally requires appearing in person). Anything illegal or fraudulent. Calls to emergency services. The agent will tell you upfront if your request is out of scope.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    metaTitle: "Wireline for Insurance Agencies | Voice Quote Intake and Renewal Follow Up",
    metaDescription:
      "Voice + email agent for insurance agencies. Capture quote intake, FNOL details, renewal follow up, and producer ready notes.",
    eyebrow: "For Insurance Agencies",
    headline: "Keep quote intake and renewal follow up moving",
    pains: [
      {
        icon: "Phone",
        title: "Quote intake without the wait",
        body: "Caller wants an auto quote after hours? The agent gathers the fields you approve and routes a structured intake for a licensed producer to review.",
      },
      {
        icon: "Clock",
        title: "FNOL (first notice of loss) capture",
        body: "After hours claim calls don't have to go to voicemail. Agent captures policy #, date/time/location of loss, parties involved, injuries. Texts you immediately if it's serious, emails the desk for routine.",
      },
      {
        icon: "MailCheck",
        title: "Renewal follow up campaigns",
        body: "Choose the dates, channels, script, and stop conditions for approved renewal outreach. The agent records each attempt and can offer a review slot from the connected calendar.",
      },
      {
        icon: "Shield",
        title: "Carrier line compliance hedges",
        body: "Configured rules keep the agent from quoting binding coverage or making coverage promises. Outbound work still requires your approved consent basis, calling windows, DNC policy, and state specific script.",
      },
    ],
    scriptPreview: `"Hi, this is Alex with [Your Agency]. I see you requested an auto quote. I'd love to get you accurate numbers fast. Can you tell me the year, make, and model of your primary vehicle, and how many drivers we'll be covering?"`,
    statValue: "Configurable",
    statLabel:
      "Renewal timing, channels, retry limits, opt outs, and staff handoff stay under the agency's control.",
    primaryCta: { label: "Create insurance agent", href: signupHrefForWedge("insurance") },
    secondaryCta: { label: "Call insurance demo", href: "tel:+19044601596" },
    trustLine:
      "Callers hear the agency identity you configure, subject to carrier behavior. Transcripts follow tenant retention; recording is optional and off by default.",
    faqs: [
      {
        q: "Will it actually bind a policy?",
        a: "No. Binding requires a licensed agent. Wireline gathers the approved quote intake fields and routes the record to your producer for review and any coverage decision.",
      },
      {
        q: "Can it handle commercial lines, not just personal?",
        a: 'Yes. Configure agent personas per line of business: "Auto", "Home", "Commercial Auto", "GL/Business Owners", "Workers Comp". Each persona knows the right intake questions and which producer to hand the lead to.',
      },
      {
        q: "What about claims?",
        a: "FNOL intake mode captures the structured fields your carrier portals need (policy #, DOL, DOL location, parties, injuries, photos requested via SMS link). For complex losses the agent transfers live to your claims desk; for routine ones it emails the package and confirms the claim # with the insured by SMS.",
      },
      {
        q: "How does it compare to a 24/7 answering service?",
        a: "Compare Wireline on the complete intake and follow up workflow, not only the per call price. Paid plans include voice minutes, and prepaid Runtime Balance covers supported usage beyond the plan allowance.",
      },
    ],
  },

  restaurants: {
    slug: "restaurants",
    metaTitle: "Wireline for Restaurants | Voice Host for Reservations and Takeout",
    metaDescription:
      "Voice + email host for restaurants. Take reservations, capture takeout orders, handle event inquiries, and follow up by SMS.",
    eyebrow: "For Restaurants",
    headline: "The phone rings during dinner rush. The agent picks up",
    pains: [
      {
        icon: "Calendar",
        title: "Reservation taking without the hostess",
        body: "Captures party size, name, time, and special requests, then books through a connected calendar or approved reservation workflow. Confirmation timing is configurable.",
      },
      {
        icon: "PhoneIncoming",
        title: "Takeout orders done right",
        body: "Reads back each item, confirms substitutions, captures pickup time, and routes a structured order summary. Allergy questions are flagged for staff confirmation rather than answered speculatively.",
      },
      {
        icon: "Clock",
        title: "After hours and closed Sundays",
        body: "Closed Mondays? Route catering inquiries to a structured intake, then notify the manager through the handoff path you configure.",
      },
      {
        icon: "MailCheck",
        title: "Private events and catering pipeline",
        body: "Captures party size, date, dietary needs, budget range, and contact details. It can route a structured RFQ and offer approved tasting windows when those actions are configured.",
      },
    ],
    scriptPreview: `"Hi, thanks for calling [Your Restaurant]! Were you hoping to make a reservation, place an order to pick up, or ask about a private event? I can take care of all three."`,
    statValue: "Saturday 7pm",
    statLabel:
      "Built for the rush hour calls your host cannot reach: reservations, structured takeout requests, and event inquiries.",
    primaryCta: { label: "Create restaurant agent", href: signupHrefForWedge("restaurants") },
    secondaryCta: { label: "Call demo concierge", href: "tel:+15642389455" },
    trustLine:
      "Callers hear the restaurant identity and approved voice you configure. Custom voice options require explicit speaker consent and provider availability.",
    faqs: [
      {
        q: "Will it integrate with Resy / OpenTable / Tock?",
        a: 'Today the agent books against your connected Google or Outlook calendar. Caller hears "I have 7pm or 8:15pm, which works?" from real availability, and the reservation writes straight back. Direct Resy, OpenTable, and Tock sync is on the roadmap; tell us which one you use and we\'ll prioritize it.',
      },
      {
        q: "Can it handle dietary restrictions + allergens correctly?",
        a: "The workflow can capture allergens as a structured field and flag them for staff confirmation. The agent should not make medical or ingredient safety promises; the restaurant remains responsible for review and the final response.",
      },
      {
        q: "What about private event inquiries?",
        a: "Captures party size, date, food and beverage preferences, budget range, and contact information. When email routing is configured, it can send a structured RFQ and offer approved tasting windows under the threshold rules you set.",
      },
      {
        q: "How is this different from Yelp / Google booking widgets?",
        a: "Booking widgets cover web demand. Wireline adds a configurable voice path for callers, larger party questions, and private event inquiries your web form may not resolve.",
      },
    ],
  },

  sales: {
    slug: "sales",
    metaTitle: "Wireline for Sales Teams | Profit Recovery Phone Agents",
    metaDescription:
      "Compliance first phone agents for sales teams. Speed to lead, quote follow up, warm reactivation, and governed outbound queues with approved CRM actions.",
    eyebrow: "For Sales Teams",
    headline: "Your sales voice agent works the queue while your team works the deals",
    pains: [
      {
        icon: "Phone",
        title: "Governed outbound follow up",
        body: "Work approved lead queues with consent provenance, calling windows, and retry caps. Agent dials, navigates gatekeepers, runs your qualifier script, books the next step meeting, and logs every outcome for review.",
      },
      {
        icon: "Clock",
        title: "Fast, governed speed to lead",
        body: "An approved inbound request can enter a monitored queue immediately. The workflow calls within the timing, consent, and retry limits you configure, then qualifies and offers an approved next step.",
      },
      {
        icon: "Calendar",
        title: "Calendar aware booking",
        body: "Reads your reps' real Google/Outlook availability. Offers 2 or 3 specific slots. Books it. Sends calendar invites with prep materials. No back and forth scheduling email tennis.",
      },
      {
        icon: "Shield",
        title: "Outbound compliance controls",
        body: "The ledger records configured disclosures, opt outs, and suppression decisions. Workspace calling windows and attempt caps are checked before dial; marketing outreach remains blocked if required platform DNC coverage is not ready.",
      },
    ],
    scriptPreview: `"Hi, this is Casey calling from [Your Company]. I saw you downloaded our [resource] last week. Got 2 minutes to see if what we do is even a fit before I book any of your team's time?"`,
    statValue: "Fast follow up",
    statLabel:
      "Governed queues can respond quickly to inbound requests and approved warm leads while preserving consent, caps, and an audit trail.",
    primaryCta: { label: "Create sales voice agent", href: signupHrefForWedge("sales") },
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
        a: "It can ask for the named contact, give the approved reason for calling, request voicemail, and follow the retry limit you configure. If blocked, it logs the outcome for a person to review rather than trying to evade the gatekeeper.",
      },
      {
        q: "What about CRM logging?",
        a: "Approved actions sync to your connected CRM: contact, outcome (qualified / not qualified / no answer / callback), transcript, recording link, and next step booked. HubSpot and Salesforce are supported today; Apollo for enrichment is in beta. Custom CRMs via webhook.",
      },
      {
        q: "How is this different from Apollo / Outreach AI features?",
        a: "Those products center on sales sequencing and enrichment. Wireline centers on governed voice workflows, call outcomes, and connected follow up. Use each only where its configured integration and your consent policy support the workflow.",
      },
    ],
  },
};
