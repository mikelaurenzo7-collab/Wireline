import { expect, test } from "@playwright/test";

for (const sessionFailure of ["unavailable", "offline"] as const) {
  test(`a failed starting brief survives ${sessionFailure} session hydration and saves on the same Bot`, async ({
    page,
  }) => {
    const bot = {
      id: "brief-recovery-bot",
      name: "Repair Desk",
      role: "receptionist",
      mark_key: "spark-rose",
    };
    const brief = "Our repair shop opens at 7am. Ask for the appliance model before booking.";
    let created = false;
    let createCount = 0;
    let extractionCount = 0;
    let failSession = false;
    let saved = false;
    let configReadsAfterSave = 0;
    const trainingMessages: string[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") {
        if (failSession) {
          if (sessionFailure === "offline") await route.abort("internetdisconnected");
          else await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
          return;
        }
        await route.fulfill({ json: { user: { id: "brief-owner", email: "owner@example.test" } } });
        return;
      }
      if (path === "/api/agents") {
        if (request.method() === "POST") {
          createCount += 1;
          created = true;
          await route.fulfill({ json: bot });
        } else await route.fulfill({ json: { agents: created ? [bot] : [] } });
        return;
      }
      if (path === "/api/train/extract") {
        extractionCount += 1;
        trainingMessages.push(request.postDataJSON().message);
        if (extractionCount === 1) {
          await route.fulfill({ status: 503, json: { error: "Training unavailable" } });
        } else {
          saved = true;
          await route.fulfill({ json: { readiness: { rules: 1, facts: 1, tone: true } } });
        }
        return;
      }
      if (path === `/api/agent-config/${bot.id}`) {
        if (saved) configReadsAfterSave += 1;
        await route.fulfill({
          json: {
            personality: saved ? "Warm" : "Clear",
            directives: saved ? [{ content: brief }] : [],
            mark_key: bot.mark_key,
          },
        });
        return;
      }
      await route.fulfill({
        json: { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
      });
    });

    await page.goto("/studio?create=1");
    const create = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
    await create.getByRole("textbox", { name: "Describe the Job" }).fill(brief);
    await create.getByRole("button", { name: "Create Bot", exact: true }).click();
    const guide = page.getByRole("dialog", { name: /Next Up for/ });
    await guide.getByRole("button", { name: "Close setup guide" }).click();
    const knowledge = page.locator("#setup-knowledge");
    await expect(knowledge).toHaveValue(brief);
    await expect(
      page.getByText(
        "Your starting brief is preserved above. Review it, then save changes to apply it.",
      ),
    ).toBeVisible();

    const workspaceUrl = page.url();
    failSession = true;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Session Could Not Be Confirmed", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(workspaceUrl);
    failSession = false;
    await page.getByRole("button", { name: "Try Again", exact: true }).click();
    await expect(knowledge).toHaveValue(brief);
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(
      page.getByText("Saved. Try the updated Bot before sending live traffic.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(knowledge).toHaveValue("");
    expect(trainingMessages).toHaveLength(2);
    expect(trainingMessages[1]).toBe(brief);
    expect(createCount).toBe(1);

    await page.getByRole("tab", { name: "Summary", exact: true }).click();
    await expect(page.getByText("Warm and natural", { exact: true })).toBeVisible();
    expect(configReadsAfterSave).toBeGreaterThan(0);
    await page.getByRole("tab", { name: "Set up", exact: true }).click();
    await page.reload();
    await expect(knowledge).toBeVisible({ timeout: 15_000 });
    await expect(knowledge).toHaveValue("");
    await expect(
      page.getByText(
        "Your starting brief is preserved above. Review it, then save changes to apply it.",
      ),
    ).toHaveCount(0);
  });
}
