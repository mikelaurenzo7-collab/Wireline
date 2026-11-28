import { expect, test, type Page } from "@playwright/test";

/**
 * On a short desktop window the workspace rail runs out of height and scrolls.
 * Its Chats block used to be the one thing allowed to shrink, down to nothing:
 * New chat was drawn over the Work heading and saved chats sat under the Work
 * links, so a click on a chat opened Inbox. Every endpoint is mocked.
 */
async function mockWorkspace(page: Page, chatCount: number) {
  const bot = {
    id: "rail-bot",
    name: "Bo",
    mark_key: "spark-rose",
    channel: "voice",
    is_business_agent: true,
  };
  await page.addInitScript(() => localStorage.setItem("wireline_cookie_consent", "acknowledged"));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({ json: { user: { id: "rail-owner", email: "owner@example.test" } } });
    if (path === "/api/agents") return route.fulfill({ json: { agents: [bot] } });
    if (path === `/api/agents/${bot.id}/workspace/messages`)
      return route.fulfill({
        json: {
          messages: [],
          threads: Array.from({ length: chatCount }, (_, index) => ({
            id: `chat-${index + 1}`,
            title: `Saved chat ${index + 1}`,
            project: null,
          })),
        },
      });
    if (path === `/api/agent-config/${bot.id}`)
      return route.fulfill({
        json: { personality: "Clear", directives: [], mark_key: bot.mark_key },
      });
    return route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [], threads: [] },
    });
  });
  await page.goto(`/studio?agent=${bot.id}`);
}

for (const { width, height, chatCount } of [
  { width: 1280, height: 720, chatCount: 1 },
  { width: 1280, height: 720, chatCount: 8 },
  { width: 1024, height: 640, chatCount: 3 },
  { width: 1440, height: 900, chatCount: 1 },
]) {
  test(`saved chats stay visible and clickable in the rail at ${width}x${height} with ${chatCount}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await mockWorkspace(page, chatCount);
    const rail = page.getByRole("complementary", { name: "Workspace navigation" });
    const chat = rail.getByRole("link", { name: "Saved chat 1", exact: true });
    await expect(chat).toBeVisible();

    const layout = await rail.evaluate((element) => {
      const box = (node: Element | null) => node?.getBoundingClientRect() ?? null;
      const work = [...element.querySelectorAll("*")].find(
        (node) => node.children.length === 0 && node.textContent?.trim() === "Work",
      );
      const link = element.querySelector(".wl-shell-chat-link");
      const linkBox = box(link);
      const hit = linkBox
        ? document.elementFromPoint(
            linkBox.left + linkBox.width / 2,
            linkBox.top + linkBox.height / 2,
          )
        : null;
      return {
        chatsHeight: box(element.querySelector(".wl-shell-chat-rail"))?.height ?? 0,
        newChatBottom: box(element.querySelector(".wl-shell-chat-new"))?.bottom ?? 0,
        chatsBottom: box(element.querySelector(".wl-shell-chat-rail"))?.bottom ?? 0,
        workTop: box(work ?? null)?.top ?? 0,
        clickReachesChat: Boolean(link && hit && (hit === link || link.contains(hit))),
      };
    });
    expect(layout.chatsHeight).toBeGreaterThan(0);
    expect(layout.newChatBottom).toBeLessThanOrEqual(layout.workTop);
    expect(layout.chatsBottom).toBeLessThanOrEqual(layout.workTop);
    expect(layout.clickReachesChat).toBe(true);

    // The rail scrolls, so Settings at its foot stays reachable.
    const settings = rail.getByRole("link", { name: "Account settings" });
    await settings.scrollIntoViewIfNeeded();
    await expect(settings).toBeInViewport();
  });
}
