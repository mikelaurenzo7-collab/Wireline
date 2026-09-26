#!/usr/bin/env node

import "dotenv/config";
import { parseDncScrubResult } from "../src/lib/federal-dnc-result.mjs";

const TEST_PHONE = "2025550100";
const TIMEOUT_MS = 8_000;

function output(result, exitCode) {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = exitCode;
}

function isVercelToken(apiKey) {
  return /^vcp_/i.test(apiKey) || /^vercel_/i.test(apiKey);
}

function isDncScrubProvider(apiUrl) {
  const provider = process.env.FEDERAL_DNC_PROVIDER?.trim().toLowerCase();
  if (provider === "dncscrub") return true;
  try {
    return new URL(apiUrl).hostname.toLowerCase().includes("dncscrub.com");
  } catch {
    return apiUrl.toLowerCase().includes("dncscrub.com");
  }
}

function buildDncScrubRequestUrl(apiUrl) {
  const url = new URL(apiUrl);
  url.searchParams.set("phoneList", TEST_PHONE);
  url.searchParams.set("version", "5");
  url.searchParams.set("output", "json");
  return url.toString();
}

async function probeDncScrub(apiUrl, apiKey) {
  const response = await fetch(buildDncScrubRequestUrl(apiUrl), {
    method: "GET",
    headers: {
      loginId: apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      probe_ok: false,
      listed: true,
      detail: `DNCScrub probe failed with HTTP ${response.status}.`,
    };
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return {
      probe_ok: false,
      listed: true,
      detail: "DNCScrub probe returned non-JSON response.",
    };
  }

  const result = parseDncScrubResult(payload);
  if (!result.recognized) {
    return {
      probe_ok: false,
      listed: true,
      detail: "DNCScrub probe returned a malformed or unrecognized result.",
    };
  }

  return {
    probe_ok: true,
    listed: result.listed,
    detail:
      "DNCScrub returned a recognized result for the harmless NANP probe number. This is not permission to call.",
  };
}

async function probeGenericPost(apiUrl, apiKey) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ phone: TEST_PHONE }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      probe_ok: false,
      listed: true,
      detail: `Generic federal DNC probe failed with HTTP ${response.status}.`,
    };
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return {
      probe_ok: false,
      listed: true,
      detail: "Generic federal DNC probe returned non-JSON response.",
    };
  }

  if (typeof payload?.listed !== "boolean") {
    return {
      probe_ok: false,
      listed: true,
      detail: "Generic federal DNC probe returned no boolean listed result.",
    };
  }

  return {
    probe_ok: true,
    listed: payload.listed,
    detail:
      "Generic federal DNC endpoint returned a boolean listed result. This is not permission to call.",
  };
}

async function main() {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim() || "";
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim() || "";

  if (!apiKey && !apiUrl) {
    output(
      {
        configured: false,
        probe_ok: false,
        listed: false,
        source: "unconfigured",
        detail:
          "FEDERAL_DNC_API_URL and FEDERAL_DNC_API_KEY are not set; probe skipped intentionally.",
      },
      0,
    );
    return;
  }

  if (!apiKey || !apiUrl) {
    output(
      {
        configured: false,
        probe_ok: false,
        listed: false,
        source: "error",
        detail: "FEDERAL_DNC_API_URL and FEDERAL_DNC_API_KEY must both be set for a live probe.",
      },
      1,
    );
    return;
  }

  if (isVercelToken(apiKey)) {
    output(
      {
        configured: false,
        probe_ok: false,
        listed: false,
        source: "error",
        detail:
          "FEDERAL_DNC_API_KEY looks like a Vercel token (vcp_/vercel_), not a DNCScrub loginId.",
      },
      1,
    );
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    output(
      {
        configured: false,
        probe_ok: false,
        listed: false,
        source: "error",
        detail: "FEDERAL_DNC_API_URL is not a valid URL.",
      },
      1,
    );
    return;
  }

  if (parsedUrl.protocol !== "https:") {
    output(
      {
        configured: false,
        probe_ok: false,
        listed: false,
        source: "error",
        detail: "FEDERAL_DNC_API_URL must use HTTPS.",
      },
      1,
    );
    return;
  }

  try {
    const result = isDncScrubProvider(apiUrl)
      ? await probeDncScrub(apiUrl, apiKey)
      : await probeGenericPost(apiUrl, apiKey);
    output(
      {
        configured: true,
        probe_ok: result.probe_ok,
        listed: result.listed,
        source: result.probe_ok ? "vendor" : "error",
        detail: result.detail,
      },
      result.probe_ok ? 0 : 1,
    );
  } catch (error) {
    output(
      {
        configured: true,
        probe_ok: false,
        listed: true,
        source: "error",
        detail: error instanceof Error ? error.message : String(error),
      },
      1,
    );
  }
}

await main();
