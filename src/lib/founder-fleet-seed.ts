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
import { BRAND_SYSTEM } from "./product-copy";
import { currentPricingFacts } from "./usage-billing-catalog";
import { FOUNDER_FLEET_SEED_CONTRACT_VERSION } from "./founder-internal-runtime-policy";
import {
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "./bot-mark";

export { FOUNDER_FLEET_SEED_CONTRACT_VERSION } from "./founder-internal-runtime-policy";

export const ALL_AGENT_TOOLS: AgentToolName[] = [...AGENT_TOOL_NAME_VALUES];

const CHAT_COLLABORATOR_OVERLAY = `

CHAT MODE (operator workspace):
You are also a full collaborator in private chat, not just a Phone Bot. In chat you can:
- Draft business plans, GTM strategies, SOPs, email sequences, and marketing copy tailored to the operator's business.
- Outline logo concepts, brand voice guides, and pitch decks (for production logo SVGs, suggest the Director chat).
- Propose config changes, tool toggles, and outbound actions via approval cards. Never mutate settings silently.
- Coach the operator on call performance, objection handling, and agent strategy using your role expertise.
Be substantive, structured, and actionable. Match the operator's industry when known.`;

/**
 * Operating pods for the founder fleet.
 *
 * BotBound sells and serves itself with this account, so the roster is grouped
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
  systemPrompt?: string;
  isBusinessAgent?: boolean;
}

/**
 * Specialty roster beyond the 6 internal compatibility personas.
 *
 * Every business agent here sells or serves BotBound itself. The roster used to
 * carry vertical demo flavor (a real-estate closer asking about listings, an
 * insurance desk asking for a policy number), which reads as someone else's
 * company on the account that runs BotBound. Vertical role-play belongs to the
 * public demo lines in `src/data/contact-agents.ts`, not to the founder fleet.
 */
export const FOUNDER_FLEET_TEMPLATES: AssistantAgentTemplate[] = [
  {
    id: "founder-jordan",
    name: "Jordan",
    role: "customer_service",
    channel: "voice",
    archetype: "Receptionist",
    firstMessage: "Hi, Jordan here with BotBound. What can I help you with today?",
    team: "support",
    personalityVibe: "warm",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-marcus",
    name: "Marcus",
    role: "scheduler",
    channel: "voice",
    archetype: "Scheduler",
    firstMessage:
      "Hi, this is Marcus with BotBound. I can get a walkthrough on the calendar. What's your name?",
    team: "front_door",
    personalityVibe: "authoritative",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-diana",
    name: "Diana",
    role: "lead_qualifier",
    channel: "voice",
    archetype: "Intake Specialist",
    firstMessage:
      "Diana with BotBound. A couple of quick questions so I route you to the right person. May I have your name?",
    team: "revenue",
    personalityVibe: "authoritative",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-aisha",
    name: "Aisha",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage:
      "Hey, Aisha with BotBound partnerships. Are you reselling for clients or running this in your own business?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-elena",
    name: "Elena",
    role: "customer_service",
    channel: "voice",
    archetype: "Claims Intake",
    firstMessage:
      "Elena with BotBound account care. I can look at your plan, usage, or renewal. What's going on?",
    team: "retention",
    personalityVibe: "warm",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-jake",
    name: "Jake",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage: "Hey, Jake with BotBound. Who am I speaking with?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-billing",
    name: "Billing Specialist",
    role: "collections",
    channel: "voice",
    archetype: "The Collector",
    firstMessage: "BotBound billing. How can I help with your account today?",
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
      "Hi, this is BotBound. You're talking to a voice Bot right now. Got a quick minute?",
    team: "revenue",
    personalityVibe: "playful",
    websiteUrl: "https://botbound.app",
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
    emailSignature: "The BotBound Team",
    websiteUrl: "https://botbound.app",
  },
  {
    id: "founder-tier2",
    name: "Tier 2 Technical Lead",
    role: "technical_support",
    channel: "voice",
    archetype: "Support Tech",
    firstMessage: "BotBound technical support. What symptoms are you seeing?",
    team: "support",
    personalityVibe: "warm",
  },
  {
    id: "founder-personal",
    name: "Concierge Bot",
    role: "personal_assistant",
    channel: "voice",
    archetype: "Personal Assistant",
    firstMessage: "Hi, this is your agent. How can I help with your schedule today?",
    team: "personal",
    personalityVibe: "warm",
    isBusinessAgent: false,
  },
];

/** Minimum agents after a full founder seed (6 personas + specialty roster). */
export const EXPECTED_FOUNDER_FLEET_AGENT_COUNT =
  Object.keys(WIRELINE_PERSONAS).length + FOUNDER_FLEET_TEMPLATES.length;
export const EXPECTED_FOUNDER_PERSONA_COUNT = Object.keys(WIRELINE_PERSONAS).length;

export interface FounderFleetSeedState {
  totalAgents: number;
  businessAgents: number;
  personalAgents: number;
  currentManagedContracts: number;
}

/** A partial contract migration must retry until every managed founder agent is current. */
export function founderFleetSeedNeedsRefresh(state: FounderFleetSeedState): boolean {
  return !(
    state.totalAgents >= EXPECTED_FOUNDER_FLEET_AGENT_COUNT &&
    state.businessAgents > 0 &&
    state.personalAgents > 0 &&
    state.currentManagedContracts >= EXPECTED_FOUNDER_FLEET_AGENT_COUNT
  );
}

/**
 * Current launch plan facts for the agents that sell BotBound.
 *
 * Prices and availability come from the same catalog as public pricing.
 * Persisted Training remains founder controlled and needs review when the
 * offer changes; refreshing the fleet must not restore edited seed text.
 */
export function wirelinePlanFacts(): string[] {
  return [`BotBound in one line: ${BRAND_SYSTEM.northStar}`, ...currentPricingFacts()];
}

const KNOWLEDGE_SNIPPETS: Record<string, string[]> = {
  default: [
    "Operators configure Bots via Create, Knowledge, Connections, and the Workspace.",
    "Escalations route to the configured phone or email. When risk is high, hand the conversation to a person.",
    "BotBound Bots handle calls, email, and computer tasks through their enabled channels and actions. Describe only the capabilities configured for this Bot.",
  ],
  sales: [
    "Lead with outcome before features. Always propose a concrete next step before ending the conversation.",
    "Qualify on the phone problem first: what call is being missed, who handles it now, and what a missed call costs.",
    "Common objection, 'will callers know it is AI?': yes, disclosure is built in and the agent identifies itself. Never claim an agent passes as human.",
    "Common objection, 'what if it goes wrong?': sensitive actions sit behind approvals, and escalation hands the conversation to a person with context intact.",
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
    "BotBound markets its own product with its own Bots. Anything sent must be something the founder would sign.",
    "Marketing and sales call campaigns are not available in the current launch. Reviewed service and personal calls cannot be used to bypass that boundary.",
  ],
  technical_support: [
    "Diagnose in this order: number and routing, then Bot configuration, then integration connection, then provider status.",
    "Never invent a root cause. If telemetry does not show it, say what is known and escalate with the call id.",
  ],
  scheduler: [
    "Confirm date, time, timezone, and contact method out loud before closing any booking.",
    "A walkthrough is the offer. Capture what the caller wants to see so the demo is specific to them.",
  ],
};

const DIRECTIVE_SNIPPETS: string[] = [
  "Always confirm spelling of names and callback numbers before ending a call.",
  "If the caller asks for a human, escalate immediately. No friction.",
  "In chat, draft deliverables (plans, copy, briefs) in structured sections the operator can approve or edit.",
  "Never invent integration credentials. Say when an integration needs to be connected in Settings.",
];

const LESSON_SNIPPETS: string[] = [
  "When price objections arise, acknowledge first then reframe around ROI and cost of inaction.",
  "For scheduling, always read back date, time, timezone, and contact method before closing.",
  "In chat, offer to turn a business plan outline into config changes (greeting, tone, tools) when relevant.",
  "Logo requests in agent chat -> outline concepts here; send the operator to the Workspace for brand artifacts.",
];

/** Pod for each internal compatibility persona. */
function personaTeam(personaId: WirelinePersonaId): FounderFleetTeam {
  if (personaId === "sales") return "revenue";
  if (personaId === "support" || personaId === "technical") return "support";
  if (personaId === "success") return "retention";
  return "front_door";
}

export function personalityForTemplate(
  template: Pick<AssistantAgentTemplate, "role" | "systemPrompt">,
): string {
  const key = template.role in ROLE_PERSONALITY_TEMPLATES ? template.role : "customer_service";
  const roleTemplate =
    ROLE_PERSONALITY_TEMPLATES[key as keyof typeof ROLE_PERSONALITY_TEMPLATES] ||
    ROLE_PERSONALITY_TEMPLATES.customer_service;
  const basePrompt = template.systemPrompt?.trim() || roleTemplate;
  return basePrompt + CHAT_COLLABORATOR_OVERLAY;
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
  return `${userId}-${templateId}`;
}

type FounderSeedDb = typeof drizzle | Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

async function ensurePersonality(
  agentId: string,
  userId: string,
  content: string,
  db: FounderSeedDb,
): Promise<void> {
  const [existing] = await db
    .select({ agentId: schema.personality.agentId })
    .from(schema.personality)
    .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)))
    .limit(1);
  if (existing) {
    return;
  }

  const [foreign] = await db
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

  await db.insert(schema.personality).values({ agentId, userId, content });
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * A versioned fleet refresh may repair seed ownership metadata and identity-mark
 * uniqueness, but it must not overwrite the founder's dogfooded Studio state.
 */
