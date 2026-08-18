import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/AdminSettings.tsx"),
  "utf8",
);

describe("AdminSettings initial-load contract", () => {
  it("loads the team endpoint once and treats certification gating as an empty roster", () => {
    expect(source.match(/authFetch\("\/api\/team"\)/g)).toHaveLength(1);
    expect(source).not.toContain("fetchTeam();");
    expect(source).toContain('teamRes.status === 503');
    expect(source).toContain('teamJson?.code === "SHARED_WORKSPACES_NOT_CERTIFIED"');
    expect(source).toContain("setTeamMembers([])");
  });

  it("always releases the primary loading state after a failed response", () => {
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );
    const earlyReturn = loader.indexOf(
      'toastError("Settings unavailable", "Could not load settings. Please refresh.")',
    );
    const finallyBlock = loader.indexOf("} finally {");
    const release = loader.indexOf("setIsLoading(false)", finallyBlock);

    expect(earlyReturn).toBeGreaterThan(-1);
    expect(finallyBlock).toBeGreaterThan(earlyReturn);
    expect(release).toBeGreaterThan(finallyBlock);
  });
});
