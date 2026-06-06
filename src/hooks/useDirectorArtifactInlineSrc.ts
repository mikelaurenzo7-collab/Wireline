import { useEffect, useRef, useState } from "react";

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

/**
 * Fetches a fresh signed artifact URL (session cookie) and exposes a blob: URL
 * suitable for <img> and <iframe> without forcing a download.
 */
export function useDirectorArtifactBlobSrc(
  artifactId: string | undefined,
  options?: { inline?: boolean; enabled?: boolean },
): DirectorArtifactInlineSrc {
  const inline = options?.inline ?? true;
  const enabled = options?.enabled ?? true;
  const [src, setSrc] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const blobRef = useRef<string | undefined>();

  useEffect(() => {
    const revokeBlob = () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = undefined;
      }
    };

    if (!artifactId || !enabled) {
      revokeBlob();
      setSrc(undefined);
      setLoading(false);
      setError(false);
      return;
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
        revokeBlob();
        const nextBlobUrl = URL.createObjectURL(blob);
        blobRef.current = nextBlobUrl;
        setSrc(nextBlobUrl);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokeBlob();
      setSrc(undefined);
    };
  }, [artifactId, inline, enabled]);

  return { src, loading, error };
}
