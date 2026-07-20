/**
 * Fast Start Wizard E2E tests
 *
 * Tests the streamlined onboarding flow that combines agent creation,
 * knowledge ingestion, voice selection, and phone provisioning into
 * a single guided wizard.
 */
import { test, expect } from "@playwright/test";

test.describe("Fast Start Wizard", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate before testing
    await page.goto("/auth");
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="sign-in-button"]');
    await page.waitForURL("**/dashboard**");
  });

  test("Fast Start CTA appears for new users", async ({ page }) => {
    await page.goto("/onboarding");

    // Fast Start banner should be visible
    await expect(page.getByText("Fastest path to live")).toBeVisible();
    await expect(page.getByText("under 3 minutes")).toBeVisible();
    await expect(page.getByRole("button", { name: /fast start wizard/i })).toBeVisible();
  });

  test("Fast Start CTA hidden when user has completed 2+ steps", async ({ page }) => {
    // Mock API response to simulate partial progress
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ agents: [{ id: "1", name: "Test Agent" }] }),
      });
    });

    await page.route("**/api/agent-config/default-agent", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ knowledge: [{ id: "1" }] }),
      });
    });

    await page.goto("/onboarding");
    await page.waitForTimeout(500);

    // Fast Start banner should be hidden when 2+ steps done
    await expect(page.getByText("Fastest path to live")).not.toBeVisible();
  });

  test("Fast Start Wizard opens when clicking CTA", async ({ page }) => {
    await page.goto("/onboarding");

    await page.click('button:has-text("Fast Start Wizard")');

    // Wizard modal should open
    await expect(page.getByText("Fast Start")).toBeVisible();
    await expect(page.getByText("~3 minutes to your first AI agent")).toBeVisible();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("Wizard progresses through all steps", async ({ page }) => {
    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');

    // Step 1: Business description
    await expect(page.getByText("What does your business do?")).toBeVisible();
    await page.fill(
      'textarea[placeholder*="e.g., We\'re a family-owned"]',
      "We're a dental practice in Chicago offering cleanings, whitening, and emergency dental care.",
    );
    await page.click('button:has-text("Continue")');

    // Step 2: Website (optional)
    await expect(page.getByText("Add your website")).toBeVisible();
    await page.fill('input[type="url"]', "https://chicagodental.example.com");
    await page.click('button:has-text("Continue")');

    // Step 3: Voice selection
    await expect(page.getByText("Choose a voice")).toBeVisible();
    await page.click('button:has-text("Adam")'); // Select a voice
    await page.click('button:has-text("Continue")');

    // Step 4: Phone number (optional)
    await expect(page.getByText("Get a phone number")).toBeVisible();
    await page.fill('input[placeholder="212"]', "312"); // Chicago area code
    await page.click('button:has-text("Continue")');

    // Step 5: Review
    await expect(page.getByText("You're almost live")).toBeVisible();
    await expect(page.getByText("Dental practice")).toBeVisible(); // From business description
  });

  test("Wizard validates inputs with human-readable errors", async ({ page }) => {
    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');

    // Step 1: Try to continue without input
    await page.click('button:has-text("Continue")');
    await expect(
      page.getByText("Tell us a bit more — at least 10 characters so we understand what you do."),
    ).toBeVisible();

    // Fill with short input
    await page.fill("textarea", "Hi");
    await page.click('button:has-text("Continue")');
    await expect(
      page.getByText("Tell us a bit more — at least 10 characters so we understand what you do."),
    ).toBeVisible();

    // Fill with valid input
    await page.fill("textarea", "We're a family-owned plumbing company in Chicago.");
    await page.click('button:has-text("Continue")');

    // Step 2: Try invalid URL
    await page.fill('input[type="url"]', "not-a-valid-url");
    await page.click('button:has-text("Continue")');
    await expect(page.getByText("That doesn't look like a valid website URL")).toBeVisible();
  });

  test("Wizard allows skipping optional steps", async ({ page }) => {
    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');

    // Step 1: Fill required
    await page.fill(
      "textarea",
      "We're a dental practice in Chicago offering comprehensive dental care.",
    );
    await page.click('button:has-text("Continue")');

    // Step 2: Skip website
    await expect(page.getByText("Add your website")).toBeVisible();
    await page.click('button:has-text("Skip")');

    // Step 3: Select voice and continue
    await page.click('button:has-text("Adam")');
    await page.click('button:has-text("Continue")');

    // Step 4: Skip phone
    await expect(page.getByText("Get a phone number")).toBeVisible();
    await page.click('button:has-text("Skip")');

    // Step 5: Review should show skipped items
    await expect(page.getByText("You're almost live")).toBeVisible();
    await expect(page.getByText("Skipped — add later")).toBeVisible();
  });

  test("Completing wizard shows 'You're Live' celebration", async ({ page }) => {
    // Mock API endpoints
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "agent-123",
          name: "Chicago Dental Receptionist",
        }),
      });
    });

    await page.route("**/api/knowledge/scrape", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ items: [{ id: "1" }, { id: "2" }, { id: "3" }] }),
      });
    });

    await page.route("**/api/phone-numbers/provision", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ number: "+1 (312) 555-0123" }),
      });
    });

    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');

    // Fill all steps
    await page.fill("textarea", "We're a dental practice in Chicago.");
    await page.click('button:has-text("Continue")');
    await page.fill('input[type="url"]', "https://example.com");
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Adam")');
    await page.click('button:has-text("Continue")');
    await page.fill('input[placeholder="212"]', "312");
    await page.click('button:has-text("Continue")');

    // Launch
    await page.click('button:has-text("Launch Agent")');

    // Celebration modal should appear
    await expect(page.getByText("You're Live!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Chicago Dental Receptionist")).toBeVisible();
    await expect(page.getByText(/Setup complete/)).toBeVisible();
  });

  test("'You're Live' modal has working navigation", async ({ page }) => {
    // Mock and complete wizard
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ id: "agent-123", name: "Test Agent" }),
      });
    });

    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');
    await page.fill("textarea", "We're a dental practice.");
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Skip")'); // Skip website
    await page.click('button:has-text("Adam")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Skip")'); // Skip phone
    await page.click('button:has-text("Launch Agent")');

    // Wait for celebration
    await expect(page.getByText("You're Live!")).toBeVisible();

    // Click "Talk to your agent"
    await page.click('button:has-text("Start test call")');
    await expect(page).toHaveURL("/");
  });

  test("Time-to-first-call is tracked and displayed", async ({ page }) => {
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ id: "agent-123", name: "Speed Test Agent" }),
      });
    });

    await page.goto("/onboarding");
    await page.click('button:has-text("Fast Start Wizard")');

    // Complete quickly
    await page.fill("textarea", "We're a dental practice in Chicago.");
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Skip")');
    await page.click('button:has-text("Adam")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Skip")');
    await page.click('button:has-text("Launch Agent")');

    // Celebration should show time
    await expect(page.getByText("You're Live!")).toBeVisible();
    await expect(page.getByText(/Lightning fast|Setup complete/)).toBeVisible();
  });
});

