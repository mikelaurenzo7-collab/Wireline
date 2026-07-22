#!/usr/bin/env node

import "dotenv/config";

const TEST_PHONE = "2025550100";
const TIMEOUT_MS = 8_000;
const DNCSCRUB_FEDERAL_RESULT_CODES = new Set(["D", "DNCL", "FED", "FEDERAL", "NDNC"]);

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

function isDncScrubFederalListed(resultCode) {
  if (typeof resultCode !== "string" || !resultCode.trim()) return false;
  const normalized = resultCode.trim().toUpperCase();
  if (DNCSCRUB_FEDERAL_RESULT_CODES.has(normalized)) return true;
  return normalized.startsWith("D") && normalized.length <= 4;
}

function parseDncScrubListed(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  const row = payload[0];
  return isDncScrubFederalListed(row?.ResultCode ?? row?.resultCode);
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
      listed: false,
      detail: `DNCScrub probe failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
    };
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return {
      probe_ok: false,
      listed: false,
      detail: "DNCScrub probe returned non-JSON response.",
    };
  }

  if (!Array.isArray(payload)) {
    return {
      probe_ok: false,
      listed: false,
      detail: "DNCScrub probe returned JSON but not the expected array payload.",
    };
  }

  return {
    probe_ok: true,
    listed: parseDncScrubListed(payload),
    detail:
      "DNCScrub accepted the loginId header and returned JSON for the harmless NANP probe number.",
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
      listed: false,
      detail: `Generic federal DNC probe failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
    };
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return {
      probe_ok: false,
      listed: false,
      detail: "Generic federal DNC probe returned non-JSON response.",
    };
  }

  return {
    probe_ok: true,
    listed: payload?.listed === true,
    detail: "Generic federal DNC endpoint accepted the bearer token and returned JSON.",
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
        listed: false,
        source: "error",
        detail: error instanceof Error ? error.message : String(error),
      },
      1,
    );
  }
}

await main();
