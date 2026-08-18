import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const filePath = (path) => resolve(root, path);
const read = (path) => readFileSync(filePath(path), "utf8");
const write = (path, content) => writeFileSync(filePath(path), content, "utf8");

function replaceOnce(path, needle, replacement) {
  const source = read(path);
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${path}: required text was not found: ${needle.slice(0, 120)}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${path}: required text is not unique: ${needle.slice(0, 120)}`);
  }
  write(path, source.slice(0, first) + replacement + source.slice(first + needle.length));
}

function replaceRegexOnce(path, pattern, replacement) {
  const source = read(path);
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one regex match, found ${matches.length}: ${pattern}`);
  }
  write(path, source.replace(pattern, replacement));
}

function replaceIfPresent(path, needle, replacement) {
  const source = read(path);
  if (!source.includes(needle)) return;
  write(path, source.replace(needle, replacement));
}

for (const [staged, destination] of [
  [".audit/postmerge/PrecisionPublicHeader.tsx", "src/components/marketing/PrecisionPublicHeader.tsx"],
  [".audit/postmerge/marketing-viewport-lock.spec.ts", "tests/e2e/marketing-viewport-lock.spec.ts"],
  [".audit/postmerge/round6-tenant-binding-contract.test.ts", "tests/round6-tenant-binding-contract.test.ts"],
  [".audit/postmerge/admin-settings-load-contract.test.ts", "tests/admin-settings-load-contract.test.ts"],
  [".audit/postmerge/public-header-mobile-contract.test.ts", "tests/public-header-mobile-contract.test.ts"],
]) {
  copyFileSync(filePath(staged), filePath(destination));
}

replaceOnce(
  "src/db/schema.ts",
  "Latest committed migration: `drizzle/migrations/0152_native_xai_phone_bindings.sql`.",
  "Latest committed migration: `drizzle/migrations/0153_preserve_xai_registration_ledger.sql`.",
);
replaceIfPresent(
  "src/db/schema-base.ts",
  "`drizzle/migrations/0151_xai_grok_46_runtime_defaults.sql`",
  "`drizzle/migrations/0153_preserve_xai_registration_ledger.sql`",
);

replaceOnce(
  "src/data/wireline-knowledge.ts",
  ' *   1. Injected into every Vapi agent system prompt as a "WIRELINE KNOWLEDGE" block.',
  ' *   1. Injected into every managed voice-agent system prompt as a "WIRELINE KNOWLEDGE" block.',
);
replaceRegexOnce(
  "src/data/wireline-knowledge.ts",
  /export const WIRELINE_VOICE_STACK =\s*\n\s*"[^"]*";?/,
  'export const WIRELINE_VOICE_STACK =\n  "Live calls run through Twilio plus xAI Direct SIP Speech-to-Speech (grok-voice-think-fast-2.0). Studio live tests use the same voice brain. OpenAI Realtime is limited to the ChatGPT App preview because that host permits only OpenAI\\\'s realtime endpoint; it is not the PSTN runtime.";',
);
replaceOnce(
  "src/data/wireline-knowledge.ts",
  '    "DNC enforcement on outbound dialing",',
  '    "Tenant-maintained DNC enforcement on outbound dialing",',
);
replaceOnce(
  "src/data/wireline-knowledge.ts",
  '    "EU data residency is not currently available",',
  '    "EU data residency is not currently available",\n    "Federal Do Not Call registration is not complete; marketing campaigns fail closed until the vendor login is configured",',
);

