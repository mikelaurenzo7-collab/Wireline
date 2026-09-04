import { gunzipSync, gzipSync } from "node:zlib";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const BULK_AUDIT_PATH = "-/npm/v1/security/advisories/bulk";
const KNOWN_SEVERITIES = new Set(["info", "low", "moderate", "medium", "high", "critical"]);
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_PACKAGES_PER_REQUEST = 80;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packageNameFromLockPath(lockPath, entry) {
  if (typeof entry.name === "string" && entry.name.trim()) return entry.name.trim();

  const normalized = lockPath.replaceAll("\\", "/");
  const marker = "node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;

  const remainder = normalized.slice(markerIndex + marker.length);
  const parts = remainder.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0].startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0];
}

export function buildProductionPackagePayload(lockfile) {
  if (!isRecord(lockfile) || Number(lockfile.lockfileVersion) < 2 || !isRecord(lockfile.packages)) {
    throw new Error("package-lock.json must use lockfileVersion 2 or newer with a packages map");
  }

  const versionsByPackage = new Map();
  for (const [lockPath, entry] of Object.entries(lockfile.packages)) {
    if (!lockPath || !isRecord(entry)) continue;
    if (entry.dev === true || entry.link === true) continue;
    if (typeof entry.version !== "string" || !entry.version.trim()) continue;

    const packageName = packageNameFromLockPath(lockPath, entry);
    if (!packageName) continue;

    const versions = versionsByPackage.get(packageName) || new Set();
    versions.add(entry.version.trim());
    versionsByPackage.set(packageName, versions);
  }

  if (!versionsByPackage.size) {
    throw new Error("package-lock.json did not contain any auditable production package versions");
  }

  return Object.fromEntries(
    [...versionsByPackage.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [
        name,
        [...versions].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
      ]),
  );
}

export function countPackageVersions(payload) {
  if (!isRecord(payload)) return 0;
  return Object.values(payload).reduce(
    (total, versions) => total + (Array.isArray(versions) ? versions.length : 0),
    0,
  );
}

export function chunkBulkAuditPayload(
  payload,
  maxPackagesPerRequest = DEFAULT_MAX_PACKAGES_PER_REQUEST,
) {
  if (!isRecord(payload)) {
    throw new Error("Bulk Advisory payload must be an object");
  }
  if (!Number.isInteger(maxPackagesPerRequest) || maxPackagesPerRequest < 1) {
    throw new Error("maxPackagesPerRequest must be a positive integer");
  }

  const entries = Object.entries(payload);
  if (!entries.length) {
    throw new Error("Bulk Advisory payload must contain at least one package");
  }

  for (const [packageName, versions] of entries) {
    if (
      !packageName ||
      !Array.isArray(versions) ||
      !versions.length ||
      versions.some((version) => typeof version !== "string" || !version.trim())
    ) {
      throw new Error(`Bulk Advisory payload contained invalid versions for ${packageName || "a package"}`);
    }
  }

  const chunks = [];
  for (let index = 0; index < entries.length; index += maxPackagesPerRequest) {
    chunks.push(Object.fromEntries(entries.slice(index, index + maxPackagesPerRequest)));
  }
  return chunks;
}

function maybeGunzip(body) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzipSync(bytes);
  }
  return bytes;
}

export function decodeBulkAdvisoryBody(body) {
  const text = maybeGunzip(body).toString("utf8").trim();
  if (!text) throw new Error("npm Bulk Advisory endpoint returned an empty response");

  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `npm Bulk Advisory endpoint returned invalid JSON: ${error instanceof Error ? error.message : "parse failure"}`,
    );
  }

  if (!isRecord(report)) {
    throw new Error("npm Bulk Advisory endpoint returned an unexpected response shape");
  }
  return report;
}

function responseDetail(body) {
  try {
    return maybeGunzip(body).toString("utf8").replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    return "";
  }
}

export function resolveBulkAuditEndpoint(registry = DEFAULT_REGISTRY) {
  const base = new URL(String(registry || DEFAULT_REGISTRY).trim());
  const localHttp =
    base.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !localHttp) {
    throw new Error("NPM_AUDIT_REGISTRY must use HTTPS (HTTP is allowed only for localhost tests)");
  }
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return new URL(BULK_AUDIT_PATH, base).toString();
}

function mergeBulkAdvisoryReports(target, report) {
  if (!isRecord(report)) {
    throw new Error("npm Bulk Advisory endpoint returned an unexpected response shape");
  }

  for (const [packageName, entries] of Object.entries(report)) {
    if (!Array.isArray(entries)) {
      throw new Error(`Bulk Advisory report entry for ${packageName} was not an array`);
    }
    target[packageName] = [...(target[packageName] || []), ...entries];
  }
  return target;
}

