import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated mobile cleanup", () => {
  it("renders existing short tab labels without weakening accessible names", () => {
    const tabStrip = read("src/components/layout/WorkspaceTabStrip.tsx");
    const tabs = read("src/lib/page-sub-tabs.ts");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
    const approvals = read("src/components/ApprovalInbox.tsx");

    expect(tabStrip).toContain("shortLabel?: string");
    expect(tabStrip).toContain('wrap?: boolean | "always"');
    expect(tabStrip).toContain("wrapAlways");
    expect(tabStrip).toContain('className="sm:hidden"');
    expect(tabStrip).toContain('className="hidden sm:inline"');
    expect(tabStrip).toContain("tab.ariaLabel ?? (tab.shortLabel ? fullLabel : undefined)");
    expect(tabStrip).not.toContain("(${tab.shortLabel})");
    expect(tabs).toContain('shortLabel: "Camps"');
    expect(tabs).toContain('shortLabel: "Seq"');
    expect(tabs).toContain('shortLabel: "Cbks"');
    // Settings uses full labels on every viewport — no redundant shortLabel twins.
    expect(settingsTabs).toContain('label: "Account"');
    expect(settingsTabs).toContain('label: "Billing"');
    expect(settingsTabs).toContain('label: "Appearance"');
    expect(settingsTabs).toContain('label: "Compliance"');
    expect(settingsTabs).toContain('wrap="always"');
    expect(settingsTabs).not.toContain("shortLabel:");
    expect(settingsTabs).not.toContain('shortLabel: "Acct"');
    expect(settingsTabs).not.toContain('shortLabel: "Bill"');
    expect(approvals).toContain('escalations: "Esc."');
  });

  it("keeps authenticated metrics glanceable instead of stacking full cards", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const phone = read("src/pages/PhonePage.tsx");

    expect(overview).toContain("grid grid-cols-2 gap-2");
    expect(overview).toContain("wl-metric-tile--compact");
    expect(overview).not.toContain("wl-metric-tile__detail");
    expect(knowledge).toContain("grid grid-cols-3 gap-2");
    expect(knowledge).toContain("wl-metric-tile--compact");
    expect(phone).toContain('label: "Appointments"');
    expect(phone).toContain('shortLabel: "Appts"');
  });

  it("keeps outbound controls concise without duplicating empty-state actions", () => {
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const cadences = read("src/components/Cadences.tsx");
    const outbound = read("src/components/outbound/OutboundHub.tsx");

    expect(campaigns).toContain("flex flex-col items-stretch gap-2 sm:flex-row");
    expect(campaigns).toContain('aria-label="Refresh campaigns"');
    expect(campaigns).toContain("campaigns.length > 0 ?");
    expect(cadences).toContain("Build timed call, SMS, and email follow-up sequences.");
    expect(cadences).not.toMatch(/job-worker|\/pipeline/);
    expect(cadences).toContain("cadences.length > 0 && !showBuilder");
    expect(outbound).toMatch(/Consent checks run\s+before every dial/);
    expect(outbound).not.toContain("grid grid-cols-3 gap-2");
  });

  it("keeps heavy-user exceptions and phone-width actions in view", () => {
    const activation = read("src/components/ActivationChecklist.tsx");
    const outcomes = read("src/components/OutcomeLedger.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const knowledgePage = read("src/pages/KnowledgePage.tsx");
    const connections = read("src/pages/ConnectionsPage.tsx");
    const mailbox = read("src/components/MailboxConnectionCard.tsx");
    const callLogs = read("src/components/CallLogsClaude.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const appointments = read("src/components/AppointmentsPanel.tsx");

    expect(activation).toContain("grid grid-cols-2 gap-2 lg:grid-cols-3");
    expect(activation).not.toContain("{step.detail}");
    expect(activation).not.toContain("hidden text-[11px] leading-4");
    expect(outcomes).toContain("line-clamp-3");
    expect(outcomes).toContain('row.compliance_state !== "clear"');
    expect(outcomes).toContain("row.lead_score > 0");
    expect(knowledge).toContain("sm:[&>button]:w-auto");
    expect(knowledge).toContain('"Choose files"');
    expect(knowledge).not.toContain('role="button"');
    expect(knowledge).not.toContain("absolute right-4 top-4");
    expect(knowledgePage).toContain('shortLabel: "Knowledge"');
    expect(connections).not.toContain("Connect a channel");
    expect(mailbox).not.toContain("Optional next");
    expect(callLogs).toContain('shortLabel: "Stats"');
    expect(callLogs).toContain('aria-label="Export calls as CSV"');
    expect(studio).toContain("hidden size-4 shrink-0 sm:block");
    expect(read("src/components/AgentTemplates.tsx")).toContain(
      "sm:grid-cols-2 sm:gap-3 xl:grid-cols-3",
    );
    // The appointments empty state moved into its own data-driven panel.
    expect(appointments).toContain(
      'title={calendarConnected ? "No appointments yet" : "Connect a calendar"}',
    );
  });

  it("keeps guidance once, next to the decision it supports", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    const inbox = read("src/components/EmailInbox.tsx");

    expect(setup).not.toMatch(/Set the tone, greeting, essential facts/);
    expect(setup).not.toMatch(/Add only what the first customer workflow needs/);
    expect(review).not.toMatch(/Keep the loop small/);
    expect(voice).toMatch(
      /Browser tests the words\. Place a real call to verify the selected\s+audio\./,
    );
    expect(inbox).toContain("Inbox unavailable");
    expect(inbox).toContain("No email conversations yet");
    expect(inbox).toContain("Refresh inbox");
    expect(inbox).not.toContain("Connect Gmail or Outlook to sync customer threads.");
    expect(inbox).not.toContain("Summary + controls live here.");
  });

  it("keeps first-run authenticated chrome free of leftover strands and shouted periods", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const accounts = read("src/components/admin/AccountsPanel.tsx");
    const insights = read("src/components/insights/shared.tsx");
    const polish = read("src/styles/authenticated-visual-qa.css");

    expect(overview).toContain("hasAgents ? (");
    expect(overview).toContain("wl-overview-greeting");
    expect(polish).toContain(".wl-workspace-page.wl-overview--first-run");
    expect(polish).toContain("gap: 0");
    expect(accounts).toContain("Keep personal and business work separate");
    expect(accounts).not.toContain("Keep personal and business work separate.");
    expect(insights).toContain("No conversations yet");
    expect(insights).toContain("Activity appears once a voice agent starts taking calls.");
  });

  it("uses Wireline language and iconography on active work surfaces", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const callLogs = read("src/components/CallLogsClaude.tsx");
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const callbacks = read("src/components/outbound/CallbacksPanel.tsx");
    const billing = read("src/components/StripeBillingCard.tsx");
    const activationWizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");

    // The rail's agents section keeps the posture-aware plural where it has room
    // to be read in full — the nav's accessible name. The visible kicker stays
    // short because the rail row cannot fit the noun phrase (see the sidebar rail
    // contract below), matching a rail whose other labels are posture-agnostic.
    expect(shell).toContain("aria-label={language.plural}");
    expect(shell).toContain("aria-label={`New ${language.singular}`}");
    expect(callLogs).toContain('label: "Agents"');
    expect(callLogs).toContain('<Zap className="size-4"');
    expect(callLogs).not.toContain("⚡");
    expect(callLogs).not.toContain("Create first agent");
    expect(campaigns).toContain('placeholder="Assign voice agent"');
    expect(campaigns).toContain('aria-label="Campaign name"');
    expect(campaigns).toContain('aria-label="Sales playbook"');
    expect(callbacks).not.toContain("description=");
    expect(billing).toContain('"voice agent" : "voice agents"');
    expect(billing).toContain("Current plan");
    expect(billing).toContain("Live video presence");
    // TrialBanner was removed 2026-08-13 (unmounted since activation
    // replaced trials); the activation wizard carries the live language.
    expect(existsSync(resolve(process.cwd(), "src/components/layout/TrialBanner.tsx"))).toBe(false);
    expect(activationWizard).toContain("connected to this voice agent");
  });

  it("fails closed on setup-load errors and keeps action feedback in view", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("setupLoadError");
    expect(setup).toContain('title="Setup unavailable"');
    expect(setup).toContain('setSetupKnowledge("")');
    expect(setup).toContain("setSetupNotice(null)");
    expect(setup).toContain('setSetupGreeting("")');
    expect(setup).toContain("setLoadedPersonality(null)");
    expect(setup).toContain("setReloadKey((current) => current + 1)");
    expect(setup).toContain("activeAgentIdRef.current === setupAgentId");
    expect(setup).toContain('title="Setup needs attention"');
    expect(review).toContain("setConfig(null)");
    expect(review).toContain("hidden={Boolean(error)}");
    expect(phoneSetup.indexOf("{message ? (")).toBeLessThan(
      phoneSetup.indexOf("<CompanyIdentityPack"),
    );
    expect(phoneSetup.indexOf("{error ? (")).toBeLessThan(
      phoneSetup.indexOf("<CompanyIdentityPack"),
    );
  });
});
