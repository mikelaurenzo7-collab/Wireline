/**
 * Founder agent seed - provisions the platform owner's account with a
 * full roster of agents, max capabilities, and training artifacts so
 * Mike can dogfood chat, training, and integrations end-to-end.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { WIRELINE_PERSONAS } from "./wireline-agent-personas";
import type { WirelinePersonaId } from "./wireline-agent-escalation";
import { AGENT_TOOL_NAME_VALUES, type AgentToolName } from "./agent-capabilities";
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";
import { pickRotatedVoiceId } from "../data/voice-roster";
import { getOwnerEmails } from "./auth-service";
import { BRAND_SYSTEM, AGENT_NUMBER_PROMISE } from "./product-copy";
import { plansForClient, EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY } from "./plan-catalog";

export const ALL_AGENT_TOOLS: AgentToolName[] = [...AGENT_TOOL_NAME_VALUES];

const CHAT_COLLABORATOR_OVERLAY = `

CHAT MODE (operator workspace):
You are also a full AI collaborator in private chat — not just a voice agent. In chat you can:
- Draft business plans, GTM strategies, SOPs, email sequences, and marketing copy tailored to the operator's business.
- Outline logo concepts, brand voice guides, and pitch decks (for production logo SVGs, suggest the Director chat).
- Propose config changes, tool toggles, and outbound actions via approval cards — never mutate settings silently.
- Coach the operator on call performance, objection handling, and agent strategy using your role expertise.
Be substantive, structured, and actionable. Match the operator's industry when known.`;

/**
 * Operating pods for the founder fleet.
 *
 * Wireline sells and serves itself with this account, so the roster is grouped
 * by the work it does rather than by vertical flavor. The pod is persisted in
 * `business_variables.team` so Studio, analytics, and routing can group agents
 * without a schema change.
 */
export const FOUNDER_FLEET_TEAMS = [
  "front_door",
  "revenue",
  "support",
  "retention",
  "personal",
] as const;
export type FounderFleetTeam = (typeof FOUNDER_FLEET_TEAMS)[number];

export interface AssistantAgentTemplate {
  id: string;
  name: string;
  role: string;
  channel: "voice" | "email";
  archetype: string;
  firstMessage: string;
  team: FounderFleetTeam;
  personalityVibe?: "warm" | "playful" | "authoritative";
  emailAgentTone?: string;
  emailSignature?: string;
  websiteUrl?: string;
  wirelinePersonaId?: WirelinePersonaId;
  isBusinessAgent?: boolean;
}

/**
 * Specialty roster beyond the 6 internal Wireline personas.
 *
 * Every business agent here sells or serves Wireline itself. The roster used to
 * carry vertical demo flavor (a real-estate closer asking about listings, an
 * insurance desk asking for a policy number), which reads as someone else's
 * company on the account that runs Wireline. Vertical role-play belongs to the
 * public demo lines in `src/data/contact-agents.ts`, not to the founder fleet.
 */
