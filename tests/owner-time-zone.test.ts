import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { chosenTimeZone, mostUsedTimeZone } from "../src/lib/owner-time-zone";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("the zone a new Bot starts in when its creator sent none", () => {
  it("treats the UTC column default as not chosen", () => {
    expect(chosenTimeZone("UTC")).toBeUndefined();
    expect(chosenTimeZone("Etc/UTC")).toBeUndefined();
    expect(chosenTimeZone("")).toBeUndefined();
    expect(chosenTimeZone(null)).toBeUndefined();
    expect(chosenTimeZone("Not/AZone")).toBeUndefined();
    expect(chosenTimeZone(" America/Chicago ")).toBe("America/Chicago");
  });

  it("uses the zone most of the owner's Bots use", () => {
    expect(
      mostUsedTimeZone(["UTC", "America/Chicago", "America/New_York", "America/Chicago", null]),
    ).toBe("America/Chicago");
  });

  it("breaks a tie the same way every time", () => {
    const zones = ["America/New_York", "America/Chicago"];
    expect(mostUsedTimeZone(zones)).toBe("America/Chicago");
    expect(mostUsedTimeZone([...zones].reverse())).toBe("America/Chicago");
  });

  it("leaves the default alone when the owner has chosen no zone yet", () => {
    expect(mostUsedTimeZone([])).toBeUndefined();
    expect(mostUsedTimeZone(["UTC", null, ""])).toBeUndefined();
  });

  it("is applied on every path that creates a Bot, and a sent zone still wins", () => {
    const web = read("src/routes/agent-routes-v2.ts");
    expect(web).toContain(
      "timezone ?? mostUsedTimeZone(existingAgents.map((agent) => agent.timezone))",
    );
    expect(web).toContain("...(startingTimeZone ? { timezone: startingTimeZone } : {}),");
    for (const path of ["src/routes/mobile-routes.ts", "src/lib/agent-draft-service.ts"]) {
      const source = read(path);
      expect(source, path).toContain(
        "const startingTimeZone = mostUsedTimeZone(existingAgents.map((agent) => agent.timezone));",
      );
      expect(source, path).toContain(
        "...(startingTimeZone ? { timezone: startingTimeZone } : {}),",
      );
    }
  });
});
