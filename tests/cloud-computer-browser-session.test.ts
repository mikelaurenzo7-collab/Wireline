import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CloudBrowserSession } from "../src/lib/cloud-computer/browser-session";
// @ts-expect-error -- shared .mjs helper without type declarations
import { resolvePreinstalledChromium } from "../scripts/lib/resolve-preinstalled-chromium.mjs";

function chromiumPath(): string | null {
  const preinstalled = resolvePreinstalledChromium() as string | undefined;
  if (preinstalled && existsSync(preinstalled)) return preinstalled;
  try {
    const bundled = chromium.executablePath();
    return bundled && existsSync(bundled) ? bundled : null;
  } catch {
    return null;
  }
}

const executablePath = chromiumPath();

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
  });

  it("reads the page as a tagged accessibility tree with stable refs", async () => {
    const first = await session.execute("read_page", { filter: "interactive" });
    expect(first.ok).toBe(true);
    const text = (first.content[0] as { text: string }).text;
    expect(text).toMatch(/link "Pricing" \[ref_\d+\]/);
    expect(text).toMatch(/textbox "Your name" \[ref_\d+\]/);
    expect(text).toMatch(/checkbox "Urgent" \[ref_\d+\] unchecked/);
    expect(text).toMatch(/combobox "Appliance" \[ref_\d+\] value="Washer"/);
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
    expect(after).toMatch(/combobox "Appliance" \[ref_\d+\] value="Dryer"/);
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

  it("returns real screenshots and upscaled zoom images", async () => {
    const shot = await session.execute("screenshot", {});
    const image = shot.content[0] as { type: string; source: { data: string } };
    expect(image.type).toBe("image");
    const png = Buffer.from(image.source.data, "base64");
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(800);
    const zoom = await session.execute("zoom", { region: [0, 0, 320, 200] });
    const zoomed = Buffer.from(
      (zoom.content[0] as { source: { data: string } }).source.data,
      "base64",
    );
    expect(zoomed.readUInt32BE(16)).toBeGreaterThan(320);
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
});
