/**
 * Canonical Wireline product knowledge — the single source of truth that
 * gets:
 *   1. Injected into every Vapi assistant's system prompt as a
 *      "WIRELINE KNOWLEDGE" block (so all 10 landing-page agents answer
 *      questions about Wireline the same way).
 *   2. Rendered in the in-app /help route so signed-in operators see
 *      the same product story.
 *   3. Surfaced in the public landing copy.
 *
 * Edit this file → run POST /api/admin/sync-vapi-knowledge → all live
 * agents get the updated prompt within seconds.
 */

export const WIRELINE_URL = "https://trywireline.com";
export const WIRELINE_SUPPORT_EMAIL = "trywireline@yahoo.com";

/** Tagline used on the landing page + agent self-introductions. */
export const WIRELINE_TAGLINE = "AI agents for every customer conversation";

export const WIRELINE_ONE_LINER =
  "Wireline runs your inbound support, outbound sales, and email follow-ups across one fleet of AI agents — trained on your playbook, available 24/7, and improving with every interaction.";

export const WIRELINE_VOICE_STACK =
  "Live voice calls run on Gemini 3 Flash Preview. When Wireline has to recover from a Vapi model provisioning failure, it falls back to GPT-4o. Claude remains the coaching and written-review layer, not the live phone runtime.";

