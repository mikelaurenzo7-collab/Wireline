import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({ log: { warn: h.warn } }));
vi.mock("../src/lib/people/people-service", () => ({ findPeopleByIdentifiers: vi.fn() }));

const { withPersonLabels } = await import("../src/lib/people/people-labels");

type Row = { id: number; customerNumber: string | null };
const rows: Row[] = [
  { id: 1, customerNumber: "+12025550100" },
  { id: 2, customerNumber: "+12025550101" },
  { id: 3, customerNumber: null },
];

beforeEach(() => h.warn.mockReset());

// Nov 26 surface audit: Calls and Texts lists showed bare numbers even for
// customers saved in People. One batched lookup labels a whole page.
describe("withPersonLabels", () => {
  it("names each row whose number People holds, in one lookup", async () => {
    const lookup = vi.fn(
      async () => new Map([["+12025550100", { id: "p-1", displayName: "  Dana Ruiz " }]]),
    );
    const labelled = await withPersonLabels(
      "user-1",
      rows,
      "phone",
      (row) => row.customerNumber,
      lookup,
    );

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("user-1", "phone", ["+12025550100", "+12025550101", null]);
    expect(labelled).toEqual([
      { id: 1, customerNumber: "+12025550100", personId: "p-1", personName: "Dana Ruiz" },
      { id: 2, customerNumber: "+12025550101", personId: null, personName: null },
      { id: 3, customerNumber: null, personId: null, personName: null },
    ]);
  });

  it("keeps the person id but no name when the saved person has none", async () => {
    const lookup = vi.fn(async () => new Map([["+12025550101", { id: "p-2", displayName: null }]]));
    const [, second] = await withPersonLabels(
      "user-1",
      rows,
      "phone",
      (row) => row.customerNumber,
      lookup,
    );
    expect(second).toMatchObject({ personId: "p-2", personName: null });
  });

  it("still returns the list, unlabelled, when People cannot answer", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("People isn't available on this workspace yet.");
    });
    const labelled = await withPersonLabels(
      "user-1",
      rows,
      "phone",
      (row) => row.customerNumber,
      lookup,
    );
    expect(labelled.map((row) => row.personName)).toEqual([null, null, null]);
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it("does not ask People about an empty page", async () => {
    const lookup = vi.fn(async () => new Map());
    expect(await withPersonLabels("user-1", [], "phone", () => null, lookup)).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });
});
