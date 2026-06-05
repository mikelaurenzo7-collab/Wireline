import { describe, expect, it } from "vitest";
import { dedupeDirectorArtifacts } from "./director-artifact-dedupe";

describe("dedupeDirectorArtifacts", () => {
  it("keeps the newest artifact per name and type", () => {
    const older = new Date("2026-06-01T12:00:00Z");
    const newer = new Date("2026-06-05T12:00:00Z");
    const deduped = dedupeDirectorArtifacts([
      {
        name: "logo-concept-2.svg",
        artifactType: "svg",
        createdAt: older,
        id: "1",
      },
      {
        name: "logo-concept-2.svg",
        artifactType: "svg",
        createdAt: newer,
        id: "2",
      },
      {
        name: "website.md",
        artifactType: "markdown",
        createdAt: newer,
        id: "3",
      },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((a) => a.id === "2")).toBeTruthy();
    expect(deduped[0]?.id).toBe("3");
  });
});
