const DEFAULT_QUERY_ENDPOINT = "https://api.osv.dev/v1/querybatch";
const DEFAULT_VULNERABILITY_ENDPOINT = "https://api.osv.dev/v1/vulns/";
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_QUERY_BATCH_SIZE = 200;
const DEFAULT_DETAIL_CONCURRENCY = 8;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const SEVERITY_RANK = new Map([
  ["info", 0],
  ["low", 1],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSeverity(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "informational") return "info";
  if (normalized === "medium") return "moderate";
  return SEVERITY_RANK.has(normalized) ? normalized : null;
}

function highestSeverity(values) {
  let selected = null;
  for (const value of values) {
    const normalized = normalizeSeverity(value);
    if (
      normalized &&
      (selected === null || SEVERITY_RANK.get(normalized) > SEVERITY_RANK.get(selected))
    ) {
      selected = normalized;
    }
  }
  return selected;
}

function severityCandidates(vulnerability, packageName) {
  const values = [vulnerability.database_specific?.severity];
  if (!Array.isArray(vulnerability.affected)) return values;

  for (const affected of vulnerability.affected) {
    if (!isRecord(affected) || !isRecord(affected.package)) continue;
    if (affected.package.ecosystem !== "npm" || affected.package.name !== packageName) continue;
    values.push(affected.ecosystem_specific?.severity, affected.database_specific?.severity);
  }
  return values;
}

function canonicalAdvisoryId(vulnerability) {
  const aliases = Array.isArray(vulnerability.aliases) ? vulnerability.aliases : [];
  const ghsa = [vulnerability.id, ...aliases].find(
    (candidate) => typeof candidate === "string" && /^GHSA-[0-9a-z-]+$/i.test(candidate),
  );
  return typeof ghsa === "string" ? ghsa.toUpperCase() : vulnerability.id.toUpperCase();
}

function responseDetail(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function validateHttpsEndpoint(value, label) {
  const endpoint = new URL(value);
  const localHttp =
    endpoint.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !localHttp) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed only for localhost tests)`);
  }
  return endpoint.toString();
}

async function requestJson(
  url,
  init,
  {
    fetchImpl,
    attempts,
    timeoutMs,
    retryDelayMs,
    sleep,
    context,
  },
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const detail = responseDetail(text);
        const error = new Error(
          `OSV ${context} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        );
        error.nonRetryable =
          response.status >= 400 &&
          response.status < 500 &&
          !RETRYABLE_STATUS_CODES.has(response.status);
        throw error;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(
          `OSV ${context} returned invalid JSON: ${
            error instanceof Error ? error.message : "parse failure"
          }`,
        );
      }
      if (!isRecord(parsed)) throw new Error(`OSV ${context} returned an unexpected response shape`);
      return parsed;
    } catch (error) {
      const normalizedError = timedOut
        ? new Error(
            `OSV ${context} timed out after ${timeoutMs}ms (attempt ${attempt}/${attempts})`,
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
    : new Error(`OSV ${context} failed without an error detail`);
}

export function buildOsvQueryEntries(payload) {
  if (!isRecord(payload)) throw new Error("OSV payload must be an object");

  const entries = [];
  for (const [packageName, versions] of Object.entries(payload)) {
    if (
      !packageName ||
      !Array.isArray(versions) ||
      !versions.length ||
      versions.some((version) => typeof version !== "string" || !version.trim())
    ) {
      throw new Error(`OSV payload contained invalid versions for ${packageName || "a package"}`);
    }

    for (const version of versions) {
      entries.push({
        packageName,
        version: version.trim(),
        query: {
          package: { ecosystem: "npm", name: packageName },
          version: version.trim(),
        },
      });
    }
  }

  if (!entries.length) throw new Error("OSV payload must contain at least one package version");
  return entries;
}

export function chunkOsvQueryEntries(entries, batchSize = DEFAULT_QUERY_BATCH_SIZE) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error("OSV query entries must be a non-empty array");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("OSV query batch size must be a positive integer");
  }

  const chunks = [];
  for (let index = 0; index < entries.length; index += batchSize) {
    chunks.push(entries.slice(index, index + batchSize));
  }
  return chunks;
}

function validateBatchResponse(response, expectedLength, context) {
  if (!Array.isArray(response.results) || response.results.length !== expectedLength) {
    throw new Error(
      `OSV ${context} returned ${Array.isArray(response.results) ? response.results.length : "no"} ` +
        `results for ${expectedLength} queries`,
    );
  }

  return response.results.map((result, index) => {
    if (!isRecord(result)) throw new Error(`OSV ${context} result ${index + 1} was malformed`);
    const vulns = result.vulns ?? [];
    if (!Array.isArray(vulns)) {
      throw new Error(`OSV ${context} result ${index + 1} contained malformed vulnerabilities`);
    }
    for (const vulnerability of vulns) {
      if (!isRecord(vulnerability) || typeof vulnerability.id !== "string" || !vulnerability.id.trim()) {
        throw new Error(`OSV ${context} result ${index + 1} contained a malformed vulnerability id`);
      }
    }
    if (
      result.next_page_token !== undefined &&
      (typeof result.next_page_token !== "string" || !result.next_page_token)
    ) {
      throw new Error(`OSV ${context} result ${index + 1} contained an invalid page token`);
    }
    return result;
  });
}

async function queryEntryBatch(entries, options, context) {
  const response = await requestJson(
    options.queryEndpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "BotBound dependency security audit",
      },
      body: JSON.stringify({ queries: entries.map((entry) => entry.query) }),
    },
    { ...options, context },
  );
  return validateBatchResponse(response, entries.length, context);
}

