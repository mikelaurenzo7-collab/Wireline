import { signupHrefForWedge } from "../lib/signup-intent";

const PRODUCT_TOUR_CTA = { label: "See How It Works", href: "/features" } as const;

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
 * pulled the whole lucide-react barrel and React component machinery into
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
    metaTitle: "BotBound for Home Services | Phone Bots for Calls and Follow-Up",
    metaDescription:
      "A voice-first Bot for HVAC, plumbing, electrical, and roofing teams. Answer after-hours calls, book jobs, and follow up on open quotes.",
    eyebrow: "For Home Services Pros",
    headline: "Turn After-Hours Calls into Scheduled Work",
    pains: [
      {
        icon: "Clock",
        title: "24/7 Emergency Intake",
        body: "Burst pipes do not wait for office hours. Your Bot can answer, qualify the urgency, alert the person on call, and text the caller a confirmation.",
      },
      {
        icon: "Calendar",
        title: "Books to Your Calendar",
        body: "Uses your Calendar hours and booking rules to offer available times, book the visit, or request your approval. Google and Outlook busy-time imports are optional.",
      },
      {
        icon: "DollarSign",
        title: "Quote Follow-Up",
        body: "Use the original quote context to ask the next question, book a visit, and record the outcome.",
      },
      {
        icon: "Shield",
        title: "Outreach Controls",
        body: "Choose who receives follow-up, the calling window, retry limits, and when your Bot should stop.",
      },
    ],
    scriptPreview: `"Hey, this is Sarah from [Your Company]. Sounds like you have water coming through the ceiling. Let me get you on the schedule right now. Are you home in the next 90 minutes or would after 5 work better?"`,
    statValue: "24 / 7",
    statLabel:
      "Built for the after-hours calls, urgent requests, and quote follow-ups your team chooses to route.",
    primaryCta: { label: "Create Home Services Bot", href: signupHrefForWedge("home-services") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Uses your configured company identity. Final caller ID display depends on carrier, network, device, and completed identity review.",
    faqs: [
      {
        q: "Will Customers Know They Are Talking to a Bot?",
        a: 'BotBound Bots use the company identity, disclosure language, and jurisdiction rules you configure, for example "Sarah from Premier HVAC." Configured disclosure and consent events are logged for review; your team remains responsible for the policy and its legal sufficiency.',
      },
      {
        q: "What Happens If the Bot Does Not Know the Answer?",
        a: "The Bot says it does not have that detail handy and offers to follow up by text or email, or transfer to you live. Configure the escalation number per shift in Settings. It is designed to decline uncertain details, follow your escalation rules, and leave a reviewable record.",
      },
      {
        q: "Can the Bot Actually Dispatch Me on an Emergency?",
        a: "Configure on-call routing and approved urgency rules such as water, smoke, sparks, or no heat. The workflow can alert staff and offer available Google or Outlook calendar windows; emergency dispatch, arrival promises, and direct field-service write-back stay with the tools and people you approve.",
      },
      {
        q: "How Much Does It Cost Compared with an Answering Service?",
        a: "Calls plans start at $19/month with included minutes and prepaid Runtime Balance for additional calls. Add Email when you need it. Compare the workflow, connected tools, and logged outcomes against your answering service. SMS activation is pending.",
      },
    ],
  },

  medical: {
    slug: "medical",
    metaTitle: "BotBound for Medical Practices | Phone Bots for Intake and Scheduling",
    metaDescription:
      "A voice-first Bot for dental, med spa, chiropractic, and primary care practices. Handle approved intake, book appointments, continue by text and email, and route exceptions.",
    eyebrow: "For Medical Practices",
    headline: "Patients on Hold Become Patients on the Schedule",
    pains: [
      {
        icon: "Phone",
        title: "No More Dropped Calls",
        body: "Route overflow or after-hours calls to a Bot that gathers the visit reason, follows your urgency rules, and offers configured next steps.",
      },
      {
        icon: "Calendar",
        title: "Books to Your Connected Calendar",
        body: "Reads connected Google or Outlook availability, respects configured buffers, books supported events, and can send a text confirmation.",
      },
      {
        icon: "MailCheck",
        title: "Recall and Recare Follow-Up",
        body: "Your Bot can contact approved recall lists, reference authorized visit context, and offer convenient appointment windows across voice, text, or email.",
      },
      {
        icon: "Shield",
        title: "Compliance-Aware, Not Certified",
        body: "Healthcare-sensitive intake controls include consent logging, opt-out enforcement, recording off by default, and configurable retention. Do not use BotBound for PHI unless a signed BAA and approved configuration are confirmed in writing.",
      },
    ],
    scriptPreview: `"Thanks for calling Dr. Chen's office. I can help schedule your visit. Was this for a cleaning, a specific concern, or something else? Got it. Our next opening for that is Thursday at 2:15 or Friday at 9. Which works?"`,
    statValue: "After Hours",
    statLabel:
      "Route the calls your team cannot answer so configured intake and scheduling can continue after hours.",
    primaryCta: { label: "Create Medical Bot", href: signupHrefForWedge("medical") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Uses your configured practice identity, subject to carrier display support. Do not use BotBound for PHI unless a signed BAA and approved configuration are confirmed in writing.",
    faqs: [
      {
        q: "Is BotBound HIPAA Compliant?",
        a: "No. BotBound offers healthcare-sensitive guardrails, but does not claim HIPAA compliance or certification. Do not use it for PHI unless BotBound confirms a signed BAA and approved configuration in writing.",
      },
      {
        q: "Can the Bot Actually Book to My Existing Schedule?",
        a: "Set your hours, buffers, and confirmation preference in Calendar. Your Bot can book an available time or request your approval. You can also import Google or Outlook busy times; new native bookings stay in BotBound.",
      },
      {
        q: "What About Insurance Verification?",
        a: "The Bot can capture the insurance fields you approve during intake and route them with the appointment record. It does not verify eligibility today; your staff must validate coverage in the systems you already use.",
      },
      {
        q: "Will Patients Accept a Phone Bot?",
        a: "The practical win is no hold time: a clear Bot that uses your practice name and resolves routine scheduling quickly can be better than waiting on the line. Disclosure choices and consent language should match your practice policy and applicable rules.",
      },
    ],
  },

  legal: {
    slug: "legal",
    metaTitle: "BotBound for Law Firms | Phone Bots for Intake and Consult Routing",
    metaDescription:
      "A voice-first Bot for law firms. Capture new matters, qualify urgency, schedule consults, continue by text and email, and route conflict checks for staff review.",
    eyebrow: "For Law Firms",
    headline: "Give Every Routed Intake a Clear Next Step",
    pains: [
      {
        icon: "Phone",
        title: "Structured New-Matter Intake",
        body: "Route overflow or after-hours calls to a Bot that captures matter type, urgency, contact details, and the next approved intake step.",
      },
      {
        icon: "MailCheck",
        title: "Firm-Approved Intake Language",
        body: "Uses the disclaimer and intake language your firm approves. BotBound does not determine whether privilege exists and is configured not to provide legal advice.",
      },
      {
        icon: "Calendar",
        title: "Conflict-Check Workflow",
        body: "Captures prospective client and opposing party names, then routes the record for staff conflict review before any workflow you mark as requiring clearance.",
      },
      {
        icon: "DollarSign",
        title: "Protect Valuable Intake Demand",
        body: "Turn paid and organic call demand into structured, reviewable intake while your team keeps control of qualification and engagement decisions.",
      },
    ],
    scriptPreview: `"Thank you for calling Henderson Law. I can collect some initial information for the firm's review. This intake does not provide legal advice or create an attorney client relationship. Can you briefly describe what brings you in today?"`,
    statValue: "Review Ready",
    statLabel:
      "Captures the prospective client, opposing party, and matter type, then routes the record to your designated reviewer.",
    primaryCta: { label: "Create Legal Intake Bot", href: signupHrefForWedge("legal") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Audit logs preserve configured disclosures and opt-outs. BotBound is the intake layer; your attorneys deliver the advice.",
    faqs: [
      {
        q: "Does the Bot Give Legal Advice?",
        a: "No. The Bot is an intake specialist: it captures the matter, schedules the consult, and hands off to an attorney. It explicitly tells callers it cannot provide legal advice and that anything substantive needs the attorney. Refusal is enforced in the directive layer.",
      },
      {
        q: "How Does It Handle Conflict Checks?",
        a: "The Bot captures the prospective client name, opposing party name, and matter type. It can route that record through connected Slack or your approved handoff path. Your firm remains responsible for running and clearing conflicts before engagement or scheduling when required.",
      },
      {
        q: "What About Attorney-Client Privilege?",
        a: "BotBound cannot determine whether attorney-client privilege applies. Your firm supplies the approved disclaimer, recording policy, retention settings, and staff access rules; configured disclosures are logged for review.",
      },
      {
        q: "Can It Qualify by Case Type Before Booking?",
        a: "Yes. Configure your firm's qualification gates, and the Bot walks through them conversationally. Callers outside the configured fit receive the approved next step instead of occupying a consult slot.",
      },
    ],
  },

  "real-estate": {
    slug: "real-estate",
    metaTitle: "BotBound for Real Estate | Phone Bots for Listing Calls and Follow-Up",
    metaDescription:
      "A voice-first Bot for real estate teams. Qualify buyers, book showings, and reconnect with older leads.",
    eyebrow: "For Real Estate",
    headline: "Work More Listing Calls Without Losing Control",
    pains: [
      {
        icon: "Phone",
        title: "Listing-Call Concierge",
        body: "When a sign call comes in, your Bot can capture timeline, budget, preapproval status, and representation, then alert the listing agent when the lead meets your rules.",
      },
      {
        icon: "Calendar",
        title: "Showing Scheduler",
        body: "Books showings around the listing agent's real calendar, adds buffer time, confirms by text, and can update supported events when the workflow and your rules allow it.",
      },
      {
        icon: "Sparkles",
        title: "Lead Reactivation",
        body: "Build follow-up playbooks for older leads from approved lists and source context, with clear next steps.",
      },
      {
        icon: "DollarSign",
        title: "CRM-Native Pipeline",
        body: "Can push qualified leads into connected HubSpot or Salesforce records with the call summary and approved next-step task.",
      },
    ],
    scriptPreview: `"Hi. You called about the listing at 1247 Maple. Great property. Quick question. Are you working with a buyer's agent already, or are we starting fresh? And ballpark, where do you need to be on price?"`,
    statValue: "Calendar Aware",
    statLabel:
      "Qualified buyers can receive approved showing options from the connected calendar; follow-up cadence and staff handoff remain configurable.",
    primaryCta: { label: "Create Real Estate Bot", href: signupHrefForWedge("real-estate") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Supports connected HubSpot, Salesforce, Google Calendar, and Outlook paths. Buyers hear the brokerage identity you configure, subject to carrier display behavior.",
    faqs: [
      {
        q: "Will the Bot Know My Listings?",
        a: "Yes. Add listing URLs or details to the Bot's knowledge, and it can answer price, beds, baths, square footage, and neighborhood basics from that source, then pivot to scheduling a showing when the caller shows interest. Direct MLS feed sync remains on the roadmap.",
      },
      {
        q: "Does It Work for a Single Professional or a Full Brokerage?",
        a: "Both. Solo users can start with one live Bot and the phone capacity included in their plan; larger teams can add Bot capacity and configure brokerage-level routing in the same workspace. Runtime Balance covers supported usage beyond included plan allowances.",
      },
      {
        q: "How Does It Qualify the Buyer?",
        a: "Configure the qualification fields your firm approves: preapproval status, timeline, price band, and whether the buyer is already represented. Matching callers can receive approved calendar options; text follow-up runs only through the cadence and consent rules you enable.",
      },
      {
        q: "Can It Follow Up on Older Leads I Have Not Reached?",
        a: "Import an approved lead list, choose a cadence, and give your Bot a reengagement script. You control who is contacted and when the sequence stops.",
      },
    ],
  },

  personal: {
    slug: "personal",
    metaTitle: "BotBound for Everyone | Set Up a Phone Bot for Calls You Avoid",
    metaDescription:
      "Create a Phone Bot for appointments and customer-service calls. Give it a call brief, set limits, and rehearse before it acts.",
    eyebrow: "For Everyone Who Hates the Phone",
    headline: "Set Up a Bot for the Calls You Keep Avoiding",
    pains: [
      {
        icon: "Clock",
        title: "Billing Calls",
        body: "Prepare an approved offer, rehearse the conversation, and ask for any available terms in writing.",
      },
      {
        icon: "Calendar",
        title: "Appointments",
        body: "Choose the office and a time window, then give your Bot the questions to ask and the details to confirm.",
      },
      {
        icon: "DollarSign",
        title: "Returns & Disputes",
        body: "Rehearse how your Bot should state the approved request, handle a hold, and report an escalation.",
      },
      {
        icon: "Shield",
        title: "Phone Support",
        body: "Set up authorized call instructions and review a private rehearsal. Not an emergency or certified accessibility service.",
      },
    ],
    scriptPreview:
      "Hi, this is Alex calling on behalf of [Your Name] regarding account ending in 0000. [Your Name] authorized me to ask whether your team can consider a $1,200 one-time payment offer and send any available terms in writing. If that is not something you can review, who should I speak with?",
    statValue: "Yours",
    statLabel:
      "Set the brief, boundaries, and next step. Your Bot follows the instructions you approve.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("personal") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Your Bot follows the brief and limits you provide. Call outcomes are logged; recording is optional and off by default. You can stop active work or change the instructions at any time.",
    faqs: [
      {
        q: "How Do I Prepare a Call?",
        a: "Give your Bot a call brief, choose whom to contact, set boundaries, and rehearse the conversation before activation. Rules vary by call type and location; use your own legal guidance.",
      },
      {
        q: "Can It Negotiate Debt?",
        a: "You can rehearse an authorized offer and a request for written terms. Outcomes are not guaranteed; this is not legal or financial advice.",
      },
      {
        q: "Can It Handle Phone Menus and Hold Time?",
        a: "You can rehearse menu choices, hold instructions, voicemail wording, and retry limits as part of the call brief.",
      },
      {
        q: "Why Not Ask a Friend?",
        a: "Your Bot keeps the instructions and boundaries together, so you can refine the call before deciding how to proceed. Recording is optional and should be enabled only where lawful.",
      },
      {
        q: "What Can't It Do?",
        a: "Calls requiring identity verification beyond what you authorize, anything illegal or fraudulent, emergency-service calls, or work that legally requires appearing in person. Your Bot will tell you when a request is outside the supported scope.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    metaTitle: "BotBound for Insurance Agencies | Phone Bots for Quote Intake and Renewals",
    metaDescription:
      "A voice-first Bot for insurance agencies. Capture quote intake, first-notice-of-loss details, and renewal follow-up.",
    eyebrow: "For Insurance Agencies",
    headline: "Keep Quote Intake and Renewal Follow-Up Moving",
    pains: [
      {
        icon: "Phone",
        title: "Quote Intake Without the Wait",
        body: "When a caller requests a quote after hours, the Bot gathers the fields you approve and routes a structured intake for a licensed producer to review.",
      },
      {
        icon: "Clock",
        title: "First Notice of Loss Capture",
        body: "After-hours claim calls do not have to go to voicemail. The Bot captures approved loss fields and routes urgent or routine cases through the handoff paths you configure.",
      },
      {
        icon: "MailCheck",
        title: "Renewal Follow-Up",
        body: "Set renewal dates, channels, scripts, and stop conditions so follow-up stays on schedule.",
      },
      {
        icon: "Shield",
        title: "Licensed-Decision Boundaries",
        body: "Set boundaries for licensed decisions. The Bot collects details and routes coverage questions to your producer.",
      },
    ],
    scriptPreview: `"Hi, this is Alex with [Your Agency]. I see you requested an auto quote. I'd love to get you accurate numbers fast. Can you tell me the year, make, and model of your primary vehicle, and how many drivers we'll be covering?"`,
    statValue: "Configurable",
    statLabel:
      "Renewal timing, channels, retry limits, opt-outs, and staff handoff stay under the agency's control.",
    primaryCta: { label: "Create Insurance Bot", href: signupHrefForWedge("insurance") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Callers hear the agency identity you configure, subject to carrier behavior. Transcripts follow tenant retention; recording is optional and off by default.",
    faqs: [
      {
        q: "Will the Bot Actually Bind a Policy?",
        a: "No. Binding requires a licensed person. BotBound gathers the approved quote-intake fields and routes the record to your producer for review and any coverage decision.",
      },
      {
        q: "Can It Handle Commercial Lines, Not Just Personal?",
        a: "Yes. Configure Bots or role templates by line of business, such as Auto, Home, Commercial Auto, General Liability, Business Owners, or Workers Compensation. Each can use the right intake questions and route to the appropriate producer inside the same workspace.",
      },
      {
        q: "What About Claims?",
        a: "First-notice-of-loss mode captures the structured fields your carrier workflow needs. Complex losses can transfer to your claims desk; routine ones can route a structured package and send an approved confirmation by text or email.",
      },
      {
        q: "How Does It Compare with a 24/7 Answering Service?",
        a: "Compare BotBound on the complete intake, conversation, follow-up, and logged outcome, not only the per-call price. Paid plans include voice minutes, and prepaid Runtime Balance covers supported usage beyond the plan allowance.",
      },
    ],
  },

  restaurants: {
    slug: "restaurants",
    metaTitle: "BotBound for Restaurants | Phone Bots for Reservations and Takeout",
    metaDescription:
      "A voice-first Bot for restaurants. Take reservations, capture takeout requests, handle event inquiries, continue by text and email, and route exceptions to staff.",
    eyebrow: "For Restaurants",
    headline: "The Phone Rings During Dinner Rush. The Bot Picks Up",
    pains: [
      {
        icon: "Calendar",
        title: "Reservation Taking Without the Host",
        body: "Captures party size, name, time, and special requests, then books through a connected calendar or approved reservation workflow. Confirmation timing is configurable.",
      },
      {
        icon: "PhoneIncoming",
        title: "Takeout Requests Done Right",
        body: "Reads back each item, confirms substitutions, captures pickup time, and routes a structured order summary. Allergy questions are flagged for staff confirmation rather than answered speculatively.",
      },
      {
        icon: "Clock",
        title: "After Hours and Closed Days",
        body: "Route catering and private-event inquiries to a structured intake, then notify the manager through the handoff path you configure.",
      },
      {
        icon: "MailCheck",
        title: "Private Events and Catering Pipeline",
        body: "Captures party size, date, dietary needs, budget range, and contact details. It can route a structured request and offer approved tasting windows when those actions are configured.",
      },
    ],
    scriptPreview: `"Hi, thanks for calling [Your Restaurant]! Were you hoping to make a reservation, place an order to pick up, or ask about a private event? I can help with all three."`,
    statValue: "Saturday 7pm",
    statLabel:
      "Built for the rush-hour calls your host cannot reach: reservations, structured takeout requests, and event inquiries.",
    primaryCta: { label: "Create Restaurant Bot", href: signupHrefForWedge("restaurants") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Callers hear the restaurant identity and the built-in OpenAI voice you choose; that speaker stays consistent for the full call.",
    faqs: [
      {
        q: "Will It Integrate with Resy, OpenTable, or Tock?",
        a: 'Today the Bot books against your connected Google or Outlook calendar. The caller can hear "I have 7pm or 8:15pm, which works?" from real availability, and the reservation writes back. Direct Resy, OpenTable, and Tock sync remains on the roadmap.',
      },
      {
        q: "Can It Handle Dietary Restrictions and Allergens Correctly?",
        a: "The workflow can capture allergens as a structured field and flag them for staff confirmation. The Bot should not make medical or ingredient-safety promises; the restaurant remains responsible for review and the final response.",
      },
      {
        q: "What About Private-Event Inquiries?",
        a: "The Bot captures party size, date, food and beverage preferences, budget range, and contact information. When email routing is configured, it can send a structured request and offer approved tasting windows under the threshold rules you set.",
      },
      {
        q: "How Is This Different from Yelp or Google Booking Widgets?",
        a: "Booking widgets cover web demand. BotBound adds a configurable Phone Bot for callers, larger-party questions, takeout requests, and private-event inquiries your web form may not resolve.",
      },
    ],
  },

  sales: {
    slug: "sales",
    metaTitle: "BotBound for Sales Teams | Phone Bots for Lead Follow-Up",
    metaDescription:
      "Give a Sales Bot the playbook for speed-to-lead, quote follow-up, warm reactivation, and approved CRM actions.",
    eyebrow: "For Sales Teams",
    headline: "Set Up a Sales Bot for Lead Follow-Up",
    pains: [
      {
        icon: "Phone",
        title: "Outbound Follow-Up",
        body: "Give your Bot a lead list, a call playbook, calling windows, and retry limits. Reviewable outcomes keep the next step clear.",
      },
      {
        icon: "Clock",
        title: "Speed to Lead",
        body: "Turn an inbound request into a timely call, qualification, and booked next step.",
      },
      {
        icon: "Calendar",
        title: "Calendar-Aware Booking",
        body: "Reads your team's real Google or Outlook availability, offers specific slots, books the meeting, sends the invitation, and preserves the conversation context.",
      },
      {
        icon: "Shield",
        title: "Calling Controls",
        body: "Set who the Bot can contact, when it can call, how often to retry, and when to stop.",
      },
    ],
    scriptPreview: `"Hi, this is Casey calling from [Your Company]. I saw you downloaded our [resource] last week. Got 2 minutes to see if what we do is even a fit before I book any of your team's time?"`,
    statValue: "Fast Follow-Up",
    statLabel:
      "Give new requests and selected leads a clear next step, from the first call through booking and follow-up.",
    primaryCta: { label: "Create Sales Bot", href: signupHrefForWedge("sales") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Connects to HubSpot and Salesforce. Approved actions sync to your connected CRM. Apollo enrichment is available in beta.",
    faqs: [
      {
        q: "Can I Shape What the Bot Says?",
        a: "Yes. Set its introduction, qualification questions, offer details, booking rules, and next step. Rehearse the playbook before activation.",
      },
      {
        q: "How Do I Control Outreach?",
        a: "You choose the contacts, playbook, calling window, retry limits, and stop conditions. Rehearse the workflow before activation; the Trust Center explains the safeguards applied to live calls.",
      },
      {
        q: "What About CRM Logging?",
        a: "Approved actions sync to your connected CRM: contact, outcome, transcript, recording link, and next step booked. HubSpot and Salesforce are supported today; Apollo enrichment is in beta. Custom CRMs can use webhooks.",
      },
      {
        q: "How Is This Different from Apollo or Outreach AI Features?",
        a: "Those products center on sales sequencing and enrichment. BotBound centers on voice conversations, call outcomes, and connected text and email follow-up when those channels are enabled.",
      },
    ],
  },
};
