import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outcome evidence loop", () => {
  const eventClient = read("src/lib/product-event-client.ts");

  it("counts outcome review only after explicit evidence interaction", () => {
    expect(eventClient).toContain('if (input.event === "outcome_reviewed")');
    expect(eventClient).toContain("return input.metadata?.reviewed === true;");
  });
});
