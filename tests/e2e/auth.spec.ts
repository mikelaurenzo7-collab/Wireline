import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test('Login page loads and has correct title', async ({ page }) => {
    await page.goto('/login');
    
    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Wireline/);
    
    // Expect an email input to be visible
    const emailInput = page.getByPlaceholder(/name@company.com/i).first();
    await expect(emailInput).toBeVisible();
    
    // Expect a submit button to be visible
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    await expect(submitBtn).toBeVisible();
  });

  test('Registration page loads and contains pricing link', async ({ page }) => {
    await page.goto('/register');
    
    // Check if the registration form is present
    const emailInput = page.getByPlaceholder(/name@company.com/i).first();
    await expect(emailInput).toBeVisible();
    
    // Check for "Sign up" button
    const submitBtn = page.getByRole('button', { name: /create account/i });
    await expect(submitBtn).toBeVisible();
  });
});
