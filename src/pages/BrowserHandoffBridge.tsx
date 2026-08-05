import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";

import TransitionSurface from "../components/TransitionSurface";
import {
  decodeBrowserContextFragment,
  parseExtensionBrowserContext,
} from "../lib/browser-command-context";
import { authFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

/**
 * Authenticated bridge: extension opens `/studio/handoff#browser-context=…`,
 * this page exchanges the fragment for a one-time handoff id and redirects to Studio.
 */
export default function BrowserHandoffBridge() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const run = async () => {
      if (!location.hash.startsWith("#browser-context=")) {
        setError("No browser context was provided.");
        return;
      }

      const encoded = location.hash.slice("#browser-context=".length);
      const decoded = decodeBrowserContextFragment(encoded);
      if (!decoded) {
        setError("Could not read browser context.");
        return;
      }

      const context = parseExtensionBrowserContext(decoded);
      if (!context) {
        setError(
          "This handoff link is invalid or expired. Capture the page again from Wireline Command.",
        );
        return;
      }

      const response = await authFetch("/api/browser/handoff/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          source: "browser-extension",
          capturedAt: decoded.capturedAt,
          title: context.title,
          url: context.url,
          description: context.description,
          selection: context.selection,
          link: context.link,
          request: context.request,
        }),
      });

      const body = (await response.json()) as {
        handoff_id?: string;
        studio_url?: string;
        error?: string;
      };
      if (!response.ok || !body.studio_url || !body.handoff_id) {
        setError(body.error || "Could not secure this handoff. Try again from Wireline Command.");
        return;
      }

      window.location.replace(body.studio_url);
    };

    void run().catch(() => {
      setError("Could not complete the handoff. Try again from Wireline Command.");
    });
  }, [loading, user, location.hash]);

  if (!loading && !user) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.hash}`);
    return <Navigate to={`/signin?redirect=${returnTo}`} replace />;
  }

  if (error) {
    return (
      <TransitionSurface
        eyebrow="Studio"
        title="Handoff unavailable"
        description={error}
        busyLabel=""
      />
    );
  }

  return (
    <TransitionSurface
      eyebrow="Studio"
      title="Securing browser context"
      description="Signing your page capture before opening Studio…"
      busyLabel="Preparing Studio"
    />
  );
}