export const FOUNDER_FLEET_TEMPLATES: AssistantAgentTemplate[] = [
  {
    id: "founder-jordan",
    name: "Jordan",
    role: "customer_service",
    channel: "voice",
    archetype: "Receptionist",
    firstMessage: "Hi, Jordan here with Wireline. What can I help you with today?",
    team: "support",
    personalityVibe: "warm",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-marcus",
    name: "Marcus",
    role: "scheduler",
    channel: "voice",
    archetype: "Scheduler",
    firstMessage:
      "Hi, this is Marcus with Wireline. I can get a walkthrough on the calendar. What's your name?",
    team: "front_door",
    personalityVibe: "authoritative",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-diana",
    name: "Diana",
    role: "lead_qualifier",
    channel: "voice",
    archetype: "Intake Specialist",
    firstMessage:
      "Diana with Wireline. A couple of quick questions so I route you to the right person. May I have your name?",
    team: "revenue",
    personalityVibe: "authoritative",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-aisha",
    name: "Aisha",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage:
      "Hey, Aisha with Wireline partnerships. Are you reselling for clients or running this in your own business?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-elena",
    name: "Elena",
    role: "customer_service",
    channel: "voice",
    archetype: "Claims Intake",
    firstMessage:
      "Elena with Wireline account care. I can look at your plan, usage, or renewal. What's going on?",
    team: "retention",
    personalityVibe: "warm",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-jake",
    name: "Jake",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage: "Hey, Jake with Wireline. Who am I speaking with?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-billing",
    name: "Billing Specialist",
    role: "collections",
    channel: "voice",
    archetype: "The Collector",
    firstMessage: "Wireline billing. How can I help with your account today?",
    team: "retention",
    personalityVibe: "authoritative",
  },
  {
    id: "founder-prospector",
    name: "Outbound Prospector",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage:
      "Hi, this is Wireline. You're talking to a voice agent right now. Got a quick minute?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-growth-email",
    name: "Growth Coordinator",
    role: "marketing",
    channel: "email",
    archetype: "Receptionist",
    firstMessage: "Thanks for reaching out. Happy to help with campaigns or follow up.",
    team: "revenue",
    personalityVibe: "playful",
    emailAgentTone: "Friendly",
    emailSignature: "— The Wireline Team",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-tier2",
    name: "Tier 2 Technical Lead",
    role: "technical_support",
    channel: "voice",
    archetype: "Support Tech",
    firstMessage: "Wireline technical support. What symptoms are you seeing?",
    team: "support",
    personalityVibe: "warm",
  },
  {
    id: "founder-personal",
    name: "Personal Assistant",
    role: "personal_assistant",
    channel: "voice",
    archetype: "Executive Assistant",
    firstMessage: "Hi, this is your agent. How can I help with your schedule today?",
    team: "personal",
    personalityVibe: "warm",
    isBusinessAgent: false,
  },
];

/** Minimum agents after a full founder seed (6 personas + specialty roster). */
export const EXPECTED_FOUNDER_FLEET_AGENT_COUNT =
  Object.keys(WIRELINE_PERSONAS).length + FOUNDER_FLEET_TEMPLATES.length;

/**
 * Live plan facts for the agents that sell Wireline.
 *
 * Derived from the Stripe catalog rather than written out, so a catalog change
 * cannot leave the fleet quoting a retired price on a real call. Never hardcode
 * plan pricing here.
 */
export function wirelinePlanFacts(): string[] {
  // plansForClient() is the same public catalog the pricing page consumes. A
  // hand-rolled `plan.public` filter here silently dropped every paid plan,
  // because paid plans are public by omission (`public !== false`) — the fleet
  // would have gone to work knowing only Free Builder.
  const lines = plansForClient().map((plan) => {
    const price =
      plan.price_usd_monthly === 0
        ? "free"
        : `$${plan.price_usd_monthly}/month or $${plan.price_usd_annual}/year`;
    const minutes = plan.voice_minutes_monthly
      ? `${plan.voice_minutes_monthly} guaranteed live voice minutes each month`
      : "no production minutes until a paid plan is active";
    const numbers = plan.included_phone_numbers
      ? `${plan.included_phone_numbers} included Wireline number${plan.included_phone_numbers === 1 ? "" : "s"}`
      : "no included number";
    const agents = `${plan.max_agents} agent${plan.max_agents === 1 ? "" : "s"}`;
    return `${plan.name}: ${price}. ${agents}, ${minutes}, ${numbers}.`;
  });
  return [
    `Wireline in one line: ${BRAND_SYSTEM.northStar}`,
    ...lines,
    `Additional agents are an add-on at $${EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY}/month each.`,
    AGENT_NUMBER_PROMISE,
    "Usage beyond included minutes draws from prepaid Runtime Balance. There is no surprise postpaid overage invoice, and live calls are never cut mid conversation.",
    "Quote only these plan facts. If asked for a discount, custom terms, or anything not listed, take the request and escalate instead of inventing an offer.",
  ];
}

