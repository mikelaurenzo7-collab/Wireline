import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<void>;
type Registered = { method: string; path: string; handlers: unknown[] };

const h = vi.hoisted(() => ({
  routes: [] as Registered[],
  authenticateUser: () => {},
  read: () => {},
  write: () => {},
  service: {
    listPeople: vi.fn(),
    createPerson: vi.fn(),
    getPerson: vi.fn(),
    updatePerson: vi.fn(),
    deletePerson: vi.fn(),
    findPersonByIdentifier: vi.fn(),
    addPersonIdentifier: vi.fn(),
    removePersonIdentifier: vi.fn(),
    addPersonNote: vi.fn(),
    deletePersonNote: vi.fn(),
    mergePeople: vi.fn(),
    unmergePerson: vi.fn(),
  },
  timeline: { getPersonTimeline: vi.fn(), listPeopleSuggestions: vi.fn() },
}));

vi.mock("express", () => {
  const register =
    (method: string) =>
    (path: string, ...handlers: unknown[]) => {
      h.routes.push({ method, path, handlers });
    };
  return {
    Router: () => ({
      get: register("get"),
      post: register("post"),
      patch: register("patch"),
      delete: register("delete"),
    }),
  };
});
vi.mock("../src/middleware/auth", () => ({ authenticateUser: h.authenticateUser }));
vi.mock("../src/middleware/api-rate-limits", () => ({
  peopleReadRateLimit: h.read,
  peopleWriteRateLimit: h.write,
}));
vi.mock("../src/lib/people/people-service", () => h.service);
vi.mock("../src/lib/people/people-timeline", () => h.timeline);
await import("../src/routes/people-routes");

function route(method: string, path: string): Handler {
  const found = h.routes.find((entry) => entry.method === method && entry.path === path);
  if (!found) throw new Error(`missing ${method} ${path}`);
  return found.handlers.at(-1) as Handler;
}

function response() {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const PERSON = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  for (const fn of [...Object.values(h.service), ...Object.values(h.timeline)]) fn.mockReset();
});