export function founderFleetExistingAgentPatch(
  existingBusinessVariables: unknown,
  managedBusinessVariables: Record<string, unknown>,
  markKey: BotMarkKey,
) {
  return {
    businessVariables: {
      ...recordValue(existingBusinessVariables),
      ...managedBusinessVariables,
    },
    markKey,
  };
}

async function seedTrainingArtifacts(
  agentId: string,
  userId: string,
  role: string,
  report: FounderAssistantSeedReport,
  db: FounderSeedDb,
): Promise<void> {
  for (const content of knowledgeForRole(role)) {
    const exists = await db
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
      await db.insert(schema.knowledge).values({ agentId, userId, content });
      report.knowledgeInserted++;
    }
  }

  for (const [i, content] of DIRECTIVE_SNIPPETS.entries()) {
    const exists = await db
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
      await db.insert(schema.directives).values({
        agentId,
        userId,
        content,
        priority: 10 - i,
      });
      report.directivesInserted++;
    }
  }

  for (const lesson of LESSON_SNIPPETS) {
    const inserted = await db
      .insert(schema.agentLessons)
      .values({
        agentId,
        userId,
        lesson,
        source: "founder-agent-seed",
      })
      .onConflictDoNothing({ target: [schema.agentLessons.agentId, schema.agentLessons.lesson] })
      .returning({ id: schema.agentLessons.id });
    report.lessonsInserted += inserted.length;
  }
}

