/**
 * Single source of truth for the 10 AI agents featured on the landing
 * page + in the in-app /help console.
 *
 * Structure (per Mike's call):
 *   - **Wireline Customer Service** — 6 lines that all answer for Wireline
 *     itself. Same role, same process, same deep Wireline knowledge. Built
 *     for scale: any caller reaches a real Wireline-trained agent who asks
 *     the reason for calling and routes the conversation accordingly.
 *   - **Live Demos** — 4 role-play agents showcasing distinct verticals so
 *     prospects can hear what their own Wireline agent could sound like
 *     before they buy. Each one role-plays a different business + agent
 *     archetype: outbound sales, inbound support, appointment scheduling,
 *     and front-desk reception.
 *
 * Used in:
 *   1. AuthPortal landing page — public "talk to Wireline" CTAs
 *   2. In-app /help route — signed-in operators reach the same agents
 *      without leaving the console.
 *   3. /api/admin/sync-vapi-knowledge — resolves each tel back to its
 *      Vapi assistantId via the live number list, then PATCHes the
 *      assistant's system prompt with the latest Wireline knowledge
 *      (and points serverUrl at trywireline.com).
 *
 * Each tel is a live Vapi-routed number — calls hit the matching
 * assistant + can escalate to a human via `escalate_to_human`
 * (POSTs to /api/escalate).
 */

export type ContactAgent = {
  name: string;
  role: string;
  scope: string;
  /** First-message template the agent opens calls with. */
  firstMessage: string;
  /** Comma-joined intent buckets this agent handles. Used by routing prompts. */
  handles: string;
  tel: string;
  display: string;
  tint: string;
};

/**
 * Unified Wireline Customer Service role. All six numbers run the same
 * persona + process — the differentiator is only the agent's name (and
 * the voice routed to that number in Vapi). This is intentional: when
 * the team scales we add capacity to one role, not six.
 *
 * Process every CS agent follows (also encoded in the system prompt
 * via wireline-knowledge.ts → buildWirelineCustomerServiceProcess):
 *   1. Warm greet + name + open-ended "how can I help you today?"
 *   2. Listen. One clarifying question only if intent is unclear.
 *   3. Classify intent: SALES / PRODUCT / TECHNICAL / BILLING /
 *      PARTNERSHIPS / OTHER.
 *   4. Answer directly from Wireline knowledge when possible. Offer
 *      a follow-up email summary + clear next step.
 *   5. Close: confirm resolved, thank them, end warm.
 *
 * Per-line scope wording stays generic so we can route load across
 * any of the six without surprise.
 */
const WIRELINE_CS_ROLE = "Wireline Customer Service";
const WIRELINE_CS_SCOPE =
  "Answers any question about Wireline — pricing, features, integrations, troubleshooting, account help. Asks the caller's reason up front and routes specialists in (sales, billing, partnerships) only when the answer can't be given directly.";
const WIRELINE_CS_HANDLES =
  "general support, sales, pricing, demos, product questions, integrations, technical help, billing, account, partnerships";

function csAgent(name: string, tel: string, display: string, tint: string): ContactAgent {
  return {
    name,
    role: WIRELINE_CS_ROLE,
    scope: WIRELINE_CS_SCOPE,
    firstMessage: `Thanks for calling Wireline, this is ${name}. How can I help you today?`,
    handles: WIRELINE_CS_HANDLES,
    tel,
    display,
    tint,
  };
}

export const WIRELINE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [
  csAgent("Sarah", "+16306425661", "(630) 642-5661", "#0AC8D4"),
  csAgent("Liam", "+16305811834", "(630) 581-1834", "#0AC8D4"),
  csAgent("Tyler", "+15642389455", "(564) 238-9455", "#0AC8D4"),
  csAgent("Maya", "+16306425927", "(630) 642-5927", "#0AC8D4"),
  csAgent("Devon", "+12075935155", "(207) 593-5155", "#0AC8D4"),
  csAgent("Priya", "+15727269365", "(572) 726-9365", "#0AC8D4"),
];

export type DemoAgent = ContactAgent;

/**
 * Four demo agents, each role-playing a distinct business scenario so
 * prospects can hear the four most common Wireline use cases:
 *   1. Outbound sales (Apex Software — B2B SaaS SDR)
 *   2. Inbound customer service (Tidewater Internet — ISP tier-1 support)
 *   3. Appointment scheduling (Lumen Dental — patient bookings)
 *   4. Front-desk reception (Sterling & Co — law firm call routing)
 *
 * Each demo agent also has deep Wireline knowledge in its system prompt,
 * so if a caller breaks character and asks "wait, what IS Wireline?",
 * the agent answers properly + offers to transfer to a real Wireline
 * line.
 */
export const WIRELINE_DEMO_AGENTS: ReadonlyArray<DemoAgent> = [
  {
    name: "Alex",
    role: "Outbound Sales Agent",
    scope:
      "Role-plays a B2B SaaS SDR for 'Apex Software' — calls a lead, qualifies fit (team size, current setup, pain), books a discovery call with a closer, logs the call summary to CRM.",
    firstMessage:
      "Hey, this is Alex from Apex Software — I noticed your team handles a lot of customer calls. Mind if I ask about your current setup?",
    handles: "outbound, cold call, SDR, prospecting, qualification, B2B sales",
    tel: "+14692571581",
    display: "(469) 257-1581",
    tint: "#F59E0B",
  },
  {
    name: "Maya",
    role: "Inbound Customer Service Agent",
    scope:
      "Role-plays an ISP tier-1 support rep for 'Tidewater Internet' — identifies issue (billing vs. outage vs. technical), runs basic troubleshooting, escalates to a technician or schedules a service call when needed.",
    firstMessage: "Thanks for calling Tidewater Internet, this is Maya. How can I help you today?",
    handles: "customer service, support, billing, outage, troubleshooting, ISP",
    tel: "+19044601596",
    display: "(904) 460-1596",
    tint: "#0AC8D4",
  },
  {
    name: "Casey",
    role: "Appointment Scheduler",
    scope:
      "Role-plays a patient-booking agent for 'Lumen Dental' — captures patient name + reason, checks calendar availability, books or reschedules, sends a confirmation, handles last-minute cancels.",
    firstMessage:
      "Thanks for calling Lumen Dental, this is Casey. Were you looking to book an appointment or following up on an existing one?",
    handles: "appointments, scheduling, booking, reschedule, cancellation, healthcare",
    tel: "+16173134469",
    display: "(617) 313-4469",
    tint: "#10B981",
  },
  {
    name: "River",
    role: "Front-Desk Receptionist",
    scope:
      "Role-plays a law-firm receptionist for 'Sterling & Company' — greets the caller, identifies whether they need an attorney, paralegal, billing, or scheduling, routes the call (or takes a detailed message if the right person is unavailable), and flags urgent matters.",
    firstMessage: "Sterling and Company, this is River. How may I direct your call?",
    handles: "reception, routing, message taking, intake, triage, law firm",
    tel: "+19733638874",
    display: "(973) 363-8874",
    tint: "#8B5CF6",
  },
];
