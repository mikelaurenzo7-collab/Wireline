import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const filePath = (path) => resolve(root, path);
const read = (path) => readFileSync(filePath(path), "utf8");
const write = (path, content) => writeFileSync(filePath(path), content, "utf8");

function replaceOnce(path, needle, replacement) {
  const source = read(path);
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${path}: required text was not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${path}: required text is not unique`);
  }
  write(path, source.slice(0, first) + replacement + source.slice(first + needle.length));
}

function replaceRegexOnce(path, pattern, replacement) {
  const source = read(path);
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one regex match, found ${matches.length}`);
  }
  write(path, source.replace(pattern, replacement));
}

copyFileSync(
  filePath(".audit/postmerge/PrecisionPublicHeader.tsx"),
  filePath("src/components/marketing/PrecisionPublicHeader.tsx"),
);
copyFileSync(
  filePath(".audit/postmerge/marketing-viewport-lock.spec.ts"),
  filePath("tests/e2e/marketing-viewport-lock.spec.ts"),
);
copyFileSync(
  filePath(".audit/postmerge/round6-tenant-binding-contract.test.ts"),
  filePath("tests/round6-tenant-binding-contract.test.ts"),
);
copyFileSync(
  filePath(".audit/postmerge/admin-settings-load-contract.test.ts"),
  filePath("tests/admin-settings-load-contract.test.ts"),
);
copyFileSync(
  filePath(".audit/postmerge/public-header-mobile-contract.test.ts"),
  filePath("tests/public-header-mobile-contract.test.ts"),
);

replaceOnce(
  "src/db/schema.ts",
  "Latest committed migration: `drizzle/migrations/0152_native_xai_phone_bindings.sql`.",
  "Latest committed migration: `drizzle/migrations/0153_preserve_xai_registration_ledger.sql`.",
);

replaceOnce(
  "src/data/wireline-knowledge.ts",
  ' *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.',
  ' *   1. Injected into every managed voice-agent system prompt as a "WIRELINE KNOWLEDGE" block.',
);
replaceRegexOnce(
  "src/data/wireline-knowledge.ts",
  /export const WIRELINE_VOICE_STACK =\n  "[^"]*";/,
  'export const WIRELINE_VOICE_STACK =\n  "Live calls run through Twilio plus xAI Direct SIP Speech-to-Speech (grok-voice-think-fast-2.0). Studio live tests use the same voice brain. OpenAI Realtime is limited to the ChatGPT App preview because that host permits only OpenAI\'s realtime endpoint; it is not the PSTN runtime.";',
);

replaceOnce(
  "src/lib/marketing-route-meta.ts",
  "Last updated August 1, 2026.",
  "Last updated August 17, 2026.",
);

replaceOnce(
  "src/components/marketing/BrowserCallWidget.tsx",
  '                  ? "Call the public demo line below. Standard carrier rates may apply."\n                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}',
  '                  ? (\n                      <>\n                        Call the public demo line below.{" "}\n                        <span>Standard carrier rates may apply.</span>\n                      </>\n                    )\n                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}',
);

replaceOnce(
  "src/components/marketing/MarketingChrome.tsx",
  `/**
 * Header, pinned chrome bar, and an optional mobile sticky CTA, for pages that
 * bring their own content width: legal, trust, status, changelog, support.
 *
 * These are the long-form routes, and they are exactly why the frame is a frame
 * rather than a per-page decision. A terms-of-service page has to scroll; what
 * it must not do is scroll the *window*, because then the header detaches, the
 * chrome bar drops off the bottom, and the route stops matching every other
 * public page. So it gets the same 100dvh surface as the composed pages, and
 * the document flows inside the same single \`.marketing-flow\` scroller.
 */`,
  `/**
 * Shared fixed header, document-flow content, and optional mobile sticky CTA
 * for public routes that bring their own content width.
 *
 * Public pages deliberately use the browser document as the vertical scroll
 * owner. The authenticated workspace keeps the fixed-viewport application
 * shell; keeping those contracts separate prevents nested or clipped scrolling.
 */`,
);
replaceOnce(
  "src/components/marketing/MarketingChrome.tsx",
  `          /* One scroller, and it is this one. The header offset is authored on
             \`.marketing-flow\` itself, so no page reserves h-16 of its own. */`,
  `          /* The shared flow owns the fixed-header offset. Document mode turns
             this region into normal page flow; workspace mode remains isolated. */`,
);

replaceRegexOnce(
  "src/styles/ruthless-mobile-cleanup.css",
  /\n  \/\* -----------------------------------------------------------------------\n   \* Public drawer: no miniature landing page inside a navigation sheet\.\n   \* --------------------------------------------------------------------- \*\/\n  #wireline-mobile-navigation > div \{[\s\S]*?\n  #wireline-mobile-navigation > div > div:last-child \{\n    padding-top: 1\.25rem;\n  \}\n/,
  "\n",
);

