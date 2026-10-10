import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request as BrowserRequest,
  type Response as BrowserResponse,
  type Route,
} from "playwright-core";

import {
  chordTypesText,
  clampNumber,
  normalizeKeyName,
  parseKeySequence,
  parseModifiers,
} from "./browser-input";
import { CLOUD_BROWSER_VIEWPORT } from "./browser-constants";
import { snapshotExpression, type SnapshotMode } from "./page-snapshot";
import {
  checkUrlAllowed,
  isNonPublicAddress,
  normalizeHostname,
  parseNavigateTarget,
} from "./url-policy";

/**
 * One Bot's cloud computer: an isolated Chromium session driven through the
 * OpenAI computer tool. Production connects to a remote, sandboxed browser
 * over Browserless's native Playwright protocol so request and WebSocket
 * routing stay available; a local Chromium launch is allowed only for tests.
 */

const NAVIGATION_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 8_000;
const READ_MAX_CHARS = 50_000;
const TEXT_MAX_CHARS = 50_000;
const MAX_TABS = 8;
const MAX_TYPE_CHARS = 4_000;
const MAX_OWNER_REDACTIONS = 32;
const MAX_OWNER_REDACTION_CHARS = 16_000;
const MODEL_EDITABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"], [role="textbox"]';
// Typing is sent in short runs so a deadline or a newly focused password
// field stops it between runs instead of after thousands of keystrokes.
const TYPE_CHUNK_CHARS = 40;
// A verdict lives no longer than its DNS record (and at most a minute); a
// lookup that failed rather than answered is retried after a few seconds.
const DNS_CACHE_MS = 60_000;
const DNS_FAILURE_CACHE_MS = 5_000;
// Browser egress checks resolve names with c-ares (not the libuv threadpool
// shared with the rest of the API), bounded per session.
const DNS_TIMEOUT_MS = 2_500;
const DNS_CONCURRENCY = 4;
/** Distinct hosts one session may look up; re-checking a known host is free. */
const DNS_MAX_HOSTS = 1_500;
const DNS_CACHE_MAX = 2_000;
const OPEN_DEADLINE_MS = 60_000;
// Page scripts can block their own main thread, and page.evaluate has no
// timeout of its own: every member runs under a hard deadline instead.
const MEMBER_DEADLINE_MS = 45_000;
const CLOSE_DEADLINE_MS = 10_000;

class DeadlineError extends Error {
  override name = "TimeoutError";
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError("Deadline exceeded")), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Text as runs of at most TYPE_CHUNK_CHARS characters, with each newline its own Enter. */
export function typingPieces(text: string): string[] {
  const pieces: string[] = [];
  for (const part of text.split(/(\r\n|\r|\n)/)) {
    if (!part) continue;
    if (/^(?:\r\n|\r|\n)$/.test(part)) {
      pieces.push("\n");
      continue;
    }
    for (let at = 0; at < part.length; at += TYPE_CHUNK_CHARS) {
      pieces.push(part.slice(at, at + TYPE_CHUNK_CHARS));
    }
  }
  return pieces;
}

/**
 * Runs in every frame before page scripts: channels that bypass request
 * interception (shared and service workers, WebRTC) are simply unavailable.
 */
const ISOLATION_INIT_SCRIPT = `(() => {
  for (const name of ["SharedWorker", "RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel"]) {
    try { Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false }); } catch {}
  }
  try { Object.defineProperty(Navigator.prototype, "serviceWorker", { get: () => undefined, configurable: false }); } catch {}
})();`;

/**
 * The snapshot script runs in the page's own realm, where page code can
 * replace builtins: never trust the type or size of what comes back.
 */
function pageText(value: unknown, max: number): string {
  if (typeof value !== "string") fail("The page returned an unreadable result.");
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}

/** Frame URLs that hold no third-party network content of their own. */
function isLocalFrameUrl(raw: string): boolean {
  return (
    !raw ||
    raw === "about:blank" ||
    raw === "about:srcdoc" ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("chrome-error:")
  );
}

export type BrowserStateTab = { tab_id: string; title: string; url: string; active?: boolean };
export type BrowserStateChange = { type: "tab_opened"; tab_id: string };
export type BrowserStateBlock = {
  type: "browser_state";
  tabs: BrowserStateTab[];
  state_changes?: BrowserStateChange[];
};
export type MemberResultBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string };
    }
  | BrowserStateBlock;

export type MemberResult = {
  ok: boolean;
  content: MemberResultBlock[];
  /** Short, owner-readable line for the activity feed. Never contains typed text. */
  activity: string;
};

export type CloudBrowserConnection =
  { kind: "remote"; wsEndpoint: string } | { kind: "local"; executablePath: string };

type Target = { type: "coordinate"; x: number; y: number } | { type: "ref"; ref: string };

type MemberInput = Record<string, unknown>;

/** Direct owner input is deliberately separate from model computer actions. */
export type OwnerControlInput =
  | { kind: "click"; x: number; y: number }
  | { kind: "drag"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "navigate"; url: string }
  | { kind: "history"; action: "back" | "forward" | "reload" }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string };

/** Set when a member's deadline passes, so work it started stops at its next check. */
type MemberToken = { cancelled: boolean };

const PRIVATE_ADDRESS_STOP = "The page moved to a private or unsupported address and was stopped.";
const TOO_MANY_SITES =
  "This task has visited too many different sites. Start a new task with a narrower goal.";

class MemberError extends Error {}

function fail(message: string): never {
  throw new MemberError(message);
}