const KNOWLEDGE_SNIPPETS: Record<string, string[]> = {
  default: [
    "Operators configure agents via Create, Training, Wire or Integrations, and Studio.",
    "Escalations route to the configured phone/email; use escalate_to_human when risk is high.",
    "Wireline agents work across voice, text, and email under one identity, memory, and outcome record.",
  ],
  sales: [
    "Lead with outcome before features. Always propose a concrete next step before ending the conversation.",
    "Qualify on the phone problem first: what call is being missed, who handles it now, and what a missed call costs.",
    "Common objection — 'will callers know it is AI?': yes, disclosure is built in and the agent identifies itself. Never claim an agent passes as human.",
    "Common objection — 'what if it goes wrong?': sensitive actions sit behind approvals, and escalation hands the conversation to a person with context intact.",
    "Never promise a capability that is not live today. Beta and planned surfaces are described as such.",
  ],
  customer_service: [
    "Use HEARD: Hear, Empathize, Apologize, Resolve, Diagnose. Never transfer without context.",
  ],
  collections: [
    "Always verify identity before discussing balances. Log every promise-to-pay immediately.",
    "Billing questions resolve against the plan catalog and the account's Runtime Balance. Refunds and credits are escalated, never promised on the call.",
  ],
  marketing: [
    "Campaign brief template: Audience → Hook → Offer → CTA → Success metric.",
    "Wireline markets its own product with its own agents. Anything sent must be something the founder would sign.",
    "Outbound marketing contact runs only after consent and DNC gates pass. If a gate blocks the work, report it instead of routing around it.",
  ],
  technical_support: [
    "Diagnose in this order: number and routing, then agent configuration, then integration connection, then provider status.",
    "Never invent a root cause. If telemetry does not show it, say what is known and escalate with the call id.",
  ],
  scheduler: [
    "Confirm date, time, timezone, and contact method out loud before closing any booking.",
    "A walkthrough is the offer. Capture what the caller wants to see so the demo is specific to them.",
  ],
};

const DIRECTIVE_SNIPPETS: string[] = [
  "Always confirm spelling of names and callback numbers before ending a call.",
  "If the caller asks for a human, escalate immediately — no friction.",
  "In chat, draft deliverables (plans, copy, briefs) in structured sections the operator can approve or edit.",
  "Never invent integration credentials — say when an integration needs to be connected in Settings.",
];

const LESSON_SNIPPETS: string[] = [
  "When price objections arise, acknowledge first then reframe around ROI and cost of inaction.",
  "For scheduling, always read back date, time, timezone, and contact method before closing.",
  "In chat, offer to turn a business plan outline into config changes (greeting, tone, tools) when relevant.",
  "Logo requests in agent chat -> outline concepts here; send the operator to Studio for brand artifacts.",
];

/** Pod for each internal Wireline persona. */
function personaTeam(personaId: WirelinePersonaId): FounderFleetTeam {
  if (personaId === "sales") return "revenue";
  if (personaId === "support" || personaId === "technical") return "support";
  if (personaId === "success") return "retention";
  return "front_door";
}

function personalityForRole(role: string): string {
  const key = role in ROLE_PERSONALITY_TEMPLATES ? role : "customer_service";
  return (
    (ROLE_PERSONALITY_TEMPLATES[key as keyof typeof ROLE_PERSONALITY_TEMPLATES] ||
      ROLE_PERSONALITY_TEMPLATES.customer_service) + CHAT_COLLABORATOR_OVERLAY
  );
}

/**
 * Knowledge for a role, accumulated rather than early-returned.
 *
 * The previous chain returned on the first match, so `marketing` was captured by
 * the sales branch above it and the marketing snippets were unreachable — the
 * Growth Coordinator never received its own campaign knowledge. Accumulating
 * makes overlapping roles additive and keeps a later block from being shadowed.
 */
export function knowledgeForRole(role: string): string[] {
  const snippets = [...KNOWLEDGE_SNIPPETS.default];

  // Every business agent fields pricing questions, so the whole fleet carries
  // the same live plan facts. The personal agent stays out of the sales lane.
  if (role !== "personal_assistant") snippets.push(...wirelinePlanFacts());

  if (role.includes("sales") || role === "lead_qualifier" || role === "marketing") {
    snippets.push(...KNOWLEDGE_SNIPPETS.sales);
  }
  if (role === "marketing") snippets.push(...KNOWLEDGE_SNIPPETS.marketing);
  if (role === "collections") snippets.push(...KNOWLEDGE_SNIPPETS.collections);
  if (
    role === "customer_service" ||
    role.includes("reception") ||
    role.includes("support") ||
    role.includes("success")
  ) {
    snippets.push(...KNOWLEDGE_SNIPPETS.customer_service);
  }
  if (role.includes("technical")) snippets.push(...KNOWLEDGE_SNIPPETS.technical_support);
  if (role === "scheduler" || role.includes("onboarding")) {
    snippets.push(...KNOWLEDGE_SNIPPETS.scheduler);
  }

  return [...new Set(snippets)];
}

