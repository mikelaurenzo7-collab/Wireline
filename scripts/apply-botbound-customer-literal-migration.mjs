#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

/**
 * Transitional BotBound launch bridge.
 *
 * The source tree still carries a small number of customer-facing Wireline
 * literals in long-lived runtime modules. GitHub's stable technical namespace,
 * provider identifiers, persisted names, headers, and compatibility artifacts
 * intentionally remain Wireline. This codemod changes only the exact visible
 * literals below before the Vercel release estate runs.
 *
 * It is deliberately idempotent so the source files can be cleaned up directly
 * later without breaking deploys. The always-on botbound-visible-brand-sweep
 * test runs immediately after this bridge and remains the release authority.
 */
const replacements = {
  "src/lib/agent-constants.ts": [
    ["You are Wireline Operator:", "You are BotBound Operator:"],
  ],
  "src/lib/ai-models.ts": [
    ["retried by Wireline through OpenAI.", "retried by BotBound through OpenAI."],
  ],
  "src/lib/demo-account-seed.ts": [
    ["HIPAA + Wireline for our practice", "HIPAA + BotBound for our practice"],
    ["Avery from Wireline. Happy to help with that.", "Avery from BotBound. Happy to help with that."],
  ],
  "src/lib/integration-playbooks.ts": [
    ["Every call becomes a row in your Wireline log workbook", "Every call becomes a row in your BotBound log workbook"],
  ],
  "src/lib/job-worker-base.ts": [
    ["`Wireline ${input.direction} call${subjectSuffix}`", "`BotBound ${input.direction} call${subjectSuffix}`"],
    ["p.agentName || \"Wireline Agent\"", "p.agentName || \"BotBound Bot\""],
    ["`[Wireline] ${count} tenant(s) at margin risk`", "`[BotBound] ${count} tenant(s) at margin risk`"],
  ],
  "src/lib/microsoft-graph-service.ts": [
    ["[\"<strong>Wireline</strong>\"]", "[\"<strong>BotBound</strong>\"]"],
  ],
  "src/lib/phone-provisioning.ts": [
    ["Wireline could not activate a number right now.", "BotBound could not activate a number right now."],
    ["Wireline could not release that number right now.", "BotBound could not release that number right now."],
  ],
  "src/lib/post-call-digest.ts": [
    ["`[Wireline · ${core.outcomeTag.toUpperCase()}]", "`[BotBound · ${core.outcomeTag.toUpperCase()}]"],
    ["Shareable Wireline recap · private link", "Shareable BotBound recap · private link"],
    ["Wireline · Post-call digest", "BotBound · Post-call digest"],
  ],
  "src/lib/shareable-artifact/template/shell.ts": [
    ["\"Wireline · \" + escapeHtml(WIRELINE_SIGNATURE)", "\"BotBound · \" + escapeHtml(WIRELINE_SIGNATURE)"],
  ],
  "src/lib/vapi-assistant-factory-v2.ts": [
    ["a Wireline ${configured.role || \"agent\"}", "a BotBound ${configured.role || \"agent\"}"],
    ["a personal Wireline agent", "a personal BotBound Bot"],
  ],
  "src/lib/vapi-handlers.ts": [
    ["agentDetail?.name || \"Wireline Agent\"", "agentDetail?.name || \"BotBound Bot\""],
  ],
  "src/lib/vapi-helpers.ts": [
    ["the Wireline ads account", "the BotBound ads account"],
  ],
  "src/lib/voice/xai-sip-session.ts": [
    ["Wireline does not operate one", "BotBound does not operate one"],
    ["input.businessName?.trim() || \"Wireline\"", "input.businessName?.trim() || \"BotBound\""],
  ],
  "src/lib/wireline-ops-design.ts": [
    ["shortcuts back into Wireline.", "shortcuts back into BotBound."],
  ],
  "src/lib/workspace-planner.ts": [
    ["AI manager inside Wireline.", "AI manager inside BotBound."],
    ["a Wireline AI ${role}", "a BotBound AI ${role}"],
  ],
  "src/routes/agent-workspace-routes.ts": [
    ["a Wireline AI ${role}", "a BotBound AI ${role}"],
  ],
  "src/routes/auth-oauth-routes.ts": [
    ["your Wireline account", "your BotBound account"],
  ],
  "src/routes/billing-routes.ts": [
    ["a paid Wireline plan", "a paid BotBound plan"],
    ["Wireline is reconciling its local billing record.", "BotBound is reconciling its local billing record."],
  ],
  "src/routes/chatgpt-mcp-account-routes.ts": [
    // These are the only two standalone uppercase customer-name shapes in the
    // account-bound protocol owner. Lowercase/camel technical identifiers such
    // as list_wireline_agents and open_in_wireline_url remain untouched.
    ["Wireline ", "BotBound "],
    ["Wireline.", "BotBound."],
  ],
  "src/routes/chatgpt-mcp-routes.ts": [
    // This router's uppercase Wireline occurrences are OAuth errors/consent
    // prose only. Its compatibility tables, scopes, endpoints, and token fields
    // are all lowercase wireline_* or imported protocol values.
    ["Wireline", "BotBound"],
  ],
  "src/routes/company-identity-routes.ts": [
    ["Wireline records a verified business profile", "BotBound records a verified business profile"],
    ["supported Wireline workflows", "supported BotBound workflows"],
  ],
  "src/routes/launch-billing-checkout-atomic-routes.ts": [
    ["Wireline is reconciling its local billing record.", "BotBound is reconciling its local billing record."],
    ["Wireline is reconciling local checkout state.", "BotBound is reconciling local checkout state."],
  ],
  "src/routes/twilio-webhook-base.ts": [
    ["you have reached a Wireline agent line", "you have reached a BotBound Bot line"],
    ["Wireline: voicemail left during call failover", "BotBound: voicemail left during call failover"],
    ["fun at Wireline sometimes", "fun at BotBound sometimes"],
  ],
  "src/routes/twilio-webhook.ts": [
    ["Wireline's Twilio account", "BotBound's Twilio account"],
    ["`[Wireline] Twilio ${recurring} usage threshold reached`", "`[BotBound] Twilio ${recurring} usage threshold reached`"],
  ],
  "src/routes/xai-outbound-routes.ts": [
    ["agent?.name?.trim() || \"Wireline\"", "agent?.name?.trim() || \"BotBound\""],
  ],
};

let filesChanged = 0;
let literalsChanged = 0;
const unresolved = [];

for (const [relativePath, rules] of Object.entries(replacements)) {
  const path = resolve(root, relativePath);
  const original = readFileSync(path, "utf8");
  let next = original;

  for (const [from, to] of rules) {
    if (next.includes(from)) {
      const before = next;
      next = next.split(from).join(to);
      if (next !== before) literalsChanged += 1;
      continue;
    }
    if (!next.includes(to)) unresolved.push(`${relativePath}: ${from}`);
  }

  if (next !== original) {
    writeFileSync(path, next, "utf8");
    filesChanged += 1;
  }
}

if (unresolved.length) {
  console.error("BotBound customer-literal migration found unexpected source drift:\n");
  for (const item of unresolved) console.error(`- ${item}`);
  process.exit(1);
}

console.log(
  `BotBound customer-literal migration ready (${filesChanged} file(s), ${literalsChanged} rule(s) applied).`,
);