function sanitizeStateText(value: string, max = 4096): string {
  // Control characters are not allowed in browser_state fields.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

/** Browser state goes to the model; authentication URLs can carry bearer tokens. */
export function modelBrowserUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // The tab title and screen provide page context. An origin is enough to
    // distinguish sites without exposing OAuth codes in query strings or
    // magic-link tokens embedded in a path.
    return url.protocol === "http:" || url.protocol === "https:" ? `${url.origin}/` : "about:blank";
  } catch {
    return "about:blank";
  }
}

function parseTarget(value: unknown, allowRef = true): Target {
  if (!value || typeof value !== "object") fail("A target is required.");
  const target = value as Record<string, unknown>;
  if (target.type === "coordinate") {
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail("Coordinates must be numbers.");
    if (x < 0 || y < 0 || x > CLOUD_BROWSER_VIEWPORT.width || y > CLOUD_BROWSER_VIEWPORT.height) {
      fail(
        `Coordinates must be inside the ${CLOUD_BROWSER_VIEWPORT.width}x${CLOUD_BROWSER_VIEWPORT.height} viewport.`,
      );
    }
    return { type: "coordinate", x: Math.round(x), y: Math.round(y) };
  }
  if (allowRef && target.type === "ref" && typeof target.ref === "string") {
    if (!/^ref_\d{1,6}$/.test(target.ref)) fail(`${target.ref} is not a valid reference.`);
    return { type: "ref", ref: target.ref };
  }
  fail(allowRef ? "Use a ref or coordinate target." : "Use a coordinate target.");
}

