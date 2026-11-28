import { expect, test, type Page } from "@playwright/test";

/**
 * A browser translating the page (Chrome offers it to anyone whose browser is
 * not set to English) replaces every text node with its own
 * <font><font>text</font></font>, and keeps doing so as new text appears.
 * React then holds nodes that are no longer in the document. Before the guard
 * in src/lib/dom-reconciliation-recovery.ts, pressing Create Bot on such a page
 * threw NotFoundError and replaced the whole view with the crash screen. The
 * create dialog is gone; a new owner now meets Bo in a conversation, which
 * swaps the same busy icon beside a translated label.
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

test("a new owner meets Bo while the browser translates the page", async ({ page }) => {
  const bot = { id: "translated-bot", name: "Bo", mark_key: "spark-rose", channel: "voice" };
  let created = false;
  let releaseSave = () => {};
  const saveHeld = new Promise<void>((resolve) => {
    releaseSave = resolve;
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
        created = true;
        await route.fulfill({ status: 201, json: { ...bot, created: true } });
      } else {
        await route.fulfill({ json: { agents: created ? [bot] : [] } });
      }
      return;
    }
    if (path === "/api/company-identity" && request.method() === "POST") {
      // Held open so the Send button is seen in its busy state first.
      await saveHeld;
      await route.fulfill({ json: { business_name: "Rivera Plumbing" } });
      return;
    }
    if (path.endsWith("/managed-identity")) {
      await route.fulfill({ status: 402, json: { code: "ACTIVATION_REQUIRED" } });
      return;
    }
    await route.fulfill({
      json: { accounts: [], data: [], numbers: [], integrations: [], messages: [] },
    });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await translateLikeABrowser(page);
  await page.goto("/studio");
  const log = page.getByRole("log", { name: "Conversation with Bo" });
  await expect(log).toContainText("First, what's your business called?");
  const name = page.getByRole("textbox", { name: "Your business name" });
  await expect(name).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { startTranslating: () => void }).startTranslating(),
  );
  // The page is now translated: the label is no longer React's own text node.
  const send = page.locator("form button[type=submit]");
  await expect(send.locator("font font")).toHaveText("Send");

  await name.fill("Rivera Plumbing");
  await send.click();

  // The busy state swaps the icon beside the translated label. This is where
  // the view used to crash.
  await expect(log.getByRole("status")).toContainText("Saving…");
  await expect(page.getByText("Something broke")).toHaveCount(0);
  releaseSave();

  await expect(log).toContainText("Nice to meet you, Rivera Plumbing.");
  // A keyed label shows its new words on a translated page.
  await expect(page.getByText("Step 2 of 5", { exact: true })).toBeVisible();
  await expect(page.getByText("Something broke")).toHaveCount(0);
  expect(pageErrors.filter((message) => /insertBefore|removeChild/.test(message))).toEqual([]);
});
