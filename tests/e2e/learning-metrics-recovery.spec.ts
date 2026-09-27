import { expect, test, type Page } from "@playwright/test";

const bots = [
  { id: "bot-desk", name: "Front Desk", role: "receptionist" },
  { id: "bot-sales", name: "Sales", role: "sales" },
];

function digest(agentId: string, pending = 2, approved = 3) {
  return {
    ok: true,
    digest: {
      agentId,
      lessonsPending: pending,
      lessonsApproved: approved,
      topLessons: [`Guidance for ${agentId}`],
      outcomeLiftPct: null,
      objectionsTrending: [],
    },
  };
}

async function mockWorkspace(page: Page, agents = bots) {
  // Intercept every API route; no account, database, or provider work runs.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "learning-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents }
            : { accounts: [], data: [], numbers: [], integrations: [] },
    });
  });
}

for (const failure of ["unavailable", "malformed", "wrong-bot", "invalid-count"] as const) {
  test(`a ${failure} learning digest stays unavailable instead of showing healthy zeroes`, async ({
    page,
  }) => {
    await mockWorkspace(page, [bots[0]]);
    let recovered = false;
    await page.route("**/api/agents/*/learning-digest", (route) => {
      const payload = digest(bots[0].id);
      return route.fulfill(
        recovered
          ? { json: payload }
          : failure === "unavailable"
            ? { status: 503, json: { error: "Temporarily unavailable" } }
            : failure === "malformed"
              ? { json: { ok: true, digest: { agentId: bots[0].id } } }
              : failure === "wrong-bot"
                ? { json: digest(bots[1].id) }
                : {
                    json: {
                      ...payload,
                      digest: { ...payload.digest, lessonsApproved: "3" },
                    },
                  },
      );
    });

    await page.goto("/insights?tab=quality&view=learning");
    await expect(page.getByText("Learning Metrics Unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText(/Unavailable: Front Desk/)).toBeVisible();
    await expect(page.getByText("Approved lessons", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Front Desk learning summary" })).toHaveCount(0);

    recovered = true;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const summary = page.getByRole("region", { name: "Front Desk learning summary" });
    await expect(summary.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(page.getByText("Latest 50 lessons per Bot.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Lessons in runtime|outcome lift/)).toHaveCount(0);
  });
}

for (const rosterFailure of ["unavailable", "malformed"] as const) {
  test(`partial learning results survive a ${rosterFailure} roster retry and a later digest failure`, async ({
    page,
  }, testInfo) => {
    await mockWorkspace(page);
    let phase = 0;
    await page.route("**/api/agents", (route) =>
      route.fulfill(
        phase === 1
          ? rosterFailure === "unavailable"
            ? { status: 503, json: { error: "Temporarily unavailable" } }
            : { json: {} }
          : { json: { agents: bots } },
      ),
    );
    let releaseRetry!: () => void;
    const retryReady = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    await page.route("**/api/agents/*/learning-digest", async (route) => {
      const agentId = new URL(route.request().url()).pathname.split("/")[3];
      if (phase === 2) await retryReady;
      const unavailable =
        (phase === 0 && agentId === bots[1].id) || (phase === 2 && agentId === bots[0].id);
      await route.fulfill(
        unavailable
          ? { status: 503, json: { error: "Temporarily unavailable" } }
          : { json: digest(agentId, agentId === bots[0].id ? 2 : 4, 3) },
      );
    });

    await page.goto("/insights?tab=quality&view=learning");
    const desk = page.getByRole("region", { name: "Front Desk learning summary" });
    const sales = page.getByRole("region", { name: "Sales learning summary" });
    await expect(desk.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(sales).toHaveCount(0);
    await expect(page.getByText(/Unavailable: Sales/)).toBeVisible();

    phase = 1;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText(/Could not refresh the Bot list/)).toBeVisible();
    await expect(desk.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(desk.getByText("Last loaded results · Refresh unavailable")).toBeVisible();
    await expect(page.getByText("No Bots", { exact: true })).toHaveCount(0);

    phase = 2;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    try {
      await expect(page.getByRole("button", { name: "Retrying…", exact: true })).toBeDisabled();
      await expect(desk.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    } finally {
      releaseRetry();
    }
    await expect(sales.getByText("4 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(page.getByText(/Unavailable: Front Desk/)).toBeVisible();
    await expect(desk.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(desk.getByText("Last loaded results · Refresh unavailable")).toBeVisible();
    await expect(sales.getByText("Last loaded results · Refresh unavailable")).toHaveCount(0);
    if (rosterFailure === "unavailable") {
      const path = testInfo.outputPath("learning-partial-recovery.png");
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach("Synthetic Learning partial recovery with retained results", {
        path,
        contentType: "image/png",
      });
    }

    phase = 3;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("Some Learning Metrics Unavailable", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText("Last loaded results · Refresh unavailable")).toHaveCount(0);
    await expect(desk.getByText("2 pending · 3 approved", { exact: true })).toBeVisible();
    await expect(sales.getByText("4 pending · 3 approved", { exact: true })).toBeVisible();
  });
}

test("learning metrics disclose their existing Bot and recent-lesson bounds", async ({ page }) => {
  const agents = Array.from({ length: 13 }, (_, index) => ({
    id: `bot-${index}`,
    name: `Bot ${index}`,
    role: "receptionist",
  }));
  await mockWorkspace(page, agents);
  const requestedBots: string[] = [];
  await page.route("**/api/agents/*/learning-digest", (route) => {
    const agentId = new URL(route.request().url()).pathname.split("/")[3];
    requestedBots.push(agentId);
    return route.fulfill({ json: digest(agentId) });
  });

  await page.goto("/insights?tab=quality&view=learning");
  await expect(page.getByText("Latest 50 lessons per Bot. Showing 12 of 13 Bots.")).toBeVisible();
  await expect(page.getByRole("region", { name: /Bot \d+ learning summary/ })).toHaveCount(12);
  expect(requestedBots).not.toContain("bot-12");
});