export interface FounderAssistantSeedReport {
  agentsCreated: number;
  agentsUpdated: number;
  knowledgeInserted: number;
  directivesInserted: number;
  lessonsInserted: number;
  agentIds: string[];
}

/** Tenant-scoped agent lookup — never match global template ids across users. */
export function founderAssistantAgentScope(agentId: string, userId: string) {
  return and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId));
}

/** When canonical template ids are already owned by another tenant, namespace per user. */
export function namespacedAssistantAgentId(templateId: string, userId: string): string {
  return `${userId.slice(0, 8)}-${templateId}`;
}

export async function resolveAssistantAgentId(templateId: string, userId: string): Promise<string> {
  const [ownedCanonical] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(founderAssistantAgentScope(templateId, userId))
    .limit(1);
  if (ownedCanonical) return templateId;

  const namespaced = namespacedAssistantAgentId(templateId, userId);
  const [ownedNamespaced] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(founderAssistantAgentScope(namespaced, userId))
    .limit(1);
  if (ownedNamespaced) return namespaced;

  const [collision] = await drizzle
    .select({ userId: schema.agents.userId })
    .from(schema.agents)
    .where(eq(schema.agents.id, templateId))
    .limit(1);
  if (collision && collision.userId !== userId) return namespaced;

  return templateId;
}

async function upsertPersonality(agentId: string, userId: string, content: string): Promise<void> {
  const [existing] = await drizzle
    .select({ agentId: schema.personality.agentId })
    .from(schema.personality)
    .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)))
    .limit(1);
  if (existing) {
    await drizzle
      .update(schema.personality)
      .set({ content })
      .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)));
    return;
  }

  const [foreign] = await drizzle
    .select({ agentId: schema.personality.agentId })
    .from(schema.personality)
    .where(eq(schema.personality.agentId, agentId))
    .limit(1);
  if (foreign) {
    log.warn("founder agent seed: personality row owned by another tenant, skipping", {
      agentId,
      userId,
    });
    return;
  }

  await drizzle.insert(schema.personality).values({ agentId, userId, content });
}