replaceOnce(
  "src/components/marketing/BrowserCallWidget.tsx",
  '                  ? "Call the public demo line below. Standard carrier rates may apply."\n                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}',
  '                  ? (\n                      <>\n                        Call the public demo line below.{" "}\n                        <span>Standard carrier rates may apply.</span>\n                      </>\n                    )\n                  : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}',
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
replaceOnce(
  "tests/company-identity-contract.test.ts",
  `    expect(
      carrier.match(/runCompanyIdentityMutation\\(req\\.user\\.id, "phone_number_changed"/g),
    ).toHaveLength(3);
    expect(carrier).toContain("desc(schema.phoneNumbers.id)");
    expect(provisioning).toContain('runCompanyIdentityMutation(userId, "phone_number_changed"');
    expect(provisioning).toContain("compensateProvisionedNumber");
    expect(provisioning).toContain("Carrier compensation completed");
    expect(provisioning).toContain("Carrier compensation queued in durable orphan ledger");
    expect(provisioning).toContain(
      "Number provisioning could not be saved; the provider allocation was released.",
    );`,
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

    const controlUrl = sentinel.indexOf("const controlUrl =");
    const providerRequest = sentinel.indexOf("const response = await fetchWithTimeout", controlUrl);
    const okCheck = sentinel.indexOf("if (!response.ok)", providerRequest);
    const rollbackPresence = sentinel.indexOf('set({ status: "terminated" })', okCheck);
    expect(controlUrl).toBeGreaterThan(-1);
    expect(providerRequest).toBeGreaterThan(controlUrl);
    expect(okCheck).toBeGreaterThan(providerRequest);
    expect(rollbackPresence).toBeGreaterThan(okCheck);
  });
});`,
);

replaceOnce(
  "tests/security-atomicity-release-contract.test.ts",
  `  it("reserves each number before dialing and preserves the lock after uncertain outcomes", () => {
    const source = read("src/routes/outbound-dial-atomic-routes.ts");
    const reservation = source.indexOf(".insert(outboundDialReservations)");
    const provider = source.indexOf("await placeOutboundCall");
    const lead = source.indexOf("tx.insert(schema.outboundLeads)");
    const completion = source.indexOf('status: "completed"');

    expect(reservation).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(reservation);
    expect(lead).toBeGreaterThan(provider);
    expect(completion).toBeGreaterThan(provider);
    expect(source).toContain("type DeniedOutboundDialGate = Extract<");
    expect(source).toContain("function gateResponse(res: Response, gate: DeniedOutboundDialGate)");
    expect(source).toContain(".onConflictDoNothing()");
    expect(source).toContain('status: "dialing",\\n            failureCode: "provider_outcome_ambiguous"');
    expect(source).toContain('failureCode: "post_provider_persistence_failed"');
    expect(source).toContain('code: "DIAL_STATUS_UNCERTAIN"');
    expect(source).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
  });`,
  `  it("reserves each number before native placement and preserves the lock after uncertain outcomes", () => {
    const source = read("src/routes/outbound-dial-atomic-routes.ts");
    const reservation = source.indexOf(".insert(outboundDialReservations)");
    const provider = source.indexOf("await placeOutboundCall");
    const leadIdentity = source.indexOf("nativeLeadId = result.leadId || null");
    const completion = source.indexOf('status: "completed"');

    expect(reservation).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(reservation);
    expect(leadIdentity).toBeGreaterThan(provider);
    expect(completion).toBeGreaterThan(leadIdentity);
    expect(source).toContain("type DeniedOutboundDialGate = Extract<");
    expect(source).toContain("function gateResponse(res: Response, gate: DeniedOutboundDialGate)");
    expect(source).toContain(".onConflictDoNothing()");
    expect(source).toContain('status: "dialing",\\n            failureCode: "provider_outcome_ambiguous"');
    expect(source).toContain('failureCode: "post_provider_persistence_failed"');
    expect(source).toContain('code: "DIAL_STATUS_UNCERTAIN"');
    expect(source).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
  });`,
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
    const emailStart = cadence.indexOf('if (step.type === "email")');
    const emailStep = cadence.slice(
      emailStart,
      cadence.indexOf('return { ok: false, result: \`unknown step type', emailStart),
    );
    expect(emailStart).toBeGreaterThan(-1);
    expect(emailStep).toContain("new IntegrationService(cadence.userId)");
    expect(emailStep).toContain("integration.sendEmail({");
    expect(emailStep).toContain("marketing: true");
  });`,
);

console.log("Applied verified native/main post-merge fixes.");
