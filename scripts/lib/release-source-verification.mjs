import { execFileSync } from "node:child_process";

import { CANONICAL_PRODUCTION_URL } from "./production-url.mjs";

const EXACT_COMMIT = /^[0-9a-f]{40}$/i;

function gitValue(repoRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function resolveSourceCommit(repoRoot) {
  const fromEnvironment = [process.env.VERCEL_GIT_COMMIT_SHA, process.env.GITHUB_SHA]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (fromEnvironment && !EXACT_COMMIT.test(fromEnvironment)) {
    throw new Error(
      "Launch media certification received a source commit that is not an exact 40-character SHA.",
    );
  }
  const checkoutCommit = gitValue(repoRoot, ["rev-parse", "HEAD"]);
  const commit = fromEnvironment || checkoutCommit;
  if (!EXACT_COMMIT.test(commit || "")) {
    throw new Error(
      "Launch media certification requires an exact source commit in a Git checkout.",
    );
  }
  if (!checkoutCommit || checkoutCommit.toLowerCase() !== commit.toLowerCase()) {
    throw new Error(
      `Launch media source mismatch: environment says ${commit}, but the checkout is ${checkoutCommit || "unavailable"}.`,
    );
  }
  return commit.toLowerCase();
}

export function resolveSourceRef(repoRoot) {
  return (
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    gitValue(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) ||
    "detached"
  );
}

export function assertCleanCheckout(repoRoot, sourceCommit) {
  const checkoutCommit = gitValue(repoRoot, ["rev-parse", "HEAD"]);
  if (!EXACT_COMMIT.test(checkoutCommit) || checkoutCommit.toLowerCase() !== sourceCommit) {
    throw new Error(
      `Launch media source moved during capture: started at ${sourceCommit}, now at ${checkoutCommit || "unavailable"}.`,
    );
  }
  const dirty = gitValue(repoRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (dirty === null) {
    throw new Error("Launch media certification could not verify a clean Git checkout.");
  }
  if (dirty) {
    throw new Error(
      "Launch media certification requires a clean Git checkout. Commit or discard local changes, then rebuild and recapture.",
    );
  }
}

export function isTrustedBotBoundCaptureHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase();
  return host === new URL(CANONICAL_PRODUCTION_URL).hostname;
}

export function normalizeBaseURL(value) {
  const url = new URL(value || CANONICAL_PRODUCTION_URL);
  if (url.protocol !== "https:") {
    throw new Error(
      `Launch media certification requires an HTTPS production URL; received ${url.toString()}.`,
    );
  }
  if (url.username || url.password) {
    throw new Error("Launch media certification does not allow credentials in its capture URL.");
  }
  if (!isTrustedBotBoundCaptureHost(url.hostname)) {
    throw new Error(
      `Launch media certification refuses untrusted capture host ${url.hostname}; use ${CANONICAL_PRODUCTION_URL}.`,
    );
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function verifyRemoteSourceCommit(sourceCommit, requestedBaseURL) {
  const baseURL = normalizeBaseURL(requestedBaseURL);
  const healthURL = new URL("/api/health/public", `${baseURL}/`);
  // The unique query and no-cache headers prevent a previous deployment's
  // edge response from authenticating a different release capture.
  healthURL.searchParams.set("source_commit_check", sourceCommit);
  const response = await fetch(healthURL, {
    method: "HEAD",
    redirect: "error",
    headers: {
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Launch media source verification failed: ${healthURL} returned ${response.status}.`,
    );
  }

  const deployedCommit = String(response.headers.get("x-wireline-source-commit") || "")
    .trim()
    .toLowerCase();
  if (!EXACT_COMMIT.test(deployedCommit)) {
    throw new Error(
      "Launch media source verification failed: production health did not return a valid X-Wireline-Source-Commit header.",
    );
  }
  if (deployedCommit !== sourceCommit) {
    throw new Error(
      `Launch media source mismatch: checkout is ${sourceCommit}, but ${baseURL} serves ${deployedCommit}.`,
    );
  }

  return {
    baseURL,
    deployedCommit,
    verifiedAt: new Date().toISOString(),
  };
}
