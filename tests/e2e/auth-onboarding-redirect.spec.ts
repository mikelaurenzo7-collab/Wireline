import { expect, test } from "@playwright/test";

const AUTH_REDIRECT_KEY = "wireline.auth.redirect";
const FRESH_SIGNUP_KEY = "wireline_fresh_signup";

test("direct account-entry routes recognize an existing session", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agents: [], accounts: [], data: [] }),
    });
  });
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "existing-user", email: "existing@example.test", full_name: "Existing User" },
      }),
    });
  });

  await page.goto("/signin");
  await expect(page).toHaveURL(/\/overview$/);
});

test("settings sign-out followed by direct personal signup always enters Fast Start", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agents: [], accounts: [], data: [] }),
    });
  });
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "existing-user", email: "existing@example.test", full_name: "Existing User" },
      }),
    });
  });
  await page.route("**/api/auth/signout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/auth/signup", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "fresh-user", email: "fresh@example.test", full_name: "Fresh User" },
      }),
    });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin(?:\?.*)?$/);

  // Model the redirect produced if the protected settings route wins the
  // sign-out navigation race.
  await page.evaluate(({ redirectKey }) => localStorage.setItem(redirectKey, "/settings"), {
    redirectKey: AUTH_REDIRECT_KEY,
  });

  await page.goto("/signup");
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTH_REDIRECT_KEY)).toBeNull();

  await page.getByRole("button", { name: /Personal/ }).click();
  await page.getByLabel("Email address").fill("fresh@example.test");
  await page.getByLabel("Password", { exact: true }).fill("ValidPassword123!");
  await page.locator("#auth-terms").check();

  // The destination resolver remains safe even if another in-flight auth
  // transition restores the stale redirect after the signup effect clears it.
  await page.evaluate(({ redirectKey }) => localStorage.setItem(redirectKey, "/settings"), {
    redirectKey: AUTH_REDIRECT_KEY,
  });

  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page).toHaveURL(/\/studio\?create=1$/);
  expect(
    await page.evaluate(
      ({ redirectKey, freshKey }) => ({
        redirect: localStorage.getItem(redirectKey),
        fresh: sessionStorage.getItem(freshKey),
      }),
      { redirectKey: AUTH_REDIRECT_KEY, freshKey: FRESH_SIGNUP_KEY },
    ),
  ).toEqual({ redirect: null, fresh: null });
});
