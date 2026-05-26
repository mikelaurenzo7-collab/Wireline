import { test, expect } from '@playwright/test';

test.describe('Triage Inbox', () => {
  test('Triage page requires authentication', async ({ page }) => {
    await page.goto('/triage');
    
    // Expect to be redirected to login
    await expect(page).toHaveURL(/.*\/login.*/);
  });
});
