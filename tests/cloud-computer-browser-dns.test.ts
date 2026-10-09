import { describe, expect, it, vi } from "vitest";

import { CloudBrowserSession } from "../src/lib/cloud-computer/browser-session";

type Record = { address: string; ttl: number };
type Answer = Record[] | { code: string };

/** A session with a scripted resolver; nothing here touches a browser. */
function sessionWith(answers: { v4: Answer; v6: Answer }) {
  const Session = CloudBrowserSession as unknown as new (...args: unknown[]) => {
    urlIsPublic(raw: string): Promise<boolean>;
  };
  const session = new Session({}, {}, true) as unknown as {
    urlIsPublic(raw: string): Promise<boolean>;
    resolver: unknown;
    dnsHosts: Set<string>;
  };
  const answer = (value: Answer) =>
    Array.isArray(value) ? Promise.resolve(value) : Promise.reject(value);
  const resolve4 = vi.fn(() => answer(answers.v4));
  const resolve6 = vi.fn(() => answer(answers.v6));
  session.resolver = { resolve4, resolve6 };
  return { session, resolve4, answers };
}

describe("cloud browser address checks", () => {
  it("never caches a verdict past its record's TTL", async () => {
    const { session, resolve4 } = sessionWith({
      v4: [{ address: "93.184.216.34", ttl: 0 }],
      v6: { code: "ENODATA" },
    });
    expect(await session.urlIsPublic("https://rebind.example/")).toBe(true);
    expect(await session.urlIsPublic("https://rebind.example/")).toBe(true);
    // TTL 0: every check asks again, so a rebinding answer is seen at once.
    expect(resolve4).toHaveBeenCalledTimes(2);
  });

  it("treats a failed lookup of either family as not public", async () => {
    const { session } = sessionWith({
      v4: { code: "ETIMEOUT" },
      v6: [{ address: "2606:2800:220:1::1", ttl: 300 }],
    });
    expect(await session.urlIsPublic("https://split.example/")).toBe(false);
    const both = sessionWith({ v4: { code: "ENOTFOUND" }, v6: { code: "ENODATA" } });
    expect(await both.session.urlIsPublic("https://missing.example/")).toBe(false);
    const private4 = sessionWith({
      v4: [{ address: "10.0.0.5", ttl: 60 }],
      v6: { code: "ENODATA" },
    });
    expect(await private4.session.urlIsPublic("https://internal.example/")).toBe(false);
  });

  it("charges the lookup budget for new hosts only", async () => {
    const { session, resolve4 } = sessionWith({
      v4: [{ address: "93.184.216.34", ttl: 0 }],
      v6: { code: "ENODATA" },
    });
    expect(await session.urlIsPublic("https://known.example/")).toBe(true);
    for (let i = session.dnsHosts.size; i < 1_500; i += 1)
      session.dnsHosts.add(`host-${i}.example`);
    // A known host is re-checked even with the budget spent.
    expect(await session.urlIsPublic("https://known.example/")).toBe(true);
    expect(resolve4).toHaveBeenCalledTimes(2);
    expect(await session.urlIsPublic("https://new.example/")).toBe(false);
    expect(resolve4).toHaveBeenCalledTimes(2);
  });
});

describe("hosted browser default context", () => {
  const vendorDefaultContext = (browser: unknown) =>
    (
      CloudBrowserSession as unknown as {
        vendorDefaultContext(browser: unknown): Promise<unknown>;
      }
    ).vendorDefaultContext(browser);
  const browserWith = (urls: string[], cookies: unknown[] | Error = []) => {
    const pages = urls.map((url) => ({ url: () => url, close: vi.fn(async () => undefined) }));
    const context = {
      pages: () => pages,
      cookies: async () => {
        if (cookies instanceof Error) throw cookies;
        return cookies;
      },
      clearPermissions: vi.fn(async () => undefined),
    };
    return {
      contexts: () => [context],
      newBrowserCDPSession: async () => ({ send: async () => ({}), detach: async () => undefined }),
      context,
    };
  };

  it("uses a fresh vendor context", async () => {
    const browser = browserWith(["about:blank", "chrome://newtab/"]);
    expect(await vendorDefaultContext(browser)).toBe(browser.context);
  });

  it("refuses a context another session already used", async () => {
    await expect(
      vendorDefaultContext(browserWith(["https://bank.example/account"])),
    ).rejects.toThrow("already in use");
    await expect(
      vendorDefaultContext(browserWith(["about:blank"], [{ name: "session", value: "x" }])),
    ).rejects.toThrow("already in use");
  });

  it("refuses a context whose storage cannot be read", async () => {
    await expect(
      vendorDefaultContext(browserWith(["about:blank"], new Error("Storage.getCookies failed"))),
    ).rejects.toThrow("could not be checked");
  });
});
