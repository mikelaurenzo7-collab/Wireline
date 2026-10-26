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
    metaTitle: "BotBound for Home Services | Phone Bots for Calls and Booking",
    metaDescription:
      "A voice first Bot for HVAC, plumbing, electrical, and roofing teams. Answer after hours calls, capture requests, and book available appointments.",
    eyebrow: "For Home Services Pros",
    headline: "Keep the Work Moving",
    pains: [
      {
        icon: "Clock",
        title: "24/7 Emergency Intake",
        body: "Burst pipes do not wait for office hours. Your Bot can answer, qualify the urgency, alert the person on call, and record the next step.",
      },
      {
        icon: "Calendar",
        title: "Books to Your Calendar",
        body: "Uses your Calendar hours and booking rules to offer available times, book the visit, or request your approval. Google and Outlook busy time imports are optional.",
      },
      {
        icon: "DollarSign",
        title: "Quote Requests",
        body: "Capture the job details, answer approved questions, and save a clear request for your review.",
      },
      {
        icon: "Shield",
        title: "Your Handoff Rules",
        body: "Choose which questions your Bot can answer and when it should bring in a person.",
      },
    ],
    scriptPreview: `"Thanks for calling [Your Company]. I'm Sarah, an AI assistant. I can take the details for our team or help you find an available appointment. What do you need help with today?"`,
    statValue: "24 / 7",
    statLabel:
      "Built for the after hours calls, urgent requests, and quote inquiries your team chooses to route.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("home-services") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Your greeting, approved answers, and handoff rules guide every incoming conversation.",
    faqs: [
      {
        q: "Will Customers Know They Are Talking to a Bot?",
        a: 'BotBound Bots use the company identity, disclosure language, and jurisdiction rules you configure, for example "Sarah from Premier HVAC." Configured disclosure and consent events are logged for review; your team remains responsible for the policy and its legal sufficiency.',
      },
      {
        q: "What Happens If the Bot Does Not Know the Answer?",
        a: "The Bot says it does not have that detail handy and offers an approved next step, such as email or a live transfer to your configured handoff destination. It is designed to decline uncertain details, follow your escalation rules, and leave a reviewable record.",
      },
      {
        q: "Can the Bot Actually Dispatch Me on an Emergency?",
        a: "Configure on call routing and approved urgency rules such as water, smoke, sparks, or no heat. The workflow can alert staff and offer available times from your configured Calendar; emergency dispatch, arrival promises, and direct field service write back stay with the tools and people you approve.",
      },
      {
        q: "How Much Does It Cost Compared with an Answering Service?",
        a: "Compare the current monthly plans on Pricing. Each plan includes a local number, email address and shared work, with a spending limit you control.",
      },
    ],
  },

  medical: {
    slug: "medical",
    metaTitle: "BotBound for Medical Practices | Phone Bots for Intake and Scheduling",
    metaDescription:
      "A voice first Bot for general practice information and scheduling demonstrations. Use fictional details for rehearsals. Do not use BotBound for protected health information without an approved configuration and signed BAA.",
    eyebrow: "For Medical Practices",
    headline: "Every Caller. Clear Limits.",
    pains: [
      {
        icon: "Phone",
        title: "No More Dropped Calls",
        body: "Route overflow or after hours calls to a Bot that answers general office questions and explains how to arrange an appointment with your staff.",
      },
      {
        icon: "Calendar",
        title: "Books Around Your Availability",
        body: "Uses the hours, timezone, and buffers you set in BotBound Calendar to offer times and record supported bookings. Google or Outlook busy times can be imported when you sync.",
      },
      {
        icon: "MailCheck",
        title: "General Practice Questions",
        body: "Answer approved questions about office hours, location, and general services. Route personal medical questions to your staff.",
      },
      {
        icon: "Shield",
        title: "Compliance Aware, Not Certified",
        body: "Healthcare sensitive intake controls include consent logging, opt out enforcement, recording off by default, and configurable retention. Do not use BotBound for PHI unless a signed BAA and approved configuration are confirmed in writing.",
      },
    ],
    scriptPreview: `"Thanks for calling Dr. Chen's office. I'm an AI assistant. I can share office hours and explain how to request an appointment with our staff. Are you looking for our opening hours or scheduling instructions?"`,
    statValue: "After Hours",
    statLabel:
      "Route the calls your team cannot answer so configured intake and scheduling can continue after hours.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("medical") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Use your practice greeting and approved general information. Do not use BotBound for PHI unless a signed BAA and approved configuration are confirmed in writing.",
    faqs: [
      {
        q: "Is BotBound HIPAA Compliant?",
        a: "No. BotBound offers healthcare sensitive guardrails, but does not claim HIPAA compliance or certification. Do not use it for PHI unless BotBound confirms a signed BAA and approved configuration in writing.",
      },
      {
        q: "Can the Bot Actually Book to My Existing Schedule?",
        a: "Set your hours, buffers, and confirmation preference in Calendar. Your Bot can book an available time or request your approval. You can also import Google or Outlook busy times; new native bookings stay in BotBound.",
      },
      {
        q: "What About Insurance Verification?",
        a: "Your Bot can explain how to reach your scheduling staff. Insurance eligibility and coverage checks stay with your team in your existing systems. Do not collect insurance details without a signed BAA and approved configuration.",
      },
      {
        q: "Will Patients Accept a Phone Bot?",
        a: "Your Bot can answer routine questions using approved practice information and help with available appointments. Its greeting, disclosures, and recording choices should match your practice policy and applicable rules.",
      },
    ],
  },

  legal: {
    slug: "legal",
    metaTitle: "BotBound for Law Firms | Phone Bots for Intake and Consult Routing",
    metaDescription:
      "A voice first Bot for law firms. Capture new matters, qualify urgency, schedule consults, continue by email, and route conflict checks for staff review.",
    eyebrow: "For Law Firms",
    headline: "Intake with Next Steps",
    pains: [
      {
        icon: "Phone",
        title: "Structured New Matter Intake",
        body: "Route overflow or after hours calls to a Bot that captures matter type, urgency, contact details, and the next approved intake step.",
      },
      {
        icon: "MailCheck",
        title: "Firm Approved Intake Language",
        body: "Uses the disclaimer and intake language your firm approves. BotBound does not determine whether privilege exists and is configured not to provide legal advice.",
      },
      {
        icon: "Calendar",
        title: "Conflict Check Workflow",
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
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("legal") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Audit logs preserve configured disclosures and opt outs. BotBound is the intake layer; your attorneys deliver the advice.",
    faqs: [
      {
        q: "Does the Bot Give Legal Advice?",
        a: "No. The Bot is an intake specialist: it captures the matter, schedules the consult, and hands off to an attorney. It explicitly tells callers it cannot provide legal advice and that anything substantive needs the attorney. Refusal is enforced in the directive layer.",
      },
      {
        q: "How Does It Handle Conflict Checks?",
        a: "The Bot captures the prospective client name, opposing party name, and matter type for your review in BotBound. Your firm remains responsible for running and clearing conflicts before engagement or scheduling when required.",
      },
      {
        q: "What About Attorney Client Privilege?",
        a: "BotBound cannot determine whether attorney client privilege applies. Your firm supplies the approved disclaimer, recording policy, retention settings, and staff access rules; configured disclosures are logged for review.",
      },
      {
        q: "Can It Qualify by Case Type Before Booking?",
        a: "Yes. Configure your firm's qualification gates, and the Bot walks through them conversationally. Callers outside the configured fit receive the approved next step instead of occupying a consult slot.",
      },
    ],
  },

  "real-estate": {
    slug: "real-estate",
    metaTitle: "BotBound for Real Estate | Phone Bots for Listing Calls",
    metaDescription:
      "A voice first Bot for real estate professionals. Answer listing calls, capture buyer needs, and book available showings.",
    eyebrow: "For Real Estate",
    headline: "Keep Up with Every Inquiry",
    pains: [
      {
        icon: "Phone",
        title: "Listing Call Concierge",
        body: "When a sign call comes in, your Bot can capture timeline, budget, preapproval status, and representation, then alert the listing agent when the lead meets your rules.",
      },
      {
        icon: "Calendar",
        title: "Showing Scheduler",
        body: "Uses your configured hours, buffers, and any busy times you import to offer showing slots and record supported bookings.",
      },
      {
        icon: "Sparkles",
        title: "Listing Questions",
        body: "Use the listing details you provide to answer common questions and collect what the buyer needs next.",
      },
      {
        icon: "DollarSign",
        title: "Reviewable Lead Pipeline",
        body: "Keeps qualified buyer details, call outcomes, and next steps visible in BotBound for staff review.",
      },
    ],
    scriptPreview: `"Hi. You called about the listing at 1247 Maple. Great property. Quick question. Are you working with a buyer's agent already, or are we starting fresh? And ballpark, where do you need to be on price?"`,
    statValue: "Calendar Aware",
    statLabel:
      "Qualified buyers can receive showing options from your configured Calendar. You set the rules for staff handoff.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("real-estate") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Callers hear your configured brokerage greeting. Your team can review outcomes and next steps in BotBound.",
    faqs: [
      {
        q: "Will the Bot Know My Listings?",
        a: "Yes. Add listing URLs or details to the Bot's knowledge, and it can answer price, beds, baths, square footage, and neighborhood basics from that source, then offer available showing times. Keep those details current in Training.",
      },
      {
        q: "Does It Work for a Single Professional or a Full Brokerage?",
        a: "A solo professional can start on a Calls plan and add more Bots in the same workspace. For brokerage needs beyond included phone capacity, contact BotBound to plan the rollout. Extra usage is billed at the listed rates.",
      },
      {
        q: "How Does It Qualify the Buyer?",
        a: "Configure the qualification fields your firm approves: preapproval status, timeline, price band, and whether the buyer is already represented. Matching callers can receive available calendar options and an email recap when Email is enabled.",
      },
      {
        q: "Do I Need a CRM?",
        a: "No. Start with your Bot's knowledge, calendar, and call records. You can review requests and next steps in BotBound.",
      },
    ],
  },

  personal: {
    slug: "personal",
    metaTitle: "BotBound for You | Calls, Email, and Everyday Tasks",
    metaDescription:
      "Create a Bot to answer incoming calls, organize email, and research everyday tasks online. Set its knowledge and limits, then rehearse before going live.",
    eyebrow: "For You",
    headline: "Make Room for Your Day",
    pains: [
      {
        icon: "Clock",
        title: "A Bot to Answer",
        body: "Answer calls on your own Bot line, take messages, and keep the next steps together.",
      },
      {
        icon: "MailCheck",
        title: "Your Bot's Inbox",
        body: "Give your Bot a managed email address to receive messages, draft replies, and send approved email.",
      },
      {
        icon: "DollarSign",
        title: "Research and Planning",
        body: "Send your Bot online to compare options, read a policy, or find the details you need.",
      },
      {
        icon: "Shield",
        title: "Work and Business",
        body: "Use the same workspace for personal plans, client appointments, and your business front desk.",
      },
    ],
    scriptPreview:
      "Thanks for calling. I'm Alex, an AI assistant for [Your Name]. I can take a message or help with the information they've shared. What would help today?",
    statValue: "Yours",
    statLabel:
      "Set the brief, boundaries, and next step. Your Bot follows the instructions you approve.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("personal") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Your Bot follows the brief and limits you provide. Call outcomes are logged; recording is optional and off by default. You can stop active work or change the instructions at any time.",
    faqs: [
      {
        q: "How Does My Bot Answer Calls?",
        a: "Create your Bot, add the information it can share, and rehearse its greeting and answers. Activate a Calls plan and choose a number for people to reach it. Review the conversation and captured requests in your workspace.",
      },
      {
        q: "Can I Use the Same Bot for My Business?",
        a: "Yes. The same plans and workspace support personal tasks and business work. Set the knowledge, permissions, and tools for each job.",
      },
      {
        q: "What Can Its Computer Do?",
        a: "Give it a task such as comparing services, finding opening hours, or summarizing a webpage. Your Bot can research online and return a useful result. Tasks use your plan's AI allowance, and actions that need approval wait for your review.",
      },
      {
        q: "Can I Start with Calls and Add Email Later?",
        a: "Yes. Start with Calls, then contact us for an email setup and plan review. Activate your Bot's managed mailbox after that review is complete.",
      },
      {
        q: "What Can't It Do?",
        a: "Your Bot cannot act as an emergency service, make decisions that require a licensed professional, or access private accounts without permission. Set its instructions and approvals around the work you want it to handle.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    metaTitle: "BotBound for Insurance Agencies | Phone Bots for Quote Intake",
    metaDescription:
      "A voice first Bot for insurance agencies. Answer incoming questions, capture quote intake and first notice of loss details, and route requests to your team.",
    eyebrow: "For Insurance Agencies",
    headline: "Every Call. Next Steps.",
    pains: [
      {
        icon: "Phone",
        title: "Quote Intake Without the Wait",
        body: "When a caller requests a quote after hours, the Bot gathers the fields you approve and routes a structured intake for a licensed producer to review.",
      },
      {
        icon: "Clock",
        title: "First Notice of Loss Capture",
        body: "After hours claim calls do not have to go to voicemail. The Bot captures approved loss fields and routes urgent or routine cases through the handoff paths you configure.",
      },
      {
        icon: "MailCheck",
        title: "Renewal Questions",
        body: "Capture the caller's renewal questions and route them to the licensed person who can help.",
      },
      {
        icon: "Shield",
        title: "Licensed Decision Boundaries",
        body: "Set boundaries for licensed decisions. The Bot collects details and routes coverage questions to your producer.",
      },
    ],
    scriptPreview: `"Thanks for calling [Your Agency]. I'm Alex, an AI assistant. Are you calling about a quote, a claim, or an existing policy? I can collect the details for your producer."`,
    statValue: "Configurable",
    statLabel: "Intake questions, routing, and staff handoff stay under the agency's control.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("insurance") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Callers hear your configured agency greeting. Transcripts follow tenant retention; recording is optional and off by default.",
    faqs: [
      {
        q: "Will the Bot Actually Bind a Policy?",
        a: "No. Binding requires a licensed person. BotBound gathers the approved quote intake fields and routes the record to your producer for review and any coverage decision.",
      },
      {
        q: "Can It Handle Commercial Lines, Not Just Personal?",
        a: "Yes. Configure Bots or role templates by line of business, such as Auto, Home, Commercial Auto, General Liability, Business Owners, or Workers Compensation. Each can use the right intake questions and route to the appropriate producer inside the same workspace.",
      },
      {
        q: "What About Claims?",
        a: "First notice of loss mode captures the structured fields your carrier workflow needs. Complex losses can transfer to your claims desk; routine ones can route a structured package and send an approved confirmation by email.",
      },
      {
        q: "How Does It Compare with a 24/7 Answering Service?",
        a: "Compare BotBound on the complete intake, conversation, follow up, and logged outcome, not only the per call price. Calls plans include voice minutes, and extra usage is billed at the listed rates.",
      },
    ],
  },

  restaurants: {
    slug: "restaurants",
    metaTitle: "BotBound for Restaurants | Phone Bots for Reservations and Takeout",
    metaDescription:
      "A voice first Bot for restaurants. Take reservations, capture takeout requests, handle event inquiries, continue by email, and route exceptions to staff.",
    eyebrow: "For Restaurants",
    headline: "More Hosting. Less Holding.",
    pains: [
      {
        icon: "Calendar",
        title: "Reservation Taking Without the Host",
        body: "Captures party size, name, time, and special requests, then offers configured availability and records supported bookings in BotBound Calendar. Confirmation timing is configurable.",
      },
      {
        icon: "PhoneIncoming",
        title: "Takeout Requests Done Right",
        body: "Reads back each item, confirms substitutions, captures pickup time, and routes a structured order summary. Allergy questions are flagged for staff confirmation rather than answered speculatively.",
      },
      {
        icon: "Clock",
        title: "After Hours and Closed Days",
        body: "Route catering and private event inquiries to a structured intake, then notify the manager through the handoff path you configure.",
      },
      {
        icon: "MailCheck",
        title: "Private Events and Catering Pipeline",
        body: "Captures party size, date, dietary needs, budget range, and contact details. It can route a structured request and offer approved tasting windows when those actions are configured.",
      },
    ],
    scriptPreview: `"Hi, thanks for calling [Your Restaurant]! I can help with a reservation, take a pickup request for our staff, or collect details about a private event. What can I help you with?"`,
    statValue: "Saturday 7pm",
    statLabel:
      "Built for the rush hour calls your host cannot reach: reservations, structured takeout requests, and event inquiries.",
    primaryCta: { label: "Create Your Bot", href: signupHrefForWedge("restaurants") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Callers hear the restaurant identity and the built in OpenAI voice you choose; that speaker stays consistent for the full call.",
    faqs: [
      {
        q: "Will It Integrate with Resy, OpenTable, or Tock?",
        a: "BotBound does not sync reservations to Resy, OpenTable, or Tock. Set your hours and booking rules in BotBound Calendar so your Bot can offer available slots and record supported bookings there. You can import Google or Outlook busy times when you sync.",
      },
      {
        q: "Can It Handle Dietary Restrictions and Allergens Correctly?",
        a: "The workflow can capture allergens as a structured field and flag them for staff confirmation. The Bot should not make medical or ingredient safety promises; the restaurant remains responsible for review and the final response.",
      },
      {
        q: "What About Private Event Inquiries?",
        a: "The Bot captures party size, date, food and beverage preferences, budget range, and contact information. When email routing is configured, it can send a structured request and offer approved tasting windows under the threshold rules you set.",
      },
      {
        q: "How Is This Different from Yelp or Google Booking Widgets?",
        a: "Booking widgets cover web demand. BotBound adds a configurable Phone Bot for callers, larger party questions, takeout requests, and private event inquiries your web form may not resolve.",
      },
    ],
  },

  sales: {
    slug: "sales",
    metaTitle: "Sales Bots for Prospecting and Follow Up | BotBound",
    metaDescription:
      "Find prospects, qualify leads, and follow up on deals with calls, SMS, email, and a Computer. No CRM required.",
    eyebrow: "For Sales",
    headline: "Keep Every Deal Moving",
    pains: [
      {
        icon: "Phone",
        title: "Prospect and Qualify",
        body: "Research prospects, start approved outbound conversations, and capture what each lead needs.",
      },
      {
        icon: "Clock",
        title: "Follow Up to Close",
        body: "Answer objections from your Knowledge and follow up by call, SMS, or email. Keep the next step visible.",
      },
      {
        icon: "Calendar",
        title: "Book the Next Step",
        body: "Offer available times using your calendar rules. Hand off qualified prospects with the conversation attached.",
      },
      {
        icon: "Shield",
        title: "Your Rules",
        body: "Set the offer, qualification questions, and escalation rules. Review outcomes in your workspace.",
      },
    ],
    scriptPreview: `"Hi, I'm Casey, an AI assistant from [Your Company], following up on your request. Is now a good time to talk about what you need?"`,
    statValue: "From Lead to Next Step",
    statLabel: "Research, conversations, and next steps in one workspace.",
    primaryCta: { label: "Create Your Sales Bot", href: signupHrefForWedge("sales") },
    secondaryCta: PRODUCT_TOUR_CTA,
    trustLine:
      "Outbound and SMS require sender approval, recipient permission, and applicable DNC checks.",
    faqs: [
      {
        q: "Can I Shape What the Bot Says?",
        a: "Yes. Set its introduction, qualification questions, offer details, booking rules, and next step. Rehearse the playbook before activation.",
      },
      {
        q: "When Does a Person Step In?",
        a: "Set escalation rules for questions, pricing exceptions, or requests your Bot should not handle. The conversation and captured details stay available for your review.",
      },
      {
        q: "Do I Need a CRM?",
        a: "No. BotBound records contact details, call outcomes, transcripts, and next steps in your workspace.",
      },
      {
        q: "Can the Bot Send an Email Recap?",
        a: "Yes. Every paid plan includes an email address for approved replies and recaps. A setup review verifies your sending identity.",
      },
    ],
  },
};