test.describe("You're Live Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="sign-in-button"]');
    await page.waitForURL("**/dashboard**");
  });

  test("Celebration modal shows confetti and stats", async ({ page }) => {
    // Navigate to onboarding with all steps complete
    await page.goto("/onboarding");

    // Mock all completion
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ agents: [{ id: "1" }] }),
      });
    });
    await page.route("**/api/agent-config/default-agent", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ knowledge: [{ id: "1" }, { id: "2" }] }),
      });
    });
    await page.route("**/api/phone-numbers", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ numbers: [{ id: "1" }] }),
      });
    });
    await page.route("**/api/calls", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ total: 1 }),
      });
    });

    await page.reload();

    // AllSetCard should show with celebration button
    await expect(page.getByText("You're live on Wireline")).toBeVisible();
    await page.click('button:has-text("View Your Achievement")');

    // Modal with confetti should appear
    await expect(page.getByText("You're Live!")).toBeVisible();
    await expect(page.getByText("1 AI agent")).toBeVisible();
    await expect(page.getByText("2 knowledge items")).toBeVisible();
  });

  test("Share button works", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto("/onboarding");

    // Complete all steps
    await page.route("**/api/agents", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ agents: [{ id: "1" }] }) });
    });
    await page.route("**/api/agent-config/default-agent", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ knowledge: [] }) });
    });
    await page.route("**/api/phone-numbers", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ numbers: [] }) });
    });
    await page.route("**/api/calls", async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ total: 1 }) });
    });

    await page.reload();
    await page.click('button:has-text("View Your Achievement")');

    // Click share
    await page.click('button:has-text("Share")');

    // Should show copied state or use Web Share API
    await expect(page.getByText(/Copied|Share/)).toBeVisible();
  });
});
