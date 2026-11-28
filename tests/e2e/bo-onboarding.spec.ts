import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Bo's first conversation, end to end with every endpoint mocked: an account
 * without a Bot meets Bo, answers four questions, and leaves with the three
 * next steps. No account, database, provider, or payment traffic runs.
 */
type Recorded = { path: string; method: string; body: unknown };

async function mockFirstRun(page: Page, options: { lookupFound?: boolean } = {}) {
  const calls: Recorded[] = [];
  let bots: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = method === "GET" ? null : request.postDataJSON();
    calls.push({ path, method, body });
    if (path === "/api/auth/session")
      return route.fulfill({
        json: { user: { id: "first-run-owner", email: "owner@example.test" } },
      });
    if (path === "/api/agents" && method === "POST") {
      const bo = { id: "agent-bo", name: "Bo", markKey: "spark-rose", channel: "voice" };
      bots = [bo];
      return route.fulfill({
        status: 201,
        json: {
          id: "agent-bo",
          name: "Bo",
          mark_key: "spark-rose",
          channel: "voice",
          created: true,
        },
      });
    }
    if (path === "/api/agents") return route.fulfill({ json: { agents: bots } });
    if (path === "/api/train/extract")
      return route.fulfill({
        json: {
          success: true,
          responseContent: "Saved 2 facts. They now appear under Knowledge.",
          readiness: { rules: 0, facts: 2, tone: false },
        },
      });
    if (path.endsWith("/web-lookup"))
      return route.fulfill({
        json:
          options.lookupFound === false
            ? { found: false, answer: "", sources: [] }
            : {
                found: true,
                answer:
                  "Rivera Plumbing serves Austin and Round Rock. Open Monday to Friday, 8 to 6.",
                sources: [{ title: "Rivera Plumbing", uri: "https://rivera.example/" }],
              },
      });
    if (path === "/api/agent-config/agent-bo" && method === "GET")
      return route.fulfill({
        json: {
          personality: "Clear",
          directives: [],
          mark_key: "spark-rose",
          playbook: {
            version: 1,
            exactLines: {},
            situations: [],
            alwaysMention: [],
            neverSay: [],
            checkFirst: [],
          },
        },
      });
    if (path.endsWith("/playbook")) return route.fulfill({ json: { success: true } });
    if (path.endsWith("/managed-identity"))
      return route.fulfill({ status: 402, json: { code: "ACTIVATION_REQUIRED" } });
    if (path === "/api/billing/status")
      return route.fulfill({
        json: {
          email_verified: true,
          channel_entitlements: {
            plan_id: null,
            subscription_status: "none",
            channels: [],
            is_owner: true,
          },
        },
      });
    return route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [], memories: [] },
    });
  });
  return calls;
}

async function proof(page: Page, info: TestInfo, name: string) {
  const folder = process.env.BOTBOUND_WORKSPACE_PROOF_DIR;
  if (!folder) return;
  await mkdir(folder, { recursive: true });
  const path = join(folder, `bo-onboarding-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const width of [390, 1280]) {
  test(`meets Bo and teaches it the business at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const calls = await mockFirstRun(page);
    await page.goto("/studio");

    const log = page.getByRole("log", { name: "Conversation with Bo" });
    await expect(log).toContainText("What's your business called, and what do you do?");
    await expect(page.getByText("Step 1 of 4", { exact: true })).toBeVisible();
    await expect(page.getByText(/What should it handle first|Front Desk|Sales Rep/)).toHaveCount(0);
    const created = calls.find((call) => call.path === "/api/agents" && call.method === "POST");
    expect(created?.body).toMatchObject({
      name: "Bo",
      only_if_none: true,
      is_business_agent: true,
    });
    await proof(page, info, `about-${width}`);

    const answer = page.getByRole("textbox", { name: "Your answer to Bo" });
    await answer.fill("Rivera Plumbing. We fix leaks and water heaters in Austin.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(log).toContainText("Got it. Saved 2 facts.");
    await expect(log).toContainText("Do you have a website?");

    await page.getByRole("button", { name: "I Don't Have One" }).click();
    await expect(log).toContainText("I can look you up online.");
    await page.getByRole("button", { name: "Look Me Up" }).click();
    await expect(log).toContainText("Rivera Plumbing serves Austin and Round Rock.");
    await expect(log.getByRole("link", { name: "Rivera Plumbing" })).toHaveAttribute(
      "href",
      "https://rivera.example/",
    );
    // Nothing from the web reaches Knowledge before the owner confirms it.
    expect(
      calls.filter((call) => call.path === "/api/train/extract").map((call) => call.body),
    ).toHaveLength(1);
    await proof(page, info, `lookup-${width}`);
    await page.getByRole("button", { name: "Yes, Save It" }).click();
    await expect(log).toContainText("What do customers usually ask you?");
    const extracts = calls.filter((call) => call.path === "/api/train/extract");
    expect(String((extracts.at(-1)?.body as { message?: string }).message)).toContain(
      "From a web search I confirmed is my business:",
    );

    await page.getByRole("button", { name: "Skip" }).click();
    await expect(log).toContainText("What should I always check with you before I agree to it?");
    await answer.fill("Discounts or refunds\nJobs outside our area");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(log).toContainText("I'll check with you before any of those.");
    const playbook = calls.find((call) => call.path.endsWith("/playbook"));
    expect(playbook?.body).toMatchObject({
      playbook: { checkFirst: ["Discounts or refunds", "Jobs outside our area"] },
    });

    await expect(log).toContainText("Everything I learned is in Knowledge");
    for (const name of ["Hear Me", "Pick My Voice", "Get a Number", "Start Chatting"])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await proof(page, info, `done-${width}`);

    await page.getByRole("button", { name: "Start Chatting" }).click();
    await expect(page).toHaveURL(/\/studio\?agent=agent-bo$/);
    await expect(page.getByRole("log", { name: "Conversation with Bo" })).toHaveCount(0);
  });
}

test("says so plainly when Bo cannot find the business online", async ({ page }) => {
  await mockFirstRun(page, { lookupFound: false });
  await page.goto("/studio");
  await page.getByRole("textbox", { name: "Your answer to Bo" }).fill("Rivera Plumbing, Austin.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "I Don't Have One" }).click();
  await page.getByRole("button", { name: "Look Me Up" }).click();
  const log = page.getByRole("log", { name: "Conversation with Bo" });
  await expect(log).toContainText("I couldn't find your business online.");
  await expect(log).toContainText("What do customers usually ask you?");
});
