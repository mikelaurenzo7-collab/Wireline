from __future__ import annotations

import re
from pathlib import Path

ROOT = Path.cwd()


def path(name: str) -> Path:
    return ROOT / name


def read(name: str) -> str:
    return path(name).read_text(encoding="utf-8")


def write(name: str, text: str) -> None:
    path(name).write_text(text, encoding="utf-8")


def replace_exact(name: str, old: str, new: str, *, count: int = 1) -> None:
    text = read(name)
    found = text.count(old)
    if found != count:
        raise RuntimeError(f"{name}: expected {count} exact match(es), found {found}: {old[:120]!r}")
    write(name, text.replace(old, new, count))


def replace_between(name: str, start: str, end: str, replacement: str) -> None:
    text = read(name)
    start_index = text.find(start)
    end_index = text.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise RuntimeError(f"{name}: bounded replacement markers missing")
    write(name, text[:start_index] + replacement + text[end_index:])


def regex_replace(name: str, pattern: str, replacement: str, *, flags: int = 0) -> None:
    text = read(name)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{name}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(name, updated)


knowledge = "src/data/wireline-knowledge.ts"
text = read(knowledge)
text = text.replace(
    ' *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.',
    ' *   1. Injected into every managed voice-agent system prompt as a "WIRELINE KNOWLEDGE" block.',
)
text, count = re.subn(
    r'export const WIRELINE_VOICE_STACK =\n  "[^"]*";',
    'export const WIRELINE_VOICE_STACK =\n'
    '  "Live calls run through Twilio plus xAI Direct SIP Speech-to-Speech '
    '(grok-voice-think-fast-2.0). Studio live tests use the same voice brain. '
    'OpenAI Realtime is limited to the ChatGPT App preview because that host '
    'permits only OpenAI realtime WebRTC; it is not the PSTN runtime.";',
    text,
    count=1,
)
if count != 1:
    raise RuntimeError("wireline knowledge: voice stack declaration not found")
write(knowledge, text)

replace_exact(
    "src/lib/chatgpt-mcp-account.ts",
    """ * Private voice uses the same OpenAI Realtime WebRTC contract as Studio live
 * voice — an ephemeral client secret plus a browser SDP exchange.
 *
 * The host bridge speaks both ChatGPT (`window.openai`) and Claude MCP Apps
""",
    """ * Private voice in this hosted widget uses OpenAI Realtime WebRTC because
 * the iframe may connect to api.openai.com but cannot open the xAI realtime
 * endpoint. It is not the Studio or PSTN brain: Studio live tests and tenant
 * phone calls use xAI Speech-to-Speech (`grok-voice-think-fast-2.0`).
 *
 * The host bridge speaks both ChatGPT (`window.openai`) and Claude MCP Apps
""",
)

registry = "src/server/register-api-routes.ts"
replace_exact(
    registry,
    'import postCallOutputRouter from "../routes/post-call-output-routes";\n'
    'import phoneNumberReleaseRouter from "../routes/phone-number-release-routes";',
    'import postCallOutputRouter from "../routes/post-call-output-routes";\n'
    'import nativePhoneRoutingRouter from "../routes/native-phone-routing-routes";\n'
    'import nativePhoneReleaseRouter from "../routes/native-phone-release-routes";\n'
    'import phoneNumberReleaseRouter from "../routes/phone-number-release-routes";',
)
replace_exact(
    registry,
    'import jobRouter from "../routes/job-routes";\nimport mobileRouter from "../routes/mobile-routes";',
    'import jobRouter from "../routes/job-routes";\n'
    'import nativeMobileVoiceRouter from "../routes/native-mobile-voice-routes";\n'
    'import mobileRouter from "../routes/mobile-routes";',
)
replace_exact(
    registry,
    """  app.use(postCallOutputRouter);
  app.use(phoneNumberReleaseRouter);
  app.use(carrierRouter);
""",
    """  app.use(postCallOutputRouter);
  // Native Twilio + xAI owns self-serve line reads, writes, assignment, and
  // release before rollback-era carrier routes can match the same paths.
  app.use(nativePhoneRoutingRouter);
  app.use(nativePhoneReleaseRouter);
  app.use(phoneNumberReleaseRouter);
  app.use(carrierRouter);
""",
)
replace_exact(
    registry,
    '  app.use("/api/jobs", jobRouter);\n  app.use(mobileRouter);',
    '  app.use("/api/jobs", jobRouter);\n'
    '  app.use(nativeMobileVoiceRouter);\n'
    '  app.use(mobileRouter);',
)

