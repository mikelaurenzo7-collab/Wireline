import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readJson = (path: string) => JSON.parse(read(path));

describe("Milestone 3: Design System Unification & Workspace Polish Contracts", () => {
  describe("1. Design Tokens Completeness & Multi-Surface Parity", () => {
    it("defines canonical DTCG tokens with warm light and obsidian dark palettes", () => {
      const tokens = readJson("design-tokens/wireline.tokens.json");

      // Canvas tokens
      expect(tokens.color.canvas.default.$value).toBe("#0A0A0E");
      expect(tokens.color.canvas.deeper.$value).toBe("#050508");
      expect(tokens.color.canvas.warmer.$value).toBe("#101018");

      // Action tokens (Electric violet)
      expect(tokens.color.action.primary.default.$value).toBe("#A78BFA");
      expect(tokens.color.action.primary.pressed.$value).toBe("#8B5CF6");
      expect(tokens.color.action.primary.hover.$value).toBe("#C4B5FD");

      // Wire tokens (Platinum silver)
      expect(tokens.color.action.secondary.default.$value).toBe("#C7CCD6");
      expect(tokens.color.action.secondary.pressed.$value).toBe("#A9AFBC");
      expect(tokens.color.action.secondary.hover.$value).toBe("#DEE1E8");

      // Text tokens
      expect(tokens.color.text.primary.$value).toBe("#F5F4F8");
      expect(tokens.color.text.secondary.$value).toBe("#B6B1C6");
      expect(tokens.color.text.tertiary.$value).toBe("#908CA5");
      expect(tokens.color.text.onAction.$value).toBe("#0E0B16");

      // Status tokens
      expect(tokens.color.status.success.$value).toBe("#4ADE9A");
      expect(tokens.color.status.warning.$value).toBe("#E8B85C");
      expect(tokens.color.status.error.$value).toBe("#EF7B92");
      expect(tokens.color.status.info.$value).toBe("#93A0C7");

      // Spacing scale (4px/8px rhythm)
      expect(tokens.space["050"].$value).toBe("4px");
      expect(tokens.space["100"].$value).toBe("8px");
      expect(tokens.space["150"].$value).toBe("12px");
      expect(tokens.space["200"].$value).toBe("16px");
      expect(tokens.space["300"].$value).toBe("24px");
      expect(tokens.space["400"].$value).toBe("32px");

      // Radius scale
      expect(tokens.radius.xs.$value).toBe("6px");
      expect(tokens.radius.sm.$value).toBe("8px");
      expect(tokens.radius.md.$value).toBe("10px");
      expect(tokens.radius.lg.$value).toBe("12px");
      expect(tokens.radius.xl.$value).toBe("20px");
      expect(tokens.radius.pill.$value).toBe("999px");

      // Interaction targets
      expect(tokens.interaction.target.minimum.$value).toBe("40px");
      expect(tokens.interaction.target.comfortable.$value).toBe("44px");
      expect(tokens.interaction.target.primary.$value).toBe("48px");
      expect(tokens.interaction.focus.width.$value).toBe("2px");
      expect(tokens.interaction.focus.haloWidth.$value).toBe("4px");
    });

    it("verifies warm parchment light appearance and contrast-tuned status tokens in theme-light.css", () => {
      const themeLight = read("src/styles/theme-light.css");

      expect(themeLight).toContain("--wireline-color-canvas-default: #f7f7f3;");
      expect(themeLight).toContain("--wireline-color-surface-default: #ffffff;");
      expect(themeLight).toContain("--wireline-color-action-primary-default: #7040d7;");
      expect(themeLight).toContain("--wireline-color-action-secondary-default: #596170;");
      expect(themeLight).toContain("--wireline-color-status-success: #127548;");
      expect(themeLight).toContain("--wireline-color-status-warning: #8a5c07;");
      expect(themeLight).toContain("--wireline-color-status-error: #b83648;");
      expect(themeLight).toContain("--wireline-color-status-info: #46577a;");
      expect(themeLight).toContain("--background: var(--wireline-color-canvas-default);");
      expect(themeLight).toContain("--foreground: var(--wireline-color-text-primary);");
    });

    it("keeps generated token files in perfect sync with the canonical DTCG source", () => {
      const cssTokens = read("src/styles/tokens.generated.css");
      const tsTokens = read("src/constants/generated-design-tokens.ts");

      expect(cssTokens).toContain("--wireline-color-action-primary-default: #A78BFA;");
      expect(cssTokens).toContain("--wireline-color-action-secondary-default: #C7CCD6;");
      expect(cssTokens).toContain("--wireline-color-canvas-default: #0A0A0E;");
      expect(cssTokens).toContain('--wireline-font-family-display: "Inter Tight";');
      expect(cssTokens).toContain('--wireline-font-family-body: "Inter";');
      expect(cssTokens).toContain('--wireline-font-family-mono: "IBM Plex Mono";');

      expect(tsTokens).toContain('"color.action.primary.default": "#A78BFA"');
      expect(tsTokens).toContain('"color.action.secondary.default": "#C7CCD6"');
      expect(tsTokens).toContain('"color.canvas.default": "#0A0A0E"');
      expect(tsTokens).toContain('"font.family.display": \'"Inter Tight"\'');
      expect(tsTokens).toContain('"font.family.body": \'"Inter"\'');
      expect(tsTokens).toContain('"font.family.mono": \'"IBM Plex Mono"\'');
    });

    it("aligns the canonical design vision with the established multi-surface posture", () => {
      expect(WIRELINE_DESIGN_VISION.system).toBe("BotBound Design System");
      expect(WIRELINE_DESIGN_VISION.appearance.default).toBe("light");
      expect(WIRELINE_DESIGN_VISION.appearance.lightCanvas).toBe("#F7F7F3");
      expect(WIRELINE_DESIGN_VISION.appearance.darkCanvas).toBe("#0A0A0E");
      expect(WIRELINE_DESIGN_VISION.tokens.action).toBe("#A78BFA");
      expect(WIRELINE_DESIGN_VISION.tokens.accent).toBe("#C7CCD6");

      expect(WIRELINE_DESIGN_VISION.references).toEqual([
        "Codex workspace restraint",
        "ChatGPT composer clarity",
        "Cursor workbench density",
        "Claude conversation readability",
      ]);

      expect(WIRELINE_DESIGN_VISION.principles).toContain(
        "Inter Tight carries big ideas and the BotBound wordmark; Inter carries work; IBM Plex Mono carries labels and technical metadata.",
      );
      expect(WIRELINE_DESIGN_VISION.principles).toContain(
        "44px minimum for primary touch targets; 2px focus-visible rings, 4px halo optional.",
      );
    });
  });

  describe("2. Typography Strict Enforcement & Font Preloading", () => {
    it("declares the strict three-tier font stack in typography-prose.css", () => {
      const typeSystem = read("src/styles/typography-prose.css");

      expect(typeSystem).toContain(
        "--wireline-font-display:\n    var(--wireline-font-family-display), Inter, ui-sans-serif",
      );
      expect(typeSystem).toContain(
        "--wireline-font-sans:\n    var(--wireline-font-family-body), Inter, ui-sans-serif",
      );
      expect(typeSystem).toContain(
        "--wireline-font-mono:\n    var(--wireline-font-family-mono), ui-monospace",
      );

      // Headings use display family with tight kerning
      expect(typeSystem).toContain("font-family: var(--wireline-font-display);");
      expect(typeSystem).toContain(".wl-page-title");
      expect(typeSystem).toContain(".wl-app-page-title");
      expect(typeSystem).toContain(".wl-section-title");
      expect(typeSystem).toContain(".wl-card-title");
      expect(typeSystem).toContain(".wl-metric-value");

      // Eyebrows and metadata use monospace family with letter-spacing
      expect(typeSystem).toContain("font-family: var(--wireline-font-family-mono)");
      expect(typeSystem).toContain(".wl-eyebrow");
      expect(typeSystem).toContain(".wl-overline");
      expect(typeSystem).toContain(".wl-micro-meta");
    });

    it("preloads Inter Tight, Inter, and IBM Plex Mono above the fold in index.html", () => {
      const indexHtml = read("index.html");

      expect(indexHtml).toMatch(
        /<link[^>]+rel="preload"[^>]+as="font"[^>]+href="\/fonts\/NGSwv5HMAFg6IuGlBNMjxLsH8ag\.woff2"/,
      );
      expect(indexHtml).toMatch(
        /<link[^>]+rel="preload"[^>]+as="font"[^>]+href="\/fonts\/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7\.woff2"/,
      );
      expect(indexHtml).toMatch(
        /<link[^>]+rel="preload"[^>]+as="font"[^>]+href="\/fonts\/-F6qfjptAgt5VM-kVkqdyU8n3pQPwlBFgg\.woff2"/,
      );
    });

    it("restricts fonts to shipped weights and disables synthetic font smoothing/synthesis", () => {
      const typeIntegrity = read("src/styles/type-integrity.css");

      expect(typeIntegrity).toContain("font-synthesis: none;");
      expect(typeIntegrity).toContain("-webkit-font-smoothing: auto;");
      expect(typeIntegrity).toContain("text-rendering: auto;");
      expect(typeIntegrity).not.toMatch(/font-weight:\s*(?:560|650|680|720)\s*;/);
    });
  });

  describe("3. Workspace Shell & Cursor/Antigravity Navigation Rail", () => {
    it("configures resizable, persistent, and collapsible rail geometry", () => {
      const shell = read("src/components/WorkspaceShell.tsx");

      expect(shell).toContain("WorkspaceResizablePanel");
      expect(shell).toContain("WORKSPACE_RAIL_STORAGE_KEY = \"wireline:workspace-rail:v1\"");
      expect(shell).toContain("storageKey={WORKSPACE_RAIL_STORAGE_KEY}");
      expect(shell).toContain("defaultSize={232}");
      expect(shell).toContain("minSize={208}");
      expect(shell).toContain("maxSize={320}");
      expect(shell).toContain("collapsedSize={68}");
      expect(shell).toContain('className="wl-shell-nav-item wl-focus-ring-halo"');
      expect(shell).toContain('className="wl-shell-bot-context wl-focus-ring-halo"');
      expect(shell).toContain('className="wl-shell-account min-h-[44px] wl-focus-ring-halo"');
    });

    it("wires the Command Palette shortcut trigger into workspace chrome", () => {
      const shell = read("src/components/WorkspaceShell.tsx");
      const commandBar = read("src/components/CommandBar.tsx");

      expect(shell).toContain('window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))');
      expect(commandBar).toContain('data-slot="command-palette"');
      expect(commandBar).toContain("onSearchKeyDown");
      expect(commandBar).toContain('href: "/studio"');
      expect(commandBar).toContain('href: "/inbox"');
      expect(commandBar).toContain('href: "/phone"');
    });

    it("measures mobile dock clearance and respects device safe area insets", () => {
      const shell = read("src/components/WorkspaceShell.tsx");
      const safeArea = read("src/styles/safe-area-ownership.css");

      expect(shell).toContain("<MobileDock");
      expect(safeArea).toContain("padding-bottom: env(safe-area-inset-bottom");
      expect(safeArea).toContain("--wl-workspace-dock-height");
    });
  });

  describe("4. Workspace Primary Views Contracts", () => {
    it("verifies Studio (/studio): two-pane conversational workbench and inspector dock", () => {
      const studioHome = read("src/pages/AgentStudioHome.tsx");
      const studioV2 = read("src/components/StudioWorkspaceV2.tsx");
      const workroom = read("src/components/StudioWorkroom.tsx");
      const contextChrome = read("src/components/studio/StudioContextChrome.tsx");

      expect(studioHome).toContain("<StudioPageShell>");
      expect(studioHome).toContain("<StudioContextChrome />");
      expect(studioHome).toContain("<StudioWorkspaceV2 />");

      // Panel tabs Computer + Configure; Configure sub-tabs Details, Set Up, Summary
      expect(studioV2).toContain('{ id: "computer", label: "Computer" }');
      expect(studioV2).toContain('{ id: "configure", label: "Configure" }');
      expect(studioV2).toContain('{ id: "details", label: "Details" }');
      expect(studioV2).toContain('{ id: "setup", label: "Set Up" }');
      expect(studioV2).toContain('{ id: "review", label: "Summary" }');
      expect(studioV2).toContain('STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-panel:v3"');
      expect(studioV2).toContain("storageKey={STUDIO_INSPECTOR_STORAGE_KEY}");

      // Studio composer dock
      expect(workroom).toContain("showStarterPrompts");
      expect(workroom).toContain("quickPrompts.slice(0, 3)");
      expect(workroom).toContain('textarea.style.minHeight = "52px"');

      // Context chrome with switchable bot roster
      expect(contextChrome).toContain('aria-label="Switch Bot"');
      expect(contextChrome).toContain('id="studio-settings-toggle"');
    });

    it("verifies Phone / Calls (/phone): operational telephony hub, history, and lines", () => {
      const phonePage = read("src/pages/PhonePage.tsx");
      const callLogs = read("src/components/CallLogsClaude.tsx");

      expect(phonePage).toContain('{ id: "logs", label: "History" }');
      expect(phonePage).toContain('{ id: "settings", label: "Settings" }');
      expect(phonePage).toContain('{ id: "outbound", label: "Outbound" }');
      expect(phonePage).toContain('{ id: "lines", label: "Lines" }');
      expect(phonePage).toContain("<WorkspaceControlBand");
      expect(phonePage).toContain("<PhoneCallHistoryPanel");
      expect(phonePage).toContain("<PhoneSetupPanel");
      expect(phonePage).toContain("<OutboundHub");

      // Resizable call triage panel
      expect(callLogs).toContain("WorkspaceResizablePanel");
      expect(callLogs).toContain('CALL_LIST_PANEL_STORAGE_KEY = "wireline:calls-history-pane:v1"');
      expect(callLogs).toContain("storageKey={CALL_LIST_PANEL_STORAGE_KEY}");
      expect(callLogs).toContain('aria-label="Open call list"');
      expect(callLogs).toContain('aria-label="Collapse call list"');
    });

    it("verifies Inbox (/inbox): unified triage for Email, SMS threads, and approval cards", () => {
      const emailPage = read("src/pages/EmailPage.tsx");
      const emailInbox = read("src/components/EmailInbox.tsx");
      const smsThreads = read("src/components/SmsThreads.tsx");

      expect(emailPage).toContain('{ id: "email", label: "Email" }');
      expect(emailPage).toContain('{ id: "sms", label: "SMS" }');
      expect(emailPage).toContain('{ id: "approvals", label: "Approvals" }');
      expect(emailPage).toContain("<WorkspaceControlBand");
      expect(emailPage).toContain("<EmailInbox");
      expect(emailPage).toContain("<SmsThreads");
      expect(emailPage).toContain("<ApprovalInbox");

      // Both email and SMS share one intentional grid surface
      expect(emailInbox).toContain("wl-channel-inbox-grid");
      expect(smsThreads).toContain("wl-channel-inbox-grid");
      expect(emailInbox).toContain('data-empty={listOwnsOnlyState ? "true" : undefined}');
      expect(emailInbox).toContain("EmailBackButton");
      expect(emailInbox).toContain("loadThreadDetail");
    });

    it("verifies Knowledge (/knowledge): clean source ingestion and rule cards", () => {
      const knowledgePage = read("src/pages/KnowledgePage.tsx");
      const knowledgeEditor = read("src/components/KnowledgeBaseClaude.tsx");

      expect(knowledgePage).toContain("<KnowledgeQuickAdd");
      expect(knowledgePage).toContain("<WebsiteKnowledgeImport");
      expect(knowledgePage).toContain("<KnowledgeBaseClaude");
      expect(knowledgePage).toContain("Choose a Bot");
      expect(knowledgePage).toContain("<WorkspaceControlBand");

      // Ingestion drop zone and source document grounding
      expect(knowledgeEditor).toContain("Add Documents");
      expect(knowledgeEditor).toContain("activeAgentIdRef");
    });

    it("verifies Settings (/settings/*): restrained Stripe-like account and billing controls", () => {
      const settingsPage = read("src/pages/SettingsPage.tsx");
      const billingSettings = read("src/pages/BillingSettings.tsx");
      const settingsTabs = read("src/components/settings/SettingsTabs.tsx");

      expect(settingsTabs).toContain('{ id: "account", href: "/settings", label: "Account" }');
      expect(settingsTabs).toContain('{ id: "billing", href: "/settings/billing", label: "Billing" }');
      expect(settingsTabs).toContain('{ id: "team", href: "/settings/team", label: "Team" }');
      expect(settingsTabs).toContain('{ id: "apps", href: "/settings/apps", label: "Apps" }');
      expect(settingsTabs).toContain('href: "/settings/customization"');
      expect(settingsTabs).toContain('href: "/settings/compliance"');

      // Account settings provides deletion with confirmation safeguards
      expect(settingsPage).toContain("DangerZone");
      expect(settingsPage).toContain("Delete Account");
      expect(settingsPage).toContain("Keep my account");

      // Billing settings provides Stripe card, balance management, and trust footer
      expect(billingSettings).toContain("<StripeBillingCard");
      expect(billingSettings).toContain("<UsageSpendCard");
      expect(billingSettings).toContain("<RuntimeBalanceActivity");
      expect(billingSettings).toContain("BillingTrustFooter");
    });
  });

  describe("5. Design Quality & Brand Integrity Invariants", () => {
    it("ensures core atoms adhere to the 40px/44px minimum touch target floor", () => {
      const button = read("src/components/atoms/Button.tsx");
      const input = read("src/components/atoms/Input.tsx");
      const textarea = read("src/components/atoms/Textarea.tsx");

      expect(button).toContain("min-h-[var(--wireline-interaction-target-minimum,40px)]");
      expect(input).toContain("h-11"); // 44px
      expect(textarea).toContain("min-h-24");
    });

    it("ensures interactive elements have proper focus ring tokens", () => {
      const button = read("src/components/atoms/Button.tsx");
      const input = read("src/components/atoms/Input.tsx");

      expect(button).toContain("focus-visible:ring-2");
      expect(button).toContain("focus-visible:ring-[var(--wireline-color-focus-default)]");
      expect(input).toContain("focus-visible:border-[var(--wireline-color-focus-default)]");
    });

    it("guarantees zero em dashes in design-system source files", () => {
      const targetFiles = [
        "src/lib/wireline-design-vision.ts",
        "src/components/atoms/Button.tsx",
        "src/components/atoms/Input.tsx",
        "src/components/atoms/Badge.tsx",
        "src/components/atoms/Chip.tsx",
        "src/components/atoms/Paper.tsx",
        "src/components/molecules/Card.tsx",
        "src/components/molecules/StatusNotice.tsx",
        "src/pages/AgentStudioHome.tsx",
        "src/pages/PhonePage.tsx",
        "src/pages/EmailPage.tsx",
        "src/pages/KnowledgePage.tsx",
        "src/pages/SettingsPage.tsx",
        "src/pages/BillingSettings.tsx",
      ];

      const dashRegex = /[—–―]/;
      for (const file of targetFiles) {
        expect(existsSync(resolve(root, file))).toBe(true);
        const content = read(file);
        // Strip comments to test shipped code and copy
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        expect(stripped, `${file} must not contain em/en dashes in shipped code/copy`).not.toMatch(
          dashRegex,
        );
      }
    });

    it("verifies canonical BotBound mixed-case brand usage in customer copy", () => {
      const copy = read("src/lib/product-copy.ts");
      expect(copy).toContain(
        "Render the BotBound brand name in canonical mixed case everywhere it is customer-visible",
      );
      expect(copy).not.toContain("WIRELINE Design System");
    });
  });
});
