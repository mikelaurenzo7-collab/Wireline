import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Download } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CloudBrowserSession } from "../src/lib/cloud-computer/browser-session";
// @ts-expect-error -- shared .mjs helper without type declarations
import { resolvePreinstalledChromium } from "../scripts/lib/resolve-preinstalled-chromium.mjs";

const installed = resolvePreinstalledChromium() as string | undefined;
const executablePath = installed && existsSync(installed) ? installed : chromium.executablePath();
const available = existsSync(executablePath);
const LOGIN = `<!doctype html><html><body>
  <label>Username<input id="username" autocomplete="username"></label>
  <label>Password<input id="password" type="password" autocomplete="current-password"></label>
  <p id="echo"></p><button id="download" type="button">Download report</button>
  <script>
    document.querySelector('#password').addEventListener('input', event => document.querySelector('#echo').textContent = event.target.value);
    document.querySelector('#download').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['synthetic report'], {type:'text/plain'}));
      a.download = 'report.txt'; a.click();
    };
  </script></body></html>`;

describe.skipIf(!available)("owner browser tools (real Chromium, synthetic sites)", () => {
  let session: CloudBrowserSession;
  let privateProbe: Server;
  let privateProbeUrl = "";
  let privateProbeHits = 0;

  beforeAll(async () => {
    privateProbe = createServer((_request, response) => {
      privateProbeHits += 1;
      response.setHeader("Content-Disposition", 'attachment; filename="private-probe.txt"');
      response.end("synthetic private probe");
    });
    await new Promise<void>((resolve) => privateProbe.listen(0, "127.0.0.1", resolve));
    privateProbeUrl = `http://127.0.0.1:${(privateProbe.address() as AddressInfo).port}/private-probe.txt`;
  });

  afterAll(async () => {
    privateProbe.closeAllConnections();
    await new Promise<void>((resolve) => privateProbe.close(() => resolve()));
  });

  beforeEach(async () => {
    session = await CloudBrowserSession.open({ kind: "local", executablePath });
    const page = session.activePage();
    await page.route(/^https:\/\/example\.(?:com|org)\//, (route) =>
      route.fulfill({ contentType: "text/html", body: LOGIN }),
    );
    await session.executeOwnerInput({
      kind: "navigate",
      url: "https://example.com/login?token=synthetic-private-token",
    });
  }, 60_000);

  afterEach(async () => {
    await session?.close();
  });

  it("opens, switches, and closes actual tabs while preserving the last tab", async () => {
    const original = session.ownerTabs()[0].id;
    await session.executeOwnerInput({ kind: "new_tab" });
    const second = session.ownerTabs().find((tab) => tab.active)!.id;
    expect(second).not.toBe(original);
    expect(session.ownerTabs()).toHaveLength(2);
    await session.executeOwnerInput({ kind: "switch_tab", tabId: original });
    await session.executeOwnerInput({ kind: "close_tab", tabId: second });
    expect(session.ownerTabs()).toHaveLength(1);
    await expect(session.executeOwnerInput({ kind: "close_tab", tabId: original })).rejects.toThrow(
      "last browser tab",
    );
    await expect(
      session.executeOwnerInput({ kind: "new_tab", url: "http://127.0.0.1/" }),
    ).rejects.toThrow();
    expect(session.unexpectedCloseReason).toBeNull();
  });

  it("keeps transient history free of bearer paths, query strings, and fragments", async () => {
    expect(session.ownerHistory()).toMatchObject([{ url: "https://example.com/" }]);
    await session.executeOwnerInput({
      kind: "navigate",
      url: "https://example.com/pricing?code=private#token",
    });
    expect(session.ownerHistory().at(-1)?.url).toBe("https://example.com/pricing");
    expect(JSON.stringify(session.ownerHistory())).not.toContain("private");
    await session.executeOwnerInput({ kind: "history", action: "back" });
    expect(session.activeUrl()).toContain("/login");
    await session.executeOwnerInput({ kind: "history", action: "forward" });
    expect(session.activeUrl()).toContain("/pricing");
  });

  it("imports cookies only into this context and redacts echoed values after clearing", async () => {
    await session.executeOwnerInput({
      kind: "import_cookies",
      cookies: [
        {
          name: "synthetic_session",
          value: "cookie-private-731",
          url: "https://example.com/",
          secure: true,
        },
      ],
    });
    const page = session.activePage();
    expect(await page.evaluate(() => document.cookie)).toContain(
      "synthetic_session=cookie-private-731",
    );
    await page.evaluate(() => (document.querySelector("#echo")!.textContent = document.cookie));
    expect(JSON.stringify((await session.execute("get_page_text", {})).content)).not.toContain(
      "cookie-private-731",
    );
    await session.executeOwnerInput({ kind: "clear_cookies" });
    expect(await page.evaluate(() => document.cookie)).toBe("");
    expect(JSON.stringify((await session.execute("get_page_text", {})).content)).not.toContain(
      "cookie-private-731",
    );
    await expect(
      session.executeOwnerInput({
        kind: "import_cookies",
        cookies: [{ name: "x", value: "private", url: "https://127.0.0.1/", secure: true }],
      }),
    ).rejects.toThrow();
  });

  it("fills a saved session login only at its exact HTTPS origin and never exposes its values", async () => {
    await session.executeOwnerInput({
      kind: "save_login",
      origin: "https://example.com",
      username: "synthetic-owner",
      password: "private-password-731",
    });
    expect(session.ownerSavedLogins()).toEqual([
      { origin: "https://example.com", label: "example.com" },
    ]);
    expect(JSON.stringify(session.ownerSavedLogins())).not.toContain("private-password");
    await session.executeOwnerInput({ kind: "fill_login", origin: "https://example.com" });
    expect(await session.activePage().locator("#username").inputValue()).toBe("synthetic-owner");
    expect(await session.activePage().locator("#password").inputValue()).toBe(
      "private-password-731",
    );
    expect(JSON.stringify((await session.execute("get_page_text", {})).content)).not.toContain(
      "private-password-731",
    );
    const ownerFrame = await session.frame();
    expect((await session.modelFrame())?.equals(ownerFrame!)).toBe(false);
    await session.executeOwnerInput({ kind: "navigate", url: "https://example.org/login" });
    await expect(
      session.executeOwnerInput({ kind: "fill_login", origin: "https://example.org" }),
    ).rejects.toThrow("No login");
    expect(await session.activePage().locator("#password").inputValue()).toBe("");
    await session.executeOwnerInput({ kind: "navigate", url: "https://example.com/login" });
    await session.executeOwnerInput({ kind: "clear_saved_login", origin: "https://example.com" });
    expect(session.ownerSavedLogins()).toEqual([]);
    await expect(
      session.executeOwnerInput({ kind: "fill_login", origin: "https://example.com" }),
    ).rejects.toThrow("No login");
  });

  it("refuses ambiguous password/reset forms and clears logins and files when closed", async () => {
    await session.executeOwnerInput({
      kind: "save_login",
      origin: "https://example.com",
      username: "synthetic-owner",
      password: "private-password",
    });
    await session
      .activePage()
      .locator("#password")
      .evaluate((input) => input.setAttribute("autocomplete", "new-password"));
    await expect(
      session.executeOwnerInput({ kind: "fill_login", origin: "https://example.com" }),
    ).rejects.toThrow("one sign-in form");
    expect(await session.activePage().locator("#password").inputValue()).toBe("");
    await session
      .activePage()
      .locator("#password")
      .evaluate((input) => input.setAttribute("autocomplete", "current-password"));
    await session
      .activePage()
      .evaluate(() => document.body.insertAdjacentHTML("beforeend", '<input type="password">'));
    await expect(
      session.executeOwnerInput({ kind: "fill_login", origin: "https://example.com" }),
    ).rejects.toThrow("one sign-in form");
    await session.close();
    expect(session.ownerSavedLogins()).toEqual([]);
    expect(session.ownerHistory()).toEqual([]);
    expect(session.ownerDownloads()).toEqual([]);
  });

  it("refuses stale owner-origin intent for saving, filling, and clearing logins", async () => {
    await session.executeOwnerInput({
      kind: "save_login",
      origin: "https://example.com",
      username: "synthetic-owner",
      password: "private-password",
    });
    await session.executeOwnerInput({ kind: "navigate", url: "https://example.org/login" });
    await expect(
      session.executeOwnerInput({
        kind: "save_login",
        origin: "https://example.com",
        username: "synthetic-owner",
        password: "wrong-site-password",
      }),
    ).rejects.toThrow("site changed");
    await expect(
      session.executeOwnerInput({ kind: "fill_login", origin: "https://example.com" }),
    ).rejects.toThrow("site changed");
    await expect(
      session.executeOwnerInput({ kind: "clear_saved_login", origin: "https://example.com" }),
    ).rejects.toThrow("site changed");
    expect(await session.activePage().locator("#password").inputValue()).toBe("");
    expect(session.ownerSavedLogins()).toEqual([
      { origin: "https://example.com", label: "example.com" },
    ]);
  });

  it("retains actual owner downloads and erases a subsequent Bot-triggered download", async () => {
    const box = await session.activePage().locator("#download").boundingBox();
    await session.executeOwnerInput({ kind: "click", x: box!.x + 2, y: box!.y + 2 });
    await vi.waitFor(() => expect(session.ownerDownloads()).toHaveLength(1));
    const metadata = session.ownerDownloads()[0];
    expect(metadata).toMatchObject({ name: "report.txt", bytes: 16 });
    expect(session.ownerDownload(metadata.id)?.data.toString()).toBe("synthetic report");
    const capture = vi.spyOn(
      session as unknown as {
        captureOwnerDownload(download: Download): Promise<void>;
      },
      "captureOwnerDownload",
    );
    const botDownload = session.activePage().waitForEvent("download");
    await session.execute("left_click", {
      target: { type: "coordinate", x: box!.x + 2, y: box!.y + 2 },
    });
    const rejected = await botDownload;
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(rejected));
    await capture.mock.results[0].value;
    // A tiny blob may finish before cancel reaches Chromium. Erasure and lack
    // of readable bytes are the requirement, regardless of its failure label.
    await expect(rejected.createReadStream()).rejects.toThrow(/canceled|deleted|has been closed/i);
    expect(session.isClosed).toBe(false);
    expect(await session.activePage().locator("#download").count()).toBe(1);
    expect(session.ownerDownloads()).toHaveLength(1);
    await session.close();
    expect(session.ownerDownload(metadata.id)).toBeNull();
  });

  it("handles an owner navigation that returns an actual attachment instead of a document", async () => {
    await session.activePage().route("https://example.com/report.txt", (route) =>
      route.fulfill({
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
        body: "synthetic attachment",
      }),
    );
    await session.executeOwnerInput({ kind: "navigate", url: "https://example.com/report.txt" });
    await vi.waitFor(() => expect(session.ownerDownloads()).toHaveLength(1));
    expect(session.ownerDownload(session.ownerDownloads()[0].id)?.data.toString()).toBe(
      "synthetic attachment",
    );
  });

  it("refuses an attachment redirect to a private address before retaining its bytes", async () => {
    const before = privateProbeHits;
    await session.activePage().route("https://example.com/redirect-download", (route) =>
      route.fulfill({
        status: 302,
        headers: {
          Location: privateProbeUrl,
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
      }),
    );
    const urls: string[] = [];
    session.activePage().on("download", (download) => urls.push(download.url()));
    await session
      .executeOwnerInput({ kind: "navigate", url: "https://example.com/redirect-download" })
      .catch(() => undefined);
    await vi.waitFor(() => expect(session.ownerDownloads()).toEqual([]));
    expect(privateProbeHits - before, `native download URLs: ${JSON.stringify(urls)}`).toBe(0);
    expect(session.ownerDownload("download-1")).toBeNull();
  });

  it("refuses an attachment redirect to a non-web URL", async () => {
    await session.activePage().route("https://example.com/non-web-download", (route) =>
      route.fulfill({
        status: 302,
        headers: {
          Location: "file:///synthetic-private-probe.txt",
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
      }),
    );
    await expect(
      session.executeOwnerInput({ kind: "navigate", url: "https://example.com/non-web-download" }),
    ).rejects.toThrow();
    expect(session.ownerDownloads()).toEqual([]);
  });

  it("blocks redirected fetches before any private network contact", async () => {
    const page = session.activePage();
    await page.route("https://example.com/fetch-redirect", (route) =>
      route.fulfill({
        status: 302,
        headers: { Location: privateProbeUrl },
      }),
    );
    const before = privateProbeHits;
    const result = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/fetch-redirect");
        return "reached";
      } catch {
        return "blocked";
      }
    });
    expect(result).toBe("blocked");
    expect(privateProbeHits).toBe(before);
    expect(session.isClosed).toBe(false);
  });

  it("guards an actual out-of-process frame over the native remote protocol", async () => {
    await session.close();
    const server = await chromium.launchServer({
      executablePath,
      headless: true,
      args: ["--site-per-process"],
    });
    try {
      session = await CloudBrowserSession.open({ kind: "remote", wsEndpoint: server.wsEndpoint() });
      const page = session.activePage();
      await page.route("https://example.com/login", (route) =>
        route.fulfill({ contentType: "text/html", body: LOGIN }),
      );
      await session.executeOwnerInput({ kind: "navigate", url: "https://example.com/login" });
      await page.route("https://example.org/frame", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<p id="ready">Synthetic frame</p>',
        }),
      );
      await page.route("https://example.org/frame-redirect", (route) =>
        route.fulfill({
          status: 302,
          headers: { Location: privateProbeUrl },
        }),
      );
      await page.evaluate(() => {
        const frame = document.createElement("iframe");
        frame.src = "https://example.org/frame";
        document.body.append(frame);
      });
      const frame = page.frameLocator("iframe");
      await frame.locator("#ready").waitFor();
      // This is genuinely a separate Chromium target, rather than only an
      // in-process iframe that the top page's Fetch domain already covers.
      const childFrame = page.frames().find((item) => item.url() === "https://example.org/frame")!;
      const childProbe = await page.context().newCDPSession(childFrame);
      await childProbe.detach();
      const before = privateProbeHits;
      const blockedBefore = session.blockedRequests;
      await frame.locator("body").evaluate(() => {
        location.href = "https://example.org/frame-redirect";
      });
      await vi.waitFor(() => expect(session.blockedRequests).toBeGreaterThan(blockedBefore));
      expect(privateProbeHits).toBe(before);
      expect(session.isClosed).toBe(false);

      // Removing a real child target must cancel its suspended DNS work, not
      // fail the remaining top-level page or continue a late positive verdict.
      await page.evaluate(() => document.querySelector("iframe")!.remove());
      await page.evaluate(() => {
        const frame = document.createElement("iframe");
        frame.src = "https://example.org/frame";
        document.body.append(frame);
      });
      await frame.locator("#ready").waitFor();
      const realAllowed = session.urlIsPublic.bind(session);
      let releaseDns!: (allowed: boolean) => void;
      let sawDns!: () => void;
      const checkingDns = new Promise<void>((resolve) => {
        sawDns = resolve;
      });
      vi.spyOn(session, "urlIsPublic").mockImplementation((url) => {
        if (url === "https://example.org/hold") {
          sawDns();
          return new Promise<boolean>((resolve) => {
            releaseDns = resolve;
          });
        }
        return realAllowed(url);
      });
      let forwarded = 0;
      await page.route("https://example.org/hold", (route) => {
        forwarded += 1;
        return route.fulfill({ body: "synthetic late content" });
      });
      await frame.locator("body").evaluate(() => {
        void fetch("https://example.org/hold").catch(() => undefined);
      });
      await checkingDns;
      await page.evaluate(() => document.querySelector("iframe")!.remove());
      releaseDns(true);
      expect((await session.execute("get_page_text", {})).ok).toBe(true);
      expect(forwarded).toBe(0);
      expect(session.isClosed).toBe(false);
    } finally {
      await session.close();
      await server.close();
    }
  });

  it("holds popup routing until its guard is ready and refuses private redirects", async () => {
    const page = session.activePage();
    // A synthetic fulfill overrides context routing. Preserve production's
    // readiness requirement before substituting this public site's response.
    await page.context().route("https://example.org/popup-redirect", async (route) => {
      try {
        const popup = route.request().frame().page();
        await (
          session as unknown as { ensureNetworkGuard(page: typeof popup): Promise<void> }
        ).ensureNetworkGuard(popup);
      } catch {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 302, headers: { Location: privateProbeUrl } });
    });
    const before = privateProbeHits;
    const failed = page.context().waitForEvent("requestfailed");
    await page.evaluate(() => {
      window.open("https://example.org/popup-redirect");
    });
    await failed;
    expect(privateProbeHits).toBe(before);
    expect(session.isClosed).toBe(false);
  });

  it("keeps workers unavailable in both the top document and a fresh local frame", async () => {
    const page = session.activePage();
    expect(await page.evaluate(() => typeof Worker)).toBe("undefined");
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
    });
    expect(
      await page
        .frameLocator("iframe")
        .locator("body")
        .evaluate(() => typeof Worker),
    ).toBe("undefined");
    expect(session.isClosed).toBe(false);
  });

  it("closes the owned context when its live CDP guard is unexpectedly detached", async () => {
    const guards = (
      session as unknown as { networkGuards: Set<{ cdp: { detach(): Promise<void> } }> }
    ).networkGuards;
    await [...guards][0].cdp.detach();
    await vi.waitFor(() => expect(session.isClosed).toBe(true));
    expect(session.unexpectedCloseReason).toBe("network_guard_failed");
    await expect(session.activePage().evaluate(() => fetch("http://127.0.0.1/"))).rejects.toThrow();
  });

  it("distinguishes a provider disconnect from a network guard failure", async () => {
    const browser = (session as unknown as { browser: { close(): Promise<void> } }).browser;
    await browser.close();
    expect(session.isClosed).toBe(true);
    expect(session.unexpectedCloseReason).toBe("provider_disconnected");
  });

  it("classifies a new tab guard startup failure without retaining the provider error", async () => {
    const context = (session as unknown as { context: { newCDPSession(): Promise<unknown> } })
      .context;
    vi.spyOn(context, "newCDPSession").mockRejectedValueOnce(
      new Error("synthetic private provider detail"),
    );
    await expect(session.executeOwnerInput({ kind: "new_tab" })).rejects.toThrow();
    await vi.waitFor(() => expect(session.isClosed).toBe(true));
    expect(session.unexpectedCloseReason).toBe("guard_startup_failed");
    expect(session.unexpectedCloseReason).not.toContain("private");
  });

  it("erases a late native download event after owner hand-back without waiting for a Bot action", async () => {
    session.cancelCurrentInput();
    const capture = vi.spyOn(
      session as unknown as {
        captureOwnerDownload(download: Download): Promise<void>;
      },
      "captureOwnerDownload",
    );
    const pending = session.activePage().waitForEvent("download");
    await session.activePage().locator("#download").click();
    const rejected = await pending;
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(rejected));
    await capture.mock.results[0].value;
    await expect(rejected.createReadStream()).rejects.toThrow(/canceled|deleted|has been closed/i);
    expect(session.isClosed).toBe(false);
    expect(await session.activePage().locator("#download").count()).toBe(1);
    expect(session.ownerDownloads()).toEqual([]);
  });

  it("discards a file still in flight when owner control ends", async () => {
    let release!: (stream: Readable) => void;
    const download = {
      url: () => "https://example.com/report.txt",
      suggestedFilename: () => "report.txt",
      createReadStream: vi.fn(
        () =>
          new Promise<Readable>((resolve) => {
            release = resolve;
          }),
      ),
      cancel: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as Download;
    const capture = (
      session as unknown as { captureOwnerDownload: (file: Download) => Promise<void> }
    ).captureOwnerDownload(download);
    await vi.waitFor(() => expect(download.createReadStream).toHaveBeenCalled());
    session.cancelCurrentInput();
    release(Readable.from([Buffer.from("private pending file")]));
    await capture;
    expect(download.cancel).toHaveBeenCalled();
    expect(download.delete).toHaveBeenCalled();
    expect(session.ownerDownloads()).toEqual([]);
  });

  it("aborts a stalled completed-file stream when owner control ends", async () => {
    const stream = new Readable({ read() {} });
    const download = {
      url: () => "https://example.com/report.txt",
      suggestedFilename: () => "report.txt",
      createReadStream: vi.fn(async () => stream),
      cancel: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as Download;
    const capture = (
      session as unknown as { captureOwnerDownload: (file: Download) => Promise<void> }
    ).captureOwnerDownload(download);
    await vi.waitFor(() => expect(download.createReadStream).toHaveBeenCalled());
    session.cancelCurrentInput();
    await capture;
    expect(stream.destroyed).toBe(true);
    expect(download.delete).toHaveBeenCalled();
    expect(session.ownerDownloads()).toEqual([]);
  });

  it("rejects a file above the retained byte budget without keeping partial content", async () => {
    const download = {
      url: () => "https://example.com/report.txt",
      suggestedFilename: () => "report.txt",
      createReadStream: async () => Readable.from([Buffer.alloc(20 * 1_024 * 1_024 + 1)]),
      cancel: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as Download;
    await (
      session as unknown as { captureOwnerDownload: (file: Download) => Promise<void> }
    ).captureOwnerDownload(download);
    expect(session.ownerDownloads()).toEqual([]);
    expect(download.cancel).toHaveBeenCalled();
    expect(download.delete).toHaveBeenCalled();
    expect(session.ownerDownloadNotice()).toContain("20 MB");
  });
});
