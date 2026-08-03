import { isIP } from "node:net";
import * as https from "node:https";

import {
  resolvePinnedWebhookDestination,
  type PinnedWebhookDestination,
  type WebhookBlockReason,
} from "./safe-webhook-delivery";

const WEBSITE_FETCH_TIMEOUT_MS = 10_000;
const WEBSITE_FETCH_MAX_BYTES = 1_000_000;
const WEBSITE_FETCH_MAX_REDIRECTS = 3;
const WEBSITE_USER_AGENT = "WirelineKnowledgeBot/1.0 (+https://trywireline.com)";
const ALLOWED_CONTENT_TYPES = new Set(["text/html", "text/plain", "application/xhtml+xml"]);

type WebsiteFetchErrorCode =
  | "invalid_url"
  | "unsupported_protocol"
  | "private_destination"
  | "dns_resolution_failed"
  | "redirect_limit"
  | "redirect_loop"
  | "request_failed"
  | "upstream_status"
  | "unsupported_content_type"
  | "response_too_large"
  | "empty_content";

export class WebsiteFetchError extends Error {
  constructor(
    readonly code: WebsiteFetchErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "WebsiteFetchError";
  }
}

export type PublicWebsiteText = {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  title: string | null;
  text: string;
};

type PinnedPublicDestination = Extract<PinnedWebhookDestination, { status: "public" }>;

type PinnedGetResponse = {
  statusCode: number;
  location: string | null;
  contentType: string;
  body: Buffer;
};

function blockMessage(reason: WebhookBlockReason): WebsiteFetchError {
  if (reason === "private_destination") {
    return new WebsiteFetchError(
      reason,
      "That page resolves to a private or internal network and cannot be imported.",
      400,
    );
  }
  if (reason === "unsupported_protocol") {
    return new WebsiteFetchError(reason, "Website imports require an HTTPS URL.", 400);
  }
  if (reason === "invalid_url") {
    return new WebsiteFetchError(reason, "Enter a valid public HTTPS URL.", 400);
  }
  return new WebsiteFetchError(
    reason,
    "The website hostname could not be resolved safely.",
    422,
  );
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function mimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "";
}

function pinnedLookup(destination: PinnedPublicDestination): NonNullable<https.RequestOptions["lookup"]> {
  return ((
    _hostname: string,
    options: { all?: boolean } | number,
    callback: unknown,
  ) => {
    if (typeof callback !== "function") {
      throw new TypeError("Website DNS callback is unavailable");
    }
    if (typeof options === "object" && options?.all === true) {
      const allCallback = callback as (
        error: NodeJS.ErrnoException | null,
        addresses: Array<{ address: string; family: 4 | 6 }>,
      ) => void;
      allCallback(null, [{ address: destination.address, family: destination.family }]);
      return;
    }
    const singleCallback = callback as (
      error: NodeJS.ErrnoException | null,
      address: string,
      family: number,
    ) => void;
    singleCallback(null, destination.address, destination.family);
  }) as NonNullable<https.RequestOptions["lookup"]>;
}

function getPinnedPage(
  destination: PinnedPublicDestination,
  timeoutMs = WEBSITE_FETCH_TIMEOUT_MS,
): Promise<PinnedGetResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishError = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof WebsiteFetchError
          ? error
          : new WebsiteFetchError(
              "request_failed",
              "The website could not be reached securely.",
              502,
            ),
      );
    };

    const request = https.request(
      destination.url,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": WEBSITE_USER_AGENT,
          Connection: "close",
        },
        lookup: pinnedLookup(destination),
        agent: false,
        ...(isIP(destination.hostname) === 0 ? { servername: destination.hostname } : {}),
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        const location = headerValue(response.headers.location) || null;
        const contentType = mimeType(headerValue(response.headers["content-type"]));
        const declaredLength = Number(headerValue(response.headers["content-length"]));
        if (Number.isFinite(declaredLength) && declaredLength > WEBSITE_FETCH_MAX_BYTES) {
          response.destroy(
            new WebsiteFetchError(
              "response_too_large",
              "That page is too large to import. Use a focused page with the essential business information.",
              413,
            ),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buffer.length;
          if (total > WEBSITE_FETCH_MAX_BYTES) {
            response.destroy(
              new WebsiteFetchError(
                "response_too_large",
                "That page is too large to import. Use a focused page with the essential business information.",
                413,
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.once("error", finishError);
        response.once("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode,
            location,
            contentType,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(
        new WebsiteFetchError(
          "request_failed",
          "The website took too long to respond.",
          504,
        ),
      );
    });
    request.once("error", finishError);
    request.end();
  });
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => {
      const code = Number.parseInt(value, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&#(\d+);/g, (_match, value: string) => {
      const code = Number.parseInt(value, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

export function htmlToVisibleText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    : null;
  const text = decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|section|article|main|header|footer|nav|aside|h[1-6]|li|tr|table|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return { title: title || null, text };
}

function normalizePlainText(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

async function fetchPage(
  rawUrl: string,
  requestedUrl: string,
  redirectsRemaining: number,
  visited: Set<string>,
): Promise<PublicWebsiteText> {
  const destination = await resolvePinnedWebhookDestination(rawUrl);
  if (destination.status === "blocked") throw blockMessage(destination.reason);
  const normalizedUrl = destination.url.toString();
  if (visited.has(normalizedUrl)) {
    throw new WebsiteFetchError("redirect_loop", "The website redirects in a loop.", 422);
  }
  visited.add(normalizedUrl);

  const response = await getPinnedPage(destination);
  if (response.statusCode >= 300 && response.statusCode < 400) {
    if (!response.location) {
      throw new WebsiteFetchError(
        "upstream_status",
        "The website returned an incomplete redirect.",
        422,
      );
    }
    if (redirectsRemaining <= 0) {
      throw new WebsiteFetchError(
        "redirect_limit",
        "The website redirects too many times to import safely.",
        422,
      );
    }
    let redirected: URL;
    try {
      redirected = new URL(response.location, destination.url);
    } catch {
      throw new WebsiteFetchError(
        "invalid_url",
        "The website returned an invalid redirect.",
        422,
      );
    }
    return fetchPage(redirected.toString(), requestedUrl, redirectsRemaining - 1, visited);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new WebsiteFetchError(
      "upstream_status",
      `The website returned HTTP ${response.statusCode || "error"}.`,
      422,
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(response.contentType)) {
    throw new WebsiteFetchError(
      "unsupported_content_type",
      "That URL is not an HTML or plain-text page. Import a focused website page instead of a download.",
      415,
    );
  }

  const body = response.body.toString("utf8");
  const parsed =
    response.contentType === "text/html" || response.contentType === "application/xhtml+xml"
      ? htmlToVisibleText(body)
      : { title: null, text: normalizePlainText(body) };
  if (parsed.text.length < 40) {
    throw new WebsiteFetchError(
      "empty_content",
      "Wireline could not find enough readable text on that page.",
      422,
    );
  }
  return {
    requestedUrl,
    finalUrl: normalizedUrl,
    contentType: response.contentType,
    title: parsed.title,
    text: parsed.text,
  };
}

/**
 * Fetch one public HTTPS page with DNS pinning, private-network rejection,
 * redirect revalidation, a hard byte ceiling, and no cookies or credentials.
 */
export async function fetchPublicWebsiteText(rawUrl: string): Promise<PublicWebsiteText> {
  return fetchPage(rawUrl, rawUrl, WEBSITE_FETCH_MAX_REDIRECTS, new Set());
}
