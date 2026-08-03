import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";

import { isPrivateIp, isPrivateIpv6 } from "./webhook-validators";

export type WebhookAddress = { address: string; family: 4 | 6 };
export type WebhookAddressLookup = (hostname: string) => Promise<WebhookAddress[]>;

export type PinnedWebhookDestination =
  | {
      status: "public";
      url: URL;
      address: string;
      family: 4 | 6;
    }
  | {
      status: "blocked";
      reason: "invalid_url" | "unsupported_protocol" | "private_destination" | "dns_resolution_failed";
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
      reason: PinnedWebhookDestination extends infer _T
        ? "invalid_url" | "unsupported_protocol" | "private_destination" | "dns_resolution_failed"
        : never;
    };

const defaultLookup: WebhookAddressLookup = async (hostname) => {
  const addresses = await lookup(hostname, { all: true });
  return addresses
    .filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map((entry) => ({ address: entry.address, family: entry.family }));
};

function addressIsPrivate(address: WebhookAddress): boolean {
  return address.family === 4 ? isPrivateIp(address.address) : isPrivateIpv6(address.address);
}

/**
 * Resolve once, reject when any answer is non-public, and return the exact
 * address that the delivery socket must use. Rejecting mixed public/private
 * answers prevents an attacker from influencing address selection after the
 * safety decision.
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

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { status: "blocked", reason: "unsupported_protocol" };
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
    return addressIsPrivate(destination)
      ? { status: "blocked", reason: "private_destination" }
      : { status: "public", url, ...destination };
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

  return { status: "public", url, ...addresses[0] };
}

function requestWithPinnedAddress(
  destination: Extract<PinnedWebhookDestination, { status: "public" }>,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<SafeWebhookPostResult> {
  return new Promise((resolve, reject) => {
    const pinnedLookup: NonNullable<http.RequestOptions["lookup"]> = (
      _hostname,
      _options,
      callback,
    ) => callback(null, destination.address, destination.family);

    const transport = destination.url.protocol === "https:" ? https : http;
    const request = transport.request(
      destination.url,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        lookup: pinnedLookup,
        ...(destination.url.protocol === "https:"
          ? { servername: destination.url.hostname }
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
 * resolved and classified first, then the HTTP(S) socket is forced to use that
 * exact approved address while TLS SNI and the Host header retain the original
 * customer hostname.
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
