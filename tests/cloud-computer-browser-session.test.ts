import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { chordTypesText } from "../src/lib/cloud-computer/browser-input";
import {
  CloudBrowserSession,
  modelBrowserUrl,
  typingPieces,
} from "../src/lib/cloud-computer/browser-session";
// @ts-expect-error -- shared .mjs helper without type declarations
import { resolvePreinstalledChromium } from "../scripts/lib/resolve-preinstalled-chromium.mjs";

function chromiumPath(): string | null {
  const preinstalled = resolvePreinstalledChromium() as string | undefined;
  if (preinstalled && existsSync(preinstalled)) return preinstalled;
  try {
    const bundled = chromium.executablePath();
    if (process.platform === "win32") {
      const revision = /[\\/]chromium-(\d+)[\\/]/.exec(bundled)?.[1];
      if (revision) {
        const cacheRoot = path.dirname(path.dirname(path.dirname(bundled)));
        const headlessShell = path.join(
          cacheRoot,
          `chromium_headless_shell-${revision}`,
          "chrome-headless-shell-win64",
          "chrome-headless-shell.exe",
        );
        if (existsSync(headlessShell)) return headlessShell;
      }
    }
    return bundled && existsSync(bundled) ? bundled : null;
  } catch {
    return null;
  }
}

