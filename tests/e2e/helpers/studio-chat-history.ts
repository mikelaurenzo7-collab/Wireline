import { type Page } from "@playwright/test";

export async function openSavedChat(page: Page, id = "legacy") {
  const title = "Earlier conversation";
  await page.route("**/workspace/messages?view=history", (route) =>
    route.fulfill({
      json: {
        threads: [{ id, title, project: null, updatedAt: "2026-11-25T12:00:00Z" }],
        nextCursor: null,
      },
    }),
  );
  await page.getByRole("button", { name: "Chat history", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Chat history" })
    .getByRole("button", { name: title, exact: true })
    .click();
}
