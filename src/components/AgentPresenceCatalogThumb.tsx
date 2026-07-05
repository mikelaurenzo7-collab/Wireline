/**
 * Small catalog face thumbnail for canvas identity cards.
 */
import { useEffect, useState } from "react";

import { authFetch } from "../lib/api";

export default function AgentPresenceCatalogThumb({
  avatarId,
  className = "",
}: {
  avatarId: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authFetch("/api/video-presenter/avatars")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          avatars?: Array<{ id: string; previewImageUrl?: string | null }>;
        }>;
      })
      .then((payload) => {
        if (cancelled || !payload?.avatars) return;
        const match = payload.avatars.find((row) => row.id === avatarId);
        setUrl(match?.previewImageUrl ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [avatarId]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt=""
      className={`wl-presence__catalog-thumb ${className}`.trim()}
      loading="lazy"
      decoding="async"
    />
  );
}
