/**
 * Conversation Balance and billing integrity — durable ledger metadata,
 * idempotency, webhook writebacks, and honest catalog/pricing knowledge on
 * the surfaces that quote it.
 */
export function checkBillingIntegrity({ read, mustInclude, mustExclude }) {
  const billingSettingsPage = read("src/pages/BillingSettings.tsx");
  const stripeBillingCard = read("src/components/StripeBillingCard.tsx");
  const conversationBalanceCard = read("src/components/ConversationBalanceCard.tsx");
  const trialGateModal = read("src/components/TrialGateModal.tsx");
  const dbSchema = read("src/db/schema.ts");
  const creditWallet = read("src/lib/credit-wallet.ts");
  const billingRoutes = read("src/routes/billing-routes.ts");
  const balanceMigration = read("drizzle/migrations/0074_harden_conversation_balance_ledger.sql");
  const wirelineKnowledge = read("src/data/wireline-knowledge.ts");
  const verticalWedges = read("src/data/vertical-wedges.ts");
  const founderSeed = read("src/lib/founder-fleet-seed.ts");
  const wirelinePersonas = read("src/lib/wireline-agent-personas.ts");
  const wirelineObjections = read("src/lib/wireline-agent-objections.ts");
  const wirelineEscalation = read("src/lib/wireline-agent-escalation.ts");
  const emailService = read("src/lib/email-service.ts");
  const vapiToolHandlers = read("src/lib/vapi-tool-handlers.ts");

  mustInclude(
    "src/pages/BillingSettings.tsx",
    billingSettingsPage,
    /Conversation Balance/,
    "billing must expose conversation balance controls",
  );
  mustInclude(
    "src/components/StripeBillingCard.tsx",
    stripeBillingCard,
    /CONVERSATION_BALANCE_COPY/,
    "billing screen must expose Conversation Balance activation",
  );
  mustExclude(
    "src/components/StripeBillingCard.tsx",
    stripeBillingCard,
    /Build and test for free/,
    "billing screen must not revive retired Build-first billing copy",
  );
  mustExclude(
    "src/components/ConversationBalanceCard.tsx",
    conversationBalanceCard,
    /Build and test for free/,
    "Conversation Balance card must not revive retired Build-first activation copy",
  );
  mustInclude(
    "src/components/TrialGateModal.tsx",
    trialGateModal,
    /\/api\/conversation-balance\/checkout/,
    "trial gate must offer Personal Conversation Balance activation",
  );

  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /entryKind:\s*text\("entry_kind"/,
    "Conversation Balance ledger must store entry kind",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /idempotencyKey:\s*text\("idempotency_key"/,
    "Conversation Balance ledger must store provider-neutral idempotency keys",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /providerEventId:\s*text\("provider_event_id"/,
    "Conversation Balance ledger must store provider event ids",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /customerReason:\s*text\("customer_reason"/,
    "Conversation Balance ledger must store customer-visible reasons",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /metadata:\s*jsonb\("metadata"\)/,
    "Conversation Balance ledger must store sanitized metadata",
  );
  mustInclude(
    "src/lib/credit-wallet.ts",
    creditWallet,
    /entryKind\?:\s*"top_up" \| "burn" \| "refund" \| "adjustment" \| "grant" \| "reversal"/,
    "credit wallet references must classify ledger movement kinds",
  );
  mustInclude(
    "src/lib/credit-wallet.ts",
    creditWallet,
    /idempotencyKey:\s*ref\?\.idempotencyKey/,
    "credit wallet must write idempotency keys",
  );
  mustInclude(
    "src/lib/credit-wallet.ts",
    creditWallet,
    /customerReason:\s*"Voice overage covered by Conversation Balance"/,
    "voice burns must have a customer-visible Conversation Balance reason",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"top_up"[\s\S]*customerReason:\s*"Conversation Balance top-up"/,
    "Stripe top-up webhook must write durable Conversation Balance metadata",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"refund"[\s\S]*customerReason:\s*"Conversation Balance refund"/,
    "Stripe refund webhook must write durable Conversation Balance metadata",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"reversal"[\s\S]*customerReason:\s*"Conversation Balance dispute reversal"/,
    "Stripe dispute webhook must write durable Conversation Balance metadata",
  );
  mustInclude(
    "drizzle/migrations/0074_harden_conversation_balance_ledger.sql",
    balanceMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_idempotency_key/,
    "ledger migration must enforce idempotent Conversation Balance entries",
  );
  mustInclude(
    "drizzle/migrations/0074_harden_conversation_balance_ledger.sql",
    balanceMigration,
    /metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
    "ledger migration must add sanitized metadata storage",
  );

  mustInclude(
    "src/data/wireline-knowledge.ts",
    wirelineKnowledge,
    /Conversation Balance/,
    "shared product knowledge must include Conversation Balance",
  );
  mustInclude(
    "src/data/wireline-knowledge.ts",
    wirelineKnowledge,
    /Wireline Starter[\s\S]*Wireline Starter Plus[\s\S]*Wireline Pro[\s\S]*Wireline Business/,
    "shared product knowledge must match the launch catalog",
  );
  mustExclude(
    "src/data/wireline-knowledge.ts",
    wirelineKnowledge,
    /Legacy Wireline|Wireline Plus|one Assistants|Assistants analytics/,
    "shared product knowledge must purge legacy catalog and assistant copy",
  );
  mustExclude(
    "src/data/vertical-wedges.ts",
    verticalWedges,
    /Start 14-day free trial|14-day free trial|Free trial|Everyday tier|\$7\/mo|Account Holder|personal AI voice assistant/i,
    "vertical wedges must not revive retired trial or pricing copy",
  );
  mustInclude(
    "src/data/vertical-wedges.ts",
    verticalWedges,
    /a: TRUST_DISCLOSURE_FAQ,/,
    "sales wedge disclosure answer must use the canonical trust constant",
  );
  mustExclude(
    "src/lib/founder-fleet-seed.ts",
    founderSeed,
    /Wireline plans start at \$7|Everyday|Account Holders|Assistants strategy|founder-Assistants-seed/i,
    "founder seed must not insert retired pricing or assistant strategy copy",
  );
  mustExclude(
    "src/lib/wireline-agent-personas.ts",
    wirelinePersonas,
    /Everyday:|Plus:\s+\$|Studio:\s+\$|Account Holder:|first working assistant|my assistant/i,
    "demo-line personas must quote current agent and pricing language",
  );
  // The commercial model is Free Builder (build/test one agent free, no
  // card, no time limit) → pick a live plan for a customer number. There
  // is no time-boxed trial to promise or "extend" — live sales/support
  // agent scripts that offer one are lying to real prospects on the phone.
  const TRIAL_LANGUAGE_PATTERN =
    /14-day trial|fourteen-day trial|trial extension|extend a trial/i;
  mustExclude(
    "src/lib/wireline-agent-personas.ts",
    wirelinePersonas,
    TRIAL_LANGUAGE_PATTERN,
    "demo-line personas must not promise or extend a time-boxed trial (Free Builder has no expiry)",
  );
  mustExclude(
    "src/lib/wireline-agent-objections.ts",
    wirelineObjections,
    TRIAL_LANGUAGE_PATTERN,
    "objection-handling scripts must not promise a time-boxed trial (Free Builder has no expiry)",
  );
  mustExclude(
    "src/lib/wireline-agent-escalation.ts",
    wirelineEscalation,
    TRIAL_LANGUAGE_PATTERN,
    "Tier-1 auto-resolve topics must not list trial extension as a capability that doesn't exist",
  );
  mustExclude(
    "src/lib/email-service.ts",
    emailService,
    TRIAL_LANGUAGE_PATTERN,
    "transactional email copy must not promise a time-boxed trial (Free Builder has no expiry)",
  );
  mustExclude(
    "src/lib/vapi-tool-handlers.ts",
    vapiToolHandlers,
    TRIAL_LANGUAGE_PATTERN,
    "Vapi tool handler docs/copy must not describe a time-boxed trial (Free Builder has no expiry)",
  );
  mustExclude(
    "scripts/capture-prod-visual-qa.mjs",
    read("scripts/capture-prod-visual-qa.mjs"),
    /create-assistant|knowledge-base|Create assistant|Knowledge Base|standard business subscription starts at \$49/i,
    "production visual QA harness must use Create Agent and Training language",
  );
  mustExclude(
    "src/lib/plan-catalog.ts",
    read("src/lib/plan-catalog.ts"),
    /proposal|presentation, and report|report artifact workflow/i,
    "plan catalog must not sell proposal/presentation artifacts that are not shipped",
  );
  mustExclude(
    "src/lib/wireline-agent-personas.ts",
    wirelinePersonas,
    /SSO,\s*SCIM|Enterprise:\s*SSO/i,
    "demo-line personas must not claim live SSO/SCIM on a self-serve Enterprise tier",
  );
  mustExclude(
    "scripts/marketing-kit.mjs",
    read("scripts/marketing-kit.mjs"),
    /Start free trial/i,
    "marketing kit must not regenerate Start free trial CTAs",
  );
  mustInclude(
    "src/lib/wireline-agent-personas.ts",
    wirelinePersonas,
    /Free Builder:[\s\S]*Starter:/,
    "demo-line personas must quote Free Builder + Starter catalog truth",
  );
}