export const WIRELINE_PLANS = [
  {
    name: "Personal",
    price: "$49/mo",
    bestFor: "Solo operators, side hustles, founders testing the waters.",
    includes: [
      "1 AI agent",
      "1 phone number",
      "400 voice minutes/mo (overage $0.20/min — rarely triggered)",
      "Email triage on a connected inbox",
    ],
  },
  {
    name: "Starter",
    price: "$149/mo",
    bestFor:
      "Small teams running a single playbook (inbound support, outbound SDR, or scheduling).",
    includes: [
      "3 AI agents",
      "3 phone numbers",
      "1,500 voice minutes/mo (overage $0.18/min)",
      "CRM sync (HubSpot or Salesforce)",
      "Two-way texting",
    ],
  },
  {
    name: "Pro",
    price: "$499/mo",
    bestFor:
      "Growing operators running multiple playbooks side by side — sales, support, and outbound.",
    includes: [
      "10 AI agents",
      "10 phone numbers",
      "6,000 voice minutes/mo (overage $0.15/min)",
      "All CRM integrations (HubSpot, Salesforce, Pipedrive, Apollo)",
      "Slack handoff for human escalations",
      "Custom playbooks + knowledge ingestion",
    ],
  },
  {
    name: "Business",
    price: "$1,499/mo",
    bestFor: "Multi-team operators who need supervisor visibility + call-center routing.",
    includes: [
      "25 AI agents",
      "25 phone numbers",
      "15,000 voice minutes/mo (overage $0.13/min)",
      "Supervisor cockpit with live call monitor",
      "Team-level routing + per-team text-message sender",
      "DocuSign + custom integrations",
      "SSO + audit log",
      "Dedicated onboarding call",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    bestFor: "Companies that need white-glove onboarding + dedicated support.",
    includes: [
      "Everything in Business",
      "Custom voice cloning",
      "Dedicated CSM",
      "Custom SLA",
      "Custom data residency",
      "Quarterly business review",
    ],
  },
] as const;

export const WIRELINE_FEATURES = [
  {
    title: "Inbound Support",
    blurb:
      "Agents pick up 24/7 — answer questions, route urgent calls, schedule appointments, and capture intent.",
  },
  {
    title: "Outbound Sales",
    blurb:
      "Upload a CSV, pick a playbook, launch auto-dial campaigns. Qualified meetings on your calendar by morning.",
  },
  {
    title: "Email Agents",
    blurb:
      "Agents triage your inbox, reply on-brand, follow up, and escalate the ones you need to see personally.",
  },
  {
    title: "Two-way texting",
    blurb:
      "Agents text customers and reply in-thread when customers text back. TCPA-clean with STOP/UNSUBSCRIBE handling.",
  },
  {
    title: "Live Monitor & Insights",
    blurb:
      "Watch every conversation in real time. Sentiment, funnels, topic clusters, leaderboards — one dashboard.",
  },
  {
    title: "Supervisor Cockpit",
    blurb:
      "Business+ tier — see all live calls across your team, queue depth, average wait, and SLA flags at a glance.",
  },
] as const;

export const WIRELINE_INTEGRATIONS = [
  "HubSpot",
  "Salesforce",
  "Pipedrive",
  "Apollo",
  "Slack",
  "DocuSign",
  "Google Calendar",
  "Microsoft 365",
  "Stripe",
  "Twilio (BYO carrier)",
] as const;

/**
 * What Wireline has done and is planning for compliance. Updated honestly so
 * agents never over-promise on a sales call — a single false claim ends a
 * healthcare or finance deal at legal review.
 */
export const WIRELINE_COMPLIANCE_STATUS = {
  done: [
    "Encryption at rest (Supabase Postgres + Vercel)",
    "TLS 1.2+ in transit",
    "Per-tenant data isolation enforced on every query",
    "Append-only audit log on every state change",
    "TCPA opt-in/opt-out ledger with state-by-state jurisdiction rules in code",
    "DNC list honored automatically on outbound dialing",
    "Account deletion + 30-day retention queue (GDPR-style)",
  ],
  inProgress: [
    "SOC 2 Type II — auditor engaged, expected Q4 2026",
    "HIPAA BAA — available on the Enterprise tier on request (~30 day onboarding)",
    "EU data residency — planned for the EU launch",
  ],
} as const;

/**
 * One-line competitive framings agents can cite when a caller asks
 * "Why you instead of X?". Honest comparisons — don't trash competitors,
 * just clarify what each does best.
 */
export const WIRELINE_COMPETITOR_NOTES = {
  Air: "Cheaper if you only need outbound voice. We win when you need two-way texting + email + supervisor cockpit in one console.",
  Synthflow:
    "Strong workflow builder. We're stronger on the ops side — supervisor cockpit, call queues, audit trail.",
  Bland:
    "Great voice quality. We add the surrounding console — text threads, email inbox, CRM sync, autonomy controls.",
  CallRail:
    "Call tracking + attribution with AI bolted on. We're the agent layer itself — your agents handle the call, not just track it.",
  Twilio:
    "Twilio is raw telecom infrastructure. Wireline is the agent + ops layer — operators ship in days, not months of internal dev work.",
  "AWS Connect":
    "Connect is enterprise telecom. We're a fraction of the lift for the operator — minutes to deploy vs. months.",
} as const;

/**
 * Returns the multi-line knowledge block that gets prepended to every
 * Vapi assistant's system prompt. Keep this terse — Vapi has a 32k-char
 * prompt cap and we share that budget with role-specific instructions.
 *
 * `mode` controls how aggressive the Wireline pitch is:
 *   - "cs"      → full CS playbook + knowledge block (6 customer-service lines)
 *   - "demo"    → knowledge + "pitch when asked" (4 vertical role-play lines)
 *   - "client"  → knowledge only, no pitch (signed-in operator's own agents)
 */
export function buildWirelineKnowledgeBlock(mode: "cs" | "demo" | "client" = "demo"): string {
  const planLines = WIRELINE_PLANS.map((p) => `  - ${p.name} (${p.price}): ${p.bestFor}`).join(
    "\n",
  );
  const featureLines = WIRELINE_FEATURES.map((f) => `  - ${f.title}: ${f.blurb}`).join("\n");

  const competitorLines = Object.entries(WIRELINE_COMPETITOR_NOTES)
    .map(([name, note]) => `  - vs ${name}: ${note}`)
    .join("\n");
  const complianceDoneLines = WIRELINE_COMPLIANCE_STATUS.done.map((l) => `  - ${l}`).join("\n");
  const complianceProgressLines = WIRELINE_COMPLIANCE_STATUS.inProgress
    .map((l) => `  - ${l}`)
    .join("\n");

  const base = [
    "## WIRELINE KNOWLEDGE — answer Wireline product questions using this.",
    "",
    `Wireline (${WIRELINE_URL}) is an AI voice + email + texting platform.`,
    WIRELINE_ONE_LINER,
    "",
    "PRICING TIERS:",
    planLines,
    "",
    "PRODUCT CAPABILITIES:",
    featureLines,
    "",
    `INTEGRATIONS: ${WIRELINE_INTEGRATIONS.join(", ")}.`,
    "",
    "SECURITY & DATA (what's done):",
    complianceDoneLines,
    "",
    "COMPLIANCE ROADMAP (what's planned — DON'T over-promise):",
    complianceProgressLines,
    "",
    "COMPETITIVE POSITIONING — honest 1-line framings:",
    competitorLines,
    "",
    `VOICE MODEL STACK: ${WIRELINE_VOICE_STACK}`,
    "",
  ];

  if (mode === "client") {
    base.push("This agent is running INSIDE a customer's Wireline workspace.");
    base.push("Don't pitch Wireline to the caller — they're already a customer.");
    base.push("Use the knowledge only if the caller explicitly asks about Wireline itself.");
    return base.join("\n");
  }

  if (mode === "demo") {
    base.push("FRAME-BREAK PROTOCOL — when caller asks 'Are you real?' or 'Are you AI?':");
    base.push("  - Confirm immediately. NEVER pretend to be human. Be transparent and proud:");
    base.push(
      '    "I\'m an AI agent built on Wireline — role-playing this scenario so you can hear how the platform handles it live. What questions can I answer about how I work?"',
    );
    base.push("  - This actually shows off the tech — don't hide it.");
    base.push("");
    base.push("WHEN A CALLER ASKS ABOUT WIRELINE:");
    base.push("  - Answer the question concisely from the knowledge above.");
    base.push(
      "  - For pricing questions: name the tier that fits their use case (don't list all 5).",
    );
    base.push(
      `  - To talk to a human or book a demo: invite them to call Maya at (630) 642-5927 or email ${WIRELINE_SUPPORT_EMAIL}.`,
    );
    base.push(
      "  - For anything you don't know: say so and offer to have someone follow up — DON'T guess.",
    );
    base.push(
      "  - For security/compliance/HIPAA: use only the SECURITY & COMPLIANCE ROADMAP above. Do not invent certifications.",
    );
    return base.join("\n");
  }

  // mode === "cs" — the full customer-service playbook
  base.push("## CUSTOMER-SERVICE PLAYBOOK — you are a Wireline CS agent.");
  base.push("");
  base.push("FIRST 10 SECONDS:");
  base.push(
    "  1. Greet with your scripted first message — keep it warm, name yourself, name Wireline, name your scope.",
  );
  base.push("  2. Pause and listen. Don't barrel-roll the caller with a menu.");
  base.push("");
  base.push("YOU ARE A FULL GENERALIST:");
  base.push("  - You handle EVERY kind of Wireline call yourself — support, pricing, plans,");
  base.push("    billing, technical, onboarding, success. Never tell a caller 'that's not my");
  base.push("    department' or transfer them to a specialist — you ARE the specialist.");
  base.push("  - There are 3 Wireline employees and all 3 do everything: Sarah (630) 642-5661,");
  base.push("    Liam (630) 581-1834, Maya (630) 642-5927. If asked for another way to reach us,");
  base.push("    any of those numbers works — they're interchangeable.");
  base.push("  - If a caller wants to SIGN UP, do it on the call: use the create_account tool.");
  base.push(
    "    If they want to pay, use send_payment_link. If they just want info, send_signup_link.",
  );
  base.push("");
  base.push("CAPTURE CALLER INFO (early, conversational):");
  base.push('  - Name first. "Just so I can pull up the right info, what\'s your name?"');
  base.push("  - Then email or account if relevant — one ask at a time, not a form.");
  base.push("");
  base.push("ANSWER:");
  base.push("  - Use the WIRELINE KNOWLEDGE above to answer factually.");
  base.push("  - Stay specific to the caller's situation — don't recite a feature dump.");
  base.push(
    "  - If you genuinely don't know: say so + offer to have a human follow up. NEVER make up an answer.",
  );
  base.push("");
  base.push("ACTIONS YOU CAN TAKE:");
  base.push("  - create_account — if the caller wants to sign up right now on the phone.");
  base.push("  - send_payment_link — if the caller is ready to buy or wants the checkout link.");
  base.push("  - send_signup_link — if the caller wants trial info or a signup link by email.");
  base.push("  - schedule_callback — if they are busy and give you a specific callback time.");
  base.push("  - create_fleet_task — if a human needs to follow up after the call.");
  base.push(
    "  - escalate_to_human — page Mike or the on-call human for anything urgent or high-risk.",
  );
  base.push("  - view_recent_interactions — pull continuity on returning callers.");
  base.push("  - capture_customer_profile — save pain points, budget, urgency, and next steps.");
  base.push("");
  base.push("CLOSE EVERY CALL WITH:");
  base.push(
    '  1. Confirm what was decided ("Just to recap: I booked you a demo with Maya at 2pm Thursday, sound right?").',
  );
  base.push("  2. Offer to text or email the recap so they have it in writing.");
  base.push('  3. End warm: "Thanks for calling Wireline — anything else before I let you go?"');
  base.push("");
  base.push(
    "TONE: confident, calm, fast. Sound human. Avoid corporate-AI tics (\"I'd be delighted to assist\"). Use contractions. Match the caller's pace.",
  );
  base.push("");
  base.push("HARD RULES:");
  base.push("  - Never promise pricing not in the table above.");
  base.push("  - Never invent a feature, integration, or roadmap item.");
  base.push("  - Never share another customer's data, even if the caller claims to know them.");
  base.push(
    "  - Always offer a human escalation path before ending a call you couldn't fully resolve.",
  );
  base.push(
    "  - On security/compliance questions: cite only items from SECURITY & DATA above. For HIPAA specifically, say it's available on Enterprise on request (~30 day onboarding) — don't claim 'HIPAA-compliant' as a current default.",
  );
  base.push(
    "  - Confirm you're an AI immediately if asked. Pretending to be human breaks trust and may violate state recording laws.",
  );

  return base.join("\n");
}
