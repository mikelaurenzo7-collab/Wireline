/**
 * Runtime Balance and billing integrity — durable ledger metadata,
 * idempotency, webhook writebacks, and honest catalog/pricing knowledge on
 * the surfaces that quote it.
 */
export function checkBillingIntegrity({ read, mustInclude, mustExclude }) {
  const billingSettingsPage = read("src/pages/BillingSettings.tsx");
  const stripeBillingCard = read("src/components/StripeBillingCard.tsx");
  const trialGateModal = read("src/components/TrialGateModal.tsx");
  const conversationBalanceRoutes = read("src/routes/conversation-balance-routes.ts");
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
    /CONVERSATION_BALANCE_COPY\.title|Runtime Balance/,
    "billing must expose Runtime Balance controls",
  );
  mustInclude(
    "src/components/StripeBillingCard.tsx",
    stripeBillingCard,
    /CONVERSATION_BALANCE_COPY/,
    "billing screen must expose Runtime Balance activation",
  );
  mustExclude(
    "src/components/StripeBillingCard.tsx",
    stripeBillingCard,
    /Build and test for free/,
    "billing screen must not revive retired Build-first billing copy",
  );
  mustExclude(
    "src/components/TrialGateModal.tsx",
    trialGateModal,
    /\/api\/conversation-balance\/checkout/,
    "trial gate must not sell Runtime Balance as a substitute for a live plan",
  );
  mustInclude(
    "src/components/TrialGateModal.tsx",
    trialGateModal,
    /\/api\/billing\/portal/,
    "past-due trial gates must recover through Stripe billing",
  );
  mustInclude(
    "src/routes/conversation-balance-routes.ts",
    conversationBalanceRoutes,
    /plan\.id !== "personal"/,
    "Runtime Balance checkout must require a paid live plan",
  );
  mustExclude(
    "src/components/StripeBillingCard.tsx",
    stripeBillingCard,
    /Personal activation without a subscription|mode=\{hasActive \? "topup" : "activation"\}/,
    "billing must not present prepaid balance as free-plan activation",
  );

  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /entryKind:\s*text\("entry_kind"/,
    "Runtime Balance ledger must store entry kind",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /idempotencyKey:\s*text\("idempotency_key"/,
    "Runtime Balance ledger must store provider-neutral idempotency keys",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /providerEventId:\s*text\("provider_event_id"/,
    "Runtime Balance ledger must store provider event ids",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /customerReason:\s*text\("customer_reason"/,
    "Runtime Balance ledger must store customer-visible reasons",
  );
  mustInclude(
    "src/db/schema.ts",
    dbSchema,
    /metadata:\s*jsonb\("metadata"\)/,
    "Runtime Balance ledger must store sanitized metadata",
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
    /customerReason:\s*"Voice minutes covered by Runtime Balance"/,
    "voice burns must have a customer-visible Runtime Balance reason",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"top_up"[\s\S]*customerReason:\s*"Runtime Balance top-up"/,
    "Stripe top-up webhook must write durable Runtime Balance metadata",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"refund"[\s\S]*customerReason:\s*"Runtime Balance refund"/,
    "Stripe refund webhook must write durable Runtime Balance metadata",
  );
  mustInclude(
    "src/routes/billing-routes.ts",
    billingRoutes,
    /entryKind:\s*"reversal"[\s\S]*customerReason:\s*"Runtime Balance dispute reversal"/,
    "Stripe dispute webhook must write durable Runtime Balance metadata",
  );
  mustInclude(
    "drizzle/migrations/0074_harden_conversation_balance_ledger.sql",
    balanceMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_idempotency_key/,
    "ledger migration must enforce idempotent Runtime Balance entries",
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
    /Runtime Balance/,
    "shared product knowledge must include Runtime Balance",
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
  const TRIAL_LANGUAGE_PATTERN = /14-day trial|fourteen-day trial|trial extension|extend a trial/i;
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
    "src/lib/showcase-assistant.ts",
    read("src/lib/showcase-assistant.ts"),
    /free-trial|Wireline trial|toward trial|want the trial|email a free.trial/i,
    "showcase/demo agents must not sell a time-boxed trial (Free Builder has no expiry)",
  );
  mustExclude(
    "src/lib/showcase-assistant.ts",
    read("src/lib/showcase-assistant.ts"),
    /listen\/whisper\/barge in beta/i,
    "showcase agents must not claim supervisor listen/whisper/barge as live beta",
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

  const conversationBalance = read("src/lib/conversation-balance.ts");
  const stripeFounderCatalog = read("scripts/lib/stripe-founder-catalog.mjs");
  mustInclude(
    "src/lib/conversation-balance.ts",
    conversationBalance,
    /CONVERSATION_BALANCE_PRESETS_USD = \[10, 25, 50, 100\]/,
    "Runtime Balance presets must stay at $10/$25/$50/$100",
  );
  mustInclude(
    "src/lib/conversation-balance.ts",
    conversationBalance,
    /CONVERSATION_BALANCE_MIN_USD = 10/,
    "Runtime Balance minimum must stay $10",
  );
  mustInclude(
    "scripts/lib/stripe-founder-catalog.mjs",
    stripeFounderCatalog,
    /\[10, 25, 50, 100\]\.map/,
    "Stripe founder catalog balance prices must match Runtime Balance presets",
  );
  mustExclude(
    "docs/P0_BILLING_OPS_NOTE.md",
    read("docs/P0_BILLING_OPS_NOTE.md"),
    /\$5 minimum|prepaid \$5, \$10, \$25, or \$50/,
    "P0 billing ops note must not revive $5 Runtime Balance presets",
  );
}