replaceOnce(
  "tests/e2e/marketing-a11y.spec.ts",
  '  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();',
  `  const accountNav = page.getByRole("navigation", { name: "Account" });
  await expect(accountNav).toBeVisible();
  await expect(accountNav.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  await expect(accountNav.getByRole("link", { name: "Start Free", exact: true })).toBeVisible();`,
);

replaceRegexOnce(
  "src/components/AdminSettings.tsx",
  /  useEffect\(\(\) => \{\n    fetchData\(\);\n    fetchIntegrationHealth\(\);\n    fetchTeam\(\);\n    \/\/ eslint-disable-next-line react-hooks\/exhaustive-deps -- one-time data load on mount\n  \}, \[\]\);\n\n  const fetchTeam = async \(\) => \{[\s\S]*?\n  \};\n\n  const fetchData = async \(\) => \{/,
  `  useEffect(() => {
    fetchData();
    fetchIntegrationHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time data load on mount
  }, []);

  const fetchData = async () => {`,
);
replaceOnce(
  "src/components/AdminSettings.tsx",
  `      const [settingsRes, agentsRes, numbersRes] = await Promise.all([
        authFetch("/api/settings"),
        authFetch("/api/agents"),
        authFetch("/api/phone-numbers"),
      ]);`,
  `      const [settingsRes, agentsRes, numbersRes, teamRes] = await Promise.all([
        authFetch("/api/settings"),
        authFetch("/api/agents"),
        authFetch("/api/phone-numbers"),
        authFetch("/api/team"),
      ]);`,
);
replaceOnce(
  "src/components/AdminSettings.tsx",
  `      const settingsJson = settingsRes.ok ? await settingsRes.json() : null;
      const agentsJson = agentsRes.ok ? await agentsRes.json() : null;
      const numbersJson = numbersRes.ok ? await numbersRes.json() : null;`,
  `      const settingsJson = settingsRes.ok ? await settingsRes.json() : null;
      const agentsJson = agentsRes.ok ? await agentsRes.json() : null;
      const numbersJson = numbersRes.ok ? await numbersRes.json() : null;
      const teamJson = await teamRes.json().catch(() => null);`,
);
replaceOnce(
  "src/components/AdminSettings.tsx",
  `      if (!numbersRes.ok || numbersJson?.degraded) {
        toastError(
          "Phone numbers unavailable",
          numbersJson?.error || "Could not load phone numbers. Please refresh.",
        );
      }
`,
  `      if (!numbersRes.ok || numbersJson?.degraded) {
        toastError(
          "Phone numbers unavailable",
          numbersJson?.error || "Could not load phone numbers. Please refresh.",
        );
      }

      if (teamRes.ok) {
        setTeamMembers(teamJson?.members || []);
      } else if (
        teamRes.status === 503 &&
        teamJson?.code === "SHARED_WORKSPACES_NOT_CERTIFIED"
      ) {
        setTeamMembers([]);
      } else {
        setTeamMembers([]);
        toastError("Team unavailable", "Could not load team members. Please refresh.");
      }
`,
);
replaceRegexOnce(
  "src/components/AdminSettings.tsx",
  /\n      \/\/ Fetch team members\n      const teamRes = await authFetch\("\/api\/team"\);\n      if \(teamRes\.ok\) \{\n        const teamData = await teamRes\.json\(\);\n        setTeamMembers\(teamData\.members \|\| \[\]\);\n      \}/,
  "",
);
replaceOnce(
  "src/components/AdminSettings.tsx",
  `    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    }
    setIsLoading(false);
  };`,
  `    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };`,
);

replaceOnce(
  "tests/company-identity-contract.test.ts",
  '    const provisioning = read("src/lib/phone-provisioning.ts");\n    const registry = read("src/server/register-api-routes.ts");',
  '    const nativeProvisioning = read("src/lib/voice/native-phone-provisioning.ts");\n    const nativeAssignment = read("src/lib/voice/native-phone-assignment.ts");\n    const nativeRouting = read("src/routes/native-phone-routing-routes.ts");\n    const registry = read("src/server/register-api-routes.ts");',
);
replaceRegexOnce(
  "tests/company-identity-contract.test.ts",
  /    expect\(\n      carrier\.match\(\/runCompanyIdentityMutation\\\(req\\\.user\\\.id, \"phone_number_changed\"\/g\),\n    \)\.toHaveLength\(3\);[\s\S]*?      "Number provisioning could not be saved; the provider allocation was released\.",\n    \);/,
  `    const manualClaim = carrier.slice(
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
    expect(nativeProvisioning).toContain(
      'runCompanyIdentityMutation(input.userId, "phone_number_changed"',
    );
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
    expect(nativeProvisioning).toContain('code: "PHONE_PERSISTENCE_FAILED"');
    expect(nativeAssignment).toContain(
      'runCompanyIdentityMutation(\n      input.userId,\n      "phone_number_changed"',
    );
    expect(nativeAssignment).toContain("restorePreviousRouting");`,
);

replaceOnce(
  "tests/round6-honesty-compliance-contract.test.ts",
  `describe("sentinel killCall verifies the Vapi response", () => {
  it("does not mark presence terminated when the terminate call was rejected", () => {
    const sentinel = read("src/services/sentinel.ts");
    expect(sentinel).toContain("if (!response.ok)");
    const okCheck = sentinel.indexOf("if (!response.ok)");
    const presenceUpdate = sentinel.indexOf('set({ status: "terminated" })');
    expect(okCheck).toBeGreaterThan(-1);
    expect(presenceUpdate).toBeGreaterThan(okCheck);
  });
});`,
  `describe("sentinel killCall verifies native and rollback termination", () => {
  it("marks presence terminated only after the active provider confirms control", () => {
    const sentinel = read("src/services/sentinel.ts");

    const nativeBranch = sentinel.indexOf("if (xaiCallId)");
    const nativeHangup = sentinel.indexOf("await hangupXAISipCall(xaiCallId)", nativeBranch);
    const nativePresence = sentinel.indexOf('set({ status: "terminated" })', nativeHangup);
    expect(nativeBranch).toBeGreaterThan(-1);
    expect(nativeHangup).toBeGreaterThan(nativeBranch);
    expect(nativePresence).toBeGreaterThan(nativeHangup);

    const rollbackBranch = sentinel.indexOf("const url = \`${VAPI_API_BASE}/call/${controlUrl}/terminate\`");
    const providerRequest = sentinel.indexOf("const response = await fetchWithTimeout", rollbackBranch);
    const okCheck = sentinel.indexOf("if (!response.ok)", providerRequest);
    const rollbackPresence = sentinel.indexOf('set({ status: "terminated" })', okCheck);
    expect(rollbackBranch).toBeGreaterThan(-1);
    expect(providerRequest).toBeGreaterThan(rollbackBranch);
    expect(okCheck).toBeGreaterThan(providerRequest);
    expect(rollbackPresence).toBeGreaterThan(okCheck);
  });
});`,
);

replaceRegexOnce(
  "tests/security-atomicity-release-contract.test.ts",
  /  it\("reserves each number before dialing and preserves the lock after uncertain outcomes", \(\) => \{[\s\S]*?\n  \}\);\n\n  it\("prevents the legacy route from bypassing the atomic owner",/,
  `  it("reserves each number before native placement and preserves the lock after uncertain outcomes", () => {
    const reservationAt = atomic.indexOf("reservePhoneOperation");
    const dialingAt = atomic.indexOf('status: "dialing"', reservationAt);
    const providerAt = atomic.indexOf("placeOutboundCall({", dialingAt);
    const attachedLeadAt = atomic.indexOf("nativeLeadId = result.leadId", providerAt);
    const ambiguousAt = atomic.indexOf("result.providerOutcomeAmbiguous", providerAt);
    const completionAt = atomic.indexOf('status: "completed"', providerAt);

    expect(reservationAt).toBeGreaterThan(-1);
    expect(dialingAt).toBeGreaterThan(reservationAt);
    expect(providerAt).toBeGreaterThan(dialingAt);
    expect(attachedLeadAt).toBeGreaterThan(providerAt);
    expect(ambiguousAt).toBeGreaterThan(providerAt);
    expect(completionAt).toBeGreaterThan(ambiguousAt);
    expect(atomic).toContain("await getPhoneOperation(operationKey)");
    expect(atomic).toContain("ambiguous_failure");
    expect(atomic).toContain("already_processing");
  });

  it("prevents the legacy route from bypassing the atomic owner",`,
);

replaceOnce(
  "tests/silent-failure-round2-contract.test.ts",
  '    const advanceAt = engine.indexOf("const nextIdx = currentIdx + 1");',
  '    const advanceAt = engine.indexOf("const nextIndex = currentIndex + 1");',
);
replaceOnce(
  "tests/silent-failure-round2-contract.test.ts",
  `    expect(journal.entries.at(-1)).toMatchObject({
      idx: 49,
      tag: "0151_xai_grok_46_runtime_defaults",
    });`,
  `    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 50,
        tag: "0152_native_xai_phone_bindings",
      }),
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 51,
      tag: "0153_preserve_xai_registration_ledger",
    });`,
);

replaceOnce(
  "tests/subsystem-audit-hardening-contract.test.ts",
  `  it("routes cadence email steps as marketing mail", () => {
    expect(read("src/lib/cadence-engine.ts")).toMatch(
      /integ\\.sendEmail\\(\\{[\\s\\S]{0,200}marketing: true/,
    );
  });`,
  `  it("routes cadence email steps as marketing mail", () => {
    const cadence = read("src/lib/cadence-engine.ts");
    const emailStep = cadence.slice(
      cadence.indexOf('if (step.type === "email")'),
      cadence.indexOf('return { ok: false, result: `unknown step type', cadence.indexOf('if (step.type === "email")')),
    );
    expect(emailStep).toContain("new IntegrationService(cadence.userId)");
    expect(emailStep).toContain("integration.sendEmail({");
    expect(emailStep).toContain("marketing: true");
  });`,
);

console.log("Applied verified native/main post-merge fixes.");