const executablePath = chromiumPath();

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  expect(jpeg.readUInt16BE(0)).toBe(0xffd8);
  let at = 2;
  while (at < jpeg.length) {
    const marker = jpeg.readUInt16BE(at);
    const length = jpeg.readUInt16BE(at + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) {
      return { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  throw new Error("No JPEG frame header.");
}

const FIXTURE = `<!doctype html><html><head><title>Repair Desk</title></head><body>
<header><nav aria-label="Primary"><a href="/pricing">Pricing</a></nav></header>
<main>
  <h1>Book a repair</h1>
  <p>Our technicians visit Monday through Friday. Follow-up visits are free.</p>
  <form id="f">
    <label for="name">Your name</label><input id="name" name="name" placeholder="Jane Doe" />
    <label for="zip">ZIP code</label><input id="zip" name="zip" />
    <label><input type="checkbox" id="urgent" /> Urgent</label>
    <label for="appliance">Appliance</label>
    <select id="appliance"><option value="washer">Washer</option><option value="dryer">Dryer</option></select>
    <input type="password" id="pw" aria-label="Password" />
    <button type="button" id="go" onclick="document.getElementById('out').textContent='Booked for '+document.getElementById('name').value">Check availability</button>
  </form>
  <p id="out"></p>
</main>
</body></html>`;

describe("cloud computer input rules", () => {
  it("keeps model tab URLs free of login codes and magic-link paths", () => {
    expect(modelBrowserUrl("https://name:password@example.com/magic/secret?code=abc#token")).toBe(
      "https://example.com/",
    );
    expect(modelBrowserUrl("about:blank")).toBe("about:blank");
    expect(modelBrowserUrl("not a URL")).toBe("about:blank");
  });

  it("knows which chords put text into the focused field", () => {
    for (const chord of ["a", "A", "Shift+A", "Space", "Shift+Space", "1", "@"]) {
      expect(chordTypesText(chord), chord).toBe(true);
    }
    // A paste inserts the clipboard: the password rule covers it too.
    for (const chord of ["Control+V", "Meta+V", "Control+Shift+V", "Shift+Insert"]) {
      expect(chordTypesText(chord), chord).toBe(true);
    }
    for (const chord of ["Enter", "Tab", "Control+A", "Control+C", "Alt+X", "Shift", "Insert"]) {
      expect(chordTypesText(chord), chord).toBe(false);
    }
  });

  it("types in short runs with every newline as its own Enter", () => {
    expect(typingPieces("user@example.com\nsecret")).toEqual(["user@example.com", "\n", "secret"]);
    expect(typingPieces("a\r\nb")).toEqual(["a", "\n", "b"]);
    const long = typingPieces("x".repeat(95));
    expect(long.map((piece) => piece.length)).toEqual([40, 40, 15]);
  });

  it("redacts short and overlapping owner values once without expanding its placeholders", () => {
    const redactor = Object.create(CloudBrowserSession.prototype) as {
      ownerEnteredValues: string[];
      ownerToolSecrets: Set<string>;
      redactOwnerText: (text: string) => string;
    };
    redactor.ownerEnteredValues = "aetxohindr".split("");
    redactor.ownerToolSecrets = new Set();
    const redacted = redactor.redactOwnerText("A page about a task");
    expect(redacted).toContain("[owner-entered text hidden]");
    expect(redacted.length).toBeLessThan(1_000);
    redactor.ownerEnteredValues = ["secret", "secret-token", "a+b"];
    expect(redactor.redactOwnerText("secret-token a+b")).toBe(
      "[owner-entered text hidden] [owner-entered text hidden]",
    );
  });
});

describe.skipIf(!executablePath)("cloud computer browser session (real Chromium)", () => {
  let session: CloudBrowserSession;
  let server: Server;
  let probeUrl = "";
  let probeHits = 0;
  let probeUpgrades = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      probeHits += 1;
      res.end("internal");
    });
    server.on("upgrade", (_req, socket) => {
      probeUpgrades += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    probeUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/secret`;
    session = await CloudBrowserSession.open({ kind: "local", executablePath: executablePath! });
    await session.activePage().setContent(FIXTURE);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }, 30_000);

  it("does not bill Browserless for a local development browser", () => {
    expect(session.browserlessConnectionMs).toBeNull();
  });

  it("reads the page as a tagged accessibility tree with stable refs", async () => {
    const first = await session.execute("read_page", { filter: "interactive" });
    expect(first.ok).toBe(true);
    const text = (first.content[0] as { text: string }).text;
    expect(text).toMatch(/link "Pricing" \[ref_\d+\]/);
    expect(text).toMatch(/textbox "Your name" \[ref_\d+\]/);
    expect(text).toMatch(/checkbox "Urgent" \[ref_\d+\] unchecked/);
    expect(text).toMatch(/combobox "Appliance" \[ref_\d+\] has_value/);
    expect(text).toMatch(/button "Check availability" \[ref_\d+\]/);
    const again = await session.execute("read_page", { filter: "interactive" });
    expect((again.content[0] as { text: string }).text).toBe(text);
  });

  it("finds elements by description and fills, checks, selects and clicks by ref", async () => {
    const found = await session.execute("find", { query: "name field" });
    const nameRef = /textbox "Your name" \[(ref_\d+)\]/.exec(
      (found.content[0] as { text: string }).text,
    )?.[1];
    expect(nameRef).toBeTruthy();
    expect(
      (await session.execute("form_input", { target: { type: "ref", ref: nameRef }, value: "Ada" }))
        .ok,
    ).toBe(true);

    const tree = (
      (await session.execute("read_page", { filter: "interactive" })).content[0] as { text: string }
    ).text;
    const ref = (pattern: RegExp) => pattern.exec(tree)?.[1] as string;
    expect(
      (
        await session.execute("form_input", {
          target: { type: "ref", ref: ref(/checkbox "Urgent" \[(ref_\d+)\]/) },
          value: true,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await session.execute("form_input", {
          target: { type: "ref", ref: ref(/combobox "Appliance" \[(ref_\d+)\]/) },
          value: "Dryer",
        })
      ).ok,
    ).toBe(true);
    const click = await session.execute("left_click", {
      target: { type: "ref", ref: ref(/button "Check availability" \[(ref_\d+)\]/) },
    });
    expect(click.ok).toBe(true);
    expect(click.activity).toBe('Clicked "Check availability"');
    expect(click.content.some((block) => block.type === "browser_state")).toBe(true);

    const text = await session.execute("get_page_text", {});
    expect((text.content[0] as { text: string }).text).toContain("Booked for Ada");
    const after = (
      (await session.execute("read_page", { filter: "interactive" })).content[0] as { text: string }
    ).text;
    expect(after).toMatch(/checkbox "Urgent" \[ref_\d+\] checked/);
    expect(after).toMatch(/combobox "Appliance" \[ref_\d+\] has_value/);
  });

  it("refuses passwords, stale refs and unsupported keys as tool errors", async () => {
    const tree = (
      (await session.execute("read_page", { filter: "interactive" })).content[0] as { text: string }
    ).text;
    const pw = /textbox "Password" \[(ref_\d+)\]/.exec(tree)?.[1];
    const password = await session.execute("form_input", {
      target: { type: "ref", ref: pw },
      value: "x",
    });
    expect(password.ok).toBe(false);
    expect((password.content[0] as { text: string }).text).toContain(
      "Passwords are entered by the owner",
    );
    // Clicking into the field and typing is refused the same way.
    expect((await session.execute("left_click", { target: { type: "ref", ref: pw } })).ok).toBe(
      true,
    );
    const typed = await session.execute("type", { text: "hunter2" });
    expect(typed.ok).toBe(false);
    expect((typed.content[0] as { text: string }).text).toContain(
      "Passwords are entered by the owner",
    );
    // Printable keys type characters too: the same rule applies to key.
    const keyed = await session.execute("key", { text: "s e c r e t" });
    expect(keyed.ok).toBe(false);
    expect(await session.activePage().locator("#pw").inputValue()).toBe("");
    await session.activePage().locator("#name").focus();
    const stale = await session.execute("left_click", {
      target: { type: "ref", ref: "ref_99999" },
    });
    expect(stale.ok).toBe(false);
    expect((stale.content[0] as { text: string }).text).toContain("stale or not found");
    const key = await session.execute("key", { text: "hyper+q" });
    expect(key.ok).toBe(false);
    const js = await session.execute("javascript_exec", { text: "1" });
    expect(js.ok).toBe(false);
    const nav = await session.execute("navigate", { url: "file:///etc/hosts" });
    expect(nav.ok).toBe(false);
  });

  it("lets the owner enter a password during takeover while Bot typing stays blocked", async () => {
    const page = session.activePage();
    await page.setContent(FIXTURE);
    await page.locator("#pw").focus();

    const frame = await session.executeOwnerInput({ kind: "type", text: "owner-secret-123" });
    expect(Buffer.isBuffer(frame)).toBe(true);
    expect(await page.locator("#pw").inputValue()).toBe("owner-secret-123");
    expect(await session.execute("type", { text: "bot-secret-456" })).toMatchObject({ ok: false });
    expect(await page.locator("#pw").inputValue()).toBe("owner-secret-123");

    const frameAfterKey = await session.executeOwnerInput({ kind: "key", key: "Enter" });
    expect(Buffer.isBuffer(frameAfterKey)).toBe(true);
    await expect(session.executeOwnerInput({ kind: "key", key: "A" })).rejects.toThrow();
    expect(await page.locator("#pw").inputValue()).toBe("owner-secret-123");
  });

  it("limits owner keyboard input to navigation and supports focus in both directions", async () => {
    const page = session.activePage();
    await page.setContent(`
      <input id="first" aria-label="First" />
      <input id="second" aria-label="Second" />
      <label><input id="choice" type="checkbox" /> Choose</label>
      <div style="height: 1500px"></div>
    `);
    await page.locator("#first").focus();

    await session.executeOwnerInput({ kind: "key", key: "Tab" });
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("second");
    await session.executeOwnerInput({ kind: "key", key: "Shift+Tab" });
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("first");

    await page.locator("#choice").focus();
    await session.executeOwnerInput({ kind: "key", key: "Space" });
    expect(await page.locator("#choice").isChecked()).toBe(true);

    for (const key of [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Delete",
    ]) {
      expect(await session.executeOwnerInput({ kind: "key", key }), key).toBeInstanceOf(Buffer);
    }
    for (const key of ["A", "Control+A", "Alt+Tab", "Shift+Space", "Control+Shift+Tab"]) {
      await expect(session.executeOwnerInput({ kind: "key", key }), key).rejects.toThrow(
        "supported navigation key",
      );
    }
  });

  it("keeps owner-entered values out of model screenshots and page text", async () => {
    const page = session.activePage();
    await page.setContent(
      '<label for="owner-value">Account email</label><input id="owner-value" oninput="document.getElementById(\'echo\').textContent=this.value"><p id="echo"></p>',
    );
    await page.locator("#owner-value").focus();
    await session.executeOwnerInput({ kind: "type", text: "owner@example.test" });

    const ownerFrame = await session.frame();
    const modelFrame = await session.modelFrame();
    expect(ownerFrame).toBeInstanceOf(Buffer);
    expect(modelFrame).toBeInstanceOf(Buffer);
    expect(modelFrame?.equals(ownerFrame!)).toBe(false);

    const snapshot = await session.execute("read_page", { filter: "all" });
    const snapshotText = (snapshot.content[0] as { text: string }).text;
    expect(snapshotText).toContain("has_value");
    expect(snapshotText).not.toContain("owner@example.test");

    const bodyText = await session.execute("get_page_text", {});
    expect((bodyText.content[0] as { text: string }).text).not.toContain("owner@example.test");
  });

  it("redacts a short owner code echoed outside its input, including adjacent text", async () => {
    const page = session.activePage();
    await page.setContent(
      "<label>Security code<input id=\"owner-code\" oninput=\"document.getElementById('echo').textContent='Code'+this.value+'accepted'\"></label><p id=\"echo\"></p>",
    );
    await page.locator("#owner-code").focus();
    await session.executeOwnerInput({ kind: "type", text: "731" });

    const bodyText = await session.execute("get_page_text", {});
    const snapshot = await session.execute("read_page", { filter: "all" });
    expect((bodyText.content[0] as { text: string }).text).toContain("[owner-entered text hidden]");
    expect((bodyText.content[0] as { text: string }).text).not.toContain("731");
    expect((snapshot.content[0] as { text: string }).text).not.toContain("731");
    expect((await session.modelFrame())?.equals((await session.frame())!)).toBe(false);
  });

  it("inspects only visible heading semantics and safe public link destinations", async () => {
    const page = session.activePage();
    await page.setContent(`
      <h2 id="heading">Example domains</h2>
      <p id="body">This sentence is not a heading.</p>
      <a id="safe" href="https://example.com/help/example-domains">Learn more</a>
      <a id="private" href="https://example.com/help?token=private">Private query</a>
    `);
    const inspect = async (selector: string) => {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      return session.execute("inspect_visible_element", {
        x: box!.x + box!.width / 2,
        y: box!.y + box!.height / 2,
      });
    };
    const heading = await inspect("#heading");
    expect((heading.content[0] as { text: string }).text).toContain("Heading: h2");
    const body = await inspect("#body");
    expect((body.content[0] as { text: string }).text).toContain("Heading: none");
    const link = await inspect("#safe");
    expect(link.verifiedLinkUrl).toBe("https://example.com/help/example-domains");
    const privateQuery = await inspect("#private");
    expect(privateQuery.verifiedLinkUrl).toBeUndefined();
    expect((privateQuery.content[0] as { text: string }).text).not.toContain("token=private");
  });

  it("withholds a link containing owner-entered text", async () => {
    const page = session.activePage();
    await page.setContent(
      '<input id="owner"><a id="secret" href="https://example.com/owner-secret-123">Owner link</a>',
    );
    await page.locator("#owner").focus();
    await session.executeOwnerInput({ kind: "type", text: "owner-secret-123" });
    const box = await page.locator("#secret").boundingBox();
    expect(box).not.toBeNull();
    const inspected = await session.execute("inspect_visible_element", {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
    });
    expect(inspected.verifiedLinkUrl).toBeUndefined();
    expect(JSON.stringify(inspected)).not.toContain("owner-secret-123");

    await page.setContent(
      '<a id="encoded" href="https://example.com/u/owner%2Dsecret%2D123">Encoded owner link</a>',
    );
    const encodedBox = await page.locator("#encoded").boundingBox();
    expect(encodedBox).not.toBeNull();
    const encoded = await session.execute("inspect_visible_element", {
      x: encodedBox!.x + encodedBox!.width / 2,
      y: encodedBox!.y + encodedBox!.height / 2,
    });
    expect(encoded.verifiedLinkUrl).toBeUndefined();
    expect(JSON.stringify(encoded)).not.toContain("owner%2Dsecret%2D123");
  });

  it("leaves token-bearing link paths, queries, and fragments out of model snapshots", async () => {
    await session
      .activePage()
      .setContent(
        '<a href="https://example.com/magic/one-time-secret?code=hidden#access_token=hidden">Continue</a>',
      );
    const snapshot = await session.execute("read_page", { filter: "all" });
    const text = (snapshot.content[0] as { text: string }).text;
    expect(text).toMatch(/link "Continue" \[ref_\d+\]/);
    expect(text).not.toContain("magic");
    expect(text).not.toContain("one-time-secret");
    expect(text).not.toContain("code=hidden");
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("href=");
  });

  it("returns real JPEG screenshots and masked zoom crops", async () => {
    const shot = await session.execute("screenshot", {});
    const image = shot.content[0] as {
      type: string;
      source: { media_type: string; data: string };
    };
    expect(image.type).toBe("image");
    expect(image.source.media_type).toBe("image/jpeg");
    expect(jpegSize(Buffer.from(image.source.data, "base64"))).toEqual({
      width: 1280,
      height: 800,
    });
    const zoom = await session.execute("zoom", { region: [0, 0, 320, 200] });
    const zoomed = zoom.content[0] as { source: { media_type: string; data: string } };
    expect(zoomed.source.media_type).toBe("image/jpeg");
    expect(jpegSize(Buffer.from(zoomed.source.data, "base64")).width).toBe(320);
    expect(await session.frame()).toBeInstanceOf(Buffer);
  });

  it("tracks tabs through browser_state blocks", async () => {
    const opened = await session.execute("new_tab", {});
    const state = opened.content[0] as {
      type: string;
      tabs: Array<{ tab_id: string; active?: boolean }>;
      state_changes?: unknown[];
    };
    expect(state.type).toBe("browser_state");
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs.filter((tab) => tab.active)).toHaveLength(1);
    expect(state.state_changes).toEqual([{ type: "tab_opened", tab_id: state.tabs[1].tab_id }]);
    const closed = await session.execute("close_tab", { tab_id: state.tabs[1].tab_id });
    expect((closed.content[0] as { tabs: unknown[] }).tabs).toHaveLength(1);
  });

  it("focuses an owner-opened login popup and lets the owner return to the original tab", async () => {
    const original = session.activePage();
    const originalId = session.ownerTabs().find((tab) => tab.active)!.id;
    await original.setContent('<button id="login">Log in</button>');
    await original.locator("#login").evaluate((button) => {
      button.addEventListener("click", () => {
        const popup = window.open("about:blank");
        if (popup) popup.document.body.innerHTML = '<label>Email <input id="email"></label>';
      });
    });
    const button = await original.locator("#login").boundingBox();
    expect(button).toBeTruthy();

    await session.executeOwnerInput({ kind: "click", x: button!.x + 3, y: button!.y + 3 });
    await vi.waitFor(() => expect(session.activePage()).not.toBe(original));
    const popup = session.activePage();
    expect(popup).not.toBe(original);
    expect(await popup.locator("#email").count()).toBe(1);
    const tabs = session.ownerTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toMatchObject({ active: true });
    const tabLabel = `Tab ${tabs[1].id.slice(4)}`;
    const popupUrl = vi.spyOn(popup, "url");
    popupUrl.mockReturnValue("https://accounts.example.com/login?code=private-code");
    expect(session.ownerTabs()[1].label).toBe(`${tabLabel} · accounts.example.com`);
    popupUrl.mockReturnValue("https://name:password@accounts.example.com/login");
    expect(session.ownerTabs()[1].label).toBe(tabLabel);
    popupUrl.mockRestore();
    await popup.locator("#email").focus();
    await session.executeOwnerInput({ kind: "type", text: "owner@example.test" });
    expect(await popup.locator("#email").inputValue()).toBe("owner@example.test");

    await session.executeOwnerInput({ kind: "switch_tab", tabId: originalId });
    expect(session.activePage()).toBe(original);
    await session.executeOwnerInput({ kind: "switch_tab", tabId: tabs[1].id });
    expect(session.activePage()).toBe(popup);
    await popup.close();
    expect(session.activePage()).toBe(original);
    await original.setContent(FIXTURE);
  });

  it("focuses a popup announced after owner input, but never after hand-back", async () => {
    const original = session.activePage();
    await session.executeOwnerInput({ kind: "click", x: 1, y: 1 });
    const first = original.waitForEvent("popup");
    await original.evaluate(() => {
      window.open("about:blank");
    });
    const popup = await first;
    await vi.waitFor(() => expect(session.activePage()).toBe(popup));
    session.cancelCurrentInput();
    const second = original.waitForEvent("popup");
    await original.evaluate(() => {
      window.open("about:blank");
    });
    const late = await second;
    await vi.waitFor(() => expect(session.ownerTabs()).toHaveLength(3));
    expect(session.activePage()).toBe(popup);
    await late.close();
    await popup.close();
    expect(session.activePage()).toBe(original);
  });

  it("still blocks an owner popup that tries to reach loopback", async () => {
    const original = session.activePage();
    const originalId = session.ownerTabs().find((tab) => tab.active)!.id;
    await original.setContent('<button id="blocked-popup">Open</button>');
    await original.locator("#blocked-popup").evaluate((button, url) => {
      button.addEventListener("click", () => window.open(url));
    }, probeUrl);
    const button = await original.locator("#blocked-popup").boundingBox();
    expect(button).toBeTruthy();
    const before = session.blockedRequests;
    await session
      .executeOwnerInput({ kind: "click", x: button!.x + 3, y: button!.y + 3 })
      .catch(() => undefined);
    expect(session.blockedRequests).toBeGreaterThan(before);
    expect(probeHits).toBe(0);
    expect(session.ownerTabs().every((tab) => !tab.label.includes("127.0.0.1"))).toBe(true);
    for (const tab of session.ownerTabs()) {
      if (tab.id === originalId) continue;
      await session.executeOwnerInput({ kind: "switch_tab", tabId: originalId });
      await session.activePage(tab.id).close();
    }
    await original.setContent(FIXTURE);
  });

  it("blocks page requests to loopback and private addresses", async () => {
    const before = session.blockedRequests;
    const page = session.activePage();
    const result = await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return "reached";
      } catch {
        return "blocked";
      }
    }, probeUrl);
    expect(result).toBe("blocked");
    expect(probeHits).toBe(0);
    expect(session.blockedRequests).toBeGreaterThan(before);
  });

  it("refuses private WebSockets and channels that bypass request screening", async () => {
    const page = session.activePage();
    const before = session.blockedRequests;
    const outcome = await page.evaluate(
      (url) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(url);
          socket.onopen = () => resolve("open");
          socket.onclose = () => resolve("closed");
          socket.onerror = () => resolve("error");
          setTimeout(() => resolve("timeout"), 5_000);
        }),
      probeUrl.replace("http://", "ws://"),
    );
    expect(outcome).not.toBe("open");
    expect(probeUpgrades).toBe(0);
    expect(session.blockedRequests).toBeGreaterThan(before);
    const channels = await page.evaluate(() => ({
      shared: typeof (window as { SharedWorker?: unknown }).SharedWorker,
      rtc: typeof (window as { RTCPeerConnection?: unknown }).RTCPeerConnection,
      serviceWorker: typeof navigator.serviceWorker,
    }));
    expect(channels).toEqual({ shared: "undefined", rtc: "undefined", serviceWorker: "undefined" });
  });

  it("keeps the password rule for held keys, spaces, and keys after focus moves", async () => {
    const page = session.activePage();
    await page.setContent(FIXTURE);
    await page.locator("#pw").focus();
    expect((await session.execute("hold_key", { text: "x", duration: 0 })).ok).toBe(false);
    expect((await session.execute("key", { text: "space" })).ok).toBe(false);
    expect((await session.execute("hold_key", { text: "shift", duration: 0 })).ok).toBe(true);
    // Tab moves focus from the Appliance select into the password field.
    await page.locator("#appliance").focus();
    const sequence = await session.execute("key", { text: "Tab s e c r e t" });
    expect(sequence.ok).toBe(false);
    expect(await page.locator("#pw").inputValue()).toBe("");
  });

  it("pauses a Bot submit click while allowing a harmless navigation click", async () => {
    const page = session.activePage();
    await page.setContent(`
      <a id="pricing" href="#pricing-details" onclick="event.preventDefault(); document.body.dataset.nav='yes'">Pricing</a>
      <form onsubmit="event.preventDefault(); document.body.dataset.sent='yes'">
        <button id="send" type="submit">Send request</button>
      </form>
      <button id="book" type="button" onclick="document.body.dataset.booked='yes'">Book now</button>
      <p id="pricing-details">Plans</p>
    `);
    const send = await page.locator("#send").boundingBox();
    expect(send).toBeTruthy();
    const blocked = await session.execute("left_click", {
      target: { type: "coordinate", x: send!.x + 3, y: send!.y + 3 },
    });
    expect(blocked).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-sent")).toBeNull();
    const book = await page.locator("#book").boundingBox();
    expect(book).toBeTruthy();
    const booking = await session.execute("left_click", {
      target: { type: "coordinate", x: book!.x + 3, y: book!.y + 3 },
    });
    expect(booking).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-booked")).toBeNull();

    const pricing = await page.locator("#pricing").boundingBox();
    expect(pricing).toBeTruthy();
    const navigation = await session.execute("left_click", {
      target: { type: "coordinate", x: pricing!.x + 3, y: pricing!.y + 3 },
    });
    expect(navigation.ok).toBe(true);
    expect(navigation.ownerCheckpoint).toBeUndefined();
    expect(await page.locator("body").getAttribute("data-nav")).toBe("yes");
    await session.executeOwnerInput({ kind: "click", x: send!.x + 3, y: send!.y + 3 });
    expect(await page.locator("body").getAttribute("data-sent")).toBe("yes");
    await page.setContent(FIXTURE);
  });

  it("pauses consequential native checkbox changes through clicks and form_input", async () => {
    const page = session.activePage();
    await page.setContent(`
      <label><input id="confirm" type="checkbox"
        onchange="document.body.dataset.submitted='yes'">Confirm purchase</label>
    `);
    const tree = await session.execute("read_page", { filter: "interactive" });
    const ref = /checkbox "Confirm purchase" \[(ref_\d+)\]/.exec(
      (tree.content[0] as { text: string }).text,
    )?.[1];
    expect(ref).toBeTruthy();
    for (const member of ["left_click", "form_input"]) {
      expect(
        await session.execute(member, { target: { type: "ref", ref }, value: true }),
      ).toMatchObject({ ok: false, ownerCheckpoint: true });
      expect(await page.locator("#confirm").isChecked()).toBe(false);
      expect(await page.locator("body").getAttribute("data-submitted")).toBeNull();
    }
    await page.setContent(FIXTURE);
  });

  it("pauses a consequential select option before its change handler runs", async () => {
    const page = session.activePage();
    await page.setContent(`
      <label for="action">Action</label>
      <select id="action" onchange="document.body.dataset.deleted='yes'">
        <option value="none">Choose an action</option>
        <option value="erase">Delete account</option>
      </select>
    `);
    const tree = await session.execute("read_page", { filter: "interactive" });
    const ref = /combobox "Action" \[(ref_\d+)\]/.exec(
      (tree.content[0] as { text: string }).text,
    )?.[1];
    expect(ref).toBeTruthy();
    expect(
      await session.execute("form_input", { target: { type: "ref", ref }, value: "erase" }),
    ).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("#action").inputValue()).toBe("none");
    expect(await page.locator("body").getAttribute("data-deleted")).toBeNull();
    await page.setContent(FIXTURE);
  });

  it("pauses Enter on a focused form field before it submits", async () => {
    const page = session.activePage();
    await page.setContent(`
      <form onsubmit="event.preventDefault(); document.body.dataset.sent='yes'">
        <input id="message" name="message" />
        <button type="submit">Send</button>
      </form>
    `);
    await page.locator("#message").focus();
    const blocked = await session.execute("key", { text: "Enter" });
    expect(blocked).toMatchObject({ ok: false, ownerCheckpoint: true });
    const shortcut = await session.execute("key", { text: "ctrl+enter" });
    expect(shortcut).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-sent")).toBeNull();
    await page.setContent(FIXTURE);
  });

  it("allows a clearly read-only GET search but pauses POST and payment controls", async () => {
    const page = session.activePage();
    await page.setContent(`
      <form id="search" method="get" action="/search" onsubmit="event.preventDefault(); document.body.dataset.searched='yes'">
        <input id="query" name="q" type="text" />
        <button id="search-button" type="submit">Google Search</button>
      </form>
      <form id="message" method="post" onsubmit="event.preventDefault(); document.body.dataset.sent='yes'">
        <input id="message-text" name="q" type="text" />
        <button id="post-button" type="submit">Search messages</button>
      </form>
      <form id="payment" method="get" onsubmit="event.preventDefault(); document.body.dataset.paid='yes'">
        <input id="payment-query" name="q" type="text" />
        <button id="pay-button" type="submit">Pay</button>
      </form>
      <form id="payment-full" method="get" onsubmit="event.preventDefault(); document.body.dataset.paid='yes'">
        <input id="payment-full-query" name="q" type="text" />
        <button id="submit-payment" type="submit">Submit Payment</button>
        <button id="delete-button" type="button" onclick="document.body.dataset.deleted='yes'">Delete</button>
      </form>
    `);
    const search = await page.locator("#search-button").boundingBox();
    expect(search).toBeTruthy();
    const click = await session.execute("left_click", {
      target: { type: "coordinate", x: search!.x + 3, y: search!.y + 3 },
    });
    expect(click).toMatchObject({ ok: true });
    expect(await page.locator("body").getAttribute("data-searched")).toBe("yes");
    await page.locator("#query").focus();
    expect((await session.execute("key", { text: "Enter" })).ok).toBe(true);

    const post = await page.locator("#post-button").boundingBox();
    expect(post).toBeTruthy();
    expect(
      await session.execute("left_click", {
        target: { type: "coordinate", x: post!.x + 3, y: post!.y + 3 },
      }),
    ).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-sent")).toBeNull();
    await page.locator("#payment-query").focus();
    expect(await session.execute("key", { text: "Enter" })).toMatchObject({
      ok: false,
      ownerCheckpoint: true,
    });
    expect(await page.locator("body").getAttribute("data-paid")).toBeNull();
    await page.locator("#payment-full-query").focus();
    expect(await session.execute("key", { text: "Enter" })).toMatchObject({
      ok: false,
      ownerCheckpoint: true,
    });
    const deleteButton = await page.locator("#delete-button").boundingBox();
    expect(deleteButton).toBeTruthy();
    expect(
      await session.execute("left_click", {
        target: { type: "coordinate", x: deleteButton!.x + 3, y: deleteButton!.y + 3 },
      }),
    ).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-deleted")).toBeNull();
    await page.setContent(FIXTURE);
  });

  it("pauses a consequential unlabeled HTML role if it is visibly clickable", async () => {
    const page = session.activePage();
    await page.setContent(`
      <div id="send" onclick="document.body.dataset.sent='yes'">Send message</div>
    `);
    const send = await page.locator("#send").boundingBox();
    expect(send).toBeTruthy();
    expect(
      await session.execute("left_click", {
        target: { type: "coordinate", x: send!.x + 3, y: send!.y + 3 },
      }),
    ).toMatchObject({ ok: false, ownerCheckpoint: true });
    expect(await page.locator("body").getAttribute("data-sent")).toBeNull();
    await page.setContent(FIXTURE);
  });

  it("blanks a tab that a redirect hop took to a private address, before anyone reads it", async () => {
    const page = session.activePage();
    const internals = session as unknown as {
      hostResolvesPublic: (host: string) => Promise<boolean>;
      screenRedirect: (request: unknown) => void;
    };
    const resolve = internals.hostResolvesPublic.bind(session);
    internals.hostResolvesPublic = async (host) => host === "public.example" || resolve(host);
    await page.route("https://public.example/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Public page</p>" }),
    );
    await page.goto("https://public.example/start");
    expect((await session.execute("get_page_text", {})).ok).toBe(true);
    expect(await session.frame()).toBeInstanceOf(Buffer);

    // What Playwright reports for a hop that route handlers never see.
    const before = session.blockedRequests;
    internals.screenRedirect({
      redirectedFrom: () => ({}),
      url: () => probeUrl,
      frame: () => ({ page: () => page }),
    });
    await vi.waitFor(() => expect(session.blockedRequests).toBeGreaterThan(before));
    // Neither the owner's live view nor the model sees the tab.
    expect(await session.frame()).toBeNull();
    expect(page.url()).toBe("about:blank");
    await page.goto("https://public.example/again");
    internals.screenRedirect({
      redirectedFrom: () => ({}),
      url: () => probeUrl,
      frame: () => ({ page: () => page }),
    });
    await vi.waitFor(() => expect(session.blockedRequests).toBeGreaterThan(before + 1));
    const read = await session.execute("get_page_text", {});
    expect(read.ok).toBe(false);
    expect((read.content[0] as { text: string }).text).toContain("private or unsupported address");
    expect(probeHits).toBe(0);
  });
});