async function collectVulnerabilityContexts(entries, options) {
  const contextsById = new Map();
  const batches = chunkOsvQueryEntries(entries, options.batchSize);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;
    options.onBatch({ batchNumber, batchCount: batches.length, queryCount: batch.length });

    let pending = batch;
    let page = 1;
    while (pending.length) {
      if (page > 20) throw new Error(`OSV query batch ${batchNumber}/${batches.length} exceeded 20 pages`);
      const results = await queryEntryBatch(
        pending,
        options,
        `query batch ${batchNumber}/${batches.length}, page ${page}`,
      );
      const nextPending = [];

      for (let index = 0; index < pending.length; index += 1) {
        const entry = pending[index];
        const result = results[index];
        for (const vulnerability of result.vulns ?? []) {
          const id = vulnerability.id.trim();
          const contexts = contextsById.get(id) || [];
          contexts.push({ packageName: entry.packageName, version: entry.version });
          contextsById.set(id, contexts);
        }
        if (result.next_page_token) {
          nextPending.push({
            ...entry,
            query: { ...entry.query, page_token: result.next_page_token },
          });
        }
      }

      pending = nextPending;
      page += 1;
    }
  }

  return contextsById;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fetchVulnerability(id, options) {
  const url = new URL(encodeURIComponent(id), options.vulnerabilityEndpoint).toString();
  const vulnerability = await requestJson(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BotBound dependency security audit",
      },
    },
    { ...options, context: `vulnerability ${id}` },
  );

  if (typeof vulnerability.id !== "string" || !vulnerability.id.trim()) {
    throw new Error(`OSV vulnerability ${id} did not contain an id`);
  }
  if (vulnerability.id.toUpperCase() !== id.toUpperCase()) {
    throw new Error(`OSV vulnerability ${id} returned mismatched id ${vulnerability.id}`);
  }
  return vulnerability;
}

export function normalizeOsvAdvisories(vulnerabilityRecords, contextsById) {
  if (!Array.isArray(vulnerabilityRecords) || !(contextsById instanceof Map)) {
    throw new Error("OSV advisories require vulnerability records and query contexts");
  }

  const merged = new Map();
  for (const vulnerability of vulnerabilityRecords) {
    if (!isRecord(vulnerability) || typeof vulnerability.id !== "string" || !vulnerability.id.trim()) {
      throw new Error("OSV returned a malformed vulnerability record");
    }
    if (typeof vulnerability.withdrawn === "string" && vulnerability.withdrawn) continue;

    const contexts = contextsById.get(vulnerability.id) || [];
    if (!contexts.length) {
      throw new Error(`OSV vulnerability ${vulnerability.id} had no matching package query context`);
    }

    for (const context of contexts) {
      const severity = highestSeverity(severityCandidates(vulnerability, context.packageName));
      if (!severity) {
        throw new Error(
          `OSV vulnerability ${vulnerability.id} did not provide a recognized severity for ${context.packageName}`,
        );
      }

      const id = canonicalAdvisoryId(vulnerability);
      const key = `${context.packageName}:${id}`;
      const existing = merged.get(key);
      const title =
        typeof vulnerability.summary === "string" && vulnerability.summary.trim()
          ? vulnerability.summary.trim()
          : id;

      if (!existing) {
        merged.set(key, {
          packageName: context.packageName,
          id,
          title,
          severity,
          versions: new Set([context.version]),
        });
        continue;
      }

      existing.versions.add(context.version);
      if (SEVERITY_RANK.get(severity) > SEVERITY_RANK.get(existing.severity)) {
        existing.severity = severity;
      }
    }
  }

  return [...merged.values()]
    .map((entry) => ({
      packageName: entry.packageName,
      id: entry.id,
      title: entry.title,
      severity: entry.severity,
      vulnerableVersions: [...entry.versions].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      ).join(", "),
    }))
    .sort((left, right) =>
      left.packageName.localeCompare(right.packageName) || left.id.localeCompare(right.id),
    );
}

export async function requestOsvAdvisories(
  payload,
  {
    queryEndpoint = DEFAULT_QUERY_ENDPOINT,
    vulnerabilityEndpoint = DEFAULT_VULNERABILITY_ENDPOINT,
    fetchImpl = globalThis.fetch,
    attempts = DEFAULT_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = 500,
    batchSize = DEFAULT_QUERY_BATCH_SIZE,
    detailConcurrency = DEFAULT_DETAIL_CONCURRENCY,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    onBatch = () => {},
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new Error("A Fetch API implementation is required");
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("attempts must be a positive integer");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");
  if (!Number.isInteger(detailConcurrency) || detailConcurrency < 1) {
    throw new Error("detailConcurrency must be a positive integer");
  }
  if (typeof onBatch !== "function") throw new Error("onBatch must be a function");

  const entries = buildOsvQueryEntries(payload);
  const options = {
    queryEndpoint: validateHttpsEndpoint(queryEndpoint, "OSV query endpoint"),
    vulnerabilityEndpoint: validateHttpsEndpoint(
      vulnerabilityEndpoint.endsWith("/") ? vulnerabilityEndpoint : `${vulnerabilityEndpoint}/`,
      "OSV vulnerability endpoint",
    ),
    fetchImpl,
    attempts,
    timeoutMs,
    retryDelayMs,
    batchSize,
    detailConcurrency,
    sleep,
    onBatch,
  };

  const contextsById = await collectVulnerabilityContexts(entries, options);
  if (!contextsById.size) return [];

  const ids = [...contextsById.keys()].sort();
  const vulnerabilityRecords = await mapWithConcurrency(ids, detailConcurrency, (id) =>
    fetchVulnerability(id, options),
  );
  return normalizeOsvAdvisories(vulnerabilityRecords, contextsById);
}