describe("People routes", () => {
  it("authenticates and rate-limits every route, with writes on the write bucket", () => {
    expect(h.routes.length).toBe(15);
    for (const entry of h.routes) {
      expect(entry.handlers[0], `${entry.method} ${entry.path}`).toBe(h.authenticateUser);
      // The lookup is a read that carries its value in a body, not a write.
      const reads = entry.method === "get" || entry.path === "/api/people/lookup";
      expect(entry.handlers[1], `${entry.method} ${entry.path}`).toBe(reads ? h.read : h.write);
      expect(entry.path.startsWith("/api/people")).toBe(true);
    }
  });

  it("declares the fixed paths before the person id so they are not read as ids", () => {
    const gets = h.routes.filter((entry) => entry.method === "get").map((entry) => entry.path);
    expect(gets.indexOf("/api/people/suggestions")).toBeLessThan(
      gets.indexOf("/api/people/:personId"),
    );
    expect(gets.indexOf("/api/people/lookup")).toBeLessThan(gets.indexOf("/api/people/:personId"));
  });

  it("acts only for the signed-in owner, never a user id from the body", async () => {
    h.service.createPerson.mockResolvedValue({ id: PERSON });
    const res = response();
    await route("post", "/api/people")(
      {
        user: { id: "owner" },
        body: { userId: "intruder", displayName: "Dana", identifiers: [] },
      },
      res,
    );
    expect(h.service.createPerson).toHaveBeenCalledExactlyOnceWith("owner", {
      displayName: "Dana",
      company: undefined,
      identifiers: [],
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("passes only the editable fields through to an update", async () => {
    h.service.updatePerson.mockResolvedValue({ id: PERSON });
    await route("patch", "/api/people/:personId")(
      {
        user: { id: "owner" },
        params: { personId: PERSON },
        body: { summary: "Prefers mornings", userId: "x", mergedIntoId: "y" },
      },
      response(),
    );
    expect(h.service.updatePerson).toHaveBeenCalledExactlyOnceWith("owner", PERSON, {
      displayName: undefined,
      company: undefined,
      status: undefined,
      summary: "Prefers mornings",
      customFields: undefined,
    });
  });

  it("merges the path person into the body target", async () => {
    h.service.mergePeople.mockResolvedValue({ id: "target" });
    await route("post", "/api/people/:personId/merge")(
      { user: { id: "owner" }, params: { personId: PERSON }, body: { targetId: "target" } },
      response(),
    );
    expect(h.service.mergePeople).toHaveBeenCalledExactlyOnceWith("owner", PERSON, "target");
    await expect(
      route("post", "/api/people/:personId/merge")(
        { user: { id: "owner" }, params: { personId: PERSON }, body: {} },
        response(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("takes the lookup value in the body, so a customer number stays out of the URL", async () => {
    h.service.findPersonByIdentifier.mockResolvedValue({ id: PERSON });
    const res = response();
    await route("post", "/api/people/lookup")(
      {
        user: { id: "owner" },
        body: { kind: "email", value: "dana@example.com", userId: "intruder" },
      },
      res,
    );
    expect(h.service.findPersonByIdentifier).toHaveBeenLastCalledWith(
      "owner",
      "email",
      "dana@example.com",
    );
    expect(res.json).toHaveBeenCalledWith({ person: { id: PERSON } });
    await expect(
      route("post", "/api/people/lookup")(
        { user: { id: "owner" }, body: { kind: "ssn", value: "x" } },
        response(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("looks up only phones and emails", async () => {
    h.service.findPersonByIdentifier.mockResolvedValue(null);
    const res = response();
    await route("get", "/api/people/lookup")(
      { user: { id: "owner" }, query: { kind: "phone", value: "3125550101" } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ person: null });
    await expect(
      route("get", "/api/people/lookup")(
        { user: { id: "owner" }, query: { kind: "ssn", value: "x" } },
        response(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("People store availability", () => {
  it("answers 503 PEOPLE_UNAVAILABLE before migration 0197 is applied", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/people/people-service")>(
      "../src/lib/people/people-service",
    );
    expect(() =>
      actual.rethrowPeopleStoreError(
        Object.assign(new Error("relation missing"), { code: "42P01" }),
      ),
    ).toThrow(expect.objectContaining({ status: 503, code: "PEOPLE_UNAVAILABLE" }));
    const wrapped = new Error("query failed", {
      cause: Object.assign(new Error("relation missing"), { code: "42P01" }),
    });
    expect(() => actual.rethrowPeopleStoreError(wrapped)).toThrow(
      expect.objectContaining({ code: "PEOPLE_UNAVAILABLE" }),
    );
    const other = Object.assign(new Error("boom"), { code: "23505" });
    expect(() => actual.rethrowPeopleStoreError(other)).toThrow(other);
  });

  it("validates custom fields as a small flat set of text values", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/people/people-service")>(
      "../src/lib/people/people-service",
    );
    expect(actual.parseCustomFields({ Gate: "Code 4412", Dog: "", Visits: 3 })).toEqual({
      Gate: "Code 4412",
      Visits: "3",
    });
    expect(() => actual.parseCustomFields(["a"])).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => actual.parseCustomFields({ nested: { a: 1 } })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});

describe("People identifier sources", () => {
  it("keeps the bot source for Bot actions and lets owners record where they saw a value", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/people/people-service")>(
      "../src/lib/people/people-service",
    );
    expect(
      actual.parseIdentifierInput({ kind: "phone", value: "3125550101", source: "bot" }, "owner"),
    ).toMatchObject({ value: "+13125550101", source: "owner", verified: false });
    expect(
      actual.parseIdentifierInput({ kind: "email", value: "a@b.co", source: "call" }, "owner"),
    ).toMatchObject({ source: "call", verified: false });
    expect(
      actual.parseIdentifierInput({ kind: "email", value: "a@b.co", source: "bot" }, "bot"),
    ).toMatchObject({ source: "bot" });
    expect(() =>
      actual.parseIdentifierInput({ kind: "email", value: "a@b.co", source: "crm" }, "owner"),
    ).toThrow(expect.objectContaining({ status: 400 }));
  });
});
