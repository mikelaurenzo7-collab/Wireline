import { expect, test, type Page } from "@playwright/test";

const DANA = "11111111-1111-4111-8111-111111111111";
const DUPLICATE = "22222222-2222-4222-8222-222222222222";

function person(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: "Dana Ruiz",
    company: "Ruiz Roofing",
    status: "active",
    summary: null,
    customFields: {},
    mergedIntoId: null,
    createdAt: "2026-11-20T15:00:00.000Z",
    updatedAt: "2026-11-25T15:00:00.000Z",
    identifiers: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        personId: id,
        kind: "phone",
        value: "+13125550101",
        source: "call",
        verified: false,
        createdAt: "2026-11-20T15:00:00.000Z",
      },
    ],
    mergedPeople: [],
    ...overrides,
  };
}

async function mockPeople(page: Page) {
  const created: unknown[] = [];
  const notes: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/people" && method === "GET") {
      await route.fulfill({ json: { people: [person(DANA)], nextCursor: null } });
      return;
    }
    if (path === "/api/people" && method === "POST") {
      const body = request.postDataJSON();
      created.push(body);
      if (body.identifiers?.some((entry: { value: string }) => entry.value.includes("0101"))) {
        await route.fulfill({
          status: 409,
          json: {
            error: "That phone number already belongs to someone else in People.",
            code: "PERSON_IDENTIFIER_CONFLICT",
            details: { personId: DANA },
          },
        });
        return;
      }
      await route.fulfill({
        status: 201,
        json: { person: person(DUPLICATE, { displayName: body.displayName, identifiers: [] }) },
      });
      return;
    }
    if (path === "/api/people/suggestions") {
      await route.fulfill({
        json: {
          suggestions: [
            {
              kind: "email",
              value: "jo@example.com",
              nameHint: "Jo Ng",
              lastSeenAt: new Date().toISOString(),
              sources: ["email"],
              count: 2,
            },
          ],
        },
      });
      return;
    }
    if (path === `/api/people/${DANA}`) {
      await route.fulfill({ json: { person: person(DANA) } });
      return;
    }
    if (path === `/api/people/${DUPLICATE}`) {
      await route.fulfill({
        json: { person: person(DUPLICATE, { displayName: "Jo Ng", identifiers: [] }) },
      });
      return;
    }
    if (path.endsWith("/timeline")) {
      await route.fulfill({
        json: {
          items: [
            {
              id: "call:9",
              source: "call",
              at: "2026-11-24T15:00:00.000Z",
              direction: "inbound",
              title: "Inbound call · 2 min",
              preview: "Asked about a Friday install.",
              agentId: null,
              demo: false,
              ref: { kind: "call", id: "9" },
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (path.endsWith("/notes") && method === "POST") {
      notes.push(request.postDataJSON());
      await route.fulfill({ status: 201, json: { note: { id: "note-1" } } });
      return;
    }
    const json =
      path === "/api/auth/session"
        ? {
            user: {
              id: "people-owner",
              email: "owner@example.test",
              full_name: "People Owner",
              email_verified_at: "2026-09-27T00:00:00Z",
            },
          }
        : path === "/api/agents"
          ? { agents: [] }
          : path === "/api/billing/status"
            ? {
                subscription: null,
                agent_count: 0,
                channel_entitlements: {
                  plan_id: "personal",
                  subscription_status: "none",
                  channels: [],
                  is_owner: false,
                },
              }
            : { accounts: [], data: [], numbers: [], integrations: [] };
    await route.fulfill({ json });
  });
  return { created, notes };
}

test("People lists the customer record, opens a timeline and saves a note", async ({ page }) => {
  const { notes } = await mockPeople(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/people");
  const list = page.getByRole("list", { name: "People list" });
  await expect(list.getByRole("link", { name: /Dana Ruiz/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Contacts Not in People" })).toBeVisible();

  await list.getByRole("link", { name: /Dana Ruiz/ }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${DANA}$`));
  await expect(page.getByRole("heading", { name: "Dana Ruiz", level: 2 })).toBeVisible();
  const detail = page.getByRole("article", { name: "Dana Ruiz" });
  await expect(detail.getByText("+1 (312) 555-0101")).toBeVisible();
  const timeline = page.getByRole("list", { name: "Timeline for Dana Ruiz" });
  await expect(timeline.getByText("Asked about a Friday install.")).toBeVisible();

  await page.getByRole("textbox", { name: "Add a note" }).fill("Prefers texts after 5pm.");
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect.poll(() => notes).toEqual([{ body: "Prefers texts after 5pm." }]);
});

test("adding someone whose phone is already saved explains the conflict and links to them", async ({
  page,
}) => {
  await mockPeople(page);
  await page.goto("/people");
  await page.getByRole("button", { name: "Add Person" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Person" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Dana R.");
  await dialog.getByRole("textbox", { name: "Phone" }).fill("312-555-0101");
  await dialog.getByRole("button", { name: "Save Person" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already belongs to someone else");
  await dialog.getByRole("link", { name: "Open Them" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${DANA}$`));
});

test("a recent contact saves with its name and email prefilled", async ({ page }) => {
  const { created } = await mockPeople(page);
  await page.goto("/people");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Person" });
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Jo Ng");
  await expect(dialog.getByRole("textbox", { name: "Email" })).toHaveValue("jo@example.com");
  await dialog.getByRole("button", { name: "Save Person" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${DUPLICATE}$`));
  expect(created).toEqual([
    {
      displayName: "Jo Ng",
      identifiers: [{ kind: "email", value: "jo@example.com", source: "email" }],
    },
  ]);
});

test("People stays usable at phone width", async ({ page }) => {
  await mockPeople(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/people/${DANA}`);
  await expect(page.getByRole("heading", { name: "Dana Ruiz", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "All People" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("link", { name: "All People" }).click();
  await expect(page.getByRole("list", { name: "People list" })).toBeVisible();
});
