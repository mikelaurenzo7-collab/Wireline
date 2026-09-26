import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const retiredProductTerms = [
  "Ametrine Precision",
  "Browser Companion",
  "personal AI call assistant",
];

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function expectNoTerms(source: string, terms: string[]) {
  const lower = source.toLowerCase();
  for (const term of terms) expect(lower).not.toContain(term.toLowerCase());
}

describe("product documentation and compatibility contract", () => {
  it("keeps the root README aligned with the current product model", () => {
    const readme = read("README.md");
    expect(readme).toContain("BotBound Command");
    expect(readme).toContain("BotBound Design System");
    expect(readme).toContain("generated from shared semantic tokens");
    expect(readme).toContain(
      "Public marketing leads with capabilities, outcomes, and a clear signup action.",
    );
    expect(readme).toContain("Train -> Test -> Launch");
    expect(readme).toContain("Create / Build");
    expect(readme).toContain("Wire / Launch");
    expect(readme).toContain("Studio / Operations");
    expect(readme).toContain("your Bot across calls, texts, and email");
    expect(readme).toContain("active paid Bot gets a dedicated production number");
    expect(readme).toContain("BotBound-managed email identity");
    expect(readme).toContain(
      "Web creation on an active paid account starts identity setup automatically",
    );
    expect(readme).toContain(
      "connected-client drafts stay private until their phone line is activated from BotBound",
    );
    expect(readme).toContain("Unused Bot capacity does not pre-provision carrier numbers");
    expectNoTerms(readme, retiredProductTerms);
  });

  it("keeps the docs index aligned with current product truth", () => {
    const readme = read("docs/README.md");
    const launchTruth = read("docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    expect(readme).toContain("It does not require a setup sequence.");
    expect(readme).toContain("Train -> Test -> Launch");
    expect(readme).toContain("LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    expect(launchTruth).toContain("Do not add a public setup sequence or repeat process slogans.");
    expect(launchTruth).toContain("Your Next Hire Is a Bot.");
    expect(readme).toContain("Broad public copy uses **Bot** or **Phone Bot**");
    expect(readme).toContain("same workspace model");
    expect(readme).toContain("included number");
    expect(readme).toContain("Training");
    expect(readme).toContain("BotBound Command");
    expect(readme).toContain("WIRELINE_2026_ROADMAP.md");
    expectNoTerms(readme, retiredProductTerms);
  });

  it("pins the active launch creative manifest to the actual QA pack", () => {
    const launchTruth = read("docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    for (const asset of [
      "Wireline_Launch_15s_Missed_Call_Clean.mp4",
      "Wireline_Product_Loop_22s_Music.mp4",
      "Wireline_Launch_53s_Founder_Walkthrough_Clean.mp4",
    ]) {
      expect(launchTruth).toContain(asset);
    }
    expect(launchTruth).not.toContain("Wireline_Launch_22s_Product_Reel_Clean.mp4");
    expect(launchTruth).toContain('7.47-second "Second Ring" narration');
    expect(launchTruth).toContain("reference/editing assets until the picture is recaptured");
  });

  it("keeps the 2026 roadmap aligned with Letterpress and activation doctrine", () => {
    const roadmap = read("docs/WIRELINE_2026_ROADMAP.md");
    const vendors = read("docs/PRESENTER_VENDOR_STRATEGY.md");
    const theme = read("src/contexts/ThemeContext.tsx");
    const themeLight = read("src/styles/theme-light.css");
    expect(roadmap).toContain("Create → Train → Wire → Run");
    expect(roadmap).toContain("Letterpress");
    expect(roadmap).toContain("voice + chat AI-employee");
    expect(roadmap).toContain("Material-style dark SaaS");
    expect(vendors).toContain("LiveAvatar");
    expect(vendors).toContain("Customer surfaces must never name vendors");
    expect(theme).toContain("wireline-theme");
    expect(themeLight).toContain(":root.light");
  });

  it("keeps extension docs aligned with Bot-native IA while legacy file history remains readable", () => {
    const readme = read("apps/browser-extension/README.md");
    expect(readme).toContain("Prepare a call");
    expect(readme).toContain("Draft a text");
    expect(readme).toContain("Send a Bot task");
    expect(readme).toContain("Bots, Connections, Phone, Inbox, Knowledge, or Studio");
  });

  it("keeps product docs aligned with Training and agent-first technical copy", () => {
    const customization = read("docs/AGENT_CUSTOMIZATION_ARCHITECTURE.md");
    const submission = read("docs/CHATGPT_APP_SUBMISSION.md");
    expect(customization).toContain("Training");
    expect(customization).not.toContain("Knowledge");
    expect(submission).toContain("agent draft");
    expect(submission).not.toContain("professional assistant");
    expect(submission).not.toContain("I need an assistant");
    expectNoTerms(customization, retiredProductTerms);
    expectNoTerms(submission, retiredProductTerms);
  });

  it("keeps native documentation on the existing technical Letterpress contract during brand migration", () => {
    const android = read("android/README.md");
    const ios = read("ios/README.md");
    for (const source of [android, ios]) expect(source).toContain("Wireline Letterpress");
  });

  it("keeps static metadata and OG positioning aligned with BotBound", () => {
    const head = read("index.html");
    const ogImage = read("public/og-image.svg");

    expect(head).toContain("BotBound | Your Next Hire Is a Bot");
    expect(head).toContain("Your Bot for calls, texts, and email.");
    expect(head).toContain('"name":"BotBound"');
    expect(head).toContain('"slogan":"Your Next Hire Is a Bot"');
    expect(head).not.toContain("WIRE YOUR PHONE BOT");
    expect(head).not.toContain("VOICE-FIRST");
    expect(head).not.toContain("—");

    expect(ogImage).toContain("BotBound");
    expect(ogImage).toContain("Find. Call. Book");
    expect(ogImage).toContain("OUTBOUND SALES. INBOUND CALLS.");
    expect(ogImage).not.toContain("ONE BOT.");
    expect(ogImage).toContain("Find leads. Make calls. Answer inbound.");
    expect(ogImage).toMatch(/phone|Phone/);
    expect(ogImage).not.toContain("WIRE YOUR");
    expect(ogImage).not.toContain("ONE WORKSPACE");
    expect(ogImage).not.toContain("VOICE-FIRST");
    expectNoTerms(head, retiredProductTerms);
    expectNoTerms(ogImage, retiredProductTerms);
  });

  it("keeps authenticated workspace routes out of crawler policy and public sitemap", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const privateRoutes = [
      "/admin",
      "/agents",
      "/overview",
      "/studio",
      "/settings",
      "/inbox",
      "/knowledge",
      "/templates",
      "/connections",
      "/phone",
      "/insights",
      "/approvals",
      "/apps",
      "/call-logs",
      "/calls",
    ];
    for (const route of privateRoutes) {
      expect(robots).toContain(`Disallow: ${route}`);
      expect(sitemap).not.toContain(`https://trywireline.com${route}`);
    }
  });
});
