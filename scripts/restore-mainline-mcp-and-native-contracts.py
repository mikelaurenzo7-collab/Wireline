from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact marker, found {count}")
    write(path, text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    text = read(path)
    start_at = text.find(start)
    end_at = text.find(end, start_at)
    if start_at < 0 or end_at < 0:
        raise RuntimeError(f"{path}: bounded replacement markers were not found")
    write(path, text[:start_at] + replacement + text[end_at:])


MAINLINE_PATHS = [
    ".mcp.json",
    "agents/wireline.md",
    "chatgpt-app-submission.json",
    "claude-connector-submission.json",
    "docs/CHATGPT_APP.md",
    "docs/CHATGPT_APP_SUBMISSION.md",
    "docs/CLAUDE_CONNECTOR.md",
    "docs/CLAUDE_CONNECTOR_SUBMISSION.md",
    "docs/CLIENT_SURFACES.md",
    "docs/CLIENT_SURFACES_STRATEGY_2026-08.md",
    "docs/CURSOR_PLUGIN.md",
    "docs/CURSOR_PLUGIN_SUBMISSION.md",
    "docs/README.md",
    "mcp.json",
    "plugin.json",
    "public/chatgpt-app-privacy.html",
    "public/claude-connector.html",
    "public/cursor-plugin.html",
    "public/mcp-privacy.html",
    "rules/wireline-mcp.mdc",
    "skills/wireline-voice-agent/SKILL.md",
    "scripts/check-chatgpt-app-release.mjs",
    "scripts/check-deployment-boundaries.mjs",
    "scripts/check-docs-index.mjs",
    "scripts/check-mcp-http-hardening.mjs",
    "scripts/check-no-em-dashes.mjs",
    "src/components/settings/McpCoachingPanel.tsx",
    "src/constants/navigation.ts",
    "src/entrypoints/chatgpt-mcp-api.ts",
    "src/lib/agent-draft-service.ts",
    "src/lib/auth-redirect.test.ts",
    "src/lib/auth-redirect.ts",
    "src/lib/chatgpt-mcp-account.ts",
    "src/lib/chatgpt-mcp.ts",
    "src/lib/mcp-agent-coaching.ts",
    "src/lib/mcp-app-metadata.test.ts",
    "src/lib/mcp-app-metadata.ts",
    "src/lib/mcp-client-registry.test.ts",
    "src/lib/mcp-client-registry.ts",
    "src/lib/mcp-coaching-preferences.test.ts",
    "src/lib/mcp-coaching-preferences.ts",
    "src/lib/mcp-oauth-security.ts",
    "src/lib/mcp-transport.ts",
    "src/lib/private-agent-test.test.ts",
    "src/lib/private-agent-test.ts",
    "src/lib/product-events.ts",
    "src/lib/wireline-mcp-widget-styles.ts",
    "src/middleware/mcp-oauth-issuer-binding.ts",
    "src/pages/ClientAppsPage.tsx",
    "src/pages/Developers.tsx",
    "src/pages/SignupPage.tsx",
    "src/routes/agent-test-routes.ts",
    "src/routes/auth-routes.ts",
    "src/routes/chatgpt-mcp-account-routes.ts",
    "src/routes/chatgpt-mcp-routes.ts",
    "src/routes/mcp-coaching-settings-routes.ts",
    "src/server/register-mcp-routes.ts",
    "tests/authenticated-agent-flow-contract.test.ts",
    "tests/chatgpt-app-contract.test.ts",
    "tests/claude-connector-contract.test.ts",
    "tests/cursor-plugin-contract.test.ts",
    "tests/design/agent-navigation-contract.test.ts",
    "tests/design/demand-driven-overview-contract.test.ts",
    "tests/double-pass-launch-honesty-contract.test.ts",
    "tests/mcp-client-registry-contract.test.ts",
    "tests/mcp-coaching-contract.test.ts",
    "tests/mcp-oauth-issuer-binding-contract.test.ts",
    "tests/mcp-transport-contract.test.ts",
    "vercel.json",
]

subprocess.run(["git", "fetch", "--no-tags", "origin", "main"], check=True)
subprocess.run(["git", "checkout", "origin/main", "--", *MAINLINE_PATHS], check=True)

# Restore the standalone MCP transport after the canonical API registry.
replace_once(
    "server.ts",
    'import { registerApiRoutes } from "./src/server/register-api-routes";\n',
    'import { registerApiRoutes } from "./src/server/register-api-routes";\n'
    'import { registerMcpRoutes } from "./src/server/register-mcp-routes";\n',
)
replace_once(
    "server.ts",
    "registerApiRoutes(app);\n",
    "registerApiRoutes(app);\nregisterMcpRoutes(app);\n",
)

# Restore the authenticated Apps coaching controls without altering native route order.
replace_once(
    "src/server/register-api-routes.ts",
    'import userPreferenceGuardRouter from "../routes/user-preference-guard-routes";\n',
    'import userPreferenceGuardRouter from "../routes/user-preference-guard-routes";\n'
    'import mcpCoachingSettingsRouter from "../routes/mcp-coaching-settings-routes";\n',
)
replace_once(
    "src/server/register-api-routes.ts",
    "  app.use(userPreferenceGuardRouter);\n",
    "  app.use(userPreferenceGuardRouter);\n  app.use(mcpCoachingSettingsRouter);\n",
)

# Keep current-main acquisition truth while preserving the native voice boundary.
meta = read("src/lib/marketing-route-meta.ts")
meta = re.sub(
    r'("/developers": \{\n\s+title: "Developer Portal \| Wireline",\n\s+description:\n\s+)"[^"]*"',
    r'\1"Wireline MCP apps for ChatGPT, Claude, and Cursor. Create an account, build your first voice agent in the chat you already use, then continue in Studio. No public API keys."',
    meta,
    count=1,
)
write("src/lib/marketing-route-meta.ts", meta)

replace_once(
    "src/lib/chatgpt-mcp-account.ts",
    " * Private voice uses the same OpenAI Realtime WebRTC contract as Studio live\n"
    " * voice — an ephemeral client secret plus a browser SDP exchange.\n",
    " * Private voice in this ChatGPT-hosted widget uses OpenAI Realtime WebRTC\n"
    " * because the iframe may only connect to api.openai.com. It is not the\n"
    " * Studio or PSTN brain. Studio live tests and tenant phone calls use xAI\n"
    " * grok-voice-think-fast-2.0 through the native realtime and Direct SIP paths.\n",
)

# Retired Identity is deliberate; use current main's behavior contract.
# Company identity must follow every native phone ownership mutation, not retired Vapi counts.
replace_once(
    "tests/company-identity-contract.test.ts",
    '    const carrier = read("src/routes/carrier-routes.ts");\n'
    '    const provisioning = read("src/lib/phone-provisioning.ts");\n'
    '    const registry = read("src/server/register-api-routes.ts");',
    '    const carrier = read("src/routes/carrier-routes.ts");\n'
    '    const nativeProvisioning = read("src/lib/voice/native-phone-provisioning.ts");\n'
    '    const nativeAssignment = read("src/lib/voice/native-phone-assignment.ts");\n'
    '    const nativeRelease = read("src/lib/voice/native-phone-release.ts");\n'
    '    const nativeRouting = read("src/routes/native-phone-routing-routes.ts");\n'
    '    const registry = read("src/server/register-api-routes.ts");',
)
company = read("tests/company-identity-contract.test.ts")
company_start = company.find('    expect(\n      carrier.match(/runCompanyIdentityMutation')
company_end_marker = '    expect(provisioning).toContain(\n      "Number provisioning could not be saved; the provider allocation was released.",\n    );'
company_end = company.find(company_end_marker, company_start)
if company_start < 0 or company_end < 0:
    raise RuntimeError("company identity legacy assertion block was not found")
company_end += len(company_end_marker)
company_replacement = '''    const manualClaim = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(manualClaim).toContain("status(410)");
    expect(manualClaim).toContain('code: "NATIVE_PHONE_REQUIRED"');
    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeLessThan(
      registry.indexOf("app.use(carrierRouter)"),
    );
    expect(nativeRouting).toContain("provisionNativeTenantNumber");
    expect(nativeRouting).toContain("assignNativePhoneLine");
    expect(nativeProvisioning).toContain("runCompanyIdentityMutation");
    expect(nativeProvisioning).toContain('"phone_number_changed"');
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
    expect(nativeAssignment).toContain("runCompanyIdentityMutation");
    expect(nativeAssignment).toContain("restorePreviousRouting");
    expect(nativeRelease).toContain("deactivateNativeXAIPhoneLine");
    expect(nativeRelease).toContain('status: "retired"');'''
write(
    "tests/company-identity-contract.test.ts",
    company[:company_start] + company_replacement + company[company_end:],
)

# Header checks should assert the responsive safety properties, not an exact class spelling.
replace_once(
    "tests/marketing-centering-contract.test.ts",
    '''    expect(header).toContain(
      '<nav className="ml-auto flex items-center gap-2 sm:gap-4" aria-label="Account">',
    );
    expect(header).toContain('to="/signin"');
    expect(header).toContain('to="/signup?plan=personal"');''',
    '''    expect(header).toContain('aria-label="Account"');
    expect(header).toContain("min-w-0");
    expect(header).toContain("shrink-0");
    expect(header).toContain("whitespace-nowrap");
    expect(header).toContain('to="/signin"');
    expect(header).toContain('to="/signup?plan=personal"');''',
)

replace_once(
    "tests/round6-honesty-compliance-contract.test.ts",
    '''describe("sentinel killCall verifies the Vapi response", () => {
  it("does not mark presence terminated when the terminate call was rejected", () => {
    const sentinel = read("src/services/sentinel.ts");
    expect(sentinel).toContain("if (!response.ok)");
    const okCheck = sentinel.indexOf("if (!response.ok)");
    const presenceUpdate = sentinel.indexOf('set({ status: "terminated" })');
    expect(okCheck).toBeGreaterThan(-1);
    expect(presenceUpdate).toBeGreaterThan(okCheck);
  });
});''',
    '''describe("sentinel call termination verifies the active provider", () => {
  it("marks presence terminated only after native or rollback control succeeds", () => {
    const sentinel = read("src/services/sentinel.ts");
    const nativeBranch = sentinel.indexOf("if (xaiCallId)");
    const nativeHangup = sentinel.indexOf("await hangupXAISipCall(xaiCallId)", nativeBranch);
    const nativePresence = sentinel.indexOf('set({ status: "terminated" })', nativeHangup);
    expect(nativeBranch).toBeGreaterThan(-1);
    expect(nativeHangup).toBeGreaterThan(nativeBranch);
    expect(nativePresence).toBeGreaterThan(nativeHangup);

    const rollbackRequest = sentinel.indexOf("const response = await fetchWithTimeout", nativePresence);
    const okCheck = sentinel.indexOf("if (!response.ok)", rollbackRequest);
    const rollbackPresence = sentinel.indexOf('set({ status: "terminated" })', okCheck);
    expect(rollbackRequest).toBeGreaterThan(nativePresence);
    expect(okCheck).toBeGreaterThan(rollbackRequest);
    expect(rollbackPresence).toBeGreaterThan(okCheck);
  });
});''',
)

write(
    "tests/round6-tenant-binding-contract.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 native phone-line tenant binding", () => {
  const carrier = read("src/routes/carrier-routes.ts");
  const nativeRouting = read("src/routes/native-phone-routing-routes.ts");
  const nativeProvisioning = read("src/lib/voice/native-phone-provisioning.ts");
  const registry = read("src/server/register-api-routes.ts");

  it("retires manual Vapi claims and gives native routing precedence", () => {
    const manual = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(manual).toContain("status(410)");
    expect(manual).toContain('code: "NATIVE_PHONE_REQUIRED"');
    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeGreaterThan(-1);
    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeLessThan(
      registry.indexOf("app.use(carrierRouter)"),
    );
  });

  it("checks capacity before purchase and again inside ownership persistence", () => {
    const entitlement = nativeProvisioning.indexOf("getIncludedPhoneLineSlots(input.userId)");
    const purchase = nativeProvisioning.indexOf("purchaseNativeNumber(input)");
    const lockedCount = nativeProvisioning.indexOf("const [{ held }] = await tx");
    const insert = nativeProvisioning.indexOf(".insert(schema.phoneNumbers)", lockedCount);
    expect(entitlement).toBeGreaterThan(-1);
    expect(purchase).toBeGreaterThan(entitlement);
    expect(lockedCount).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lockedCount);
    expect(nativeProvisioning).toContain('kind: "capacity"');
    expect(nativeProvisioning).toContain('code: "PHONE_CAPACITY_REACHED"');
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
  });

  it("binds native line and agent lookups to the authenticated workspace", () => {
    expect(nativeProvisioning).toContain("eq(schema.agents.userId, input.userId)");
    expect(nativeProvisioning).toContain("userId: input.userId");
    expect(nativeProvisioning).toContain("eq(schema.phoneNumbers.userId, input.userId)");
    expect(nativeRouting).toContain("userId: req.user.id");
    expect(nativeRouting).toContain("assignNativePhoneLine");
    expect(nativeRouting).toContain("provisionNativeTenantNumber");
  });

  it("keeps storage backstops for legacy and native provider identities", () => {
    const schemaSrc = read("src/db/schema.ts");
    expect(schemaSrc).toContain("idx_phone_numbers_vapi_number_id_unique");
    const nativeMigration = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_twilio_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_xai_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_xai_webhook");
    expect(nativeMigration).toContain("wireline_current_user_id()");
  });
});

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const create = mobile.slice(
      mobile.indexOf('"/api/mobile/agents",'),
      mobile.indexOf('router.get(\\n  "/api/mobile/agents"'),
    );
    const lockIdx = create.indexOf("pg_advisory_xact_lock");
    const countIdx = create.indexOf("count(*)");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(countIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
''',
)

security = read("tests/security-atomicity-release-contract.test.ts")
start_marker = '  it("reserves each number before dialing and preserves the lock after uncertain outcomes", () => {'
end_marker = '  it("creates resumable Stripe Checkout Sessions with durable idempotency keys", () => {'
start_at = security.find(start_marker)
end_at = security.find(end_marker, start_at)
if start_at < 0 or end_at < 0:
    raise RuntimeError("atomic dial contract markers were not found")
security_replacement = '''  it("reserves each number before native placement and preserves uncertain outcomes", () => {
    const source = read("src/routes/outbound-dial-atomic-routes.ts");
    const reservation = source.indexOf(".insert(outboundDialReservations)");
    const dialing = source.indexOf('status: "dialing"', reservation);
    const provider = source.indexOf("placeOutboundCall({", dialing);
    const attachedLead = source.indexOf("nativeLeadId = result.leadId", provider);
    const ambiguous = source.indexOf("result.providerOutcomeAmbiguous", provider);
    const completion = source.indexOf('status: "completed"', provider);
    expect(reservation).toBeGreaterThan(-1);
    expect(dialing).toBeGreaterThan(reservation);
    expect(provider).toBeGreaterThan(dialing);
    expect(attachedLead).toBeGreaterThan(provider);
    expect(ambiguous).toBeGreaterThan(provider);
    expect(completion).toBeGreaterThan(ambiguous);
    expect(source).toContain('failureCode: "provider_outcome_ambiguous"');
    expect(source).toContain('failureCode: "post_provider_persistence_failed"');
    expect(source).toContain('code: "DIAL_STATUS_UNCERTAIN"');
    expect(source).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
  });

'''
write(
    "tests/security-atomicity-release-contract.test.ts",
    security[:start_at] + security_replacement + security[end_at:],
)

silent = read("tests/silent-failure-round2-contract.test.ts")
silent = silent.replace(
    'const advanceAt = engine.indexOf("const nextIdx = currentIdx + 1");',
    'const advanceAt = engine.indexOf("const nextIndex = currentIndex + 1");',
)
silent = re.sub(
    r'expect\(journal\.entries\.at\(-1\)\)\.toMatchObject\(\{\n\s+idx: 49,\n\s+tag: "0151_xai_grok_46_runtime_defaults",\n\s+\}\);',
    'expect(journal.entries.at(-1)).toMatchObject({\n      idx: 52,\n      tag: "0154_xai_grok_46_persisted_defaults",\n    });',
    silent,
    count=1,
)
write("tests/silent-failure-round2-contract.test.ts", silent)

replace_once(
    "tests/structured-runtime-policy-contract.test.ts",
    'voiceLlmModel: text("voice_llm_model").default("grok-4.3")',
    'voiceLlmModel: text("voice_llm_model").default("grok-4.6")',
)

replace_once(
    "tests/subsystem-audit-hardening-contract.test.ts",
    '''  it("routes cadence email steps as marketing mail", () => {
    expect(read("src/lib/cadence-engine.ts")).toMatch(
      /integ\\.sendEmail\\(\\{[\\s\\S]{0,200}marketing: true/,
    );
  });''',
    '''  it("routes cadence email steps as marketing mail", () => {
    const cadence = read("src/lib/cadence-engine.ts");
    const start = cadence.indexOf('if (step.type === "email")');
    const end = cadence.indexOf("\\n  return { ok: false", start);
    const emailStep = cadence.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(emailStep).toContain("new IntegrationService(cadence.userId)");
    expect(emailStep).toContain("integration.sendEmail({");
    expect(emailStep).toContain("marketing: true");
  });''',
)

voice = read("tests/xai-native-voice-contract.test.ts")
voice_start = voice.find('  it("reconciles stale agent assignment and mutable Twilio origination state", () => {')
voice_end = voice.find('  it("verifies a valid Standard Webhooks signature over the exact raw body", () => {', voice_start)
if voice_start < 0 or voice_end < 0:
    raise RuntimeError("native voice reconciliation test markers were not found")
voice_replacement = '''  it("reconciles assignment leases and mutable Twilio origination state", () => {
    const route = read("src/routes/xai-voice-routes.ts");
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const provisioning = read("src/lib/voice/xai-sip-provisioning.ts");
    expect(route).toContain('from "../lib/voice/xai-phone-activation-service"');
    expect(assignment).toContain("currentAgentPredicate");
    expect(assignment).toContain("restorePreviousRouting");
    expect(provisioning).toContain("originationUrls(primarySid).update");
    expect(provisioning).toContain("enabled: true");
    expect(provisioning).toContain("xaiSharedTwilioOriginationUri()");
    expect(provisioning).toContain("staleManagedOriginations");
  });

'''
write(
    "tests/xai-native-voice-contract.test.ts",
    voice[:voice_start] + voice_replacement + voice[voice_end:],
)

# Retrigger the exact full migration gate against the restored final product tree.
workflow = " .github/workflows/materialize-grok46-defaults.yml".strip()
workflow_text = read(workflow)
workflow_text += "\n# Exact-head rerun includes restored Claude, Cursor, MCP coaching, and native contracts.\n"
write(workflow, workflow_text)

print("Restored current-main MCP surfaces and converted stale native contracts to behavior checks.")
