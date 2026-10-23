import type { ComputerStatus, ComputerTask } from "../contexts/ComputerWorkspaceContext";

const STATUSES = new Set([
  "running",
  "needs_input",
  "completed",
  "blocked",
  "failed",
  "stopped",
  "interrupted",
]);
const EVENTS = new Set(["action", "note", "question", "reply", "result", "error"]);
const REASONS = new Set([
  "ready",
  "model_unconfigured",
  "browser_unconfigured",
  "storage_unavailable",
  "plan_required",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 100_000): value is string =>
  typeof value === "string" && value.length <= max;
const id = (value: unknown): value is string => text(value, 256) && /^[A-Za-z0-9_-]+$/.test(value);
// Match the Computer route's Bot identifiers without widening task or browser path IDs.
const agentId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_:-]{1,128}$/.test(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string =>
  text(value, 100) && Number.isFinite(Date.parse(value));
const nullableText = (value: unknown) => value == null || text(value);
function webUrl(value: unknown) {
  if (!text(value, 4096)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function readComputerStatusReceipt(value: unknown): ComputerStatus | null {
  if (
    !record(value) ||
    typeof value.available !== "boolean" ||
    !text(value.reason) ||
    !REASONS.has(value.reason) ||
    !record(value.limits)
  )
    return null;
  if (value.available !== (value.reason === "ready")) return null;
  const { maxMinutes, maxSteps } = value.limits;
  if (
    typeof maxMinutes !== "number" ||
    !Number.isFinite(maxMinutes) ||
    maxMinutes <= 0 ||
    !count(maxSteps) ||
    maxSteps === 0
  )
    return null;
  return value as unknown as ComputerStatus;
}

/** Validate a server receipt before adopting state or discarding an owner's draft.
 * Historical rows may omit ephemeral browser metadata; normalise those defaults.
 */
export function readComputerTaskReceipt(
  value: unknown,
  expected: { taskId?: string; agentId?: string; goal?: string } = {},
): ComputerTask | null {
  if (
    !record(value) ||
    !id(value.id) ||
    !agentId(value.agentId) ||
    (expected.taskId && value.id !== expected.taskId) ||
    (expected.agentId && value.agentId !== expected.agentId) ||
    (expected.goal !== undefined && value.goal !== expected.goal)
  )
    return null;
  if (
    !text(value.goal, 10000) ||
    !value.goal.trim() ||
    !text(value.status) ||
    !STATUSES.has(value.status) ||
    !nullableText(value.summary) ||
    !nullableText(value.question) ||
    !nullableText(value.errorCode)
  )
    return null;
  if (
    !date(value.startedAt) ||
    !date(value.updatedAt) ||
    (value.finishedAt != null && !date(value.finishedAt)) ||
    !count(value.actionCount) ||
    !count(value.turnCount) ||
    typeof value.liveView !== "boolean"
  )
    return null;
  for (const field of ["ownerControl", "controlRequested", "preparingBrowser", "stopping"])
    if (value[field] !== undefined && typeof value[field] !== "boolean") return null;
  if (value.startUrl != null && !webUrl(value.startUrl)) return null;
  for (const field of ["currentUrl", "frameUrl"])
    if (value[field] != null && value[field] !== "about:blank" && !webUrl(value[field]))
      return null;
  if (value.frameCapturedAt != null && !date(value.frameCapturedAt)) return null;
  if (!Array.isArray(value.sources) || value.sources.length > 1000 || !value.sources.every(webUrl))
    return null;
  if (
    !Array.isArray(value.events) ||
    value.events.length > 1000 ||
    !value.events.every(
      (event) =>
        record(event) &&
        date(event.at) &&
        text(event.kind) &&
        EVENTS.has(event.kind) &&
        text(event.text, 10000) &&
        (event.url == null || event.url === "about:blank" || webUrl(event.url)) &&
        (event.ok === undefined || typeof event.ok === "boolean"),
    )
  )
    return null;
  if (
    value.agentPointer != null &&
    (!record(value.agentPointer) ||
      !date(value.agentPointer.at) ||
      typeof value.agentPointer.x !== "number" ||
      !Number.isFinite(value.agentPointer.x) ||
      typeof value.agentPointer.y !== "number" ||
      !Number.isFinite(value.agentPointer.y))
  )
    return null;
  if (
    value.ownerTabs !== undefined &&
    (!Array.isArray(value.ownerTabs) ||
      value.ownerTabs.length > 100 ||
      !value.ownerTabs.every(
        (tab) =>
          record(tab) && id(tab.id) && text(tab.label, 1000) && typeof tab.active === "boolean",
      ))
  )
    return null;
  if (
    value.ownerHistory !== undefined &&
    (!Array.isArray(value.ownerHistory) ||
      value.ownerHistory.length > 1000 ||
      !value.ownerHistory.every(
        (entry) =>
          record(entry) &&
          count(entry.id) &&
          id(entry.tabId) &&
          text(entry.label, 1000) &&
          webUrl(entry.url) &&
          date(entry.visitedAt),
      ))
  )
    return null;
  if (
    value.ownerDownloads !== undefined &&
    (!Array.isArray(value.ownerDownloads) ||
      value.ownerDownloads.length > 100 ||
      !value.ownerDownloads.every(
        (file) =>
          record(file) &&
          id(file.id) &&
          text(file.name, 1000) &&
          count(file.bytes) &&
          date(file.createdAt),
      ))
  )
    return null;
  if (
    value.ownerSavedLogins !== undefined &&
    (!Array.isArray(value.ownerSavedLogins) ||
      value.ownerSavedLogins.length > 100 ||
      !value.ownerSavedLogins.every(
        (login) => record(login) && webUrl(login.origin) && text(login.label, 1000),
      ))
  )
    return null;
  if (!nullableText(value.ownerDownloadNotice)) return null;
  if (value.browserCapabilities != null) {
    if (!record(value.browserCapabilities)) return null;
    for (const field of [
      "tabs",
      "history",
      "screenshots",
      "downloads",
      "cookieImport",
      "cookieClear",
      "sessionLogins",
      "persistentPasswords",
      "extensions",
    ])
      if (typeof value.browserCapabilities[field] !== "boolean") return null;
    for (const field of [
      "maxTabs",
      "historyLimit",
      "maxCookiesPerImport",
      "maxCookieImportBytes",
      "maxDownloadBytes",
      "maxDownloads",
    ])
      if (!count(value.browserCapabilities[field]) || value.browserCapabilities[field] === 0)
        return null;
  }
  return {
    ...value,
    startUrl: value.startUrl ?? null,
    currentUrl: value.currentUrl ?? null,
    summary: value.summary ?? null,
    question: value.question ?? null,
    errorCode: value.errorCode ?? null,
    finishedAt: value.finishedAt ?? null,
    ownerControl: value.ownerControl ?? false,
    stopping: value.stopping ?? false,
  } as ComputerTask;
}

export function readComputerTaskListReceipt(value: unknown): ComputerTask[] | null {
  if (!Array.isArray(value)) return null;
  const tasks = value.map((task) => readComputerTaskReceipt(task));
  if (tasks.some((task) => task === null)) return null;
  const confirmed = tasks as ComputerTask[];
  return new Set(confirmed.map((task) => task.id)).size === confirmed.length ? confirmed : null;
}
