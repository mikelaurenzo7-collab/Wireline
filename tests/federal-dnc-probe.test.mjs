import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const scriptUrl = new URL("../scripts/probe-federal-dnc.mjs", import.meta.url).href;

function probe(payload, provider = "dncscrub") {
  const run = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `globalThis.fetch = async () => Response.json(${JSON.stringify(payload)});
       await import(${JSON.stringify(scriptUrl)});`,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        FEDERAL_DNC_API_URL: "https://dnc.example.test/check",
        FEDERAL_DNC_API_KEY: "test-only-login-id",
        FEDERAL_DNC_PROVIDER: provider,
      },
    },
  );
  if (run.error) throw run.error;
  return { status: run.status, result: JSON.parse(run.stdout) };
}

describe("federal DNC operator probe", () => {
  it.each(
    [[], [null], [{}], [{ ResultCode: "UNKNOWN" }], [{ ResultCode: 1 }]].map((payload) => ({
      payload,
    })),
  )("does not certify a malformed DNCScrub response: %j", ({ payload }) => {
    const { status, result } = probe(payload);
    expect(status).toBe(1);
    expect(result).toMatchObject({ probe_ok: false, listed: true, source: "error" });
  });

  it.each(["D", "P", "B", "I", "M", "L", "F", "V"])(
    "recognizes blocked result %s without reporting it callable",
    (ResultCode) => {
      const { status, result } = probe([{ ResultCode }]);
      expect(status).toBe(0);
      expect(result).toMatchObject({ probe_ok: true, listed: true, source: "vendor" });
    },
  );

  it("recognizes a callable response", () => {
    const { status, result } = probe([{ ResultCode: " c " }]);
    expect(status).toBe(0);
    expect(result).toMatchObject({ probe_ok: true, listed: false, source: "vendor" });
  });

  it.each(
    [null, {}, [], { listed: "false" }, { error: "Account not funded" }].map((payload) => ({
      payload,
    })),
  )("does not certify malformed generic JSON: %j", ({ payload }) => {
    const { status, result } = probe(payload, "generic");
    expect(status).toBe(1);
    expect(result).toMatchObject({ probe_ok: false, listed: true, source: "error" });
  });

  it.each([true, false])("accepts an explicit generic listed=%s result", (listed) => {
    const { status, result } = probe({ listed }, "generic");
    expect(status).toBe(0);
    expect(result).toMatchObject({ probe_ok: true, listed, source: "vendor" });
  });
});
