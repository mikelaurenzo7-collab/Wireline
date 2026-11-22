#!/usr/bin/env node

import "dotenv/config";
import { parseDncScrubResult } from "../src/lib/federal-dnc-result.mjs";

const TEST_NUMBER_SUFFIX = "5550100";
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

function buildDncScrubRequestUrl(apiUrl, { phone, projectId }) {
  const url = new URL(apiUrl);
  url.searchParams.set("phoneList", phone);
  url.searchParams.set("version", "5");
  url.searchParams.set("output", "json");
  if (projectId) url.searchParams.set("projId", projectId);
  return url.toString();
}

async function probeDncScrub(apiUrl, apiKey, scope) {
  const response = await fetch(buildDncScrubRequestUrl(apiUrl, scope), {
    method: "GET",
    headers: {
      loginId: apiKey,
      Accept: "application/json",
    },
    redirect: "error",
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

  const result = parseDncScrubResult(payload, scope.phone);
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
      "DNCScrub returned a recognized result for the synthetic number. Calling still requires recipient eligibility.",
  };
}

async function probeGenericPost(apiUrl, apiKey, { phone, projectId }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(projectId ? { phone, project_id: projectId } : { phone }),
    redirect: "error",
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
      "The screening endpoint returned a boolean listed result. Calling still requires recipient eligibility.",
  };
}

async function main() {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim() || "";
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim() || "";
  const projectId = process.env.FEDERAL_DNC_PROBE_PROJECT_ID?.trim() || "";
  const areaCode = process.env.FEDERAL_DNC_PROBE_AREA_CODE?.trim() || "202";

  if (!apiKey && !apiUrl && !projectId) {
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

  if ((projectId && !/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) || !/^[2-9]\d{2}$/.test(areaCode)) {
    output(
      {
        configured: true,
        probe_ok: false,
        listed: true,
        source: "error",
        detail: "Enter a valid screening project ID and a three-digit probe area code.",
      },
      1,
    );
    return;
  }

  const scope = { phone: areaCode + TEST_NUMBER_SUFFIX, projectId };
  const project_scoped = Boolean(projectId);
  try {
    const result = isDncScrubProvider(apiUrl)
      ? await probeDncScrub(apiUrl, apiKey, scope)
      : await probeGenericPost(apiUrl, apiKey, scope);
    output(
      {
        configured: true,
        probe_ok: result.probe_ok,
        project_scoped,
        listed: result.listed,
        source: result.probe_ok ? "vendor" : "error",
        detail: result.detail,
      },
      result.probe_ok ? 0 : 1,
    );
  } catch {
    output(
      {
        configured: true,
        probe_ok: false,
        project_scoped,
        listed: true,
        source: "error",
        detail: "The screening provider could not complete the probe.",
      },
      1,
    );
  }
}

await main();
