import { expect, test } from "@playwright/test";

test("a retired learning link opens the current quality view without requesting digests", async ({
  page,
}) => {
  const digestRequests: string[] = [];
  // Intercept every API route; no account, database, or provider work runs.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/learning-digest")) digestRequests.push(path);
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "learning-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? { agents: [{ id: "bot-desk", name: "Front Desk", role: "receptionist" }] }
            : { accounts: [], data: [], numbers: [], integrations: [] },
    });
  });

  await page.goto("/insights?tab=quality&view=learning");
  await expect(page.getByText("No Failure Clusters", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Insights view", exact: true })).toHaveValue(
    "failures",
  );
  await expect(page.getByRole("option", { name: "Learning", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /learning summary/ })).toHaveCount(0);
  expect(digestRequests).toEqual([]);
});
