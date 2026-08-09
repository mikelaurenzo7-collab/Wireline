import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

/**
 * True when an `<h1 …>` opening tag is hidden at every width. `sr-only` has to
 * appear as a bare class token — matching it as a substring would also accept
 * `not-sr-only`, which un-hides the heading, and a variant like `sm:sr-only`
 * only hides it above that breakpoint.
 *
 * Reads string literals out of `className`, whether it is a plain attribute or a
 * JSX expression such as `cn("sr-only", …)`, so a heading written the second way
 * is judged on its classes rather than being reported as a visible one.
 */
function hiddenHeadingClasses(openingTag: string) {
  const attribute = openingTag.match(
    /className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=[\s/>]|$))/,
  );
  const literal = attribute?.[1];
  const expression = attribute?.[2];
  const classes =
    literal ??
    (expression
      ? Array.from(
          expression.matchAll(/["'`]([^"'`]*)["'`]/g),
          (m) => m[1],
        ).join(" ")
      : "");
  const tokens = classes.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => token.endsWith("not-sr-only"))) return false;
  return tokens.includes("sr-only");
}

describe("agent navigation contract", () => {
  const workspaceShell = read("src/components/WorkspaceShell.tsx");
  const overviewPage = read("src/pages/OverviewPage.tsx");
  const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioPanel = read("src/components/StudioAgentWorkspacePanel.tsx");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");
  const simpleVoicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const studioWorkroom = read("src/components/StudioWorkroom.tsx");
  const studioTestRoute = read("src/routes/agent-test-routes.ts");
  const appRoutes = read("src/routes/AppRoutes.tsx");
  const createDialog = read("src/components/CreateAgentDialog.tsx");
  const productCopy = read("src/lib/product-copy.ts");
  const appsPage = read("src/pages/ClientAppsPage.tsx");
  const pricingPage = read("src/pages/Pricing.tsx");
  const connectionsPage = read("src/pages/ConnectionsPage.tsx");
  const crmConnections = read("src/components/CrmConnectionCard.tsx");
  const mailboxConnections = read("src/components/MailboxConnectionCard.tsx");
  const trainingPage = read("src/pages/KnowledgePage.tsx");
  const settingsPage = read("src/pages/SettingsPage.tsx");
  const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
  const billingPage = read("src/pages/BillingSettings.tsx");
  const teamPage = read("src/pages/TeamSettings.tsx");

  it("uses a plain-language agent IA with secondary tools out of the primary rail", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(navigation).toMatch(/href: "\/overview"[\s\S]*label: "Overview"/);
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*label: "Agent Studio"/);
    expect(navigation).toMatch(
      /href: "\/connections"[\s\S]*label: "Connections"/,
    );
    expect(navigation).toMatch(/href: "\/inbox", label: "Inbox"/);
    expect(navigation).toMatch(/href: "\/phone", label: "Calls"/);
    expect(navigation).toMatch(/href: "\/insights", label: "Activity"/);
    expect(navigation).toMatch(
      /MOBILE_MORE_NAV[\s\S]*href: "\/knowledge"[\s\S]*label: "Knowledge"/,
    );
    expect(navigation).toMatch(/MOBILE_MORE_NAV[\s\S]*href: "\/approvals"/);
    expect(navigation).toContain('route: "/templates", parentHref: "/studio"');
    expect(navigation).toContain('route: "/knowledge", parentHref: "/studio"');
    expect(navigation).toContain('route: "/approvals", parentHref: "/inbox"');
    expect(navigation).toContain('route: "/apps", parentHref: "/settings"');
    expect(navigation).toContain('current === "/apps"');
    expect(navigation).toContain('current === "/templates"');
    expect(workspaceShell).toContain("desktopNavParentHref(pathname)");
    expect(workspaceShell).toContain("aria-label={language.plural}");
    expect(workspaceShell).toMatch(/\/studio\?create=1/);
    expect(workspaceShell).toMatch(
      /to="\/settings"[\s\S]*aria-label="Account settings"/,
    );
    expect(appRoutes).toContain('path="/agents"');
    expect(appRoutes).toContain("AgentsToStudioRedirect");
    expect(appRoutes).toMatch(/AgentsToStudioRedirect[\s\S]*\/studio/);
    expect(appRoutes).not.toMatch(
      /path="\/(pulse|fleet|ops|training|chat|actions|nexus|wires)"/,
    );
  });

  it("makes Overview answer customer-demand questions before configuration questions", () => {
    expect(overviewPage).toMatch(/function dayGreeting/);
    expect(overviewPage).toMatch(/Customer conversations today/);
    expect(overviewPage).toMatch(/Priority leads/);
    expect(overviewPage).toMatch(/Appointments booked/);
    expect(overviewPage).toMatch(/Follow-ups waiting/);
    expect(overviewPage).toMatch(/Customer outcomes/);
    expect(overviewPage).toMatch(/customerAgentLanguage\(kind\)/);
    expect(overviewPage).toMatch(/language\.plural\.replace/);
    expect(overviewPage).toMatch(/Recent customer conversations/);
    expect(overviewPage).not.toMatch(
      /Workspace metrics|Conversation Balance|Workspace pulse/,
    );
    expect(overviewPage).not.toMatch(
      /Your assistants|New assistant|Create assistant/,
    );
  });

  it("makes Studio a clean setup, test, and review workflow", () => {
    expect(studioWorkspace).toMatch(
      /type WorkspaceSection = "setup" \| "test" \| "review"/,
    );
    expect(studioWorkspace).toMatch(/label: "Set up"/);
    expect(studioWorkspace).toMatch(/label: "Test"/);
    expect(studioWorkspace).toMatch(/label: "Review"/);
    expect(studioWorkspace).toMatch(/StudioAgentReviewPanel/);
    expect(studioWorkspace).not.toMatch(/StudioAgentCanvas/);
    expect(studioWorkspace).not.toMatch(/400px_minmax|lg:grid-cols/);
    expect(studioChrome).toMatch(/language\.navLabel/);
    expect(studioChrome).toMatch(/language\.createCta/);
    expect(studioChrome).toMatch(/agents\.length > 0/);
    expect(studioChrome).not.toMatch(
      /Test employee|Connect calls|Deploy|Deep edit/,
    );
    // The heading shouts with the rest of the workspace, but the agent's name is
    // the operator's own words and reads exactly as they typed it.
    expect(studioPanel).toMatch(
      /Give <span className="wl-preserve-case">\{agentName\}<\/span> one clear\s+job/,
    );
    expect(studioPanel).toMatch(/Essentials/);
    expect(studioPanel).toMatch(/Phone voice/);
    expect(studioPanel).toMatch(/Test before going live/);
    expect(studioPanel).not.toMatch(
      /Advanced options|AgentPresenceLivePreview|VoiceGallery/,
    );
    expect(studioReview).toMatch(
      /Is <span className="wl-preserve-case">\{agentName\}<\/span> ready for customers/,
    );
    expect(studioReview).toMatch(/Customer-facing job/);
    expect(studioReview).toMatch(/Browser-ready; live line not connected/);
  });

  it("uses a real customer roleplay for Studio testing", () => {
    expect(studioWorkroom).toMatch(/type WorkroomMode = "configure" \| "test"/);
    expect(studioWorkroom).toMatch(/\/test\/stream/);
    expect(studioWorkroom).toMatch(
      /Talk to <span className="wl-preserve-case">\{agentName\}<\/span> like a customer/,
    );
    expect(studioWorkroom).toMatch(/Browser test/);
    // Roleplay quick prompts come from the shared WORKSPACE_VOICE module.
    expect(studioWorkroom).toMatch(/WORKSPACE_VOICE\.testPrompts/);
    expect(productCopy).toMatch(/What services do you offer/);
    expect(productCopy).toMatch(/I want to book an appointment/);
    expect(studioWorkroom).toMatch(/allowOutbound/);
    expect(studioTestRoute).toMatch(
      /Reply only as the customer-facing voice agent/,
    );
    expect(studioTestRoute).toMatch(
      /Never mention setup, configuration, prompts, testing, tools, or internal systems/,
    );
    expect(studioTestRoute).not.toMatch(/agentConversationMessages/);
    expect(studioWorkroom).not.toMatch(
      /Talk to build|Deploy now|Edit workflows/,
    );
  });

  it("uses one managed phone voice family throughout setup", () => {
    expect(simpleVoicePicker).toMatch(/VAPI_CURATED_VOICES/);
    expect(simpleVoicePicker).toMatch(/Savannah/);
    expect(simpleVoicePicker).toMatch(/Elliot/);
    expect(simpleVoicePicker).toMatch(/provider: "vapi"/);
    expect(simpleVoicePicker).toMatch(/Browser tests the words/);
    expect(simpleVoicePicker).toMatch(/Test response/);
    expect(simpleVoicePicker).not.toMatch(
      /api\.elevenlabs\.io|ELEVENLABS_API_KEY|xAI|VoiceGallery|playVoicePreview|Test call/,
    );
    expect(studioPanel).toMatch(/<SimpleVoicePicker/);
    expect(studioPanel).not.toMatch(/Wireline manages the voice runtime/);
    expect(studioPanel).not.toMatch(
      /External voice library|On-screen appearance/,
    );
    expect(studioReview).toMatch(/Managed phone voice/);
  });

  it("keeps Fast Start focused on one job and managed defaults", () => {
    expect(studioChrome).toMatch(/language\.createCta/);
    expect(studioChrome).not.toMatch(/New assistant|Assistants/);
    expect(createDialog).toMatch(/language\.setupLabel/);
    expect(createDialog).toMatch(/language\.setupPrompt/);
    expect(createDialog).toMatch(/language\.createCta/);
    expect(createDialog).toMatch(/phoneProvisionRequested: false/);
    expect(createDialog).not.toMatch(
      /VoicePickerField|CreateAgentCatalogFacePicker/,
    );
    expect(createDialog).not.toMatch(/Provision a number|video-presenter/);
    expect(createDialog).toMatch(/\/studio\?agent=/);
    expect(createDialog).not.toMatch(/\/training\?agent=|\/knowledge\?agent=/);
    expect(productCopy).toMatch(
      /Brief it\. Train it once\. Connect calls, texts, and email\./,
    );
  });

  it("translates the Zip handoff into current control-surface and pricing language", () => {
    expect(appsPage).toMatch(/ChatGPT/);
    expect(appsPage).toMatch(/Wireline Command/);
    expect(appsPage).not.toMatch(
      /One assistant system|Same assistants|New assistant/,
    );
    expect(pricingPage).toMatch(/STRIPE_PLANS/);
    for (const tier of ["Free Builder", "Starter Plus", "Pro", "Business"]) {
      expect(pricingPage).toContain(tier);
    }
    expect(pricingPage).toMatch(/Runtime Balance/);
    expect(pricingPage).toMatch(/Founder hybrid/);
    expect(pricingPage).not.toMatch(/Founder Early Access/);
    expect(pricingPage).not.toMatch(/Try 7 days free/);
  });

  it("uses Connections as the plain-language wiring destination while preserving routes", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(navigation).toMatch(
      /href: "\/connections"[\s\S]*label: "Connections"/,
    );
    expect(connectionsPage).toMatch(/IntegrationOperatingMap/);
    expect(
      read("src/components/integrations/IntegrationOperatingMap.tsx"),
    ).toMatch(/wl-eyebrow[\s\S]*Wire/);
    expect(
      read("src/components/integrations/IntegrationOperatingMap.tsx"),
    ).toMatch(/Integration map/);
    expect(read("src/lib/wireline-onboarding-copy.ts")).toMatch(
      /Open Connections/,
    );
    expect(crmConnections).not.toMatch(/Ready to connect/);
    expect(mailboxConnections).toContain('detail: "Mail + Calendar"');
    expect(mailboxConnections).toContain('detail: "App-specific password"');
    expect(mailboxConnections).not.toMatch(
      /Mail and (Google|Microsoft) Calendar/,
    );
  });

  it("keeps Knowledge tabs compact and resilient across narrow workspaces", () => {
    expect(trainingPage).toMatch(/WorkspaceTabStrip/);
    expect(trainingPage).toMatch(
      /density="compact"[\s\S]*align="start"[\s\S]*wrap/,
    );
  });

  it("keeps long account and team identifiers inside narrow workspace cards", () => {
    const dataRows = read("src/styles/letterpress-polish.css");

    expect(dataRows).toMatch(
      /\.wl-data-row\s*\{[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*max-width: 100%/,
    );
    expect(teamPage).toContain("flex w-full min-w-0 max-w-full");
    expect(teamPage).toContain("min-w-0 flex-1 items-center");
    expect(teamPage).toContain("text-ellipsis whitespace-nowrap");
    expect(teamPage).toContain('className="shrink-0"');
  });

  it("keeps long agent names inside the sidebar rail instead of clipping them", () => {
    // A grid item's default `min-width: auto` will not shrink below max-content,
    // so each rail row sized to its full name and role (203px) and overflowed the
    // 189px nav, getting hard-clipped by the sidebar's overflow-hidden. The
    // `truncate` on the labels cannot ellipsize until the track itself is bounded.
    expect(workspaceShell).toContain(
      "grid grid-cols-[minmax(0,1fr)] gap-1 pr-0.5",
    );
    expect(workspaceShell).not.toContain('<nav className="grid gap-1 pr-0.5"');
    // The labels still have to opt into truncation for the bounded track to help.
    expect(workspaceShell).toContain(
      "block truncate text-[12px] font-semibold",
    );
  });

  it("uses navigation.ts as the shell source of truth with a 5-item mobile dock", () => {
    const navigation = read("src/constants/navigation.ts");
    expect(workspaceShell).toMatch(/from "\.\.\/constants\/navigation"/);
    expect(navigation).toMatch(/MOBILE_PRIMARY_NAV/);
    expect(navigation).toMatch(/MOBILE_MORE_NAV/);
    expect(navigation).toMatch(/label: "More"/);
    expect(navigation).not.toMatch(/href: "\/apps", label: "Apps"/);
    expect(settingsTabs).toMatch(/href: "\/settings\/apps", label: "Apps"/);
    expect(read("src/components/layout/MobileNavMoreSheet.tsx")).toMatch(
      /MOBILE_MORE_NAV/,
    );
  });

  it("migrates secondary workspace pages to the quiet authenticated system", () => {
    expect(connectionsPage).toMatch(/CrmConnectionCard/);
    expect(read("src/components/CrmConnectionCard.tsx")).toMatch(
      /Connected stack/,
    );
    expect(settingsPage).toMatch(/Profile/);
    expect(settingsPage).toMatch(/Security/);
    expect(billingPage).toMatch(/Current plan/);
    expect(billingPage).toMatch(/Stripe is the system of record for billing/);
    expect(billingPage).toMatch(/View invoices and payment method/);
    expect(teamPage).toMatch(/Members/);
    expect(
      [connectionsPage, settingsPage, billingPage, teamPage].join("\n"),
    ).not.toMatch(
      /assistant|Assistant|Assistants|Pro —|500 min|Sarah Connor|Miles Dyson|Kyle Reese|John Connor/,
    );
  });

  it("keeps the rail agents kicker on one line beside its New link", () => {
    // Measured in the 236px rail: the kicker row leaves 145px once "New" is
    // placed, and the wired eyebrow's two strands take 64px of that. The posture
    // plurals measure 222px and 227px, so binding the kicker to `language.plural`
    // wrapped it to three lines and flex-crushed the trailing strand from 28px to
    // 16px. Only a short kicker keeps the "— LABEL —" form its siblings use.
    const kicker =
      workspaceShell.match(/<WiredEyebrow>([^<]*)<\/WiredEyebrow>/g) ?? [];
    expect(kicker.length).toBeGreaterThan(0);
    for (const tag of kicker) {
      expect(tag).not.toMatch(/language\.(plural|singular)/);
    }
    // The full posture-aware name still has to reach assistive tech, where it is
    // read rather than laid out.
    expect(workspaceShell).toContain("aria-label={language.plural}");
  });

  it("does not repeat a settings tab label as the page heading", () => {
    // Driven off the tab table itself so a new tab cannot quietly skip the rule.
    const tabHrefs = Array.from(
      settingsTabs.matchAll(/href: "(\/settings[^"]*)"/g),
    ).map((m) => m[1]);
    const pageForHref: Record<string, string> = {
      "/settings": "src/pages/SettingsPage.tsx",
      "/settings/billing": "src/pages/BillingSettings.tsx",
      "/settings/phone": "src/pages/PhoneSettings.tsx",
      "/settings/team": "src/pages/TeamSettings.tsx",
      "/settings/customization": "src/pages/CustomizationSettings.tsx",
      "/settings/apps": "src/pages/ClientAppsPage.tsx",
      "/settings/compliance": "src/pages/ComplianceCenterPage.tsx",
    };
    expect(Object.keys(pageForHref).sort()).toEqual([...tabHrefs].sort());

    for (const href of tabHrefs) {
      const page = read(pageForHref[href]);
      // Only pages that actually render the strip are named by their tab.
      // ClientAppsPage also serves standalone /apps, so it keeps a visible title.
      if (!page.includes("<SettingsTabs />")) continue;

      // The page keeps an h1 for the document outline, but never a visible one:
      // the selected tab is already the on-screen page label.
      expect(page).toMatch(/<WorkspacePageIntro[\s\S]*?titleHidden[\s\S]*?\/>/);
      // Catches hand-rolled headings that bypass WorkspacePageIntro entirely —
      // how a duplicate "Team" title survived an earlier sweep of this file set.
      for (const tag of page.match(/<h1[^>]*>/g) ?? []) {
        expect(hiddenHeadingClasses(tag)).toBe(true);
      }
    }

    // A hidden title must collapse completely rather than leave a blank band.
    const frame = read("src/components/layout/WorkspacePageFrame.tsx");
    expect(frame).toContain('<h1 className="sr-only">{title}</h1>');
  });

  it("rejects headings that re-expose themselves at a breakpoint", () => {
    // Guards the check above. A substring test for "sr-only" silently accepts
    // `not-sr-only`, because the banned utility contains the allowed one — so a
    // heading could be hidden on phones and visible on desktop while still
    // reading as compliant. Kept as an executable self-check so the rule cannot
    // quietly stop discriminating.
    expect(hiddenHeadingClasses('<h1 className="sr-only">Team</h1>')).toBe(
      true,
    );
    expect(hiddenHeadingClasses('<h1 className="sr-only mt-2">Team</h1>')).toBe(
      true,
    );

    expect(hiddenHeadingClasses('<h1 className="text-3xl">Team</h1>')).toBe(
      false,
    );
    expect(hiddenHeadingClasses('<h1 className="not-sr-only">Team</h1>')).toBe(
      false,
    );
    expect(
      hiddenHeadingClasses('<h1 className="sr-only sm:not-sr-only">Team</h1>'),
    ).toBe(false);
    expect(
      hiddenHeadingClasses('<h1 className="sr-only lg:not-sr-only">Team</h1>'),
    ).toBe(false);
    // A variant-only hide still leaves the heading visible at other widths.
    expect(hiddenHeadingClasses('<h1 className="sm:sr-only">Team</h1>')).toBe(
      false,
    );
    expect(hiddenHeadingClasses("<h1>Team</h1>")).toBe(false);

    // Judged on classes even when className is a JSX expression, so a heading
    // written this way is not misreported as a visible one.
    expect(
      hiddenHeadingClasses('<h1 className={cn("sr-only", extra)}>Team</h1>'),
    ).toBe(true);
    expect(
      hiddenHeadingClasses(
        '<h1 className={cn("sr-only", "sm:not-sr-only")}>T</h1>',
      ),
    ).toBe(false);
    expect(
      hiddenHeadingClasses(
        '<h1 className={cn("wl-display-3", extra)}>Team</h1>',
      ),
    ).toBe(false);
  });
});