async function requestBulkAdvisoryBatch(
  payload,
  {
    endpoint,
    fetchImpl,
    attempts,
    timeoutMs,
    retryDelayMs,
    sleep,
    batchNumber,
    batchCount,
  },
) {
  const requestBody = gzipSync(Buffer.from(JSON.stringify(payload)));
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Encoding": "gzip",
          "Content-Type": "application/json",
          "User-Agent": "BotBound dependency security audit",
          "npm-command": "audit",
        },
        body: requestBody,
        signal: controller.signal,
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        const detail = responseDetail(body);
        const error = new Error(
          `npm Bulk Advisory endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        );
        error.nonRetryable =
          response.status >= 400 &&
          response.status < 500 &&
          !RETRYABLE_STATUS_CODES.has(response.status);
        throw error;
      }
      return decodeBulkAdvisoryBody(body);
    } catch (error) {
      const normalizedError = timedOut
        ? new Error(
            `npm Bulk Advisory request timed out after ${timeoutMs}ms ` +
              `(batch ${batchNumber}/${batchCount}, attempt ${attempt}/${attempts})`,
          )
        : error;
      lastError = normalizedError;
      const nonRetryable = isRecord(error) && error.nonRetryable === true;
      if (nonRetryable || attempt === attempts) break;
      await sleep(retryDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("npm Bulk Advisory endpoint request failed without an error detail");
}

export async function requestBulkAdvisories(
  payload,
  {
    registry = DEFAULT_REGISTRY,
    fetchImpl = globalThis.fetch,
    attempts = DEFAULT_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = 500,
    maxPackagesPerRequest = DEFAULT_MAX_PACKAGES_PER_REQUEST,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    onBatch = () => {},
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new Error("A Fetch API implementation is required");
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("attempts must be a positive integer");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");
  if (typeof onBatch !== "function") throw new Error("onBatch must be a function");

  const endpoint = resolveBulkAuditEndpoint(registry);
  const batches = chunkBulkAuditPayload(payload, maxPackagesPerRequest);
  const mergedReport = {};

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchNumber = index + 1;
    onBatch({
      batchNumber,
      batchCount: batches.length,
      packageCount: Object.keys(batch).length,
    });
    const report = await requestBulkAdvisoryBatch(batch, {
      endpoint,
      fetchImpl,
      attempts,
      timeoutMs,
      retryDelayMs,
      sleep,
      batchNumber,
      batchCount: batches.length,
    });
    mergeBulkAdvisoryReports(mergedReport, report);
  }

  return mergedReport;
}

function advisoryId(advisory) {
  const ghsa =
    typeof advisory.url === "string"
      ? advisory.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i)?.[0]?.toUpperCase()
      : null;
  return ghsa || `NPM-${String(advisory.id)}`;
}

export function flattenBulkAdvisories(report) {
  if (!isRecord(report)) throw new Error("Bulk Advisory report must be an object");

  const flattened = [];
  const seen = new Set();
  for (const [packageName, entries] of Object.entries(report)) {
    if (!Array.isArray(entries)) {
      throw new Error(`Bulk Advisory report entry for ${packageName} was not an array`);
    }

    for (const entry of entries) {
      if (
        !isRecord(entry) ||
        !(typeof entry.id === "number" || typeof entry.id === "string") ||
        typeof entry.url !== "string" ||
        typeof entry.title !== "string" ||
        typeof entry.severity !== "string" ||
        !KNOWN_SEVERITIES.has(entry.severity.toLowerCase()) ||
        typeof entry.vulnerable_versions !== "string"
      ) {
        throw new Error(`Bulk Advisory report contained a malformed advisory for ${packageName}`);
      }

      const normalized = {
        packageName,
        id: advisoryId(entry),
        title: entry.title,
        severity: entry.severity.toLowerCase(),
        vulnerableVersions: entry.vulnerable_versions,
      };
      const key = `${packageName}:${normalized.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flattened.push(normalized);
    }
  }

  return flattened;
}

export function classifyHighSeverityAdvisories(advisories, acceptedIds = new Set()) {
  const blocking = [];
  const accepted = [];
  for (const advisory of advisories) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;
    if (acceptedIds.has(advisory.id)) accepted.push(advisory);
    else blocking.push(advisory);
  }
  return { blocking, accepted };
}
