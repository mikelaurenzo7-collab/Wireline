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
    expect(readme).toContain("customers create a Bot, set it up, and rehearse privately");
    expect(readme).toContain(
      "**Set Up** its facts, sources, policies, voice, tone, tools, and workflows.",
    );
    expect(readme).toContain("**Rehearse** customer conversations privately and refine the setup.");
    expect(readme).toContain("**Connect and activate** a number");
    expect(readme).toContain("Studio / Operations");
    expect(readme).toContain("your Bot calling, email, and a Computer");
    expect(readme).toContain("Public pages present calls, SMS, email, and Computer.");
    expect(readme).toContain(
      "verified sender, recipient permission, funding, and provider readiness",
    );
    expect(readme).toContain("Current Shared Work Offer");
    expect(readme).toContain("Legacy Package Compatibility");
    expect(readme).toContain("Warm light is the first-visit web appearance");
    expect(readme).toContain("BotBound Personal is a paid plan");
    expect(readme).toContain("Paid packages include one Bot");
    expect(readme).toContain("Calls includes a local number; Email includes a managed mailbox.");
    expect(readme).toContain(
      "Customers choose an available US area code and exact number in Phone setup.",
    );
    expect(readme).toContain("Calls-only does not allocate an AgentMail mailbox");
    expect(readme).toContain("never chooses a new number for the customer");
    expect(readme).toContain("Unpaid draft Bots receive no live identity");
    expect(readme).toContain("unused capacity does not pre-provision carrier numbers");
    expectNoTerms(readme, retiredProductTerms);
  });

  it("keeps the docs index aligned with current product truth", () => {
    const readme = read("docs/README.md");
    const launchTruth = read("docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    expect(readme).toContain("It does not require a setup sequence.");
    expect(readme).toContain("customers create a Bot, set it up, and rehearse privately");
    expect(readme).toContain("LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    expect(launchTruth).toContain("Do not add a public setup sequence or repeat process slogans.");
    expect(launchTruth).toContain("Your next hire is a bot.");
    expect(readme).toContain("Broad public copy uses **Bot** or **Phone Bot**");
    expect(readme).toContain(
      "The launch story is voice Bots with a computer, phone number, text, and email address.",
    );
    expect(readme).toContain(
      "Public pages present calls, SMS, email, and Computer; activation retains entitlement, verified sender, recipient permission, funding, and provider readiness checks.",
    );
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
    const ogImage = read("public/og-image.svg").replace(/<image\b[^>]*\/>/g, "");

    expect(head).toContain("BotBound | Your next hire is a bot.");
    expect(head).toContain(
      "Your next hire is a bot. Inbound and outbound calls, SMS, email, and computer tasks for small businesses.",
    );
    const graph = JSON.parse(
      head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
    )["@graph"];
    expect(graph).toContainEqual(
      expect.objectContaining({ name: "BotBound", slogan: "Your next hire is a bot." }),
    );
    expect(head).not.toContain("WIRE YOUR PHONE BOT");
    expect(head).not.toContain("VOICE-FIRST");
    expect(head).not.toContain("—");

    expect(ogImage).toContain("BotBound");
    expect(ogImage).toContain("YOUR NEXT HIRE");
    expect(ogImage).toContain("IS A BOT.");
    expect(ogImage).toContain("Inbound and outbound calls, SMS,");
    expect(ogImage).toContain("email, and computer tasks for small businesses.");
    expect(ogImage).not.toContain("ONE BOT.");
    expect(ogImage).not.toContain("Find. Call. Book");
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
