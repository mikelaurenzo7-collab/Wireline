import { lookup } from "node:dns/promises";
import * as https from "node:https";
import { isIP } from "node:net";

import { isPrivateIp, isPrivateIpv6 } from "./webhook-validators";

export type WebhookAddress = { address: string; family: 4 | 6 };
export type WebhookAddressLookup = (hostname: string) => Promise<WebhookAddress[]>;
export type WebhookBlockReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "private_destination"
  | "dns_resolution_failed";

export type PinnedWebhookDestination =
  | {
      status: "public";
      url: URL;
      hostname: string;
      address: string;
      family: 4 | 6;
    }
  | {
      status: "blocked";
      reason: WebhookBlockReason;
    };

export type SafeWebhookPostResult =
  | {
      status: "sent";
      statusCode: number;
      ok: boolean;
      redirect: boolean;
    }
  | {
      status: "blocked";
      reason: WebhookBlockReason;
    };

const defaultLookup: WebhookAddressLookup = async (hostname) => {
  const addresses = await lookup(hostname, { all: true });
  return addresses
    .filter(
      (entry): entry is { address: string; family: 4 | 6 } =>
        entry.family === 4 || entry.family === 6,
    )
    .map((entry) => ({ address: entry.address, family: entry.family }));
};

function addressIsPrivate(address: WebhookAddress): boolean {
  return address.family === 4 ? isPrivateIp(address.address) : isPrivateIpv6(address.address);
}

/**
 * Resolve once, reject when any answer is non-public, and return the exact
 * address that the delivery socket must use. Rejecting mixed public/private
 * answers prevents an attacker from influencing address selection after the
 * safety decision. Customer webhooks are HTTPS-only because their payloads may
 * contain call, lead, email, appointment, or compliance data.
 */
export async function resolvePinnedWebhookDestination(
  raw: string,
  lookupAddresses: WebhookAddressLookup = defaultLookup,
): Promise<PinnedWebhookDestination> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: "blocked", reason: "invalid_url" };
  }

  const rawHost = url.hostname.toLowerCase();
  const hostname = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  if (!hostname || hostname === "localhost") {
    return { status: "blocked", reason: "private_destination" };
  }

  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    const destination: WebhookAddress = {
      address: hostname,
      family: literalFamily,
    };
    if (addressIsPrivate(destination)) {
      return { status: "blocked", reason: "private_destination" };
    }
    if (url.protocol !== "https:") {
      return { status: "blocked", reason: "unsupported_protocol" };
    }
    return { status: "public", url, hostname, ...destination };
  }

  if (url.protocol !== "https:") {
    return { status: "blocked", reason: "unsupported_protocol" };
  }

  let addresses: WebhookAddress[];
  try {
    addresses = await lookupAddresses(hostname);
  } catch {
    return { status: "blocked", reason: "dns_resolution_failed" };
  }
  if (!addresses.length) {
    return { status: "blocked", reason: "dns_resolution_failed" };
  }
  if (addresses.some(addressIsPrivate)) {
    return { status: "blocked", reason: "private_destination" };
  }

  return { status: "public", url, hostname, ...addresses[0] };
}

function requestWithPinnedAddress(
  destination: Extract<PinnedWebhookDestination, { status: "public" }>,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<SafeWebhookPostResult> {
  return new Promise((resolve, reject) => {
    const pinnedLookup = ((
      _hostname: string,
      options: { all?: boolean } | number,
      callback: unknown,
    ) => {
      if (typeof callback !== "function") {
        throw new TypeError("Webhook DNS callback is unavailable");
      }
      if (typeof options === "object" && options?.all === true) {
        const allCallback = callback as (
          error: NodeJS.ErrnoException | null,
          addresses: WebhookAddress[],
        ) => void;
        allCallback(null, [
          { address: destination.address, family: destination.family },
        ]);
        return;
      }
      const singleCallback = callback as (
        error: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void;
      singleCallback(null, destination.address, destination.family);
    }) as NonNullable<https.RequestOptions["lookup"]>;

    const request = https.request(
      destination.url,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body).toString(),
          Connection: "close",
        },
        lookup: pinnedLookup,
        // A fresh socket guarantees this request cannot reuse a connection that
        // bypasses the address selected by the current safety decision.
        agent: false,
        ...(isIP(destination.hostname) === 0
          ? { servername: destination.hostname }
          : {}),
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        response.resume();
        response.once("end", () => {
          resolve({
            status: "sent",
            statusCode,
            ok: statusCode >= 200 && statusCode < 300,
            redirect: statusCode >= 300 && statusCode < 400,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Webhook delivery timed out"));
    });
    request.once("error", reject);
    request.end(body);
  });
}

/**
 * POST a webhook without a second unconstrained DNS lookup. The destination is
 * resolved and classified first, then a fresh HTTPS socket is forced to use
 * that exact approved address while TLS SNI and the Host header retain the
 * original customer hostname. Redirects are surfaced to the caller and never
 * followed.
 */
export async function postWebhookSafely(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 10_000,
): Promise<SafeWebhookPostResult> {
  const destination = await resolvePinnedWebhookDestination(rawUrl);
  if (destination.status === "blocked") return destination;
  return requestWithPinnedAddress(destination, headers, body, timeoutMs);
}
