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
  for (const term of terms) {
    expect(lower).not.toContain(term.toLowerCase());
  }
}

describe("Wireline product documentation contract", () => {
  it("keeps the root README aligned with the current product model", () => {
    const readme = read("README.md");
    expect(readme).toContain("Wireline Command");
    expect(readme).toContain("Wireline Letterpress design system");
    expect(readme).toContain("Create -> Train -> Run");
    expect(readme).toContain("AI employees");
    expect(readme).toContain("profit-moving");
    expect(readme).toContain("included number");
    expectNoTerms(readme, retiredProductTerms);
  });

  it("keeps the docs index aligned with current product truth", () => {
    const readme = read("docs/README.md");
    expect(readme).toContain("Create -> Train -> Run");
    // The bare capitalised "Agents" this used to assert only ever appeared
    // inside a retired-thesis footnote ("AI Profit Agents"), so it passed by
    // accident and would have kept passing while the real terminology drifted.
    // Assert the contextual naming rule the index actually states instead.
    expect(readme).toContain("personal agents");
    expect(readme).toContain("AI employees");
    expect(readme).toContain("AI sales agents");
    expect(readme).toContain("included number");
    expect(readme).toContain("Training");
    expect(readme).toContain("Wireline Command");
    expect(readme).toContain("WIRELINE_2026_ROADMAP.md");
    expectNoTerms(readme, retiredProductTerms);
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

  it("keeps extension docs positioned as Wireline Command", () => {
    const readme = read("apps/browser-extension/README.md");
    expect(readme).toContain("# Wireline Command");
    expect(readme).toContain("Prepare a call");
    expect(readme).toContain("Draft a text");
    expect(readme).toContain("Send an agent task");
  });

  it("keeps product docs aligned with Training and agent-first copy", () => {
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

  it("keeps native docs on the Wireline Letterpress contract", () => {
    const android = read("android/README.md");
    const ios = read("ios/README.md");

    for (const source of [android, ios]) {
      expect(source).toContain("Wire your agent");
      expect(source).toContain("Wireline Letterpress");
    }
  });

  it("keeps static metadata and OG positioning aligned with the current product truth", () => {
    const head = read("index.html");
    const ogImage = read("public/og-image.svg");

    expect(head).toContain("Wireline — AI Voice Agents for Personal &amp; Business");
    expect(head).toContain("personal tasks");
    expect(head).toContain("a coordinated team for your business");
    expect(head).toContain("calls, SMS, email, and follow-through");
    expect(ogImage).toMatch(/AI VOICE AGENTS[\s\S]*PERSONAL · BUSINESS/);
    expect(ogImage).toContain("VOICE · SMS · EMAIL · NUMBER INCLUDED · OUTCOMES · CONTROL");
    expectNoTerms(head, retiredProductTerms);
    expectNoTerms(ogImage, retiredProductTerms);
  });

  it("keeps authenticated workspace routes out of crawler policy and public sitemap", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    // Real authenticated surfaces from src/routes/AppRoutes.tsx — kept in sync
    // with the router so crawler policy never drifts from the actual app.
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
    ];

    for (const route of privateRoutes) {
      expect(robots).toContain(`Disallow: ${route}`);
      expect(sitemap).not.toContain(`https://trywireline.com${route}`);
    }
  });
});