admin = "src/components/AdminSettings.tsx"
regex_replace(
    admin,
    r"\n      // Fetch team members\n      const teamRes = await authFetch\(\"/api/team\"\);\n"
    r"      if \(teamRes\.ok\) \{\n        const teamData = await teamRes\.json\(\);\n"
    r"        setTeamMembers\(teamData\.members \|\| \[\]\);\n      \}",
    "",
)
replace_exact(
    admin,
    """    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    }
    setIsLoading(false);
  };
""",
    """    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };
""",
)

replace_exact(
    "src/db/schema.ts",
    "Latest committed migration: `drizzle/migrations/0152_native_xai_phone_bindings.sql`.",
    "Latest committed migration: `drizzle/migrations/0153_preserve_xai_registration_ledger.sql`.",
)

replace_exact(
    "src/components/marketing/MarketingChrome.tsx",
    """/**
 * Header, pinned chrome bar, and an optional mobile sticky CTA, for pages that
 * bring their own content width: legal, trust, status, changelog, support.
 *
 * These are the long-form routes, and they are exactly why the frame is a frame
 * rather than a per-page decision. A terms-of-service page has to scroll; what
 * it must not do is scroll the *window*, because then the header detaches, the
 * chrome bar drops off the bottom, and the route stops matching every other
 * public page. So it gets the same 100dvh surface as the composed pages, and
 * the document flows inside the same single `.marketing-flow` scroller.
 */
""",
    """/**
 * Shared fixed header, document-flow content, and optional mobile sticky CTA
 * for public routes that bring their own content width.
 *
 * Public pages deliberately use the browser document as the vertical scroll
 * owner. Authenticated workspaces keep the fixed-viewport application shell.
 */
""",
)
replace_exact(
    "src/components/marketing/MarketingChrome.tsx",
    """          /* One scroller, and it is this one. The header offset is authored on
             `.marketing-flow` itself, so no page reserves h-16 of its own. */
""",
    """          /* The shared flow owns the fixed-header offset. Document mode turns
             this region into normal page flow; workspace mode stays isolated. */
""",
)

css = "src/styles/ruthless-mobile-cleanup.css"
css_text = read(css)
css_text, count = re.subn(
    r"\n  /\* -----------------------------------------------------------------------\n"
    r"   \* Public drawer: no miniature landing page inside a navigation sheet\.\n"
    r"   \* --------------------------------------------------------------------- \*/\n"
    r"  #wireline-mobile-navigation > div \{[\s\S]*?\n"
    r"  #wireline-mobile-navigation > div > div:last-child \{\n"
    r"    padding-top: 1\.25rem;\n  \}\n",
    "\n",
    css_text,
    count=1,
)
if count not in (0, 1):
    raise RuntimeError("unexpected mobile drawer CSS match count")
write(css, css_text)

widget = "src/components/marketing/BrowserCallWidget.tsx"
widget_text = read(widget)
old_widget = '''                  ? "Call the public demo line below. Standard carrier rates may apply."
                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}'''
if old_widget in widget_text:
    widget_text = widget_text.replace(
        old_widget,
        '''                  ? (
                      <>
                        Call the public demo line below.{" "}
                        <span>Standard carrier rates may apply.</span>
                      </>
                    )
                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}''',
        1,
    )
write(widget, widget_text)

company_test = "tests/company-identity-contract.test.ts"
company_text = read(company_test)
company_text = company_text.replace(
    '    const provisioning = read("src/lib/phone-provisioning.ts");\n'
    '    const registry = read("src/server/register-api-routes.ts");',
    '    const nativeProvisioning = read("src/lib/voice/native-phone-provisioning.ts");\n'
    '    const nativeAssignment = read("src/lib/voice/native-phone-assignment.ts");\n'
    '    const nativeRouting = read("src/routes/native-phone-routing-routes.ts");\n'
    '    const registry = read("src/server/register-api-routes.ts");',
    1,
)
start = '''    expect(
      carrier.match(/runCompanyIdentityMutation\\(req\\.user\\.id, "phone_number_changed"/g),
    ).toHaveLength(3);'''
end = '''    expect(provisioning).toContain(
      "Number provisioning could not be saved; the provider allocation was released.",
    );'''
