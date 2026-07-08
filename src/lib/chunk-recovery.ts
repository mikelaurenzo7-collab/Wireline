const CHUNK_ERROR_PATTERNS = [
  "dynamically imported module",
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "loading chunk",
  "chunkloaderror",
  "css chunk load failed",
] as const;

const RELOAD_WINDOW_MS = 30_000;
const MAX_RELOADS_PER_WINDOW = 2;
const STORAGE_PREFIX = "wireline:stale-chunk-recovery";

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message} ${error.stack || ""}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isLikelyStaleChunkError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

export function requestStaleChunkReload(source: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const now = Date.now();
    const pathKey = `${STORAGE_PREFIX}:${window.location.pathname}`;
    const last = Number(sessionStorage.getItem(`${pathKey}:last`) || "0");
    const count = Number(sessionStorage.getItem(`${pathKey}:count`) || "0");
    const nextCount = last && now - last < RELOAD_WINDOW_MS ? count + 1 : 1;

    if (nextCount > MAX_RELOADS_PER_WINDOW) return false;

    sessionStorage.setItem(`${pathKey}:last`, String(now));
    sessionStorage.setItem(`${pathKey}:count`, String(nextCount));
    sessionStorage.setItem(`${pathKey}:source`, source);
    window.location.reload();
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}
