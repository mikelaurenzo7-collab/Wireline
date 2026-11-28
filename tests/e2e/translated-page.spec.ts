import { expect, test, type Page } from "@playwright/test";

/**
 * A browser translating the page (Chrome offers it to anyone whose browser is
 * not set to English) replaces every text node with its own
 * <font><font>text</font></font>, and keeps doing so as new text appears.
 * React then holds nodes that are no longer in the document. Before the guard
 * in src/lib/dom-reconciliation-recovery.ts, pressing Create Bot on such a page
 * threw NotFoundError and replaced the whole view with the crash screen.
 */
async function translateLikeABrowser(page: Page) {
  await page.addInitScript(() => {
    const skipped = new Set(["FONT", "SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "TITLE"]);
    const replace = (text: Node) => {
      const parent = text.parentNode;
      if (!text.nodeValue?.trim() || !parent || skipped.has(parent.nodeName)) return;
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      inner.textContent = text.nodeValue;
      outer.appendChild(inner);
      parent.replaceChild(outer, text);
    };
    const sweep = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const found: Node[] = [];
      while (walker.nextNode()) found.push(walker.currentNode);
      found.forEach(replace);
    };
    (window as unknown as { startTranslating: () => void }).startTranslating = () => {
      sweep(document.body);
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData") replace(record.target);
          record.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) replace(node);
            else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== "FONT") sweep(node);
          });
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    };
  });
}

test("a new owner can create a Bot while the browser translates the page", async ({ page }) => {
  const bot = { id: "translated-bot", name: "Bo", mark_key: "spark-rose" };
  let created = false;
  let releaseCreate = () => {};
  const createHeld = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") {
      await route.fulfill({
        json: { user: { id: "translated-owner", email: "owner@example.test" } },
      });
      return;
    }
    if (path === "/api/agents") {
      if (request.method() === "POST") {
        // Held open so the button is seen in its busy state first.
        await createHeld;
        created = true;
        await route.fulfill({ status: 201, json: bot });
      } else {
        await route.fulfill({ json: { agents: created ? [bot] : [] } });
      }
      return;
    }
    if (path === `/api/agent-config/${bot.id}`) {
      await route.fulfill({
        json: { personality: "Clear", directives: [], mark_key: bot.mark_key },
      });
      return;
    }
    if (path === "/api/train/extract") {
      await route.fulfill({ json: { readiness: { rules: 1, facts: 0, tone: false } } });
      return;
    }
    await route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await translateLikeABrowser(page);
  await page.goto("/studio?create=1");
  const dialog = page.getByRole("dialog", { name: "What Should Your Bot Do?" });
  await expect(dialog).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { startTranslating: () => void }).startTranslating(),
  );
  // The page is now translated: the label is no longer React's own text node.
  await expect(dialog.locator("button[type=submit] font font")).toHaveText("Create Bot");

  await dialog
    .getByRole("textbox", { name: "Describe the Job" })
    .fill("Answer calls and take messages.");
  await dialog.getByRole("textbox", { name: /Bot Name/ }).fill("Bo");
  await dialog.locator("button[type=submit]").click();

  // The busy state swaps the icon beside the translated label. This is where
  // the view used to crash.
  await expect(dialog.locator("button[type=submit]")).toContainText("Creating Your Bot…");
  await expect(page.getByText("Something broke")).toHaveCount(0);
  releaseCreate();

  await expect(page).toHaveURL(new RegExp(`agent=${bot.id}&section=setup$`));
  await expect(page.getByText("Something broke")).toHaveCount(0);
  expect(pageErrors.filter((message) => /insertBefore|removeChild/.test(message))).toEqual([]);
});
