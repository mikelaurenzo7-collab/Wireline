import { type MutableRefObject, useEffect, useRef, useState } from "react";

/** Parse artifact id from a persisted Director signed download/preview URL. */
export function artifactIdFromDirectorSignedUrl(url?: string): string | undefined {
  if (!url?.includes("/api/director/artifacts/")) return undefined;
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : (url.split("?")[0] ?? "");
    const match = path.match(/\/api\/director\/artifacts\/([^/]+)\/download/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchDirectorArtifactSignedUrl(
  artifactId: string,
  inline: boolean,
): Promise<string | null> {
  const res = await fetch(
    `/api/director/artifacts/${encodeURIComponent(artifactId)}/signed-url?inline=${inline ? 1 : 0}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return body.url ?? null;
}

export interface DirectorArtifactInlineSrc {
  src: string | undefined;
  loading: boolean;
  error: boolean;
}

/** Simple in-memory µ-cache for signed blob URLs scoped to the browser session. */
const signedBlobCache = new Map<string, { src: string; expiresAt: number }>();
const activeBlobReferences = new Map<string, number>();
const SIGNED_BLOB_CACHE_TTL_MS = 5 * 60 * 1000;

function incrementActiveBlobReference(src: string | undefined) {
  if (!src) return;
  activeBlobReferences.set(src, (activeBlobReferences.get(src) ?? 0) + 1);
}

function decrementActiveBlobReference(src: string | undefined) {
  if (!src) return;
  const nextCount = (activeBlobReferences.get(src) ?? 0) - 1;
  if (nextCount > 0) {
    activeBlobReferences.set(src, nextCount);
    return;
  }
  activeBlobReferences.delete(src);
}

function setActiveBlobReference(
  activeBlobRef: MutableRefObject<string | undefined>,
  nextSrc: string | undefined,
) {
  const previousSrc = activeBlobRef.current;
  if (previousSrc === nextSrc) return;
  decrementActiveBlobReference(previousSrc);
  activeBlobRef.current = nextSrc;
  incrementActiveBlobReference(nextSrc);
}

function hasActiveBlobReferences(src: string | undefined) {
  return !!src && (activeBlobReferences.get(src) ?? 0) > 0;
}

function releaseActiveBlobReference(activeBlobRef: MutableRefObject<string | undefined>) {
  const previousSrc = activeBlobRef.current;
  setActiveBlobReference(activeBlobRef, undefined);
  return previousSrc;
}

function takeRefValue(ref: MutableRefObject<string | undefined>) {
  const value = ref.current;
  ref.current = undefined;
  return value;
}

function hasUnexpiredSignedBlobCacheEntry(src: string) {
  const now = Date.now();
  for (const cached of signedBlobCache.values()) {
    if (cached.src === src && cached.expiresAt > now) return true;
  }
  return false;
}

function revokeObjectUrlIfUncached(src: string | undefined) {
  if (!src || hasActiveBlobReferences(src) || hasUnexpiredSignedBlobCacheEntry(src)) return;
  URL.revokeObjectURL(src);
}

function pruneExpiredSignedBlobCache() {
  const now = Date.now();
  for (const [key, cached] of signedBlobCache.entries()) {
    if (cached.expiresAt <= now) {
      signedBlobCache.delete(key);
      revokeObjectUrlIfUncached(cached.src);
    }
  }
}

export const __directorArtifactBlobCacheTestUtils = {
  activeBlobReferences,
  pruneExpiredSignedBlobCache,
  revokeObjectUrlIfUncached,
  setActiveBlobReference,
  signedBlobCache,
};

/**
 * Fetches a fresh signed artifact URL (session cookie) and exposes a blob: URL
 * suitable for <img> and <iframe> without forcing a download.
 *
 * Uses a session-scoped cache (5-minute TTL) so navigating between /chat and
 * /design/preview does not re-fetch the same artifacts every time.
 *
 * Blob URL revocation is deferred across renders to avoid invalidating
 * currently-displayed images in React Strict Mode double-mount scenarios.
 */
export function useDirectorArtifactBlobSrc(
  artifactId: string | undefined,
  options?: { inline?: boolean; enabled?: boolean; refreshKey?: string | number },
): DirectorArtifactInlineSrc {
  const inline = options?.inline ?? true;
  const enabled = options?.enabled ?? true;
  const refreshKey = options?.refreshKey ?? 0;
  const [src, setSrc] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const activeBlobRef = useRef<string | undefined>(undefined);
  const pendingRevokeRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const revokePending = () => {
      if (pendingRevokeRef.current) {
        revokeObjectUrlIfUncached(pendingRevokeRef.current);
        pendingRevokeRef.current = undefined;
      }
    };

    if (!artifactId || !enabled) {
      revokePending();
      pendingRevokeRef.current = activeBlobRef.current;
      setActiveBlobReference(activeBlobRef, undefined);
      setSrc(undefined);
      setLoading(false);
      setError(false);
      return;
    }

    pruneExpiredSignedBlobCache();

    const cacheKey = `${artifactId}:${inline ? 1 : 0}`;
    const cached = signedBlobCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      revokePending();
      if (activeBlobRef.current && activeBlobRef.current !== cached.src) {
        pendingRevokeRef.current = activeBlobRef.current;
      }
      setActiveBlobReference(activeBlobRef, cached.src);
      setSrc(cached.src);
      setLoading(false);
      setError(false);
      return;
    }
    if (cached) {
      revokeObjectUrlIfUncached(cached.src);
      signedBlobCache.delete(cacheKey);
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void (async () => {
      try {
        const signed = await fetchDirectorArtifactSignedUrl(artifactId, inline);
        if (cancelled) return;
        if (!signed) {
          setError(true);
          return;
        }
        const asset = await fetch(signed, { credentials: "include" });
        if (cancelled) return;
        if (!asset.ok) {
          setError(true);
          return;
        }
        const blob = await asset.blob();
        if (cancelled) return;
        const nextBlobUrl = URL.createObjectURL(blob);
        signedBlobCache.set(cacheKey, {
          src: nextBlobUrl,
          expiresAt: Date.now() + SIGNED_BLOB_CACHE_TTL_MS,
        });
        revokePending();
        if (activeBlobRef.current && activeBlobRef.current !== nextBlobUrl) {
          pendingRevokeRef.current = activeBlobRef.current;
        }
        setActiveBlobReference(activeBlobRef, nextBlobUrl);
        setSrc(nextBlobUrl);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokePending();
    };
  }, [artifactId, inline, enabled, refreshKey]);

  useEffect(() => {
    return () => {
      revokeObjectUrlIfUncached(releaseActiveBlobReference(activeBlobRef));
      revokeObjectUrlIfUncached(takeRefValue(pendingRevokeRef));
    };
  }, []);

  return { src, loading, error };
}
