import { describe, expect, it, vi } from "vitest";
import {
  assertPasswordIsSafe,
  checkPwnedPassword,
  PasswordRejectedError,
  resolvePasswordBreachCheckMode,
} from "./breached-passwords";

const PASSWORD_SHA1_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

describe("breached-passwords", () => {
  it("uses the Pwned Passwords range API without sending the full password hash", async () => {
    const fetchMock = vi.fn(async () => new Response(`${PASSWORD_SHA1_SUFFIX}:3861493\r\n`));

    const result = await checkPwnedPassword("password", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({ checked: true, breached: true, prevalence: 3861493 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(String(url)).not.toContain(PASSWORD_SHA1_SUFFIX);
    expect((init?.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("ignores padding and non-matching suffixes", async () => {
    const fetchMock = vi.fn(
      async () => new Response("00000000000000000000000000000000000:0\r\nABCDEF:1\r\n"),
    );

    await expect(
      checkPwnedPassword("CorrectHorseBatteryStaple9", {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ checked: true, breached: false, prevalence: 0 });
  });

  it("rejects known-compromised passwords in enforce mode", async () => {
    const fetchMock = vi.fn(async () => new Response(`${PASSWORD_SHA1_SUFFIX}:10\r\n`));

    await expect(
      assertPasswordIsSafe("password", {
        fetchImpl: fetchMock as unknown as typeof fetch,
        mode: "enforce",
      }),
    ).rejects.toMatchObject({
      name: "PasswordRejectedError",
      code: "PASSWORD_COMPROMISED",
      httpStatus: 400,
    } satisfies Partial<PasswordRejectedError>);
  });

  it("fails closed in enforce mode when the breach check is unavailable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      assertPasswordIsSafe("CorrectHorseBatteryStaple9", {
        fetchImpl: fetchMock as unknown as typeof fetch,
        mode: "enforce",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_SECURITY_CHECK_UNAVAILABLE",
      httpStatus: 503,
    });
  });

  it("does not block non-production flows when the breach service is unavailable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      assertPasswordIsSafe("CorrectHorseBatteryStaple9", {
        fetchImpl: fetchMock as unknown as typeof fetch,
        mode: "warn",
      }),
    ).resolves.toMatchObject({
      checked: false,
      breached: false,
      error: "network down",
    });
  });

  it("defaults to enforce on Vercel and off under tests", () => {
    expect(resolvePasswordBreachCheckMode({ NODE_ENV: "test" })).toBe("off");
    expect(resolvePasswordBreachCheckMode({ VERCEL: "1" })).toBe("enforce");
    expect(resolvePasswordBreachCheckMode({ WIRELINE_PASSWORD_BREACH_CHECK: "warn" })).toBe("warn");
  });
});
