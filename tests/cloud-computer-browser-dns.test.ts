import { describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";

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

describe("hosted browser context isolation", () => {
  const browserFixture = () => {
    const vendorPage = {
      url: () => "https://another-customer.example/account",
      setViewportSize: vi.fn(async () => undefined),
      on: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const vendorContext = {
      pages: vi.fn(() => [vendorPage]),
      cookies: vi.fn(async () => [{ name: "another-session", value: "private" }]),
    };
    const isolatedPage = {
      url: () => "about:blank",
      setViewportSize: vi.fn(async () => undefined),
      on: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const isolatedContext = {
      pages: vi.fn(() => [isolatedPage]),
      addInitScript: vi.fn(async () => undefined),
      route: vi.fn(async () => undefined),
      routeWebSocket: vi.fn(async () => undefined),
      on: vi.fn(),
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const browser = {
      contexts: vi.fn(() => [vendorContext]),
      newContext: vi.fn(async () => isolatedContext),
      on: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    return { browser, vendorContext, vendorPage, isolatedContext, isolatedPage };
  };

  it("allocates a fresh context without inspecting or reusing vendor state", async () => {
    const fixture = browserFixture();
    vi.spyOn(chromium, "connect").mockResolvedValue(fixture.browser as unknown as Browser);

    const session = await CloudBrowserSession.open({
      kind: "remote",
      wsEndpoint: "wss://browserless.example/playwright",
    });

    expect(fixture.browser.newContext).toHaveBeenCalledOnce();
    expect(fixture.browser.contexts).not.toHaveBeenCalled();
    expect(fixture.vendorContext.pages).not.toHaveBeenCalled();
    expect(fixture.vendorPage.setViewportSize).not.toHaveBeenCalled();
    expect(fixture.isolatedPage.setViewportSize).toHaveBeenCalledOnce();
    await session.close();
    expect(fixture.isolatedContext.close).toHaveBeenCalledOnce();
  });

  it("fails closed instead of falling back to a vendor default context", async () => {
    const fixture = browserFixture();
    fixture.browser.newContext.mockRejectedValue(new Error("isolated context unavailable"));
    vi.spyOn(chromium, "connect").mockResolvedValue(fixture.browser as unknown as Browser);

    await expect(
      CloudBrowserSession.open({
        kind: "remote",
        wsEndpoint: "wss://browserless.example/playwright",
      }),
    ).rejects.toThrow("isolated context unavailable");

    expect(fixture.browser.contexts).not.toHaveBeenCalled();
    expect(fixture.vendorContext.pages).not.toHaveBeenCalled();
    expect(fixture.browser.close).toHaveBeenCalledOnce();
  });
});