start_index = company_text.find(start)
end_index = company_text.find(end, start_index)
if start_index < 0 or end_index < 0:
    raise RuntimeError("company identity legacy assertion block not found")
end_index += len(end)
replacement = '''    const manualClaim = carrier.slice(
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
    expect(nativeProvisioning).toContain("runCompanyIdentityMutation(");
    expect(nativeProvisioning).toContain('"phone_number_changed"');
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
    expect(nativeProvisioning).toContain('code: "PHONE_PERSISTENCE_FAILED"');
    expect(nativeAssignment).toContain("runCompanyIdentityMutation(");
    expect(nativeAssignment).toContain('"phone_number_changed"');
    expect(nativeAssignment).toContain("restorePreviousRouting");'''
company_text = company_text[:start_index] + replacement + company_text[end_index:]
write(company_test, company_text)

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

  it("checks capacity before purchase and again inside the ownership transaction", () => {
    const entitlement = nativeProvisioning.indexOf("getIncludedPhoneLineSlots(input.userId)");
    const preflightCount = nativeProvisioning.indexOf(
      ".where(eq(schema.phoneNumbers.userId, input.userId))",
      entitlement,
    );
    const purchase = nativeProvisioning.indexOf("purchaseNativeNumber(input)");
    const lockedCount = nativeProvisioning.indexOf("const [{ held }] = await tx");
    const insert = nativeProvisioning.indexOf(".insert(schema.phoneNumbers)", lockedCount);

    expect(entitlement).toBeGreaterThan(-1);
    expect(preflightCount).toBeGreaterThan(entitlement);
    expect(purchase).toBeGreaterThan(preflightCount);
    expect(lockedCount).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lockedCount);
    expect(nativeProvisioning).toContain('kind: "capacity"');
    expect(nativeProvisioning).toContain('code: "PHONE_CAPACITY_REACHED"');
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
  });

  it("binds every native line and agent lookup to the authenticated workspace", () => {
    expect(nativeProvisioning).toContain("eq(schema.agents.userId, input.userId)");
    expect(nativeProvisioning).toContain("userId: input.userId");
    expect(nativeProvisioning).toContain("eq(schema.phoneNumbers.userId, input.userId)");
    expect(nativeRouting).toContain("userId: req.user.id");
    expect(nativeRouting).toContain("assignNativePhoneLine");
    expect(nativeRouting).toContain("provisionNativeTenantNumber");
  });

  it("keeps storage backstops for legacy and native provider identities", () => {
    const schemaSrc = read("src/db/schema.ts");
    expect(schemaSrc).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique",
    );
    const legacyMigration = read("drizzle/migrations/0111_phone_number_tenant_binding.sql");
    expect(legacyMigration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(legacyMigration).toContain("idx_phone_numbers_user_id");

    const nativeMigration = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_twilio_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_xai_phone");
    expect(nativeMigration).toContain("uq_xai_phone_bindings_xai_webhook");
    expect(nativeMigration).toContain(
      "USING (user_id = (SELECT public.wireline_current_user_id()))",
    );
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

replace_between(
    "tests/round6-honesty-compliance-contract.test.ts",
    'describe("sentinel killCall verifies the Vapi response", () => {',
    "\n});",
    '''describe("sentinel killCall verifies native and rollback termination", () => {
  it("marks presence terminated only after the active provider confirms control", () => {
    const sentinel = read("src/services/sentinel.ts");

    const nativeBranch = sentinel.indexOf("if (xaiCallId)");
    const nativeHangup = sentinel.indexOf("await hangupXAISipCall(xaiCallId)", nativeBranch);
    const nativePresence = sentinel.indexOf('set({ status: "terminated" })', nativeHangup);
    expect(nativeBranch).toBeGreaterThan(-1);
    expect(nativeHangup).toBeGreaterThan(nativeBranch);
    expect(nativePresence).toBeGreaterThan(nativeHangup);

    const rollbackLookup = sentinel.indexOf("const callResponse = await fetchWithTimeout(");
    const trustedControl = sentinel.indexOf("isAllowedVapiControlUrl(controlUrl)", rollbackLookup);
    const providerRequest = sentinel.indexOf("const response = await fetchWithTimeout(", trustedControl);
    const okCheck = sentinel.indexOf("if (!response.ok)", providerRequest);
    const rollbackPresence = sentinel.indexOf('set({ status: "terminated" })', okCheck);
    expect(rollbackLookup).toBeGreaterThan(-1);
    expect(trustedControl).toBeGreaterThan(rollbackLookup);
    expect(providerRequest).toBeGreaterThan(trustedControl);
    expect(okCheck).toBeGreaterThan(providerRequest);
    expect(rollbackPresence).toBeGreaterThan(okCheck);
  });
});''',
)

replace_between(
    "tests/security-atomicity-release-contract.test.ts",
    '  it("reserves each number before dialing and preserves the lock after uncertain outcomes", () => {',
    '  it("creates resumable Stripe Checkout Sessions with durable idempotency keys", () => {',
    '''  it("reserves each number before native placement and preserves the lock after uncertain outcomes", () => {
    const source = read("src/routes/outbound-dial-atomic-routes.ts");
    const reservation = source.indexOf(".insert(outboundDialReservations)");
    const dialing = source.indexOf('status: "dialing"', reservation);
    const provider = source.indexOf("await placeOutboundCall", dialing);
    const attachedLead = source.indexOf("nativeLeadId = result.leadId", provider);
    const ambiguous = source.indexOf("result.providerOutcomeAmbiguous", provider);
    const completion = source.indexOf('status: "completed"', provider);

    expect(reservation).toBeGreaterThan(-1);
    expect(dialing).toBeGreaterThan(reservation);
    expect(provider).toBeGreaterThan(dialing);
    expect(attachedLead).toBeGreaterThan(provider);
    expect(ambiguous).toBeGreaterThan(provider);
    expect(completion).toBeGreaterThan(ambiguous);
    expect(source).toContain(".onConflictDoNothing()");
    expect(source).toContain('failureCode: "provider_outcome_ambiguous"');
    expect(source).toContain('failureCode: "post_provider_persistence_failed"');
    expect(source).toContain('code: "DIAL_STATUS_UNCERTAIN"');
    expect(source).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
  });

''',
)

replace_exact(
    "tests/silent-failure-round2-contract.test.ts",
    '    const advanceAt = engine.indexOf("const nextIdx = currentIdx + 1");',
    '    const advanceAt = engine.indexOf("const nextIndex = currentIndex + 1");',
)
replace_exact(
    "tests/silent-failure-round2-contract.test.ts",
    '''    expect(journal.entries.at(-1)).toMatchObject({
      idx: 49,
      tag: "0151_xai_grok_46_runtime_defaults",
    });''',
    '''    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 50,
        tag: "0152_native_xai_phone_bindings",
      }),
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 51,
      tag: "0153_preserve_xai_registration_ledger",
    });''',
)

replace_exact(
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

write(
    "tests/admin-settings-load-contract.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/AdminSettings.tsx"), "utf8");

describe("AdminSettings initial-load contract", () => {
  it("loads the team endpoint once and treats certification gating as an empty roster", () => {
    expect(source.match(/authFetch\\("\\/api\\/team"\\)/g)).toHaveLength(1);
    expect(source.match(/fetchTeam\\(\\);/g)).toHaveLength(1);
    expect(source).toContain('payload?.code === "SHARED_WORKSPACES_NOT_CERTIFIED"');
    expect(source).toContain("setTeamMembers([])");
  });

  it("always releases the primary loading state after a failed response", () => {
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );
    const earlyReturn = loader.indexOf(
      'toastError("Settings unavailable", "Could not load settings. Please refresh.")',
    );
    const finallyBlock = loader.indexOf("} finally {");
    const release = loader.indexOf("setIsLoading(false)", finallyBlock);
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(finallyBlock).toBeGreaterThan(earlyReturn);
    expect(release).toBeGreaterThan(finallyBlock);
  });
});
''',
)

write(
    "tests/public-header-mobile-contract.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/marketing/PrecisionPublicHeader.tsx"),
  "utf8",
);

describe("minimal public header mobile contract", () => {
  it("keeps both account actions visible without allowing flex children to escape", () => {
    expect(source).toContain('aria-label="Account"');
    expect(source).toContain("min-w-0");
    expect(source).toContain("shrink-0");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("Sign In");
    expect(source).toContain("Start Free");
  });

  it("does not reintroduce the retired brochure navigation drawer", () => {
    expect(source).not.toMatch(/Menu|wireline-mobile-navigation|aria-label="Site"/);
  });
});
''',
)

print("Applied native/main integration fixes.")
