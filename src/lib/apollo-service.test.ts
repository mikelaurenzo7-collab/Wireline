// @vitest-environment node
//
// Apollo.io service smoke tests.
// We mock global.fetch and assert (a) the request shape Apollo expects and
// (b) the parse path that maps an Apollo response into an ApolloContact.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("apollo-service.searchLeads", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.APOLLO_API_KEY;

  beforeEach(() => {
    process.env.APOLLO_API_KEY = "test-key-abc";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.APOLLO_API_KEY;
    else process.env.APOLLO_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("issues POST /mixed_people/search with the documented body shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [] }),
    });
    global.fetch = fetchMock as any;

    const { searchLeads } = await import("./apollo-service");
    await searchLeads({
      titles: ["CEO", "Owner"],
      industries: ["Real Estate"],
      states: ["TX", "FL"],
      employee_ranges: ["1,10"],
      limit: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.apollo.io/v1/mixed_people/search");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    // The API key must travel as x-api-key per Apollo's REST contract.
    expect(init.headers["x-api-key"]).toBe("test-key-abc");

    const body = JSON.parse(init.body);
    expect(body.person_titles).toEqual(["CEO", "Owner"]);
    // States are mapped to the Apollo location string format.
    expect(body.person_locations).toEqual(["TX, United States", "FL, United States"]);
    expect(body.organization_num_employees_ranges).toEqual(["1,10"]);
    expect(body.per_page).toBe(50);
    expect(body.page).toBe(1);
  });

  it("parses the response, filters out contacts without a phone, and maps fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        people: [
          {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            phone_numbers: [{ sanitized_number: "+15125550100" }],
            title: "Founder",
            organization: { name: "Analytical Engines" },
            linkedin_url: "https://linkedin.com/in/ada",
            city: "Austin",
            state: "TX",
          },
          // Should be filtered out — no phone.
          { first_name: "No", last_name: "Phone", email: "x@y", title: "x", organization: { name: "x" } },
        ],
      }),
    }) as any;

    const { searchLeads } = await import("./apollo-service");
    const out = await searchLeads({ titles: ["Founder"] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "+15125550100",
      title: "Founder",
      company: "Analytical Engines",
      linkedin_url: "https://linkedin.com/in/ada",
      city: "Austin",
      state: "TX",
    });
  });

  it("returns [] without calling fetch when APOLLO_API_KEY is unset", async () => {
    delete process.env.APOLLO_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    const { searchLeads } = await import("./apollo-service");
    const out = await searchLeads({ titles: ["CEO"] });
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