async function upsertAgent(
  userId: string,
  template: AssistantAgentTemplate,
  voiceIndex: number,
  report: FounderAssistantSeedReport,
): Promise<string> {
  const toolsJson = ALL_AGENT_TOOLS;
  const managedBusinessVariables = template.wirelinePersonaId
    ? {
        wireline_internal: true,
        wireline_persona_id: template.wirelinePersonaId,
        founder_seed_contract_version: FOUNDER_FLEET_SEED_CONTRACT_VERSION,
        team: template.team,
      }
    : {
        founder_fleet_seed: true,
        founder_seed_contract_version: FOUNDER_FLEET_SEED_CONTRACT_VERSION,
        team: template.team,
      };
  const businessVariables = {
    ...managedBusinessVariables,
    ...(template.wirelinePersonaId
      ? { provisioned_at: new Date().toISOString() }
      : { seeded_at: new Date().toISOString() }),
  };

  const voiceId = pickRotatedVoiceId(voiceIndex);
  const values = {
    userId,
    name: template.name,
    role: template.role,
    channel: template.channel,
    archetype: template.archetype,
    firstMessage: template.firstMessage,
    voiceId,
    voiceProvider: "openai",
    enabledTools: toolsJson,
    personalityVibe: template.personalityVibe || "warm",
    emailAgentTone: template.emailAgentTone,
    emailSignature: template.emailSignature,
    websiteUrl: template.websiteUrl,
    businessVariables,
    emailAutoRespond: template.channel === "email",
    isBusinessAgent: template.isBusinessAgent ?? template.role !== "personal_assistant",
  };

  const outcome = await drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    // Template ids are global primary keys. Serialize their resolution with the
    // insert so two different tenants cannot both observe the canonical id as
    // free and then race to claim it.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${template.id}))`);

    const legacyNamespacedId = `${userId.slice(0, 8)}-${template.id}`;
    const namespacedId = namespacedAssistantAgentId(template.id, userId);
    const [ownedCanonical] = await tx
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(founderAssistantAgentScope(template.id, userId))
      .limit(1);
    const [ownedLegacyNamespaced] = await tx
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(founderAssistantAgentScope(legacyNamespacedId, userId))
      .limit(1);
    const [ownedNamespaced] = await tx
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(founderAssistantAgentScope(namespacedId, userId))
      .limit(1);
    const [canonicalCollision] = await tx
      .select({ userId: schema.agents.userId })
      .from(schema.agents)
      .where(eq(schema.agents.id, template.id))
      .limit(1);
    const [namespacedCollision] = await tx
      .select({ userId: schema.agents.userId })
      .from(schema.agents)
      .where(eq(schema.agents.id, namespacedId))
      .limit(1);

    const agentId = ownedCanonical
      ? template.id
      : ownedLegacyNamespaced
        ? legacyNamespacedId
        : ownedNamespaced
          ? namespacedId
          : canonicalCollision
            ? namespacedId
            : template.id;
    if (namespacedCollision && namespacedCollision.userId !== userId && agentId === namespacedId) {
      throw new Error(`Founder Bot id namespace collision for template ${template.id}.`);
    }
    const tenantScope = founderAssistantAgentScope(agentId, userId);

    const [existing] = await tx
      .select({
        id: schema.agents.id,
        markKey: schema.agents.markKey,
        businessVariables: schema.agents.businessVariables,
      })
      .from(schema.agents)
      .where(tenantScope)
      .limit(1);
    const workspaceAgents = await tx
      .select({ id: schema.agents.id, markKey: schema.agents.markKey })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId));
    const unavailable = new Set<BotMarkKey>();
    for (const workspaceAgent of workspaceAgents) {
      if (workspaceAgent.id === agentId) continue;
      unavailable.add(
        isBotMarkKey(workspaceAgent.markKey)
          ? workspaceAgent.markKey
          : defaultBotMarkKey(workspaceAgent.id),
      );
    }
    const markKey =
      isBotMarkKey(existing?.markKey) && !unavailable.has(existing.markKey)
        ? existing.markKey
        : firstAvailableBotMarkKey(agentId, unavailable);

    if (existing) {
      // A completed contract owns its saved Training. Exact-content matching
      // alone would restore defaults after the founder edits or removes them.
      if (
        recordValue(existing.businessVariables).founder_seed_contract_version !==
        FOUNDER_FLEET_SEED_CONTRACT_VERSION
      ) {
        await ensurePersonality(agentId, userId, personalityForTemplate(template), tx);
        await seedTrainingArtifacts(agentId, userId, template.role, report, tx);
      }
      await tx
        .update(schema.agents)
        .set(
          founderFleetExistingAgentPatch(
            existing.businessVariables,
            managedBusinessVariables,
            markKey,
          ),
        )
        .where(tenantScope);
      return { kind: "updated", agentId } as const;
    }
    await tx.insert(schema.agents).values({ id: agentId, ...values, markKey });
    // Commit the initial Bot, Training and contract marker together. A failed
    // insert rolls back the marker so the next bootstrap can retry safely.
    await ensurePersonality(agentId, userId, personalityForTemplate(template), tx);
    await seedTrainingArtifacts(agentId, userId, template.role, report, tx);
    return { kind: "created", agentId } as const;
  });
  if (outcome.kind === "updated") report.agentsUpdated++;
  else report.agentsCreated++;

  report.agentIds.push(outcome.agentId);
  return outcome.agentId;
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

  // 6 internal compatibility personas
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
        systemPrompt: persona.systemPrompt,
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

  // Owner-created Bots are not seed targets. Keep them in the report without
  // injecting plan snapshots or restoring Training the founder has edited.
  const ownerAgents = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId));

  for (const row of ownerAgents) {
    if (!report.agentIds.includes(row.id)) {
      report.agentIds.push(row.id);
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