async function seedTrainingArtifacts(
  agentId: string,
  userId: string,
  role: string,
  report: FounderAssistantSeedReport,
): Promise<void> {
  for (const content of knowledgeForRole(role)) {
    const exists = await drizzle
      .select({ id: schema.knowledge.id })
      .from(schema.knowledge)
      .where(
        and(
          eq(schema.knowledge.agentId, agentId),
          eq(schema.knowledge.userId, userId),
          eq(schema.knowledge.content, content),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await drizzle.insert(schema.knowledge).values({ agentId, userId, content });
      report.knowledgeInserted++;
    }
  }

  for (const [i, content] of DIRECTIVE_SNIPPETS.entries()) {
    const exists = await drizzle
      .select({ id: schema.directives.id })
      .from(schema.directives)
      .where(
        and(
          eq(schema.directives.agentId, agentId),
          eq(schema.directives.userId, userId),
          eq(schema.directives.content, content),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await drizzle.insert(schema.directives).values({
        agentId,
        userId,
        content,
        priority: 10 - i,
      });
      report.directivesInserted++;
    }
  }

  for (const lesson of LESSON_SNIPPETS) {
    try {
      await drizzle.insert(schema.agentLessons).values({
        agentId,
        userId,
        lesson,
        source: "founder-agent-seed",
      });
      report.lessonsInserted++;
    } catch {
      // unique (agent_id, lesson) — already seeded
    }
  }
}

async function upsertAgent(
  userId: string,
  template: AssistantAgentTemplate,
  voiceIndex: number,
  report: FounderAssistantSeedReport,
): Promise<string> {
  const toolsJson = ALL_AGENT_TOOLS;
  const agentId = await resolveAssistantAgentId(template.id, userId);
  const tenantScope = founderAssistantAgentScope(agentId, userId);
  const [existing] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(tenantScope)
    .limit(1);

  const businessVariables = template.wirelinePersonaId
    ? {
        wireline_internal: true,
        wireline_persona_id: template.wirelinePersonaId,
        team: template.team,
        provisioned_at: new Date().toISOString(),
      }
    : { founder_fleet_seed: true, team: template.team, seeded_at: new Date().toISOString() };

  const values = {
    userId,
    name: template.name,
    role: template.role,
    channel: template.channel,
    archetype: template.archetype,
    firstMessage: template.firstMessage,
    voiceId: pickRotatedVoiceId(voiceIndex),
    voiceProvider: "vapi",
    enabledTools: toolsJson,
    personalityVibe: template.personalityVibe || "warm",
    emailAgentTone: template.emailAgentTone,
    emailSignature: template.emailSignature,
    websiteUrl: template.websiteUrl,
    businessVariables,
    emailAutoRespond: template.channel === "email",
    isBusinessAgent: template.isBusinessAgent ?? template.role !== "personal_assistant",
  };

  if (existing) {
    await drizzle
      .update(schema.agents)
      .set({
        ...values,
        enabledTools: toolsJson,
      })
      .where(tenantScope);
    report.agentsUpdated++;
  } else {
    await drizzle.insert(schema.agents).values({ id: agentId, ...values });
    report.agentsCreated++;
  }

  await upsertPersonality(agentId, userId, personalityForRole(template.role));
  await seedTrainingArtifacts(agentId, userId, template.role, report);
  report.agentIds.push(agentId);
  return agentId;
}

/**
 * Seed (or refresh) the founder's full agent roster with max capabilities
 * and training artifacts. Idempotent — safe to re-run.
 */
export async function seedFounderAssistant(userId: string): Promise<FounderAssistantSeedReport> {
  const report: FounderAssistantSeedReport = {
    agentsCreated: 0,
    agentsUpdated: 0,
    knowledgeInserted: 0,
    directivesInserted: 0,
    lessonsInserted: 0,
    agentIds: [],
  };

  let voiceIndex = 0;

  // 6 internal Wireline personas
  for (const persona of Object.values(WIRELINE_PERSONAS)) {
    await upsertAgent(
      userId,
      {
        id: `wireline-${persona.id}`,
        name: persona.name,
        role: persona.role,
        channel: "voice",
        archetype: "Receptionist",
        firstMessage: persona.firstMessage,
        wirelinePersonaId: persona.id,
        team: personaTeam(persona.id),
        personalityVibe:
          persona.id === "sales" || persona.id === "onboarding"
            ? "playful"
            : persona.id === "support" || persona.id === "technical"
              ? "authoritative"
              : "warm",
      },
      voiceIndex++,
      report,
    );
  }

  // Specialty + vertical roster
  for (const template of FOUNDER_FLEET_TEMPLATES) {
    await upsertAgent(userId, template, voiceIndex++, report);
  }

  // Ensure every existing owner agent also gets max tools (legacy rows)
  const ownerAgents = await drizzle
    .select({ id: schema.agents.id, role: schema.agents.role })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId));

  for (const row of ownerAgents) {
    if (!report.agentIds.includes(row.id)) {
      // Preserve the posture the owner already chose. Role is only a default for
      // the managed seed templates above; reclassifying every existing agent from
      // its role silently moved a user-created personal agent (role "scheduler",
      // "sales", or anything custom) into the business workspace, where the
      // posture-filtered surfaces then hid it from the workspace it belonged to.
      await drizzle
        .update(schema.agents)
        .set({ enabledTools: ALL_AGENT_TOOLS })
        .where(eq(schema.agents.id, row.id));
      await seedTrainingArtifacts(row.id, userId, row.role || "customer_service", report);
      report.agentIds.push(row.id);
      report.agentsUpdated++;
    }
  }

  log.info("founder agent seed completed", { userId, ...report });
  return report;
}

export async function resolveFounderUserId(ownerEmail?: string): Promise<string | null> {
  const email = (ownerEmail || process.env.OWNER_EMAIL || [...getOwnerEmails()][0] || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const [row] = await drizzle
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(trim(${schema.users.email})) = ${email}`)
    .limit(1);
  return row?.id ?? null;
}