export class CloudBrowserSession {
  private readonly tabs = new Map<string, Page>();
  private readonly pageIds = new WeakMap<Page, string>();
  private activeTabId: string | null = null;
  private nextTabNumber = 1;
  private pendingChanges: BrowserStateChange[] = [];
  private readonly dnsCache = new Map<string, { expires: number; allowed: boolean }>();
  private readonly resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  private dnsInFlight = 0;
  private readonly dnsWaiters: Array<() => void> = [];
  private readonly dnsHosts = new Set<string>();
  private dnsBudgetExceeded = false;
  /** Tabs that loaded something from a private address the guard could not stop. */
  private readonly tainted = new WeakSet<Page>();
  private activeToken: MemberToken | null = null;
  /** Owner-entered text stays in memory for screenshot/text redaction only. */
  private readonly ownerEnteredValues: string[] = [];
  private closed = false;
  private disconnected = false;
  /** Set when a page tried to reach a private or non-web address. */
  blockedRequests = 0;

  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
  ) {}

  /**
   * Connect and set up a session, bounded: a vendor that accepts the
   * connection and then never answers cannot hold a task (and its capacity
   * slot) forever. A session that finishes opening after the deadline is
   * closed, never used.
   */
  static async open(connection: CloudBrowserConnection): Promise<CloudBrowserSession> {
    const opening = CloudBrowserSession.openUnbounded(connection);
    try {
      return await withDeadline(opening, OPEN_DEADLINE_MS);
    } catch (error) {
      void opening.then((session) => session.close()).catch(() => undefined);
      throw error;
    }
  }

  private static async openUnbounded(
    connection: CloudBrowserConnection,
  ): Promise<CloudBrowserSession> {
    const browser =
      connection.kind === "remote"
        ? await chromium.connect(connection.wsEndpoint, { timeout: NAVIGATION_TIMEOUT_MS })
        : await chromium.launch({
            executablePath: connection.executablePath,
            headless: true,
            args: ["--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"],
          });
    let context: BrowserContext | null = null;
    try {
      // Never reuse a vendor default context: it may contain another session's
      // cookies, history, or open pages. If isolation is unavailable, fail closed.
      context = await browser.newContext({
        viewport: CLOUD_BROWSER_VIEWPORT,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: "block",
        javaScriptEnabled: true,
        permissions: [],
        locale: "en-US",
        timezoneId: "America/Chicago",
      });
      const session = new CloudBrowserSession(browser, context);
      browser.on("disconnected", () => {
        session.disconnected = true;
      });
      await context.addInitScript(ISOLATION_INIT_SCRIPT);
      await context.route("**/*", (route) => session.guard(route));
      // WebSockets are not seen by context.route; screen them the same way.
      // Both are first lines only: route handlers never see redirect hops,
      // and page script or a Worker can open a socket around routeWebSocket.
      // The listeners below detect what got through, and enforcePublicTabs
      // blanks the tab before anything it loaded can be read.
      await context.routeWebSocket(/.*/, async (ws) => {
        if (await session.urlIsPublic(ws.url())) {
          ws.connectToServer();
        } else {
          session.blockedRequests += 1;
          await ws.close({ code: 1008, reason: "Blocked" }).catch(() => undefined);
        }
      });
      context.on("request", (request) => session.screenRedirect(request));
      // The address a response came from is the browser's own resolution, so
      // it catches DNS rebinding. Only a local launch is checked: a hosted
      // browser may reach the web through its vendor's proxy, whose address
      // is not the site's; the vendor's network isolation covers that case.
      if (connection.kind === "local") {
        context.on("response", (response) => session.screenServerAddress(response));
      }
      context.setDefaultTimeout(ACTION_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
      context.on("page", (page) => {
        if (session.pageIds.has(page)) return;
        const id = session.register(page);
        session.pendingChanges.push({ type: "tab_opened", tab_id: id });
      });
      const first = context.pages()[0] ?? (await context.newPage());
      if (!session.pageIds.has(first)) session.register(first);
      session.activeTabId = session.pageIds.get(first) ?? null;
      // The initial tab is the starting state, not an opened-tab event.
      session.pendingChanges = [];
      await first.setViewportSize(CLOUD_BROWSER_VIEWPORT).catch(() => undefined);
      return session;
    } catch (error) {
      await withDeadline(
        (async () => {
          await context?.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
        })(),
        CLOSE_DEADLINE_MS,
      ).catch(() => undefined);
      throw error;
    }
  }

  private register(page: Page): string {
    const id = `tab-${this.nextTabNumber++}`;
    this.tabs.set(id, page);
    this.pageIds.set(page, id);
    page.on("dialog", (dialog) => {
      dialog.dismiss().catch(() => undefined);
    });
    page.on("websocket", (ws) => this.screenUrl(page, ws.url()));
    page.on("close", () => {
      this.tabs.delete(id);
      if (this.activeTabId === id) this.activeTabId = [...this.tabs.keys()].at(-1) ?? null;
    });
    if (this.tabs.size > MAX_TABS) page.close().catch(() => undefined);
    return id;
  }

  /** Every request, including subresources, must reach a public web address. */
  private async guard(route: Route): Promise<void> {
    const raw = route.request().url();
    if (raw.startsWith("data:") || raw.startsWith("blob:") || raw === "about:blank") {
      await route.continue().catch(() => undefined);
      return;
    }
    const allowed = await this.urlIsPublic(raw);
    if (allowed) {
      await route.continue().catch(() => undefined);
    } else {
      this.blockedRequests += 1;
      await route.abort("blockedbyclient").catch(() => undefined);
    }
  }

  /** Mark a tab (or every tab, when the source is unknown) for blanking. */
  private taint(page: Page | null): void {
    if (this.closed) return;
    this.blockedRequests += 1;
    // A tab already blanked holds nothing; a late result must not fail it again.
    const pages = page ? [page] : [...this.tabs.values()];
    for (const tab of pages)
      if (!tab.isClosed() && tab.url() !== "about:blank") this.tainted.add(tab);
  }

  private static pageOf(request: BrowserRequest): Page | null {
    try {
      return request.frame().page();
    } catch {
      // Worker and service-worker requests have no frame.
      return null;
    }
  }

  private screenUrl(page: Page | null, raw: string): void {
    void this.urlIsPublic(raw).then(
      (allowed) => {
        if (!allowed) this.taint(page);
      },
      () => undefined,
    );
  }

  /** Route handlers see only the first URL of a redirect chain; check every hop. */
  private screenRedirect(request: BrowserRequest): void {
    if (!request.redirectedFrom()) return;
    this.screenUrl(CloudBrowserSession.pageOf(request), request.url());
  }

  private screenServerAddress(response: BrowserResponse): void {
    void response.serverAddr().then(
      (address) => {
        if (address && isIP(address.ipAddress) && isNonPublicAddress(address.ipAddress)) {
          this.taint(CloudBrowserSession.pageOf(response.request()));
        }
      },
      () => undefined,
    );
  }

  /** A web URL whose host is a public address (by literal or by DNS). */
  async urlIsPublic(raw: string): Promise<boolean> {
    try {
      const url = new URL(
        raw.replace(/^wss?:/, (scheme) => (scheme === "wss:" ? "https:" : "http:")),
      );
      return checkUrlAllowed(url).allowed && (await this.hostResolvesPublic(url.hostname));
    } catch {
      return false;
    }
  }

  private async withDnsSlot<T>(work: () => Promise<T>): Promise<T> {
    while (this.dnsInFlight >= DNS_CONCURRENCY) {
      await new Promise<void>((resolve) => this.dnsWaiters.push(resolve));
    }
    this.dnsInFlight += 1;
    try {
      return await work();
    } finally {
      this.dnsInFlight -= 1;
      this.dnsWaiters.shift()?.();
    }
  }

  private async hostResolvesPublic(hostname: string): Promise<boolean> {
    const host = normalizeHostname(hostname);
    if (isIP(host)) return !isNonPublicAddress(host);
    const cached = this.dnsCache.get(host);
    if (cached && Date.now() < cached.expires) return cached.allowed;
    // A page cannot make this session resolve new names without bound;
    // re-checking a host it already resolved never counts.
    if (!this.dnsHosts.has(host)) {
      if (this.dnsHosts.size >= DNS_MAX_HOSTS) {
        this.dnsBudgetExceeded = true;
        return false;
      }
      this.dnsHosts.add(host);
    }
    const [v4, v6] = await this.withDnsSlot(() =>
      Promise.allSettled([
        this.resolver.resolve4(host, { ttl: true }),
        this.resolver.resolve6(host, { ttl: true }),
      ]),
    );
    // "No such record" is an answer; a timeout or server failure is not, and
    // a family that failed may be exactly the one the browser would use.
    const failed = [v4, v6].some(
      (result) =>
        result.status === "rejected" &&
        !["ENODATA", "ENOTFOUND"].includes((result.reason as { code?: string })?.code ?? ""),
    );
    const records = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
    const allowed =
      !failed &&
      records.length > 0 &&
      records.every((record) => !isNonPublicAddress(record.address));
    const ttlMs = failed
      ? DNS_FAILURE_CACHE_MS
      : allowed
        ? Math.min(DNS_CACHE_MS, Math.min(...records.map((record) => record.ttl)) * 1_000)
        : DNS_CACHE_MS;
    if (ttlMs > 0) {
      if (this.dnsCache.size >= DNS_CACHE_MAX) {
        const oldest = this.dnsCache.keys().next().value;
        if (oldest !== undefined) this.dnsCache.delete(oldest);
      }
      this.dnsCache.set(host, { expires: Date.now() + ttlMs, allowed });
    }
    return allowed;
  }

  /** True once the session was closed or the browser connection dropped. */
  get isClosed(): boolean {
    return this.closed || this.disconnected;
  }

  /**
   * Redirect hops are not routed through the request guard, so a tab or one
   * of its frames can still land on a private address. Blank (or close) any
   * such tab before the model or the live view can read it, and report which.
   */
  private async enforcePublicTabs(): Promise<Set<string>> {
    const blanked = new Set<string>();
    for (const [tabId, page] of [...this.tabs]) {
      if (page.isClosed()) continue;
      let safe = !this.tainted.has(page);
      for (const frame of safe ? page.frames() : []) {
        const raw = frame.url();
        if (isLocalFrameUrl(raw)) continue;
        if (!(await this.urlIsPublic(raw))) {
          safe = false;
          break;
        }
      }
      if (safe) continue;
      this.tainted.delete(page);
      this.blockedRequests += 1;
      blanked.add(tabId);
      const cleared = await page.goto("about:blank").then(
        () => true,
        () => false,
      );
      if (!cleared) await page.close().catch(() => undefined);
    }
    return blanked;
  }

  /** Whether the focused element, in any frame, is a password field. */
  private async focusedPasswordField(page: Page): Promise<boolean> {
    for (const frame of page.frames()) {
      const hit = await frame
        .evaluate(() => {
          if (!document.hasFocus()) return false;
          let active: Element | null = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return active instanceof HTMLInputElement && active.type.toLowerCase() === "password";
        })
        .catch(() => false);
      if (hit === true) return true;
    }
    return false;
  }

  activePage(tabId?: unknown): Page {
    const id = typeof tabId === "string" && tabId ? tabId : this.activeTabId;
    const page = id ? this.tabs.get(id) : undefined;
    if (!page || page.isClosed()) fail(id ? `Tab ${id} is not open.` : "No tab is open.");
    return page;
  }

  activeUrl(): string {
    try {
      return this.activePage().url();
    } catch {
      return "";
    }
  }

  async browserState(): Promise<BrowserStateBlock> {
    const tabs: BrowserStateTab[] = [];
    for (const [tabId, page] of this.tabs) {
      if (page.isClosed()) continue;
      const title = await page.title().catch(() => "");
      tabs.push({
        tab_id: tabId,
        title: sanitizeStateText(title || "Untitled"),
        url: sanitizeStateText(modelBrowserUrl(page.url() || "about:blank")),
        ...(tabId === this.activeTabId ? { active: true } : {}),
      });
    }
    if (tabs.length && !tabs.some((tab) => tab.active)) {
      tabs[tabs.length - 1].active = true;
      this.activeTabId = tabs[tabs.length - 1].tab_id;
    }
    const seen = new Set<string>();
    const changes = this.pendingChanges
      .splice(0)
      .filter((change) => {
        if (seen.has(change.tab_id) || !this.tabs.has(change.tab_id)) return false;
        seen.add(change.tab_id);
        return true;
      })
      .slice(0, 200);
    return { type: "browser_state", tabs, ...(changes.length ? { state_changes: changes } : {}) };
  }

  /**
   * JPEG frame for the owner's live view. Never sent to the model. The tabs
   * are checked before and after the capture, because a frame can commit to
   * a private address while the screenshot is taken.
   */
  async frame(): Promise<Buffer | null> {
    try {
      if ((await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS)).size) return null;
      const jpeg = await this.activePage().screenshot({
        type: "jpeg",
        quality: 62,
        timeout: 10_000,
      });
      if ((await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS)).size) return null;
      return jpeg;
    } catch {
      return null;
    }
  }

  /** Redacted JPEG for the model. Form values and owner-entered text are masked. */
  async modelFrame(): Promise<Buffer | null> {
    try {
      if ((await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS)).size) return null;
      const jpeg = await this.captureModelScreenshot(this.activePage(), {
        type: "jpeg",
        quality: 62,
        timeout: 10_000,
      });
      if ((await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS)).size) return null;
      return jpeg;
    } catch {
      return null;
    }
  }

  /**
   * Apply one explicit owner action during a paused Bot handoff. Unlike model
   * actions, owner typing may reach password fields. It is never returned as
   * activity or included in a model tool result.
   */
  async executeOwnerInput(input: OwnerControlInput): Promise<Buffer> {
    const token: MemberToken = { cancelled: false };
    this.activeToken = token;
    try {
      if (this.disconnected || this.closed) fail("The cloud computer is no longer connected.");
      if ((await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS)).size) {
        this.failPrivateAddress();
      }
      const page = this.activePage();
      await withDeadline(
        (async () => {
          switch (input.kind) {
            case "click": {
              const point = parseTarget({ type: "coordinate", x: input.x, y: input.y }, false);
              if (point.type !== "coordinate") fail("Choose a point on the browser screen.");
              await page.mouse.click(point.x, point.y);
              break;
            }
            case "drag": {
              const from = parseTarget({ type: "coordinate", ...input.from }, false);
              const to = parseTarget({ type: "coordinate", ...input.to }, false);
              if (from.type !== "coordinate" || to.type !== "coordinate") {
                fail("Choose points inside the browser screen.");
              }
              await page.mouse.move(from.x, from.y);
              await page.mouse.down();
              try {
                await page.mouse.move(to.x, to.y, { steps: 8 });
              } finally {
                await page.mouse.up().catch(() => undefined);
              }
              break;
            }
            case "scroll": {
              const point = parseTarget({ type: "coordinate", x: input.x, y: input.y }, false);
              if (point.type !== "coordinate") fail("Choose a point on the browser screen.");
              if (
                !Number.isFinite(input.deltaX) ||
                !Number.isFinite(input.deltaY) ||
                Math.abs(input.deltaX) > 1_200 ||
                Math.abs(input.deltaY) > 1_200 ||
                (!input.deltaX && !input.deltaY)
              ) {
                fail("That scroll movement is outside the allowed range.");
              }
              await page.mouse.move(point.x, point.y);
              await page.mouse.wheel(input.deltaX, input.deltaY);
              break;
            }
            case "navigate": {
              const target = parseNavigateTarget(input.url);
              if (target.kind !== "url") {
                fail(target.kind === "refused" ? target.reason : "Use a full web address.");
              }
              await page.goto(target.url.toString(), { waitUntil: "domcontentloaded" });
              break;
            }
            case "history":
              if (input.action === "back") {
                await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
              } else if (input.action === "forward") {
                await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => null);
              } else {
                await page.reload({ waitUntil: "domcontentloaded" });
              }
              break;
            case "type": {
              if (typeof input.text !== "string" || !input.text || input.text.length > 1_000) {
                fail("Enter up to 1,000 characters to send to the focused page field.");
              }
              this.rememberOwnerEnteredValue(input.text);
              for (const piece of typingPieces(input.text)) {
                if (token.cancelled || this.closed) fail("Owner input was stopped.");
                if (piece === "\n") await page.keyboard.press("Enter");
                else await page.keyboard.type(piece, { delay: 0 });
              }
              break;
            }
            case "key": {
              const key = typeof input.key === "string" ? normalizeKeyName(input.key) : null;
              const allowed = new Set([
                "Enter",
                "Tab",
                "Escape",
                "Backspace",
                "Delete",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ]);
              if (!key || !allowed.has(key)) fail("Choose a supported navigation key.");
              await page.keyboard.press(key);
              break;
            }
          }
          await this.settle(page);
          await this.afterNavigationCheck(page);
        })(),
        MEMBER_DEADLINE_MS,
      );
      const frame = await this.frame();
      if (!frame) this.failPrivateAddress();
      return frame;
    } catch (error) {
      token.cancelled = true;
      throw error;
    } finally {
      if (this.activeToken === token) this.activeToken = null;
    }
  }

  /** Stop an in-flight owner typing action when the task is stopped. */
  cancelCurrentInput(): void {
    if (this.activeToken) this.activeToken.cancelled = true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.ownerEnteredValues.length = 0;
    if (this.activeToken) this.activeToken.cancelled = true;
    const shutdown = async () => {
      await this.context.close().catch(() => undefined);
      await this.browser.close().catch(() => undefined);
    };
    // A dead websocket must not hold the task open.
    await withDeadline(shutdown(), CLOSE_DEADLINE_MS).catch(() => undefined);
  }

  private async locate(page: Page, ref: string) {
    const locator = page.locator(`[data-bb-ref="${ref}"]`).first();
    if ((await locator.count().catch(() => 0)) === 0) {
      fail(
        `${ref} is stale or not found on the current page. Re-read the page to get fresh references.`,
      );
    }
    return locator;
  }

  private async pointAt(page: Page, target: Target): Promise<{ x: number; y: number }> {
    if (target.type === "coordinate") return target;
    const locator = await this.locate(page, target.ref);
    await locator.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS }).catch(() => undefined);
    const box = await locator.boundingBox();
    if (!box) fail(`${target.ref} is not visible on screen.`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  private async withModifiers<T>(page: Page, raw: unknown, action: () => Promise<T>): Promise<T> {
    const modifiers = parseModifiers(raw);
    if (!modifiers) fail("Unsupported modifier keys.");
    for (const key of modifiers) await page.keyboard.down(key);
    try {
      return await action();
    } finally {
      for (const key of [...modifiers].reverse())
        await page.keyboard.up(key).catch(() => undefined);
    }
  }

  /** JPEG keeps each screenshot a fraction of a PNG's size in the model's history. */
  private async screenshotBlock(page: Page): Promise<MemberResultBlock> {
    const jpeg = await this.captureModelScreenshot(page, {
      type: "jpeg",
      quality: 70,
      timeout: 15_000,
    });
    return {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
    };
  }

  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState("domcontentloaded", { timeout: 4_000 }).catch(() => undefined);
  }

  private async afterNavigationCheck(page: Page): Promise<void> {
    const url = page.url();
    if (!url || url === "about:blank") return;
    try {
      if (!checkUrlAllowed(new URL(url)).allowed) {
        await page.goto("about:blank").catch(() => undefined);
        this.failPrivateAddress();
      }
    } catch (error) {
      if (error instanceof MemberError) throw error;
    }
  }

  /** Execute one browser-toolset member. Errors become is_error results; nothing throws. */
  async execute(member: string, input: MemberInput): Promise<MemberResult> {
    const token: MemberToken = { cancelled: false };
    this.activeToken = token;
    try {
      if (this.disconnected) fail("The cloud computer lost its browser connection.");
      const target =
        typeof input?.tab_id === "string" && input.tab_id ? input.tab_id : this.activeTabId;
      const before = await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS);
      if (target && before.has(target)) this.failPrivateAddress();
      const result = await withDeadline(this.run(member, input ?? {}, token), MEMBER_DEADLINE_MS);
      // Check again before anything this step read can reach the model: any
      // tab blanked now may appear in this result's tab list, page text, or
      // screenshot, and the whole result is withheld.
      const after = await withDeadline(this.enforcePublicTabs(), MEMBER_DEADLINE_MS);
      if (after.size) this.failPrivateAddress();
      return {
        ...result,
        content: result.content.map((block) => {
          if (block.type === "text") {
            return { ...block, text: this.redactOwnerText(block.text) };
          }
          if (block.type === "browser_state") {
            return {
              ...block,
              tabs: block.tabs.map((tab) => ({
                ...tab,
                title: this.redactOwnerText(tab.title),
                url: this.redactOwnerText(tab.url),
              })),
            };
          }
          return block;
        }),
        activity: this.redactOwnerText(result.activity),
      };
    } catch (error) {
      // Work the member started (typing, above all) stops at its next check.
      token.cancelled = true;
      const message =
        error instanceof MemberError
          ? this.redactOwnerText(error.message)
          : error instanceof Error && /Timeout/i.test(error.name + error.message)
            ? `${member} timed out. The page may still be loading; take a screenshot to check.`
            : `${member} failed. Take a screenshot or re-read the page and try another approach.`;
      return {
        ok: false,
        content: [{ type: "text", text: `Error: ${message}` }],
        activity: `${member.replace(/_/g, " ")} did not work`,
      };
    } finally {
      if (this.activeToken === token) this.activeToken = null;
    }
  }

  private failPrivateAddress(): never {
    fail(this.dnsBudgetExceeded ? TOO_MANY_SITES : PRIVATE_ADDRESS_STOP);
  }

  /** Refuse to put text into a focused password field, in any frame. */
  private async refuseIntoPasswordField(page: Page): Promise<void> {
    if (await this.focusedPasswordField(page)) {
      fail("Passwords are entered by the owner, not the Bot.");
    }
  }

  private ok(text: string, activity: string, extra: MemberResultBlock[] = []): MemberResult {
    return { ok: true, content: [{ type: "text", text }, ...extra], activity };
  }

  private rememberOwnerEnteredValue(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length < 4 || this.ownerEnteredValues.includes(trimmed)) return;
    this.ownerEnteredValues.push(trimmed);
    let total = this.ownerEnteredValues.reduce((sum, item) => sum + item.length, 0);
    while (
      this.ownerEnteredValues.length > MAX_OWNER_REDACTIONS ||
      total > MAX_OWNER_REDACTION_CHARS
    ) {
      const removed = this.ownerEnteredValues.shift();
      total -= removed?.length ?? 0;
    }
  }

  private redactOwnerText(value: string): string {
    return this.ownerEnteredValues.reduce((text, secret) => {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return text.replace(new RegExp(escaped, "gi"), "[owner-entered text hidden]");
    }, value);
  }

  private async captureModelScreenshot(
    page: Page,
    options: {
      type: "jpeg";
      quality: number;
      timeout: number;
      clip?: { x: number; y: number; width: number; height: number };
    },
  ): Promise<Buffer> {
    const masks: Locator[] = [];
    for (const frame of page.frames()) {
      masks.push(frame.locator(MODEL_EDITABLE_SELECTOR));
      for (const value of this.ownerEnteredValues) {
        masks.push(frame.getByText(value, { exact: false }));
      }
    }
    return page.screenshot({
      ...options,
      animations: "disabled",
      caret: "hide",
      mask: masks,
      maskColor: "#111111",
    });
  }

  private async run(member: string, input: MemberInput, token: MemberToken): Promise<MemberResult> {
    if (this.closed) fail("The cloud computer has shut down.");
    switch (member) {
      case "navigate": {
        const page = this.activePage(input.tab_id);
        const target = parseNavigateTarget(input.url);
        if (target.kind === "refused") fail(target.reason);
        if (target.kind === "history") {
          if (target.action === "back") await page.goBack({ waitUntil: "domcontentloaded" });
          else if (target.action === "forward")
            await page.goForward({ waitUntil: "domcontentloaded" });
          else await page.reload({ waitUntil: "domcontentloaded" });
        } else {
          await page.goto(target.url.toString(), { waitUntil: "domcontentloaded" });
        }
        await this.afterNavigationCheck(page);
        const where = modelBrowserUrl(page.url());
        return this.ok(`Navigated to ${where}`, `Opened ${where}`, [await this.browserState()]);
      }
      case "screenshot": {
        const page = this.activePage(input.tab_id);
        return {
          ok: true,
          content: [await this.screenshotBlock(page)],
          activity: "Looked at the screen",
        };
      }
      case "zoom": {
        const page = this.activePage(input.tab_id);
        const region = Array.isArray(input.region) ? input.region.map(Number) : [];
        if (region.length !== 4 || region.some((n) => !Number.isFinite(n))) {
          fail("zoom needs region [x0, y0, x1, y1].");
        }
        const [x0, y0, x1, y1] = region;
        const width = Math.max(1, Math.min(CLOUD_BROWSER_VIEWPORT.width, x1) - Math.max(0, x0));
        const height = Math.max(1, Math.min(CLOUD_BROWSER_VIEWPORT.height, y1) - Math.max(0, y0));
        if (width < 4 || height < 4) fail("That zoom region is too small.");
        const shot = await this.captureModelScreenshot(page, {
          type: "jpeg",
          quality: 82,
          timeout: 15_000,
          clip: { x: Math.max(0, x0), y: Math.max(0, y0), width, height },
        });
        return {
          ok: true,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: shot.toString("base64"),
              },
            },
          ],
          activity: "Zoomed in to read details",
        };
      }
      case "left_click":
      case "right_click":
      case "middle_click":
      case "double_click":
      case "triple_click": {
        const page = this.activePage(input.tab_id);
        const target = parseTarget(input.target);
        const button =
          member === "right_click" ? "right" : member === "middle_click" ? "middle" : "left";
        const clickCount = member === "double_click" ? 2 : member === "triple_click" ? 3 : 1;
        let label = "";
        if (target.type === "ref") {
          const locator = await this.locate(page, target.ref);
          const raw = await locator
            .evaluate((el) =>
              ((el as { innerText?: string }).innerText || el.getAttribute("aria-label") || "")
                .trim()
                .slice(0, 60),
            )
            .catch(() => "");
          // The page realm can return anything; clamp on this side.
          label = typeof raw === "string" ? raw.slice(0, 60) : "";
          await this.withModifiers(page, input.modifiers, () =>
            locator.click({ button, clickCount, timeout: ACTION_TIMEOUT_MS }),
          );
        } else {
          await this.withModifiers(page, input.modifiers, () =>
            page.mouse.click(target.x, target.y, { button, clickCount }),
          );
        }
        await this.settle(page);
        await this.afterNavigationCheck(page);
        const where = target.type === "ref" ? target.ref : `(${target.x}, ${target.y})`;
        return this.ok(
          `Clicked ${where}.`,
          label ? `Clicked "${label.replace(/\s+/g, " ")}"` : "Clicked on the page",
          [await this.browserState()],
        );
      }
      case "hover": {
        const page = this.activePage(input.tab_id);
        const point = await this.pointAt(page, parseTarget(input.target));
        await page.mouse.move(point.x, point.y);
        return this.ok("Moved the pointer.", "Hovered over an element");
      }
      case "mouse_move": {
        const page = this.activePage(input.tab_id);
        const point = parseTarget(input.target, false) as { x: number; y: number };
        await this.withModifiers(page, input.modifiers, () => page.mouse.move(point.x, point.y));
        return this.ok("Moved the pointer.", "Moved the pointer");
      }
      case "left_click_drag": {
        const page = this.activePage(input.tab_id);
        const rawPath = Array.isArray(input.path) ? input.path : [input.from, input.target];
        if (rawPath.length < 2 || rawPath.length > 50) fail("The drag path is invalid.");
        const path = rawPath.map((point) => parseTarget(point, false) as { x: number; y: number });
        await this.withModifiers(page, input.modifiers, async () => {
          const [from, ...remaining] = path;
          if (!from) fail("The drag path is invalid.");
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          try {
            for (const point of remaining) await page.mouse.move(point.x, point.y);
          } finally {
            await page.mouse.up().catch(() => undefined);
          }
        });
        return this.ok("Dragged.", "Dragged on the page");
      }
      case "left_mouse_down":
      case "left_mouse_up": {
        const page = this.activePage(input.tab_id);
        const point = parseTarget(input.target, false) as { x: number; y: number };
        await page.mouse.move(point.x, point.y);
        if (member === "left_mouse_down") await page.mouse.down();
        else await page.mouse.up();
        return this.ok(member === "left_mouse_down" ? "Pressed." : "Released.", "Used the mouse");
      }
      case "scroll": {
        const page = this.activePage(input.tab_id);
        const point = parseTarget(input.target, false) as { x: number; y: number };
        const hasDeltas = input.scroll_x !== undefined || input.scroll_y !== undefined;
        let dx: number;
        let dy: number;
        if (hasDeltas) {
          dx = clampNumber(input.scroll_x, -1_200, 1_200, 0);
          dy = clampNumber(input.scroll_y, -1_200, 1_200, 0);
        } else {
          const direction = String(input.scroll_direction || "down");
          const amount = clampNumber(input.scroll_amount, 1, 10, 3) * 120;
          dx = direction === "left" ? -amount : direction === "right" ? amount : 0;
          dy = direction === "up" ? -amount : direction === "down" ? amount : 0;
        }
        if (!dx && !dy) fail("Provide a non-zero horizontal or vertical scroll.");
        await page.mouse.move(point.x, point.y);
        await this.withModifiers(page, input.modifiers, () => page.mouse.wheel(dx, dy));
        await page.waitForTimeout(250);
        return this.ok("Scrolled the page.", "Scrolled the page");
      }
      case "scroll_to": {
        const page = this.activePage(input.tab_id);
        const target = parseTarget(input.target);
        if (target.type !== "ref") fail("scroll_to needs a ref target.");
        const locator = await this.locate(page, target.ref);
        await locator.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
        return this.ok(`Scrolled ${target.ref} into view.`, "Scrolled to an element");
      }
      case "type": {
        const page = this.activePage(input.tab_id);
        const text = typeof input.text === "string" ? input.text : "";
        if (!text) fail("type needs text.");
        if (text.length > MAX_TYPE_CHARS)
          fail(`Type at most ${MAX_TYPE_CHARS} characters at a time.`);
        // form_input refuses password fields; typing into a focused one must
        // too. Focus can move mid-text (Enter submits a step and focuses the
        // next field), so the check runs before every run of characters.
        for (const piece of typingPieces(text)) {
          if (token.cancelled || this.closed) fail("type was stopped before it finished.");
          await this.refuseIntoPasswordField(page);
          if (piece === "\n") await page.keyboard.press("Enter");
          else await page.keyboard.type(piece, { delay: 8 });
        }
        return this.ok("Typed the text.", "Typed into a field");
      }
      case "key": {
        const page = this.activePage(input.tab_id);
        const chords = parseKeySequence(String(input.text ?? ""));
        if (!chords) fail("Unsupported key name. Use names like Enter, Tab, Escape, ctrl+a.");
        // Keys that type characters follow the password rule too, checked
        // before each one: an earlier Tab in the sequence can move focus.
        const repeat = clampNumber(input.repeat, 1, 100, 1);
        for (let i = 0; i < repeat; i += 1) {
          for (const chord of chords) {
            if (token.cancelled || this.closed) fail("key was stopped before it finished.");
            if (chordTypesText(chord)) await this.refuseIntoPasswordField(page);
            await page.keyboard.press(chord);
          }
        }
        await this.settle(page);
        await this.afterNavigationCheck(page);
        return this.ok(`Pressed ${chords.join(" ")}.`, `Pressed ${chords.join(" ")}`, [
          await this.browserState(),
        ]);
      }
      case "hold_key": {
        const page = this.activePage(input.tab_id);
        const chords = parseKeySequence(String(input.text ?? ""));
        if (!chords || chords.length !== 1) fail("hold_key needs one key or chord.");
        if (chordTypesText(chords[0])) await this.refuseIntoPasswordField(page);
        const keys = chords[0].split("+");
        const seconds = clampNumber(input.duration, 0, 5, 1);
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(seconds * 1000);
        for (const key of [...keys].reverse()) await page.keyboard.up(key);
        return this.ok(`Held ${chords[0]}.`, `Held ${chords[0]}`);
      }
      case "wait": {
        const page = this.activePage(input.tab_id);
        const seconds = clampNumber(input.duration, 0, 10, 1);
        await page.waitForTimeout(seconds * 1000);
        return this.ok(`Waited ${seconds} seconds.`, "Waited for the page");
      }
      case "read_page": {
        const page = this.activePage(input.tab_id);
        const filter =
          input.filter === "interactive" || input.filter === "all" ? input.filter : "visible";
        const depth = clampNumber(input.depth, 1, 15, 15);
        const root =
          typeof input.ref === "string" && /^ref_\d{1,6}$/.test(input.ref) ? input.ref : undefined;
        const text = pageText(
          await page.evaluate(
            snapshotExpression({
              mode: filter as SnapshotMode,
              depth,
              root,
              maxChars: READ_MAX_CHARS,
            }),
          ),
          READ_MAX_CHARS,
        );
        if (text.startsWith("Error:")) fail(text.slice(7));
        return this.ok(text, "Read the page");
      }
      case "find": {
        const page = this.activePage(input.tab_id);
        const query = typeof input.query === "string" ? input.query.slice(0, 200) : "";
        if (!query.trim()) fail("find needs a query.");
        const text = pageText(
          await page.evaluate(
            snapshotExpression({ mode: "find", depth: 15, query, maxChars: READ_MAX_CHARS }),
          ),
          READ_MAX_CHARS,
        );
        return this.ok(text, `Looked for ${query.slice(0, 40)}`);
      }
      case "get_page_text": {
        const page = this.activePage(input.tab_id);
        const text = pageText(
          await page.evaluate(snapshotExpression({ mode: "text", maxChars: TEXT_MAX_CHARS })),
          TEXT_MAX_CHARS,
        );
        return this.ok(text || "(The page has no readable text.)", "Read the page text");
      }
      case "form_input": {
        const page = this.activePage(input.tab_id);
        const target = parseTarget(input.target);
        if (target.type !== "ref") fail("form_input needs a ref target.");
        const locator = await this.locate(page, target.ref);
        const kind = await locator.evaluate((el) => {
          const tag = el.tagName;
          const type = (el.getAttribute("type") || "").toLowerCase();
          if (tag === "SELECT") return "select";
          if (tag === "INPUT" && (type === "checkbox" || type === "radio")) return "check";
          if (tag === "INPUT" && type === "password") return "password";
          if (tag === "INPUT" && type === "file") return "file";
          return "text";
        });
        if (kind === "password") fail("Passwords are entered by the owner, not the Bot.");
        if (kind === "file") fail("File uploads are not available on the cloud computer.");
        const value = input.value;
        if (kind === "check") {
          await locator.setChecked(value === true || value === "true", {
            timeout: ACTION_TIMEOUT_MS,
          });
        } else if (kind === "select") {
          const wanted = String(value ?? "")
            .trim()
            .toLowerCase();
          const match = await locator.evaluate((el, wantedValue) => {
            const options = Array.from((el as HTMLSelectElement).options);
            const hit =
              options.find((option) => option.value.toLowerCase() === wantedValue) ??
              options.find(
                (option) => (option.textContent || "").trim().toLowerCase() === wantedValue,
              );
            return hit ? hit.value : null;
          }, wanted);
          if (match === null) fail(`No option matches "${String(value ?? "").slice(0, 60)}".`);
          await locator.selectOption({ value: match }, { timeout: ACTION_TIMEOUT_MS });
        } else {
          const text = String(value ?? "");
          if (text.length > MAX_TYPE_CHARS)
            fail(`Values are limited to ${MAX_TYPE_CHARS} characters.`);
          await locator.fill(text, { timeout: ACTION_TIMEOUT_MS });
        }
        return this.ok(`Set ${target.ref}.`, "Filled in a form field");
      }
      case "new_tab": {
        if (this.tabs.size >= MAX_TABS) fail(`At most ${MAX_TABS} tabs can be open.`);
        const page = await this.context.newPage();
        const id = this.pageIds.get(page) ?? this.register(page);
        if (!this.pendingChanges.some((change) => change.tab_id === id)) {
          this.pendingChanges.push({ type: "tab_opened", tab_id: id });
        }
        this.activeTabId = id;
        await page.setViewportSize(CLOUD_BROWSER_VIEWPORT).catch(() => undefined);
        return { ok: true, content: [await this.browserState()], activity: "Opened a new tab" };
      }
      case "list_tabs":
        return { ok: true, content: [await this.browserState()], activity: "Checked open tabs" };
      case "switch_tab": {
        const id = typeof input.tab_id === "string" ? input.tab_id : "";
        const page = this.tabs.get(id);
        if (!page || page.isClosed()) fail(`Tab ${id} is not open.`);
        this.activeTabId = id;
        await page.bringToFront().catch(() => undefined);
        return { ok: true, content: [await this.browserState()], activity: "Switched tabs" };
      }
      case "close_tab": {
        const id = typeof input.tab_id === "string" ? input.tab_id : "";
        const page = this.tabs.get(id);
        if (!page || page.isClosed()) fail(`Tab ${id} is not open.`);
        if (this.tabs.size <= 1) fail("The last tab stays open.");
        await page.close();
        return { ok: true, content: [await this.browserState()], activity: "Closed a tab" };
      }
      case "javascript_exec":
      case "file_upload":
      case "read_console":
      case "read_network":
        fail(`${member} is not enabled on the cloud computer.`);
      // falls through
      default:
        fail(`${member} is not a browser action.`);
    }
  }
}
