import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Error boundary copy when a lazy route throws during render. */
export async function expectNoViewCrash(page: Page): Promise<void> {
  await expect(page.getByText("This view crashed")).toHaveCount(0);
  await expect(page.getByText("Something broke")).toHaveCount(0);
}
